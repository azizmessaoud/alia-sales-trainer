// app/lib/tts-azure.server.js
// Pure ESM — Azure REST TTS (no SDK dependency)

const VOICE_MAP = {
  en: 'en-US-JennyNeural',
  fr: 'fr-FR-DeniseNeural',
  ar: 'ar-TN-ReemNeural',
  es: 'es-ES-ElviraNeural',
};

function pickVoice(lang) {
  if (!lang) return VOICE_MAP.en;
  const normalized = String(lang).toLowerCase();
  const base = normalized.split('-')[0];
  return VOICE_MAP[normalized] || VOICE_MAP[base] || VOICE_MAP.en;
}

function escapeSsml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function synthesizeAzure(text, lang = 'en-US') {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'swedencentral';

  if (!key) {
    console.warn('[Azure TTS] Missing AZURE_SPEECH_KEY');
    return { audioBuffer: null, wordBoundaries: [], voiceName: null };
  }

  const language = lang || 'en-US';
  const voiceName = pickVoice(language);
  const ssml = `<speak version='1.0' xml:lang='${language}'><voice name='${voiceName}'>${escapeSsml(text)}</voice></speak>`;

  const resp = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
      'User-Agent': 'alia-medical-training',
    },
    body: ssml,
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => 'unknown error');
    throw new Error(`[Azure TTS] HTTP ${resp.status}: ${errorText}`);
  }

  const audioData = await resp.arrayBuffer();
  return {
    audioBuffer: Buffer.from(audioData),
    wordBoundaries: [],
    voiceName,
  };
}
