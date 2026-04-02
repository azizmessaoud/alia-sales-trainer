/**
 * Shared TTS pipeline helpers for the WebSocket gateway.
 * Provider order: ElevenLabs -> NVIDIA FastPitch -> mock WAV.
 */

import { alignmentToVisemes } from './lipsync.server.js';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

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
  } catch (_) {}
  return buf.length / (16000 * 2);
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
 * ELEVENLABS: TTS with Timestamps (for lip-sync alignment)
 * Returns audio + alignment + converted blendshapes for 30fps animation
 */
export async function runTTSWithTimestamps(text, session = null, options = {}) {
  const voices = getActiveVoice(session);
  const apiKey = options.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '';
  const modelId = options.elevenLabsModelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  try {
    if (!apiKey || !voices.elevenLabsVoiceId) {
      throw new Error('ElevenLabs credentials missing');
    }

    const resp = await fetch(`${ELEVENLABS_BASE_URL}/v1/text-to-speech/${voices.elevenLabsVoiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        language_code: voices.languageCode,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!resp.ok) {
      throw new Error(`ElevenLabs /with-timestamps HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const audioBuffer = Buffer.from(data.audio_base64, 'base64');
    const duration = parseWavDuration(audioBuffer);

    // Convert ElevenLabs character alignment to 30fps blendshape frames
    let blendshapes = [];
    if (data.alignment && Array.isArray(data.alignment.characters) && data.alignment.characters.length > 0) {
      try {
        blendshapes = alignmentToVisemes(data.alignment, session?.language || process.env.DEFAULT_LANGUAGE || 'en-US');
        console.log(`  ✅ ElevenLabs alignment → ${blendshapes.length} blendshape frames`);
      } catch (alignErr) {
        console.warn('⚠️ Alignment conversion failed, using alignment raw:', alignErr.message);
      }
    }

    return {
      audioBase64: data.audio_base64,
      alignment: data.alignment,
      blendshapes,
      duration,
      isMock: false,
    };
  } catch (err) {
    console.warn(`⚠️ ElevenLabs /with-timestamps failed: ${err.message}`);
    // Fallback to standard TTS on any error
    return runTTS(text, session, options);
  }
}

/**
 * ELEVENLABS: TTS Streaming
 */
export async function runTTSStreaming(text, session = null, options = {}) {
  const voices = getActiveVoice(session);
  const apiKey = options.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '';
  const modelId = options.elevenLabsModelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  if (!apiKey || !voices.elevenLabsVoiceId) {
    throw new Error('ElevenLabs credentials missing');
  }

  const resp = await fetch(`${ELEVENLABS_BASE_URL}/v1/text-to-speech/${voices.elevenLabsVoiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: voices.languageCode,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!resp.ok) {
    throw new Error(`ElevenLabs /stream error: ${resp.status}`);
  }

  return resp.body; // Returns a ReadableStream
}

/**
 * Legacy Sequential TTS (Fallback chain)
 */
export async function runTTS(text, session = null, options = {}) {
  const voices = getActiveVoice(session);
  const nvidiaApiKey = options.nvidiaApiKey || process.env.NVIDIA_API_KEY || '';
  const nvidiaBaseUrl = options.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1';
  const nvidiaModel = options.nvidiaModel || 'nvidia/fastpitch-hifigan';
  const elevenLabsApiKey = options.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '';

  if (elevenLabsApiKey && voices.elevenLabsVoiceId) {
    try {
      const result = await runTTSWithTimestamps(text, session, options);
      console.log(`  🎙️ TTS provider: elevenlabs [with-timestamps]`);
      return { ...result, isMock: false };
    } catch (e) {
      console.warn('⚠️ ElevenLabs TTS failed, falling back to NVIDIA:', e.message);
    }
  }

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
        console.log(`  🎙️ TTS provider: nvidia [${voices.nvidiaTtsVoice}]`);
        return { audioBase64: buf.toString('base64'), duration: parseWavDuration(buf), isMock: false };
      }
    } catch (e) {
      console.warn('⚠️ NVIDIA TTS failed, using mock:', e.message);
    }
  }

  // Mock fallback
  const wordCount = text.split(/\s+/).length;
  const duration = Math.max(1, wordCount / 2.5);
  const silentWav = createSilentWav(duration);
  return {
    audioBase64: silentWav.toString('base64'),
    duration: parseWavDuration(silentWav),
    isMock: true,
  };
}

