/**
 * Unified TTS service facade.
 * Thin wrapper over modules/tts-lipsync/tts.server.js
 * Ensures stable export shape and provider fallback chain.
 *
 * Modules may import: const { runTTS } = await import('../../services/tts.service.js');
 */

import { runTTS as runTTSImpl } from '../modules/tts-lipsync/tts.server.js';

/**
 * Run TTS synthesis with provider fallback (Azure → NVIDIA → mock).
 * @param {string} text - Text to synthesize
 * @param {Object} options - TTS options
 * @param {string} options.language - BCP 47 language tag (default: en-US)
 * @param {string} options.voice - Voice name (provider-dependent)
 * @param {number} options.pitch - Pitch adjustment (0.5–2.0, default: 1.0)
 * @param {number} options.rate - Speech rate (0.5–2.0, default: 1.0)
 * @returns {Promise<Object>} - { audioBase64, duration, wordBoundaries, isMock, provider }
 */
export async function runTTS(text, options = {}) {
  return runTTSImpl(text, options);
}

/**
 * Get available voices for a given provider.
 * @param {string} provider - 'azure' | 'nvidia' | 'mock'
 * @returns {Promise<Array<Object>>} - Array of { name, language, gender }
 */
export async function getVoices(provider = 'azure') {
  if (provider === 'nvidia') {
    const { getNvidiaVoices } = await import('../modules/tts-lipsync/tts-nvidia.server.ts');
    return getNvidiaVoices();
  }
  if (provider === 'azure') {
    // Azure voices are hardcoded in tts-azure.server.js; return common ones
    return [
      { name: 'en-US-JennyNeural', language: 'en-US', gender: 'female' },
      { name: 'fr-FR-DeniseNeural', language: 'fr-FR', gender: 'female' },
      { name: 'ar-SA-ZariyahNeural', language: 'ar-SA', gender: 'female' },
      { name: 'es-ES-ElviraNeural', language: 'es-ES', gender: 'female' }
    ];
  }
  // mock or unknown
  return [];
}

export default {
  runTTS,
  getVoices
};
