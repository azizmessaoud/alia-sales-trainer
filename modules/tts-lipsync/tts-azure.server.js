import SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

function escapeSsml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function synthesizeAzure(text, language = 'en-US', voiceName = 'en-US-JennyNeural') {
  const key = process.env.AZURE_TTS_KEY || process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_TTS_REGION || process.env.AZURE_SPEECH_REGION || 'swedencentral';

  if (!key) {
    console.warn('[Azure TTS] Missing AZURE_TTS_KEY (or AZURE_SPEECH_KEY)');
    return { audioBuffer: null, wordBoundaries: [], voiceName: null };
  }

  const ssml = `<speak version='1.0' xml:lang='${language}'><voice name='${voiceName}'>${escapeSsml(text)}</voice></speak>`;
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = voiceName;
  speechConfig.speechSynthesisOutputFormat =
    SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
  speechConfig.requestWordLevelTimestamps();

  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
  const wordBoundaries = [];

  synthesizer.wordBoundary = (_sender, event) => {
    wordBoundaries.push({
      word: event?.text || '',
      audioOffset: Number(event?.audioOffset || 0),
      duration: Number(event?.duration || 0),
    });
  };

  const result = await new Promise((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (synthesisResult) => resolve(synthesisResult),
      (error) => reject(error)
    );
  });

  synthesizer.close();

  if (result.reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
    throw new Error(`[Azure TTS] Synthesis failed with reason: ${result.reason}`);
  }

  const audioData = Buffer.from(result.audioData);
  return {
    audioBuffer: audioData,
    wordBoundaries,
    voiceName,
  };
}
