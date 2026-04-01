/**
 * ALIA 2.0 - Provider Abstraction Layer
 * Supports configurable LLM and embedding providers
 * 
 * Primary LLM: NVIDIA NIM (fastest)
 * Primary Embeddings: HuggingFace Inference API (intfloat/multilingual-e5-small, 384-dim)
 * Fallback: Groq (LLM) or Ollama (local)
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { HfInference } from '@huggingface/inference';
import http from 'node:http';
import { NvidiaNIM } from './nvidia-nim.server';

// =====================================================
// Environment Configuration
// =====================================================

const config = {
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  
  // LLM Providers
  llm: {
    provider: process.env.LLM_PROVIDER || 'nvidia', // 'nvidia' | 'groq' | 'ollama'
    nvidia: {
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: NvidiaNIM.MODELS.LLM,
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
    },
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'phi3',
    },
  },
  
  // Embedding
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'huggingface', // 'huggingface' | 'nvidia' | 'ollama'
    huggingface: {
      token: process.env.HF_TOKEN || '',
      apiUrl: process.env.HF_INFERENCE_API_URL || 'https://api-inference.huggingface.co/models',
      model: process.env.QDRANT_EMBEDDING_MODEL || 'intfloat/multilingual-e5-small', // 384-dim
    },
    nvidia: {
      apiKey: process.env.NVIDIA_API_KEY || '',
      model: NvidiaNIM.MODELS.EMBEDDING, // 'NV-Embed-QA' (1024-dim) — deprecated, kept for legacy only
    },
    ollama: {
      model: 'nomic-embed-text', // Warning: 768-dim, only use for local testing if DB is adjusted
      host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    },
  },
};

// =====================================================
// Supabase Client
// =====================================================

let supabase: SupabaseClient | any;

try {
  if (!config.supabase.url || !config.supabase.serviceKey) {
    throw new Error('Missing Supabase credentials');
  }
  supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  console.log('✅ Supabase client connected');
} catch (err) {
  console.warn('⚠️ Supabase not configured or failed to connect — using mock client. Real DB operations will fail.');
  // Mock client that returns empty arrays or nulls to prevent crashes
  supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: async () => ({ data: null, error: null }),
    }),
    rpc: async () => ({ data: [], error: null }),
  } as any;
}

export { supabase };

// =====================================================
// Groq Client
// =====================================================

let groqClient: Groq | null = null;

if (config.llm.groq.apiKey) {
  groqClient = new Groq({ apiKey: config.llm.groq.apiKey });
}

// =====================================================
// Ollama HTTP Client
// =====================================================

class OllamaClient {
  private hostname: string;
  private port: number;
  
  constructor(host: string) {
    const url = new URL(host);
    this.hostname = url.hostname;
    this.port = parseInt(url.port) || 11434;
  }
  
  private async request<T>(path: string, body: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      
      const options = {
        hostname: this.hostname,
        port: this.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 120000, // 2 min timeout for CPU inference
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response from Ollama'));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  async generate(prompt: string, options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}): Promise<{ text: string; elapsed_ms: number; tokens: number }> {
    const start = Date.now();
    const model = options.model || config.llm.ollama.model;
    
    const response = await this.request<{ response: string; eval_count?: number }>('/api/generate', {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.3,
        top_p: 0.9,
        num_predict: options.maxTokens || 512,
      },
    });
    
    return {
      text: response.response.trim(),
      elapsed_ms: Date.now() - start,
      tokens: response.eval_count || 0,
    };
  }
  
  async embed(text: string): Promise<{ embedding: number[]; elapsed_ms: number }> {
    const start = Date.now();
    
    const response = await this.request<{ embedding: number[] }>('/api/embeddings', {
      model: config.embedding.ollama.model,
      prompt: text,
    });
    
    // Normalize to unit vector for cosine similarity
    const embedding = response.embedding;
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    const normalized = embedding.map((val) => val / magnitude);
    
    return {
      embedding: normalized,
      elapsed_ms: Date.now() - start,
    };
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ models?: { name: string }[] }>('/api/tags', {});
      const models = response.models || [];
      const hasChatModel = models.some((m) => m.name.startsWith(config.llm.ollama.model));
      const hasEmbedModel = models.some((m) => m.name.startsWith(config.embedding.ollama.model));
      return hasChatModel && hasEmbedModel;
    } catch {
      return false;
    }
  }
}

export const ollama = new OllamaClient(config.embedding.ollama.host);

// HuggingFace Inference API client for embeddings (intfloat/multilingual-e5-small)
const hf = new HfInference(process.env.HF_TOKEN || '');

// =====================================================
// Unified LLM Interface
// =====================================================

export interface LLMResponse {
  text: string;
  elapsed_ms: number;
  provider: 'nvidia' | 'groq' | 'ollama';
}

export async function generateText(
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
    system_prompt?: string;
  } = {}
): Promise<LLMResponse> {
  const start = Date.now();

  // Try NVIDIA NIM first (primary)
  if (config.llm.provider === 'nvidia' && config.llm.nvidia.apiKey) {
    try {
      const result = await NvidiaNIM.generateResponse(
        [{ role: 'user', content: prompt }],
        {
          temperature: options.temperature || 0.3,
          max_tokens: options.maxTokens || 512,
          system_prompt: options.system_prompt,
        }
      );
      
      return {
        text: result.text,
        elapsed_ms: Date.now() - start,
        provider: 'nvidia',
      };
    } catch (error) {
      console.warn('⚠️ NVIDIA NIM failed, falling back to Groq:', (error as Error).message);
    }
  }

  // Try Groq second
  if (groqClient) {
    try {
      const completion = await groqClient.chat.completions.create({
        model: options.model || config.llm.groq.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 512,
      });
      
      return {
        text: completion.choices[0]?.message?.content || '',
        elapsed_ms: Date.now() - start,
        provider: 'groq',
      };
    } catch (error) {
      console.warn('⚠️ Groq failed, falling back to Ollama:', (error as Error).message);
    }
  }
  
  // Fallback to Ollama
  const result = await ollama.generate(prompt, options);
  return {
    text: result.text,
    elapsed_ms: result.elapsed_ms,
    provider: 'ollama',
  };
}

// =====================================================
// Embedding Interface
// =====================================================

export interface EmbeddingResponse {
  embedding: number[];
  elapsed_ms: number;
  provider: 'huggingface' | 'nvidia' | 'ollama';
}

export async function generateEmbedding(text: string): Promise<EmbeddingResponse> {
  const start = Date.now();

  // Primary: HuggingFace Inference API (384-dim intfloat/multilingual-e5-small)
  if (config.embedding.provider === 'huggingface' && config.embedding.huggingface.token) {
    try {
      // e5 models require 'query:' prefix for retrieval tasks
      const prefixedText = `query: ${text}`;
      
      const raw = (await hf.featureExtraction({
        model: 'intfloat/multilingual-e5-small',
        inputs: prefixedText,
      })) as number[] | number[][];

      // featureExtraction returns number[] | number[][] depending on input count
      const embedding = Array.isArray(raw[0]) ? (raw as number[][])[0] : (raw as number[]);

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from HF');
      }

      return {
        embedding,
        elapsed_ms: Date.now() - start,
        provider: 'huggingface',
      };
    } catch (error) {
      console.warn('⚠️ HuggingFace embedding failed:', (error as Error).message);
    }
  }

  // Fallback: Try NVIDIA NIM (1024-dim) — legacy support
  if (config.embedding.provider === 'nvidia' && config.embedding.nvidia.apiKey) {
    try {
      console.warn('⚠️ Using NVIDIA NIM for embeddings (1024-dim) — dimension mismatch likely with 384-dim schema');
      const embedding = await NvidiaNIM.generateEmbedding(text);
      return {
        embedding,
        elapsed_ms: Date.now() - start,
        provider: 'nvidia',
      };
    } catch (error) {
      console.warn('⚠️ NVIDIA NIM embedding failed:', (error as Error).message);
    }
  }

  // Final fallback: Ollama (768-dim)
  console.warn('⚠️ Falling back to Ollama (768-dim) — dimension mismatch likely with 384-dim schema');
  const result = await ollama.embed(text);
  return {
    ...result,
    provider: 'ollama',
  };
}

// =====================================================
// Health Check
// =====================================================

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  huggingface: '✅' | '❌' | '➖';
  nvidia: '✅' | '❌' | '➖';
  groq: '✅' | '❌' | '➖';
  ollama: '✅' | '❌';
  supabase: '✅' | '❌';
  llmProvider: string;
  embedModel: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  const results: HealthStatus = {
    status: 'ok',
    huggingface: '➖',
    nvidia: '➖',
    groq: '➖',
    ollama: '❌',
    supabase: '❌',
    llmProvider: config.llm.provider,
    embedModel: config.embedding.huggingface.model,
  };
  
  // Check HuggingFace
  if (config.embedding.provider === 'huggingface' && config.embedding.huggingface.token) {
    results.huggingface = '✅';
  }
  
  // Check NVIDIA
  if (config.llm.nvidia.apiKey) {
    results.nvidia = '✅';
  }
  
  // Check Groq
  if (config.llm.groq.apiKey) {
    results.groq = '✅';
  }
  
  // Check Ollama
  const ollamaOk = await ollama.healthCheck();
  results.ollama = ollamaOk ? '✅' : '❌';
  
  // Check Supabase
  try {
    const { error } = await supabase.from('episode_memories').select('count').limit(1);
    results.supabase = error ? '❌' : '✅';
  } catch {
    results.supabase = '❌';
  }
  
  // Determine overall status
  if (results.supabase === '❌') {
    results.status = 'down';
  } else if (results.nvidia === '➖' && results.groq === '➖' && results.ollama === '❌') {
    results.status = 'down';
  } else if (results.nvidia === '❌' || results.groq === '❌') {
    results.status = 'degraded';
  }
  
  return results;
}

// =====================================================
// Export Configuration
// =====================================================

export { config };

