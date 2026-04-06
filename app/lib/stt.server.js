import { transcribeAzure } from './stt-azure.server.js';

/**
 * Run STT pipeline. Primary: Azure Speech.
 * @param {Buffer} audioBuffer
 * @param {string} language
 */
export async function runSTT(audioBuffer, language = 'en-US') {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (key && region) {
    try {
      const result = await transcribeAzure(audioBuffer, language);
      if (result.text) {
        const confidenceText =
          typeof result.confidence === 'number' ? result.confidence.toFixed(2) : 'n/a';
        console.log(
          `✅ STT: azure [${language}] "${result.text.substring(0, 60)}..." (confidence: ${confidenceText})`
        );
        return result;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Azure STT failed:', message);
    }
  } else {
    console.warn('[STT] Azure not configured: AZURE_SPEECH_KEY or AZURE_SPEECH_REGION missing');
  }

  return {
    text: null,
    language: null,
    confidence: null,
    wordTimings: [],
    provider: null,
  };
}
