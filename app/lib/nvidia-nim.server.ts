/**
 * ALIA 2.0 - NVIDIA NIM Integration
 * Free API access via build.nvidia.com
 * Replaces Ollama/Groq with lower latency + privacy option
 */

import OpenAI from 'openai';

// =====================================================
// Configuration

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const AUDIO2FACE_BASE_URL = 'https://health.api.nvidia.com/v1/nvidia/audio2face-3d';

if (!NVIDIA_API_KEY) {
  console.warn('⚠️  NVIDIA_API_KEY not set. Get one at build.nvidia.com');
}

// Initialize NVIDIA NIM client (OpenAI-compatible)
const nimClient = new OpenAI({
  baseURL: NVIDIA_BASE_URL,
  apiKey: NVIDIA_API_KEY,
});

// =====================================================
// Model Selection
// =====================================================

const MODELS = {
  // Conversational LLM (fastest)
  LLM: 'meta/llama-3.1-8b-instruct', // 32ms ITL on H100

  // Speech-to-Text
  ASR: 'nvidia/parakeet-rnnt-1.1b', // Real-time, multilingual

  // Text-to-Speech
  TTS: 'nvidia/fastpitch-hifigan', // High-quality voice

  // Embeddings
  EMBEDDING: 'NV-Embed-QA', // 1024-dim, optimized for QA

  // Audio2Face-3D (Lip-sync for MetaHuman)
  AUDIO2FACE: 'nvidia/audio2face-3d',
};

// =====================================================
// LLM Generation
// =====================================================

export async function generateResponse(
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    max_tokens?: number;
    system_prompt?: string;
  } = {}
) {
  const {
    temperature = 0.7,
    max_tokens = 1024,
    system_prompt = 'You are ALIA, an AI-powered medical sales training assistant.',
  } = options;

  try {
    const completion = await nimClient.chat.completions.create({
      model: MODELS.LLM,
      messages: [
        { role: 'system', content: system_prompt },
        ...messages,
      ],
      temperature,
      max_tokens,
      stream: false,
    });

    return {
      text: completion.choices[0]?.message?.content || '',
      usage: completion.usage,
      model: completion.model,
    };
  } catch (error: any) {
    console.error('❌ NVIDIA NIM LLM error:', error.message);
    throw error;
  }
}

// =====================================================
// Streaming Generation (for real-time avatar)
// =====================================================

export async function* generateResponseStream(
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    max_tokens?: number;
  } = {}
) {
  const { temperature = 0.7, max_tokens = 1024 } = options;

  try {
    const stream = await nimClient.chat.completions.create({
      model: MODELS.LLM,
      messages,
      temperature,
      max_tokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    console.error('❌ NVIDIA NIM streaming error:', error.message);
    throw error;
  }
}

// =====================================================
// Embeddings (for Memory OS)
// =====================================================

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await nimClient.embeddings.create({
      model: MODELS.EMBEDDING,
      input: text,
    });

    return response.data[0].embedding;
  } catch (error: any) {
    console.error('❌ NVIDIA NIM embedding error:', error.message);
    throw error;
  }
}

// =====================================================
// Speech-to-Text (Parakeet ASR)
// =====================================================

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    // Convert buffer to base64
    const audioBase64 = audioBuffer.toString('base64');

    const response = await fetch(`${NVIDIA_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS.ASR,
        audio: audioBase64,
        language: 'en', // Supports multilingual
      }),
    });

    const data = await response.json();
    return data.text || '';
  } catch (error: any) {
    console.error('❌ NVIDIA NIM ASR error:', error.message);
    throw error;
  }
}

// =====================================================
// Text-to-Speech (FastPitch)
// =====================================================

export async function synthesizeSpeech(
  text: string,
  voice: string = 'default'
): Promise<Buffer> {
  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS.TTS,
        input: text,
        voice,
      }),
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error: any) {
    console.error('❌ NVIDIA NIM TTS error:', error.message);
    throw error;
  }
}

// =====================================================
// Audio2Face Integration (for lip-sync)
// =====================================================

export interface Audio2FaceBlendshapes {
  timestamp: number;
  blendshapes: Record<string, number>; // ARKit-compatible
}

export async function generateLipSync(
  audioBuffer: Buffer
): Promise<Audio2FaceBlendshapes[]> {
  try {
    const response = await fetch(`${AUDIO2FACE_BASE_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: audioBuffer.toString('base64'),
        format: 'arkit',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Audio2Face API error: ${response.status}`);
    }

    const data = await response.json();
    return data.blendshapes || [];
  } catch (error: any) {
    console.error('❌ NVIDIA Audio2Face error:', error.message);
    throw error;
  }
}

// =====================================================
// Health Check
// =====================================================

export async function healthCheck() {
  try {
    const response = await nimClient.models.list();
    return {
      status: 'ok',
      available_models: response.data.map(m => m.id),
      api_key_valid: true,
    };
  } catch (error: any) {
    return {
      status: 'error',
      error: error.message,
      api_key_valid: false,
    };
  }
}

// =====================================================
// Rate Limiting Helper
// =====================================================

class RateLimiter {
  private requests: number[] = [];
  private readonly limit = 40; // Free tier: 40 req/min
  private readonly window = 60000; // 1 minute

  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    // Remove old requests outside window
    this.requests = this.requests.filter(time => now - time < this.window);

    if (this.requests.length >= this.limit) {
      return false; // Rate limit exceeded
    }

    this.requests.push(now);
    return true;
  }

  getRemaining(): number {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.window);
    return this.limit - this.requests.length;
  }
}

export const rateLimiter = new RateLimiter();

// =====================================================
// Export
// =====================================================

export const NvidiaNIM = {
  generateResponse,
  generateResponseStream,
  generateEmbedding,
  transcribeAudio,
  synthesizeSpeech,
  generateLipSync,
  healthCheck,
  rateLimiter,
  MODELS,
};
