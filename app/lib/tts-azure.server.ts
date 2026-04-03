import SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

export interface AzureWordBoundary {
  text: string;
  audioOffsetMs: number;
  durationMs?: number;
}

export interface AzureTTSResult {
  audioBuffer: Buffer | null;
  wordBoundaries: AzureWordBoundary[];
  durationMs: number;
  voiceName: string;
}

const VOICE_MAP: Record<string, string> = {
  en: 'en-US-JennyNeural',
  fr: 'fr-FR-DeniseNeural',
  ar: 'ar-SA-ZariyahNeural',
  es: 'es-ES-ElviraNeural',
};

function resolveVoice(language: string, explicitVoice?: string): string {
  if (explicitVoice) return explicitVoice;
  const primary = (language || 'en-US').split('-')[0].toLowerCase();
  return VOICE_MAP[primary] || VOICE_MAP.en;
}

/**
 * Azure Speech TTS synthesis with word boundary timings.
 */
export async function synthesizeAzure(
  text: string,
  language: string = 'en-US',
  voiceName?: string
): Promise<AzureTTSResult> {
  const key = process.env.AZURE_SPEECH_KEY || '';
  const region = process.env.AZURE_SPEECH_REGION || 'swedencentral';

  if (!key) {
    throw new Error('AZURE_SPEECH_KEY is missing');
  }

  const selectedVoice = resolveVoice(language, voiceName);
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = selectedVoice;
  speechConfig.speechSynthesisOutputFormat =
    SpeechSDK.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;

  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
  const wordBoundaries: AzureWordBoundary[] = [];

  synthesizer.wordBoundary = (_sender, event) => {
    const audioOffsetMs = Math.round(event.audioOffset / 10000);
    const durationMs = event.duration ? Math.round(event.duration / 10000) : undefined;
    wordBoundaries.push({
      text: event.text || '',
      audioOffsetMs,
      durationMs,
    });
  };

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        try {
          if (result.reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            reject(new Error(`Azure Speech synthesis failed: ${result.reason}`));
            return;
          }

          const audioBuffer = result.audioData
            ? Buffer.from(result.audioData)
            : null;
          const durationMs = Date.now() - startedAt;

          resolve({
            audioBuffer,
            wordBoundaries,
            durationMs,
            voiceName: selectedVoice,
          });
        } finally {
          synthesizer.close();
        }
      },
      (error) => {
        synthesizer.close();
        reject(new Error(String(error)));
      }
    );
  });
}
