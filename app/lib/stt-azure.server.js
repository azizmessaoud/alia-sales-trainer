import SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

function parseDetailedResultJson(result) {
  try {
    const json = result?.properties?.getProperty(
      SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult
    );
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Transcribe audio buffer using Azure Speech-to-Text.
 * @param {Buffer} audioBuffer
 * @param {string} language BCP-47 tag (en-US, fr-FR, ar-SA, es-ES)
 */
export async function transcribeAzure(audioBuffer, language = 'en-US') {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'swedencentral';

  if (!key) {
    console.warn('[Azure STT] Missing AZURE_SPEECH_KEY');
    return {
      text: null,
      language: null,
      confidence: null,
      wordTimings: [],
      provider: 'azure-stt',
    };
  }

  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = language;
  speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;

  const pushStream = SpeechSDK.AudioInputStream.createPushStream(
    SpeechSDK.AudioStreamFormat.getDefaultInputFormat()
  );
  pushStream.write(audioBuffer);
  pushStream.close();

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    let finished = false;
    let finalText = '';
    let confidence = 0;
    let wordTimings = [];

    const finishResolve = () => {
      if (finished) return;
      finished = true;
      recognizer.close();
      resolve({
        text: finalText || null,
        language,
        confidence: finalText ? confidence : null,
        wordTimings,
        provider: 'azure-stt',
      });
    };

    const finishReject = (error) => {
      if (finished) return;
      finished = true;
      recognizer.close();
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      recognizer.stopContinuousRecognitionAsync(
        () => finishResolve(),
        () => finishResolve()
      );
    }, 20000);

    recognizer.recognized = (_sender, event) => {
      if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
        finalText = (event.result.text || '').trim();
        const detail = parseDetailedResultJson(event.result);
        confidence = detail?.NBest?.[0]?.Confidence ?? 0;
        wordTimings = Array.isArray(detail?.NBest?.[0]?.Words)
          ? detail.NBest[0].Words.map((w) => ({
              word: w.Word,
              audioOffset: w.Offset,
              duration: w.Duration,
            }))
          : [];

        recognizer.stopContinuousRecognitionAsync(
          () => {
            clearTimeout(timeoutId);
            finishResolve();
          },
          () => {
            clearTimeout(timeoutId);
            finishResolve();
          }
        );
      }
    };

    recognizer.canceled = (_sender, event) => {
      clearTimeout(timeoutId);
      finishReject(new Error(`[Azure STT] Canceled: ${event.errorDetails || 'Unknown error'}`));
    };

    recognizer.sessionStopped = () => {
      clearTimeout(timeoutId);
      finishResolve();
    };

    recognizer.startContinuousRecognitionAsync(
      () => undefined,
      (err) => {
        clearTimeout(timeoutId);
        finishReject(new Error(`[Azure STT] Start failed: ${err}`));
      }
    );
  });
}
