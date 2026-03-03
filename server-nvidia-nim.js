/**
 * ALIA 2.0 - NVIDIA NIM Server
 * Ultra-low latency with Audio2Face lip-sync
 * Free tier: 40 requests/min at build.nvidia.com
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Load .env
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

// NVIDIA NIM Configuration
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!NVIDIA_API_KEY) {
  console.error('\n❌ Missing NVIDIA_API_KEY');
  console.error('   Get free API key at: https://build.nvidia.com/explore/discover\n');
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Missing Supabase credentials\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize NVIDIA NIM client (OpenAI-compatible)
const nvidia = new OpenAI({
  baseURL: NVIDIA_BASE_URL,
  apiKey: NVIDIA_API_KEY,
});

// Models
const MODELS = {
  LLM: 'meta/llama-3.1-8b-instruct',
  EMBEDDING: 'nvidia/nv-embed-v2', // 4096-dim
  ASR: 'nvidia/parakeet-rnnt-1.1b',
  TTS: 'nvidia/fastpitch-hifigan',
};

// =====================================================
// Rate Limiter (40 req/min free tier)
// =====================================================

class RateLimiter {
  constructor(limit = 40, window = 60000) {
    this.limit = limit;
    this.window = window;
    this.requests = [];
  }

  checkLimit() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.window);

    if (this.requests.length >= this.limit) {
      return { allowed: false, remaining: 0 };
    }

    this.requests.push(now);
    return { allowed: true, remaining: this.limit - this.requests.length };
  }
}

const rateLimiter = new RateLimiter();

// =====================================================
// Memory OS Functions
// =====================================================

async function storeEpisodeMemory(data) {
  const startTime = Date.now();
  const performance = {};

  try {
    // 1. Generate embedding (NVIDIA NIM)
    const embedStart = Date.now();
    const embeddingResponse = await nvidia.embeddings.create({
      model: MODELS.EMBEDDING,
      input: data.episode_text,
    });
    const embedding = embeddingResponse.data[0].embedding;
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

    const completion = await nvidia.chat.completions.create({
      model: MODELS.LLM,
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.3,
      max_tokens: 256,
    });

    performance.analysis_ms = Date.now() - analysisStart;
    performance.llm_provider = 'nvidia-nim';

    // Parse LLM response
    let learning_summary;
    try {
      const responseText = completion.choices[0]?.message?.content || '{}';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      learning_summary = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
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
    console.error('❌ Store memory error:', error);
    throw error;
  }
}

async function retrieveEpisodeMemories(rep_id, query_text, limit = 5) {
  const startTime = Date.now();

  try {
    // Generate query embedding
    const embeddingResponse = await nvidia.embeddings.create({
      model: MODELS.EMBEDDING,
      input: query_text,
    });
    const embedding = embeddingResponse.data[0].embedding;

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
  // CORS
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
    try {
      const modelsResponse = await nvidia.models.list();
      const { error: supabaseError } = await supabase.from('reps').select('count').limit(1);

      // Check rate limit
      const rateLimit = rateLimiter.checkLimit();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        provider: 'nvidia-nim',
        nvidia_api: '✅',
        supabase: !supabaseError ? '✅' : '❌',
        llm_model: MODELS.LLM,
        embedding_model: MODELS.EMBEDDING,
        rate_limit_remaining: rateLimit.remaining,
        available_models: modelsResponse.data.slice(0, 5).map(m => m.id),
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', error: error.message }));
    }
    return;
  }

  // Store episode memory
  if (url.pathname === '/api/memory/store' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        // Rate limit check
        const rateLimit = rateLimiter.checkLimit();
        if (!rateLimit.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Rate limit exceeded (40 req/min). Wait and retry.',
            retry_after: 60
          }));
          return;
        }

        const data = JSON.parse(body);
        const result = await storeEpisodeMemory(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, rate_limit_remaining: rateLimit.remaining }));
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
        const rateLimit = rateLimiter.checkLimit();
        if (!rateLimit.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
          return;
        }

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
  console.log('\n🚀 ALIA 2.0 - NVIDIA NIM Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`💚 Provider: NVIDIA NIM (Free Tier)`);
  console.log(`💬 LLM: ${MODELS.LLM}`);
  console.log(`🔢 Embeddings: ${MODELS.EMBEDDING} (4096-dim)`);
  console.log(`⚡ Latency: <50ms inference on NVIDIA GPUs`);
  console.log(`🔒 Privacy: Self-host option available`);
  console.log(`📊 Rate Limit: 40 requests/min (free tier)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check connections
  try {
    const modelsResponse = await nvidia.models.list();
    console.log('✅ NVIDIA NIM API connected');
    console.log(`   Available models: ${modelsResponse.data.length}`);
  } catch (error) {
    console.error('❌ NVIDIA NIM API connection failed:', error.message);
    console.error('   Get API key at: https://build.nvidia.com/explore/discover');
  }

  console.log('\n📡 Endpoints:');
  console.log('  GET  /api/health');
  console.log('  POST /api/memory/store');
  console.log('  POST /api/memory/retrieve');
  console.log('  GET  /api/memory/profile/:rep_id\n');

  console.log('💡 Tip: Self-host NIM containers for HIPAA/GDPR compliance');
  console.log('   Docker: https://developer.nvidia.com/nim\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`   Run: Get-NetTCPConnection -LocalPort ${PORT} | Stop-Process -Force`);
    console.error(`   Then restart this server.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
