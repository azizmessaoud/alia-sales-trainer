/**
 * ALIA 2.0 - Hybrid LLM Server (Groq + Local Embeddings)
 * Supports ultra-fast Groq inference + local nomic-embed-text embeddings
 * Zero-cost embeddings, blazing-fast generation
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

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

const PORT = 3002; // Fallback LLM server (3000 = NIM, 3001 = WebSocket, 5173 = Frontend)

// LLM Provider Configuration
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'groq'; // 'groq' or 'ollama'

// Groq (Fast inference - 500+ tok/sec)
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'mixtral-8x7b-32768';

// Ollama (Local inference - offline capability)
const OLLAMA_HOST = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_CHAT_MODEL = 'phi3';

// Embeddings (Always local via Ollama - zero cost)
const EMBED_MODEL = 'nomic-embed-text';  // 768-dim, fast, free
const EXPECTED_EMBED_DIM = 768;

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isLikelyAnonKey(value) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return value.startsWith('sb_publishable_') || lower.includes('anon');
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Missing required Supabase credentials.');
  console.error('   Required keys in .env:');
  console.error('   SUPABASE_URL=https://YOUR_PROJECT.supabase.co');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...\n');
  process.exit(1);
}

if (isLikelyAnonKey(supabaseServiceKey)) {
  console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY appears to be an anon/publishable key.');
  console.error('   Use the service_role key (sb_secret_...) from Supabase Project Settings.\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details,
      hint: error.hint,
    };
  }

  if (error && typeof error === 'object') {
    return {
      message: error.message || 'Unknown error object',
      code: error.code,
      details: error.details,
      hint: error.hint,
      raw: error,
    };
  }

  return { message: String(error) };
}

function logError(context, error, metadata = {}) {
  const payload = {
    context,
    ...metadata,
    error: serializeError(error),
    timestamp: new Date().toISOString(),
  };
  console.error('❌', JSON.stringify(payload, null, 2));
}

function assertEmbeddingDimension(embedding, context) {
  if (!Array.isArray(embedding)) {
    throw new Error(`[${context}] Embedding is not an array`);
  }

  if (embedding.length !== EXPECTED_EMBED_DIM) {
    throw new Error(
      `[${context}] Expected ${EXPECTED_EMBED_DIM}-dim embedding, got ${embedding.length}`
    );
  }
}

// Initialize clients
let groq;
if (LLM_PROVIDER === 'groq' && GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

// =====================================================
// Ollama Client (for embeddings + optional local generation)
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
      assertEmbeddingDimension(normalized, 'OllamaClient.embed');
      
      return {
        embedding: normalized,
        elapsed_ms: elapsed
      };
    } catch (error) {
      logError('ollama.embed', error, { model: this.embedModel });
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

const ollama = new OllamaClient(OLLAMA_HOST, OLLAMA_CHAT_MODEL, EMBED_MODEL);

// =====================================================
// Unified LLM Interface (Groq or Ollama)
// =====================================================

async function generateText(prompt, options = {}) {
  if (LLM_PROVIDER === 'groq' && groq) {
    // Use Groq for fast generation (500+ tok/sec)
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.3,
        max_tokens: options.max_tokens || 512,
      });
      
      return {
        text: completion.choices[0]?.message?.content || '',
        elapsed_ms: 0, // Groq doesn't provide timing
        provider: 'groq'
      };
    } catch (error) {
      console.warn('⚠️  Groq failed, falling back to local Ollama:', error.message);
    }
  }
  
  // Fallback to local Ollama or if LLM_PROVIDER is 'ollama'
  const result = await ollama.generate(prompt, options);
  return { ...result, provider: 'ollama' };
}

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
    assertEmbeddingDimension(embedding, 'storeEpisodeMemory');
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

    const { text: analysisText, provider } = await generateText(analysisPrompt, {
      temperature: 0.3,
      max_tokens: 256
    });
    performance.analysis_ms = Date.now() - analysisStart;
    performance.llm_provider = provider;

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
    logError('storeEpisodeMemory', error, {
      rep_id: data?.rep_id,
      session_id: data?.session_id,
    });
    throw error;
  }
}

async function retrieveEpisodeMemories(rep_id, query_text, limit = 5) {
  const startTime = Date.now();
  
  try {
    // Generate query embedding
    const { embedding } = await ollama.embed(query_text);
    assertEmbeddingDimension(embedding, 'retrieveEpisodeMemories');

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
    logError('retrieveEpisodeMemories', error, { rep_id, query_text, limit });
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
    logError('getRepProfile', error, { rep_id });
    throw error;
  }
}

async function runStartupValidation() {
  const { error: probeError } = await supabase
    .from('episode_memories')
    .select('id')
    .limit(1);

  if (probeError) {
    throw new Error(`Supabase probe failed: ${probeError.message}`);
  }

  const probeEmbedding = Array(EXPECTED_EMBED_DIM).fill(0);
  const { error: rpcError } = await supabase.rpc('search_episode_memories', {
    p_rep_id: '__startup_probe__',
    p_query_embedding: probeEmbedding,
    p_similarity_threshold: 0,
    p_limit: 1,
  });

  if (rpcError) {
    throw new Error(`search_episode_memories RPC missing or incompatible: ${rpcError.message}`);
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
    const { error: supabaseError } = await supabase.from('episode_memories').select('id').limit(1);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      llm_provider: LLM_PROVIDER,
      groq: LLM_PROVIDER === 'groq' && groq ? 'configured' : 'not-configured',
      ollama: ollamaOk ? 'ok' : 'error',
      supabase: !supabaseError ? 'ok' : 'error',
      generation_model: LLM_PROVIDER === 'groq' && groq ? GROQ_MODEL : OLLAMA_CHAT_MODEL,
      embed_model: EMBED_MODEL,
      expected_embedding_dimension: EXPECTED_EMBED_DIM,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Embedding-specific health check
  if (url.pathname === '/api/health/embedding') {
    try {
      const { embedding } = await ollama.embed('health check embedding dimension');
      assertEmbeddingDimension(embedding, 'health.embedding');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        model: EMBED_MODEL,
        dimension: embedding.length,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      logError('health.embedding', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        model: EMBED_MODEL,
        expected_dimension: EXPECTED_EMBED_DIM,
        error: serializeError(error).message,
      }));
    }
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
        logError('route:/api/memory/store', error, { body });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: serializeError(error).message }));
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
        logError('route:/api/memory/retrieve', error, { body });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: serializeError(error).message }));
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
      logError('route:/api/memory/profile/:rep_id', error, { rep_id });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: serializeError(error).message }));
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

let hasPrintedStartupBanner = false;

server.listen(PORT, async () => {
  if (!hasPrintedStartupBanner) {
    hasPrintedStartupBanner = true;
    console.log('\n🚀 ALIA 2.0 - Hybrid LLM Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`💬 Generation: ${LLM_PROVIDER === 'groq' && groq ? `Groq (${GROQ_MODEL})` : `Ollama (${OLLAMA_CHAT_MODEL})`}`);
    console.log(`🔢 Embeddings: ${EMBED_MODEL} (${EXPECTED_EMBED_DIM}-dim, local)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  try {
    await runStartupValidation();
    console.log('✅ Supabase startup validation passed');
  } catch (error) {
    logError('startup.validation', error);
    process.exit(1);
  }

  // Check connections
  const ollamaOk = await ollama.healthCheck();
  if (!ollamaOk) {
    console.error('⚠️  WARNING: Ollama not responding or models not found!');
    console.error(`   Run: ollama pull ${OLLAMA_CHAT_MODEL}`);
    console.error(`   Run: ollama pull ${EMBED_MODEL}`);
  } else {
    console.log(`✅ Ollama connected (embeddings${LLM_PROVIDER === 'ollama' ? ' + fallback' : ''})`);
  }

  if (LLM_PROVIDER === 'groq' && groq) {
    console.log('⚡ Groq connected (fast generation, 500+ tok/sec)');
  } else if (LLM_PROVIDER === 'groq' && !groq) {
    console.warn('⚠️  GROQ_API_KEY not configured, using Ollama');
  }

  console.log('\n📡 Endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/health/embedding');
  console.log('  POST /api/memory/store');
  console.log('  POST /api/memory/retrieve');
  console.log('  GET  /api/memory/profile/:rep_id\n');
});
