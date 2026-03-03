/**
 * DEPRECATED: Azure Speech SDK Implementation
 * 
 * ⚠️  This module has been superseded by tts-nvidia.server.ts
 * 
 * NVIDIA TTS provides:
 * - Single unified provider (same API key as Audio2Face)
 * - Lower latency and better cost efficiency
 * - Automatic fallback to mock audio
 * - Simplified architecture
 * 
 * MIGRATION PATH:
 * Use: synthesizeSpeechNvidia() from tts-nvidia.server.ts
 * Instead of: synthesizeSpeech() from this module
 * 
 * Kept for reference only - do not use in new code
 */

// Re-export from new implementation for backwards compatibility
export type TTSOptions = { voice?: string; rate?: string; pitch?: string; volume?: string };
export type VisemeTimestamp = { time: number; viseme: string; duration?: number };
export type TTSResult = { audio: Buffer | null; visemes: VisemeTimestamp[]; duration: number; textLength: number };

export { synthesizeSpeechNvidia as synthesizeSpeech } from './tts-nvidia.server';

/**
 * Available voices (for reference - DEPRECATED)
 * Use NVIDIA voices from tts-nvidia.server.ts instead
 */
export const VOICES = {
  en_US: {
    female: 'en-US-AriaNeural',
    male: 'en-US-GuyNeural',
    friendly: 'en-US-JennyNeural',
    professional: 'en-US-SaraNeural',
  },
  en_GB: {
    female: 'en-GB-SoniaNeural',
    male: 'en-GB-RyanNeural',
  },
};
