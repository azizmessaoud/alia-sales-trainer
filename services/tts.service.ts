/**
 * TTS Service Facade
 * ==================
 * Thin re-export wrapper around modules/tts-lipsync/tts.server.
 *
 * PURPOSE:
 *   Provides a stable import path for the TTS pipeline. Routes viseme-generating
 *   synthesis through a single entry point regardless of whether Azure or NVIDIA
 *   is the active provider.
 *
 * USAGE:
 *   import { synthesizeSpeech, synthesizeSpeechWithVisemes } from '../../services/tts.service';
 *
 * CONTRACT (DO NOT CHANGE SIGNATURES):
 *   synthesizeSpeech(text, voice, lang) → Promise<TTSResult>
 *   synthesizeSpeechWithVisemes(text, voice, lang) → Promise<TTSResult & { visemes: VisemeFrame[] }>
 *
 * CONSTRAINTS:
 *   - No business logic here — only re-exports
 *   - Must not import browser APIs — this facade runs in Node.js
 *   - TypeScript strict: no `any`
 */

// Re-export all public TTS synthesis functions and types
export {
  synthesizeSpeech,
  synthesizeSpeechWithVisemes,
} from '../modules/tts-lipsync/tts.server';

export type {
  TTSResult,
  VisemeFrame,
  WordBoundary,
} from '../modules/tts-lipsync/tts.server';
