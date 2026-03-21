/**
 * Shared TTS pipeline helpers for the WebSocket gateway.
 * Provider order: ElevenLabs -> NVIDIA FastPitch -> mock WAV.
 */

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

/**
 * Parse a WAV buffer's RIFF header to compute actual duration in seconds.
 * Falls back to raw-byte estimate (16kHz mono 16-bit) if no header is present.
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
  } catch (_) {
    // Fall through to the conservative estimate below.
  }

  return buf.length / (16000 * 2);
}

/**
 * Resolve active voice settings for this turn.
 */
function getActiveVoice(session = null) {
  const bcp47 = session?.language || process.env.DEFAULT_LANGUAGE || 'en-US';
  return {
    elevenLabsVoiceId: session?.voice_id || process.env.ELEVENLABS_VOICE_ID || '',
    nvidiaTtsVoice: session?.tts_voice || process.env.TTS_VOICE || 'female',
    languageCode: bcp47ToISO639(bcp47),
  };
}

function bcp47ToISO639(tag) {
  if (!tag) return 'en';
  return tag.split('-')[0].toLowerCase();
}

function generateMockAudio(text) {
  const wordCount = text.split(/\s+/).length;
  const durationSeconds = Math.min(15, Math.max(0.8, wordCount / 2.3));
  const sampleRate = 16000;
  const samples = Math.floor(sampleRate * durationSeconds);
  const audioData = new Int16Array(samples);

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audioData.byteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(audioData.byteLength, 40);

  const buf = Buffer.concat([header, Buffer.from(audioData.buffer)]);
  return { audioBase64: buf.toString('base64'), duration: durationSeconds, isMock: true };
}

export async function runTTS(text, session = null, options = {}) {
  const voices = getActiveVoice(session);
  const nvidiaApiKey = options.nvidiaApiKey || process.env.NVIDIA_API_KEY || '';
  const nvidiaBaseUrl = options.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1';
  const nvidiaModel = options.nvidiaModel || 'nvidia/fastpitch-hifigan';
  const elevenLabsApiKey = options.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '';
  const elevenLabsModelId = options.elevenLabsModelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  if (elevenLabsApiKey && voices.elevenLabsVoiceId) {
    try {
      const resp = await Promise.race([
        fetch(`${ELEVENLABS_BASE_URL}/v1/text-to-speech/${voices.elevenLabsVoiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': elevenLabsApiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/wav',
          },
          body: JSON.stringify({
            text,
            model_id: elevenLabsModelId,
            language_code: voices.languageCode,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ElevenLabs TTS timeout')), 15000)
        ),
      ]);

      if (!resp.ok) {
        throw new Error(`ElevenLabs TTS API error: ${resp.status} ${resp.statusText}`);
      }

      const ab = await resp.arrayBuffer();
      const buf = Buffer.from(ab);
      const duration = parseWavDuration(buf);
      console.log(`  🎙️ TTS provider: elevenlabs [${voices.elevenLabsVoiceId}] lang=${voices.languageCode}`);
      return { audioBase64: buf.toString('base64'), duration, isMock: false };
    } catch (e) {
      console.warn('⚠️ ElevenLabs TTS failed, falling back to NVIDIA:', e.message);
    }
  }

  if (nvidiaApiKey) {
    try {
      const resp = await Promise.race([
        fetch(`${nvidiaBaseUrl}/audio/speech`, {
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
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TTS timeout')), 10000)),
      ]);

      if (!resp.ok) {
        throw new Error(`NVIDIA TTS API error: ${resp.status} ${resp.statusText}`);
      }

      const ab = await resp.arrayBuffer();
      const buf = Buffer.from(ab);
      const duration = parseWavDuration(buf);
      console.log(`  🎙️ TTS provider: nvidia [${voices.nvidiaTtsVoice}]`);
      return { audioBase64: buf.toString('base64'), duration, isMock: false };
    } catch (e) {
      console.warn('⚠️ NVIDIA TTS failed, using mock:', e.message);
    }
  }

  console.log('  🎙️ TTS provider: mock');
  return generateMockAudio(text);
}
