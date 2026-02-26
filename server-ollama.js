/**
 * ALIA 2.0 - Local Ollama Server
 * Standalone server for testing Memory OS with local LLM
 * No OpenAI dependency - 100% local inference
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Load .env file (ESM compatible)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  console.log('✅ Loaded .env file');
}

// =====================================================
// Configuration
// =====================================================

const PORT = 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const CHAT_MODEL = 'phi3';              // For text generation
const EMBED_MODEL = 'nomic-embed-text';  // For embeddings (768-dim)

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Missing Supabase credentials.');
  console.error('   Create a .env file with:');
  console.error('   SUPABASE_URL=your-project-url');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-key\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// Ollama Client (using native http to avoid Windows fetch issues)
// =====================================================

class OllamaClient {
  constructor(host, chatModel, embedModel) {
    this.host = host;
    this.chatModel = chatModel;
    this.embedModel = embedModel;
    this.hostname = new URL(host).hostname;
    this.port = new URL(host).port || 11434;
  }

  async _request(path, body) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      
      const options = {
        hostname: this.hostname,
        port: this.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async generate(prompt, options = {}) {
    const start = Date.now();
    
    try {
      const data = await this._request('/api/generate', {
        model: this.chatModel,  // Use chat model (phi3)
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.3,
          top_p: options.top_p || 0.9,
          num_predict: options.max_tokens || 256,
        }
      });

      const elapsed = Date.now() - start;
      
      return {
        text: data.response.trim(),
        elapsed_ms: elapsed,
        tokens: data.eval_count || 0
      };
    } catch (error) {
      console.error('🔴 Ollama generation error:', error.message);
      throw error;
    }
  }

  async embed(text) {
    const start = Date.now();
    
    try {
      const data = await this._request('/api/embeddings', {
        model: this.embedModel,  // Use embedding model (nomic-embed-text)
        prompt: text
      });

      const elapsed = Date.now() - start;
      
      // Normalize if needed (Supabase expects unit vectors for cosine similarity)
      const embedding = data.embedding;
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      const normalized = embedding.map(val => val / magnitude);
      
      return {
        embedding: normalized,
        elapsed_ms: elapsed
      };
    } catch (error) {
      console.error('🔴 Ollama embedding error:', error.message);
      throw error;
    }
  }

  async healthCheck() {
    return new Promise((resolve) => {
      const options = {
        hostname: this.hostname,
        port: this.port,
        path: '/api/tags',
        method: 'GET'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            // Check both models are available
            const chatExists = parsed.models?.some(m => m.name.startsWith(this.chatModel));
            const embedExists = parsed.models?.some(m => m.name.startsWith(this.embedModel));
            resolve(chatExists && embedExists);
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }
}

const ollama = new OllamaClient(OLLAMA_HOST, CHAT_MODEL, EMBED_MODEL);

// =====================================================
// Memory OS Functions
// =====================================================

async function storeEpisodeMemory(data) {
  const startTime = Date.now();
  const performance = {};

  try {
    // 1. Generate embedding
    const embedStart = Date.now();
    const { embedding } = await ollama.embed(data.episode_text);
    performance.embedding_ms = Date.now() - embedStart;

    // 2. Analyze episode with LLM
    const analysisStart = Date.now();
    const analysisPrompt = `Analyze this medical sales training session and provide a JSON response:

Session transcript:
${data.episode_text}

Provide analysis in this JSON format (only JSON, no markdown):
{
  "strengths": ["specific strength 1", "specific strength 2"],
  "struggles": ["specific struggle 1", "specific struggle 2"],
  "recommended_focus": "one concise recommendation"
}`;

    const { text: analysisText } = await ollama.generate(analysisPrompt, {
      temperature: 0.3,
      max_tokens: 256
    });

    // Parse LLM response (handle potential JSON extraction)
    let learning_summary;
    try {
      // Try to extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      learning_summary = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
    } catch (parseError) {
      console.warn('⚠️  LLM response not valid JSON, using fallback');
      learning_summary = {
        strengths: ['Completed session'],
        struggles: ['Analysis parsing failed'],
        recommended_focus: 'Review session manually'
      };
    }

    performance.analysis_ms = Date.now() - analysisStart;

    // 3. Store in database
    const dbStart = Date.now();
    const { data: inserted, error } = await supabase
      .from('episode_memories')
      .insert({
        rep_id: data.rep_id,
        session_id: data.session_id,
        episode_text: data.episode_text,
        episode_embedding: embedding,
        learning_summary,
        accuracy: data.accuracy,
        compliance: data.compliance,
        confidence: data.confidence,
        salience_score: data.salience_score || 0.8,
        session_date: data.session_date || new Date().toISOString()
      })
      .select()
      .single();

    performance.database_ms = Date.now() - dbStart;
    performance.total_ms = Date.now() - startTime;

    if (error) throw error;

    return {
      success: true,
      memory_id: inserted.id,
      learning_summary,
      performance
    };
  } catch (error) {
    console.error('❌ Store memory error:', error);
    throw error;
  }
}

async function retrieveEpisodeMemories(rep_id, query_text, limit = 5) {
  const startTime = Date.now();
  
  try {
    // Generate query embedding
    const { embedding } = await ollama.embed(query_text);

    // Semantic search using pgvector
    const { data, error } = await supabase.rpc('search_episode_memories', {
      p_rep_id: rep_id,
      p_query_embedding: embedding,
      p_similarity_threshold: 0.7,
      p_limit: limit
    });

    if (error) throw error;

    return {
      success: true,
      memories: data,
      elapsed_ms: Date.now() - startTime
    };
  } catch (error) {
    console.error('❌ Retrieve memories error:', error);
    throw error;
  }
}

async function getRepProfile(rep_id) {
  try {
    const { data, error } = await supabase
      .from('rep_profiles')
      .select('*')
      .eq('rep_id', rep_id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return {
      success: true,
      profile: data || null
    };
  } catch (error) {
    console.error('❌ Get profile error:', error);
    throw error;
  }
}

// =====================================================
// HTTP Server
// =====================================================

async function handleRequest(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health check
  if (url.pathname === '/api/health') {
    const ollamaOk = await ollama.healthCheck();
    const { error: supabaseError } = await supabase.from('reps').select('count').limit(1);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      ollama: ollamaOk ? '✅' : '❌',
      supabase: !supabaseError ? '✅' : '❌',
      chat_model: CHAT_MODEL,
      embed_model: EMBED_MODEL,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Store episode memory
  if (url.pathname === '/api/memory/store' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const result = await storeEpisodeMemory(data);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Retrieve memories
  if (url.pathname === '/api/memory/retrieve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { rep_id, query_text, limit } = JSON.parse(body);
        const result = await retrieveEpisodeMemories(rep_id, query_text, limit);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Get rep profile
  if (url.pathname.startsWith('/api/memory/profile/') && req.method === 'GET') {
    const rep_id = url.pathname.split('/').pop();
    
    try {
      const result = await getRepProfile(rep_id);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

// =====================================================
// Start Server
// =====================================================

const server = http.createServer(handleRequest);

server.listen(PORT, async () => {
  console.log('\n🚀 ALIA 2.0 - Local Ollama Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`💬 Chat: ${CHAT_MODEL}`);
  console.log(`🔢 Embeddings: ${EMBED_MODEL} (768-dim)`);
  console.log(`🔗 Ollama: ${OLLAMA_HOST}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check Ollama connection
  const ollamaOk = await ollama.healthCheck();
  if (!ollamaOk) {
    console.error('⚠️  WARNING: Ollama not responding or models not found!');
    console.error(`   Run: ollama pull ${CHAT_MODEL}`);
    console.error(`   Run: ollama pull ${EMBED_MODEL}`);
  } else {
    console.log('✅ Ollama connected (chat + embed)\n');
  }

  console.log('📡 Endpoints:');
  console.log('  GET  /api/health');
  console.log('  POST /api/memory/store');
  console.log('  POST /api/memory/retrieve');
  console.log('  GET  /api/memory/profile/:rep_id\n');
});
