/**
 * ALIA 2.0 - NVIDIA NIM Integration
 * Free API access via build.nvidia.com
 * Replaces Ollama/Groq with lower latency + privacy option
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
  messages: ChatCompletionMessageParam[],
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
  messages: ChatCompletionMessageParam[],
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
  voice: string = process.env.TTS_VOICE || 'female'
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

export interface Audio2FaceBlendshape {
  timestamp: number;
  blendshapes: Record<string, number>; // ARKit-compatible (0-1 range)
}

export interface Audio2FaceResponse {
  blendshapes: Audio2FaceBlendshape[];
  duration: number; // milliseconds
  sampleRate?: number;
}

/**
 * Generate lip-sync blendshapes from audio using NVIDIA Audio2Face-3D
 * 
 * @param audioBuffer - Raw audio data (WAV or PCM Buffer)
 * @param format - Output format: 'arkit' for ARKit blendshapes (default)
 * @returns Array of blendshape animation frames with millisecond timestamps
 * 
 * @example
 * const buffer = fs.readFileSync('speech.wav');
 * const blendshapes = await generateLipSync(buffer);
 * avatar.playLipSync(blendshapes, 0);
 */
export async function generateLipSync(
  audioBuffer: Buffer,
  format: string = 'arkit'
): Promise<Audio2FaceBlendshape[]> {
  try {
    // ✅ Validate API key
    if (!NVIDIA_API_KEY) {
      throw new Error(
        '❌ NVIDIA_API_KEY not configured. Get one at https://build.nvidia.com'
      );
    }

    // ✅ Validate audio buffer
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('❌ Audio buffer is empty or invalid');
    }

    const fileSizeKB = (audioBuffer.length / 1024).toFixed(1);
    console.log(`🎤 Audio2Face: Processing ${fileSizeKB}KB audio...`);

    // Convert audio buffer to base64
    const audioBase64 = audioBuffer.toString('base64');

    // ✅ Call NVIDIA Audio2Face API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${AUDIO2FACE_BASE_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: audioBase64,
        format: format, // 'arkit' for ARKit blendshapes
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // ✅ Better error handling
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        errorMessage = errorText.slice(0, 200) || errorMessage;
      }

      console.error(`❌ Audio2Face API error: ${errorMessage}`);

      // Return mock data in development mode for testing
      if (process.env.NODE_ENV !== 'production') {
        console.log('📝 Falling back to mock lip-sync data for testing...');
        return generateMockLipSync(audioBuffer.length);
      }

      throw new Error(`Audio2Face API error: ${errorMessage}`);
    }

    const data = (await response.json()) as any;

    // ✅ Validate response format
    if (!data.blendshapes) {
      console.warn('⚠️  Unexpected API response format:', JSON.stringify(data).slice(0, 300));
      
      // Fallback to mock data
      if (process.env.NODE_ENV !== 'production') {
        console.log('📝 Returning mock data due to invalid API response...');
        return generateMockLipSync(audioBuffer.length);
      }

      throw new Error('Invalid Audio2Face API response: missing blendshapes array');
    }

    if (!Array.isArray(data.blendshapes)) {
      console.warn('⚠️  Blendshapes is not an array:', typeof data.blendshapes);
      return generateMockLipSync(audioBuffer.length);
    }

    console.log(`✅ Audio2Face: Generated ${data.blendshapes.length} blendshape frames`);

    // ✅ Transform response to ensure correct format
    return data.blendshapes.map((frame: any, idx: number) => ({
      timestamp: frame.timestamp ?? frame.time ?? idx * 33, // Default 30fps (33ms)
      blendshapes: normalizeBlendshapes(frame.blendshapes ?? frame.shapes ?? {}),
    }));
  } catch (error: any) {
    console.error('❌ Audio2Face error:', error.message);

    // In development, return mock data instead of throwing
    if (process.env.NODE_ENV !== 'production' && error.message.includes('API')) {
      console.log('📝 Using mock lip-sync for development...');
      return generateMockLipSync(audioBuffer.length);
    }

    throw error;
  }
}

/**
 * Normalize blendshape values to 0-1 range
 */
function normalizeBlendshapes(
  blendshapes: Record<string, number>
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const [key, value] of Object.entries(blendshapes)) {
    // Ensure values are in 0-1 range
    normalized[key] = Math.max(0, Math.min(1, Number(value) || 0));
  }

  return normalized;
}

/**
 * Generate realistic mock lip-sync data for testing/development
 * Simulates blendshape animation without actual audio analysis
 * 
 * @param audioBufferLength - Length of original audio buffer in bytes
 * @param sampleRate - Audio sample rate (default: 16000 Hz)
 * @returns Array of blendshape frames at 30fps
 */
function generateMockLipSync(
  audioBufferLength: number,
  sampleRate: number = 16000
): Audio2FaceBlendshape[] {
  // Estimate duration: buffer_size_bytes / (sample_rate bytes/sec)
  const bytesPerSample = 2; // 16-bit audio = 2 bytes per sample
  const secondsPerByte = 1 / (sampleRate * bytesPerSample);
  const durationSeconds = audioBufferLength * secondsPerByte;
  const durationMs = durationSeconds * 1000;

  const frames: Audio2FaceBlendshape[] = [];
  const frameInterval = 33; // 30fps = ~33ms per frame

  for (let timestamp = 0; timestamp < durationMs; timestamp += frameInterval) {
    // Normalize time to 0-1
    const t = timestamp / durationMs;

    // Create natural-looking blendshape oscillations
    const jawWave = Math.sin(t * Math.PI * 2);
    const mouthWave = Math.cos(t * Math.PI * 4);
    const blinkWave = Math.sin(t * Math.PI * 8);

    frames.push({
      timestamp: Math.round(timestamp),
      blendshapes: {
        // Jaw movement (fundamental)
        jawOpen: Math.max(0, Math.min(1, 0.5 + jawWave * 0.3)),

        // Mouth shapes (split Left/Right for RPM models)
        mouthSmileLeft: Math.max(0, Math.min(1, 0.3 + mouthWave * 0.2)),
        mouthSmileRight: Math.max(0, Math.min(1, 0.3 + mouthWave * 0.2)),
        mouthFunnel: Math.max(0, Math.min(1, Math.abs(jawWave) * 0.4)),
        mouthFrown: Math.max(0, Math.min(1, Math.abs(mouthWave) * 0.15)),

        // Eye blinks (periodic)
        eyeBlinkLeft: Math.abs(blinkWave) < 0.3 ? 1.0 : 0.0,
        eyeBlinkRight: Math.abs(blinkWave - 0.2) < 0.3 ? 1.0 : 0.0,

        // Subtle eyebrow movement (split Left/Right)
        browDownLeft: Math.max(0, Math.min(1, Math.abs(mouthWave) * 0.1)),
        browDownRight: Math.max(0, Math.min(1, Math.abs(mouthWave) * 0.1)),

        // ReadyPlayerMe / Oculus viseme targets
        viseme_aa: Math.max(0, Math.min(1, jawWave * 0.6)),
        viseme_O: Math.max(0, Math.min(1, Math.abs(mouthWave) * 0.5)),
        viseme_FF: Math.max(0, Math.min(1, Math.abs(jawWave) * 0.2)),
        viseme_SS: Math.max(0, Math.min(1, Math.abs(mouthWave) * 0.15)),
      },
    });
  }

  console.log(
    `📊 Mock data: Generated ${frames.length} frames over ${durationSeconds.toFixed(1)}s`
  );

  return frames;
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
