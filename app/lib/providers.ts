/**
 * ALIA 2.0 - Provider Abstraction Layer
 * Supports configurable LLM and embedding providers
 * 
 * LLM: Groq (fast) or Ollama (local)
 * Embeddings: Ollama (local, zero-cost)
 */

import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import http from 'node:http';

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
    provider: process.env.LLM_PROVIDER || 'groq', // 'groq' | 'ollama'
    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
    },
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'phi3',
    },
  },
  
  // Embedding (always Ollama for local/zero-cost)
  embedding: {
    model: 'nomic-embed-text',
    dimensions: 768,
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  },
  
  // Azure TTS
  tts: {
    key: process.env.AZURE_SPEECH_KEY || '',
    region: process.env.AZURE_SPEECH_REGION || 'eastus',
  },
};

// =====================================================
// Supabase Client
// =====================================================

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey
);

// =====================================================
// Groq Client
// =====================================================

let groqClient: Groq | null = null;

if (config.llm.provider === 'groq' && config.llm.groq.apiKey) {
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
      model: config.embedding.model,
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
      const hasEmbedModel = models.some((m) => m.name.startsWith(config.embedding.model));
      return hasChatModel && hasEmbedModel;
    } catch {
      return false;
    }
  }
}

export const ollama = new OllamaClient(config.embedding.host);

// =====================================================
// Unified LLM Interface
// =====================================================

export interface LLMResponse {
  text: string;
  elapsed_ms: number;
  provider: 'groq' | 'ollama';
}

export async function generateText(
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  } = {}
): Promise<LLMResponse> {
  // Try Groq first (fastest)
  if (config.llm.provider === 'groq' && groqClient) {
    try {
      const completion = await groqClient.chat.completions.create({
        model: options.model || config.llm.groq.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 512,
      });
      
      return {
        text: completion.choices[0]?.message?.content || '',
        elapsed_ms: 0, // Groq doesn't provide timing
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
}

export async function generateEmbedding(text: string): Promise<EmbeddingResponse> {
  return ollama.embed(text);
}

// =====================================================
// Health Check
// =====================================================

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  groq: '✅' | '❌' | '➖';
  ollama: '✅' | '❌';
  supabase: '✅' | '❌';
  llmProvider: string;
  embedModel: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  const results: HealthStatus = {
    status: 'ok',
    groq: '➖',
    ollama: '❌',
    supabase: '❌',
    llmProvider: config.llm.provider,
    embedModel: config.embedding.model,
  };
  
  // Check Groq
  if (config.llm.provider === 'groq' && groqClient) {
    results.groq = '✅';
  }
  
  // Check Ollama
  const ollamaOk = await ollama.healthCheck();
  results.ollama = ollamaOk ? '✅' : '❌';
  
  // Check Supabase
  try {
    const { error } = await supabase.from('reps').select('count').limit(1);
    results.supabase = error ? '❌' : '✅';
  } catch {
    results.supabase = '❌';
  }
  
  // Determine overall status
  if (results.ollama === '❌' || results.supabase === '❌') {
    results.status = 'down';
  } else if (results.groq === '❌' && config.llm.provider === 'groq') {
    results.status = 'degraded';
  }
  
  return results;
}

// =====================================================
// Export Configuration
// =====================================================

export { config };
