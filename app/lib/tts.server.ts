/**
 * ALIA 2.0 - Azure Speech TTS Service
 * Generates speech audio and viseme timestamps for avatar lip-sync
 * 
 * Uses Azure Speech SDK for production-quality voice synthesis
 */

import { config } from './providers';

// =====================================================
// Types
// =====================================================

export interface TTSOptions {
  voice?: string;
  rate?: string;  // e.g., "+0%", "-10%"
  pitch?: string;
  volume?: string;
  style?: string; // e.g., "cheerful", "sad", "excited"
}

export interface TTSResult {
  audio: Buffer | null;  // Audio data (if using SDK directly)
  audioUrl?: string;     // URL to audio file (if using REST)
  visemes: VisemeTimestamp[];
  duration: number;      // milliseconds
  textLength: number;
}

export interface VisemeTimestamp {
  time: number;      // milliseconds from start
  viseme: string;    // viseme ID (0-4 for speech, 5 for silence)
  duration?: number; // duration of this viseme
}

// Azure Speech viseme mapping
const VISEME_MAP: Record<number, string> = {
  0: 'sil',   // silence
  1: 'PP',    // p, b, m
  2: 'FF',    // f, v
  3: 'TH',    // th
  4: 'DD',    // t, d, s, z, n, l
  5: 'KK',    // k, g, ng
  6: 'CH',    // ch, j, sh
  7: 'HH',    // h
  8: 'RR',    // r
  9: 'AA',    // aa, ao
  10: 'EH',   // eh, ey
  11: 'IH',   // ih, iy
  12: 'UW',   // uw, uh
  13: 'AH',   // ah, aw, ay
  14: 'OH',   // oy, oy
  15: 'ER',   // er
  16: 'EH',   // l, r
  17: 'AA',   // w, y
  18: 'NN',   // n
  19: 'CH',   // zh, z
  20: 'PP',   // wh
};

// =====================================================
// Azure Speech Configuration
// =====================================================

const AZURE_CONFIG = {
  key: config.tts.key,
  region: config.tts.region,
};

// Available voices
export const VOICES = {
  en_US: {
    female: 'en-US-AriaNeural',
    male: 'en-US-GuyNeural',
    friendly: 'en-US-JennyNeural',
    professional: 'en-US-SaraNeural',
  },
  en_GB: {
    female: 'en-GB-SoniaNeural',
    male: 'en-GB-RyanNeural',
  },
};

// =====================================================
// Mock TTS (when Azure not configured)
// =====================================================

/**
 * Generate simulated visemes for lip-sync
 * Used when Azure Speech SDK is not available
 */
function generateMockVisemes(text: string): VisemeTimestamp[] {
  const words = text.split(/\s+/);
  const visemes: VisemeTimestamp[] = [];
  let currentTime = 0;
  
  // Average speaking rate: 150 words per minute = 400ms per word
  const msPerWord = 400;
  
  for (const word of words) {
    // Estimate word duration based on length
    const wordDuration = word.length * 60 + msPerWord;
    
    // Assign viseme based on first letter (simplified)
    const firstChar = word.toLowerCase()[0] || 's';
    let visemeId = 4; // Default to 'DD'
    
    if (/[pb]/.test(firstChar)) visemeId = 1;
    else if (/[fv]/.test(firstChar)) visemeId = 2;
    else if (/[tdnl]/.test(firstChar)) visemeId = 4;
    else if (/[kg]/.test(firstChar)) visemeId = 5;
    else if (/[shz]/.test(firstChar)) visemeId = 6;
    else if (/[aeiou]/.test(firstChar)) visemeId = 9;
    else if (/[jr]/.test(firstChar)) visemeId = 6;
    else if (/[hw]/.test(firstChar)) visemeId = 7;
    else if (/[mc]/.test(firstChar)) visemeId = 1;
    
    visemes.push({
      time: currentTime,
      viseme: VISEME_MAP[visemeId] || 'sil',
      duration: wordDuration,
    });
    
    currentTime += wordDuration;
  }
  
  // Add final silence
  visemes.push({
    time: currentTime,
    viseme: 'sil',
    duration: 500,
  });
  
  return visemes;
}

/**
 * Mock TTS when Azure is not configured
 */
async function mockSynthesize(
  text: string,
  _options: TTSOptions
): Promise<TTSResult> {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  const visemes = generateMockVisemes(text);
  const duration = visemes.reduce((sum, v) => sum + (v.duration || 200), 0);
  
  return {
    audio: null,
    visemes,
    duration,
    textLength: text.length,
  };
}

