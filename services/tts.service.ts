/**
 * TTS Service Facade
 * ==================
 * Thin re-export wrapper around modules/tts-lipsync/.
 *
 * PURPOSE:
 *   Provides a stable import path for the TTS pipeline. Routes viseme-generating
 *   synthesis through a single entry point regardless of whether Azure or NVIDIA
 *   is the active provider.
 *
 * USAGE:
 *   import { synthesizeSpeechWithVisemes, wordBoundariesToVisemes, runTTS } from '../../services/tts.service';
 *
 * CONTRACT (DO NOT CHANGE SIGNATURES):
 *   synthesizeSpeechWithVisemes(text, voice, lang) → Promise<TTSResult>
 *   wordBoundariesToVisemes(boundaries, lang) → VisemeFrame[]
 *   runTTS(text, session) → Promise<TTSResult>
 *
 * CONSTRAINTS:
 *   - No business logic here — only re-exports
 *   - Must not import browser APIs — this facade runs in Node.js
 */

// Re-export TTS functions
export { wordBoundariesToVisemes } from '../modules/tts-lipsync/lipsync.server.js';
export { runTTS } from '../modules/tts-lipsync/tts.server.js';

// Alias runTTS as synthesizeSpeechWithVisemes for compatibility with orchestration
import { runTTS } from '../modules/tts-lipsync/tts.server.js';
export const synthesizeSpeechWithVisemes = runTTS;
