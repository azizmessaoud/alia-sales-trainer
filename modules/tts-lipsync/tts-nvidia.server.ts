/**
 * NVIDIA Text-to-Speech Implementation
 * Uses NVIDIA NIM API for high-quality audio generation
 * Unified provider with Audio2Face for seamless integration
 */

import OpenAI from 'openai';

const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

export interface TTSResponse {
  audio: Buffer;
  duration: number; // in seconds
  format: 'wav' | 'mp3';
  sampleRate: number;
}

/**
 * Synthesize speech using NVIDIA NIM TTS
 * Returns high-quality audio directly usable with Audio2Face
 */
export async function synthesizeSpeechNvidia(
  text: string,
  voice: string = 'en-US-JennyNeural',
  timeout: number = 30000
): Promise<TTSResponse> {
  if (!process.env.NVIDIA_API_KEY) {
    console.warn('⚠️  NVIDIA_API_KEY not set - falling back to mock audio');
    return generateMockTTSAudio(text);
  }

  try {
    console.log(`🎤 Synthesizing speech: "${text.substring(0, 50)}..."`);
    const startTime = Date.now();

    // Race with timeout
    const audioResponse = await Promise.race([
      nvidia.audio.speech.create({
        model: 'tts-1', // NVIDIA TTS model
        voice: voice,
        input: text,
        response_format: 'wav',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TTS timeout')), timeout)
      ),
    ]);

    // Convert response to buffer
    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const duration = buffer.length / (16000 * 2); // Assuming 16kHz, 16-bit audio
    const elapsed = Date.now() - startTime;

    console.log(
      `✅ TTS Complete: ${buffer.length} bytes, ${duration.toFixed(2)}s duration [${elapsed}ms]`
    );

    return {
      audio: buffer,
      duration,
      format: 'wav',
      sampleRate: 16000,
    };
  } catch (error) {
    console.error('❌ TTS Error:', error instanceof Error ? error.message : error);
    console.log('📢 Falling back to mock audio...');
    return generateMockTTSAudio(text);
  }
}

/**
 * Fallback: Generate mock TTS audio with realistic characteristics
 * Used when NVIDIA API is unavailable or for testing
 */
export function generateMockTTSAudio(text: string): TTSResponse {
  console.log(`📢 Generating mock audio for: "${text.substring(0, 50)}..."`);

  // Estimate duration: ~180 words per minute = 3 words per second
  // Cap at 8 seconds max to keep latency under 5s target
  const wordCount = text.split(/\s+/).length;
  const durationSeconds = Math.min(8, Math.max(0.5, wordCount / 3));

  // Generate realistic speech-like WAV file
  const sampleRate = 16000;
  const samples = Math.floor(sampleRate * durationSeconds);
  const audioData = new Int16Array(samples);

  let phase = 0;
  for (let i = 0; i < samples; i++) {
    // Vary frequency across speech range (100-250 Hz) for masculine voice
    // Add amplitude modulation for prosody
    const t = i / sampleRate;
    const baseFreq = 150 + 50 * Math.sin(Math.PI * 2 * t);
    const envelope = Math.sin(Math.PI * t / durationSeconds); // Fade in/out
    const amplitude = envelope * 20000;

    // Add harmonics for natural speech
    const fundamental = Math.sin(phase);
    const harmonic2 = 0.5 * Math.sin(2 * phase);
    const harmonic3 = 0.25 * Math.sin(3 * phase);
    const sample = (fundamental + harmonic2 + harmonic3) / 1.75 * amplitude;

    audioData[i] = Math.max(-32768, Math.min(32767, Math.floor(sample)));

    phase += (2 * Math.PI * baseFreq) / sampleRate;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
  }

  // Convert Int16Array to Buffer with WAV header
  const buffer = createWavFile(audioData, sampleRate);

  console.log(
    `📢 Mock audio generated: ${buffer.length} bytes, ${durationSeconds.toFixed(2)}s`
  );

  return {
    audio: buffer,
    duration: durationSeconds,
    format: 'wav',
    sampleRate,
  };
}

/**
 * Create a proper WAV file header for Int16Array audio data
 * Required for Audio2Face and audio playback
 */
function createWavFile(audioData: Int16Array, sampleRate: number): Buffer {
  const channels = 1; // Mono
  const bytesPerSample = 2;
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;

  // WAV file header (44 bytes)
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audioData.byteLength, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(audioData.byteLength, 40);

  return Buffer.concat([header, Buffer.from(audioData.buffer)]);
}

/**
 * Validate TTS response format
 */
export function validateTTSResponse(response: TTSResponse): boolean {
  if (!response.audio || !(response.audio instanceof Buffer)) {
    console.error('❌ Invalid TTS response: missing audio buffer');
    return false;
  }

  if (response.duration <= 0 || response.duration > 300) {
    console.error('❌ Invalid TTS response: duration out of range');
    return false;
  }

  if (response.format !== 'wav' && response.format !== 'mp3') {
    console.error('❌ Invalid TTS response: unsupported format');
    return false;
  }

  if (response.sampleRate !== 16000 && response.sampleRate !== 44100) {
    console.error('❌ Invalid TTS response: unsupported sample rate');
    return false;
  }

  return true;
}

/**
 * Get available voices for TTS
 */
export const AVAILABLE_VOICES = [
  { id: 'en-US-JennyNeural', label: 'Jenny (Female)', language: 'en-US' },
  { id: 'en-US-GuyNeural', label: 'Guy (Male)', language: 'en-US' },
  { id: 'en-US-AriaNeural', label: 'Aria (Female)', language: 'en-US' },
  { id: 'en-US-AmberNeural', label: 'Amber (Female)', language: 'en-US' },
  { id: 'en-US-AshleyNeural', label: 'Ashley (Female)', language: 'en-US' },
  { id: 'en-US-CoraNeural', label: 'Cora (Female)', language: 'en-US' },
] as const;

export type VoiceId = (typeof AVAILABLE_VOICES)[number]['id'];

/**
 * Get voice details by ID
 */
export function getVoiceDetails(voiceId: string) {
  return AVAILABLE_VOICES.find((v) => v.id === voiceId) || AVAILABLE_VOICES[0];
}