// =====================================================
// Azure TTS (Production)
// =====================================================

/**
 * Synthesize speech using Azure Speech SDK
 * Returns viseme timestamps for avatar lip-sync
 */
export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  // Check if Azure is configured
  if (!AZURE_CONFIG.key || AZURE_CONFIG.key === 'your-azure-speech-key') {
    console.log('[TTS] Using mock TTS (Azure not configured)');
    return mockSynthesize(text, options);
  }
  
  try {
    // Dynamic import to avoid build issues when SDK not available
    const sdk = await import('microsoft-cognitiveservices-speech-sdk');
    
    return new Promise((resolve, reject) => {
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        AZURE_CONFIG.key,
        AZURE_CONFIG.region
      );
      
      // Set output format
      speechConfig.setOutputFormat(sdk.OutputFormat.Compact);
      
      // Configure audio (save to file for viseme extraction)
      const audioConfig = sdk.AudioConfig.fromAudioFileOutput(
        `temp_tts_${Date.now()}.wav`
      );
      
      // Create synthesizer
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);
      
      // Build SSML for voice customization
      const ssml = buildSSML(text, options);
      
      // Get viseme events
      let visemes: VisemeTimestamp[] = [];
      let audioBuffer: Buffer | null = null;
      
      synthesizer.visemeReceived = (sender, event) => {
        // Azure provides viseme IDs (0-20)
        const visemeId = event.viseme;
        visemes.push({
          time: event.audioOffset / 10000, // Convert from 100-nanoseconds to ms
          viseme: VISEME_MAP[visemeId] || 'sil',
        });
      };
      
      synthesizer.speakTextAsync(
        text,
        (result) => {
          synthesizer.close();
          
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            // Estimate duration from text
            const wordsPerMinute = 150;
            const wordCount = text.split(/\s+/).length;
            const duration = (wordCount / wordsPerMinute) * 60 * 1000;
            
            resolve({
              audio: audioBuffer,
              visemes: visemes.length > 0 ? visemes : generateMockVisemes(text),
              duration,
              textLength: text.length,
            });
          } else {
            reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
          }
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  } catch (error) {
    console.warn('[TTS] Azure SDK not available, using mock:', error);
    return mockSynthesize(text, options);
  }
}

/**
 * Build SSML for Azure Speech
 */
function buildSSML(text: string, options: TTSOptions): string {
  const voice = options.voice || VOICES.en_US.friendly;
  const rate = options.rate || '+0%';
  const pitch = options.pitch || '+0Hz';
  
  return `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="${voice}">
    <mstts:express-as style="${options.style || 'conversational'}" rate="${rate}" pitch="${pitch}">
      <prosody rate="${rate}" pitch="${pitch}">
        ${text}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
}

// =====================================================
// Streaming TTS (for real-time avatar)
// =====================================================

/**
 * Generate speech in chunks for real-time avatar animation
 */
export async function* synthesizeStreaming(
  text: string,
  options: TTSOptions = {}
): AsyncGenerator<{ chunk: string; visemes: VisemeTimestamp[] }> {
  // Split text into sentences/chunks
  const chunks = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  for (const chunk of chunks) {
    const result = await synthesizeSpeech(chunk.trim(), options);
    
    yield {
      chunk: chunk.trim(),
      visemes: result.visemes,
    };
  }
}

// =====================================================
// Web Speech API Fallback (Browser)
// =====================================================

/**
 * Check if Web Speech API is available (browser fallback)
 */
export function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Use browser's Web Speech API for TTS
 */
export function webSpeechSynthesize(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isWebSpeechAvailable()) {
      reject(new Error('Web Speech API not available'));
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure voice
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.name.includes('Microsoft') || v.name.includes('Google')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    // Configure options
    utterance.rate = options.rate ? parseFloat(options.rate) / 100 + 1 : 1;
    utterance.pitch = options.pitch ? parseFloat(options.pitch) / 100 + 1 : 1;
    utterance.volume = options.volume ? parseFloat(options.volume) / 100 : 1;
    
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    
    speechSynthesis.speak(utterance);
  });
}

// =====================================================
// Export
// =====================================================

export const TTS = {
  synthesizeSpeech,
  synthesizeStreaming,
  webSpeechSynthesize,
  isWebSpeechAvailable,
  VOICES,
};
