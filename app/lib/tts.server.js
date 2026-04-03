/**
 * Shared TTS pipeline helpers for the WebSocket gateway.
 * Provider order: Azure Speech -> NVIDIA FastPitch -> mock WAV.
 */

import { synthesizeAzure } from './tts-azure.server.js';

const AZURE_VOICE_MAP = {
  'en-US': 'en-US-JennyNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'ar-SA': 'ar-SA-ZariyahNeural',
  'es-ES': 'es-ES-ElviraNeural',
};

function getAzureVoice(language) {
  return AZURE_VOICE_MAP[language] ?? AZURE_VOICE_MAP['en-US'];
}

/**
 * Parse a WAV buffer's RIFF header to compute actual duration in seconds.
 */
function parseWavDuration(buf) {
  try {
    if (buf.length >= 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
      const channels = buf.readUInt16LE(22);
      const sampleRate = buf.readUInt32LE(24);
      const bitsPerSample = buf.readUInt16LE(34);

      let dataSize = buf.length - 44;
      for (let i = 36; i < buf.length - 8; i++) {
        if (buf.toString('ascii', i, i + 4) === 'data') {
          dataSize = buf.readUInt32LE(i + 4);
          break;
        }
      }

      const bytesPerSample = (bitsPerSample / 8) * channels;
      if (sampleRate > 0 && bytesPerSample > 0) {
        return dataSize / (sampleRate * bytesPerSample);
      }
    }

    // MP3 estimate (Azure REST output uses 32 kbps CBR mono MP3)
    if (
      (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
      (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
    ) {
      return (buf.length * 8) / 32000;
    }
  } catch (_) {}
  return Math.max(0.1, buf.length / 16000);
}

/**
 * Build a minimal mono 16-bit PCM WAV buffer filled with silence.
 * Used for mock fallback so downstream stages still get valid audio timing.
 */
function createSilentWav(durationSec = 1, sampleRate = 16000) {
  const channels = 1;
  const bitsPerSample = 16;
  const samples = Math.max(1, Math.floor(durationSec * sampleRate));
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples * channels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(channels * bytesPerSample, 32); // block align
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  return buf;
}

/**
 * Resolve active voice settings for this turn.
 */
function getActiveVoice(session = null) {
  const bcp47 = session?.language || process.env.DEFAULT_LANGUAGE || 'en-US';
  return {
    elevenLabsVoiceId: session?.voice_id || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Default: Rachel
    nvidiaTtsVoice: session?.tts_voice || process.env.TTS_VOICE || 'female',
    languageCode: bcp47ToISO639(bcp47),
  };
}

function bcp47ToISO639(tag) {
  if (!tag) return 'en';
  return tag.split('-')[0].toLowerCase();
}

/**
 * Single-entry TTS chain: Azure -> NVIDIA -> mock.
 */
export async function runTTS(text, session = null, options = {}) {
  const language = session?.language || process.env.DEFAULT_LANGUAGE || 'en-US';
  const voiceName = getAzureVoice(language);
  const azureSpeechKey = options.azureSpeechKey || process.env.AZURE_SPEECH_KEY || '';
  const azureSpeechRegion = options.azureSpeechRegion || process.env.AZURE_SPEECH_REGION || '';
  const voices = getActiveVoice(session);
  const nvidiaApiKey = options.nvidiaApiKey || process.env.NVIDIA_API_KEY || '';
  const nvidiaBaseUrl = options.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1';
  const nvidiaModel = options.nvidiaModel || 'nvidia/fastpitch-hifigan';

  // PRIMARY: Azure Speech
  if (azureSpeechKey && azureSpeechRegion) {
    try {
      const azResult = await synthesizeAzure(text, language, voiceName);
      if (azResult.audioBuffer?.length) {
        console.log(`✅ TTS: azure [${voiceName}] ${azResult.audioBuffer.length} bytes`);
        return {
          audioBase64: azResult.audioBuffer.toString('base64'),
          duration: parseWavDuration(azResult.audioBuffer),
          wordBoundaries: azResult.wordBoundaries ?? [],
          isMock: false,
          provider: 'azure-speech',
        };
      }
    } catch (e) {
      console.error('❌ Azure TTS failed:', e instanceof Error ? e.message : String(e));
    }
  } else {
    console.warn('[TTS] Azure not configured: AZURE_SPEECH_KEY or AZURE_SPEECH_REGION missing');
  }

  // FALLBACK: NVIDIA FastPitch
  if (nvidiaApiKey) {
    try {
      const resp = await fetch(`${nvidiaBaseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nvidiaApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: nvidiaModel,
          input: text,
          voice: voices.nvidiaTtsVoice,
        }),
      });

      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        const buf = Buffer.from(ab);
        return {
          audioBase64: buf.toString('base64'),
          duration: parseWavDuration(buf),
          wordBoundaries: [],
          isMock: false,
          provider: 'nvidia',
        };
      }
    } catch (e) {
      console.warn('NVIDIA TTS failed:', e instanceof Error ? e.message : String(e));
    }
  }

  // FINAL FALLBACK: silent WAV mock
  const wordCount = text.split(/\s+/).length;
  const duration = Math.max(1, wordCount / 2.5);
  const wav = createSilentWav(duration);
  return {
    audioBase64: wav.toString('base64'),
    duration,
    wordBoundaries: [],
    isMock: true,
    provider: 'mock',
  };
}

