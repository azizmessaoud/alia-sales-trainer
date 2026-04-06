/**
 * ALIA 2.0 - Main Training Interface (Full-Duplex WebSocket)
 * Progressive pipeline: text appears instantly, then audio, then lip-sync
 * Features: Voice input (Web Speech API), Audio output (TTS), Lip-sync animation
 */

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import type { MetaFunction } from '@remix-run/node';
import { Avatar } from '~/components/Avatar';
import { ChatInput } from '~/components/ChatInput';
import { SessionHUD, type SessionMetrics } from '~/components/SessionHUD';
import type { AvatarHandle } from '~/components/Avatar';
import { useALIAWebSocket } from '~/hooks/useALIAWebSocket';
import { useHydrated } from '~/hooks/useHydrated';
import type { Blendshape } from '~/hooks/useALIAWebSocket';

export const meta: MetaFunction = () => {
  return [
    { title: 'ALIA 2.0 - Medical Sales Training' },
    { name: 'description', content: 'AI-Powered Medical Sales Training with Real-time Coaching' },
  ];
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// =====================================================
// Base64 → Uint8Array helper (browser-safe, no Buffer)
// =====================================================
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function detectAudioMime(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return 'audio/wav';
  }

  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'audio/mpeg';
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  return 'audio/mpeg';
}


export default function Index() {
  // Client-side hydration check (only render client components after hydration)
  const hydrated = useHydrated();

  // State
  const [sessionId, setSessionId] = useState('loading');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pipelineStage, setPipelineStage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SessionMetrics>({
    accuracy: 0,
    compliance: 0,
    confidence: 0,
    clarity: 0,
  });
  const [sessionStatus, setSessionStatus] = useState<'active' | 'paused' | 'completed'>('active');
  const [error, setError] = useState<string | null>(null);
  const [sessionLanguage, setSessionLanguage] = useState<string>('en-US');
  const [currentAudio, setCurrentAudio] = useState<string | null>(null);
  const [hasUserGesture, setHasUserGesture] = useState(false);
  const [lipSyncDebug, setLipSyncDebug] = useState<{ jawMin: number; jawMax: number; jawCurrent: number; speakingFactor: number; elapsedMs: number; frameIndex: number; frameCount: number; isPlaying: boolean; clockSource: string; offsetMs: number; peakJaw: number; peakFrame: number; peakElapsed: number; appliedTargets: number; dominantViseme: string; dominantMouth: string } | null>(null);

  // Refs
  const avatarRef = useRef<AvatarHandle>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestStartRef = useRef<number>(0);
  const lastLLMTextRef = useRef<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const audioUnlockingRef = useRef(false);
  const usingBrowserTTSRef = useRef(false);
  const ttsStartTimeRef = useRef<number>(0); // when TTS started speaking (performance.now)
  const nextChunkTimeRef = useRef<number>(0);
  const chunkBufferRef = useRef<AudioBufferSourceNode[]>([]);
  const lastDebugUiUpdateRef = useRef<number>(0);

  const dumpAnimationLog = useCallback((label: string) => {
    const samples = avatarRef.current?.getAnimationLog?.(6000) ?? [];
    if (!samples.length) return;

    const visemeCounts: Record<string, number> = {};
    let nonSilSamples = 0;
    let firstNonSilMs: number | null = null;
    let lastNonSilMs: number | null = null;

    for (const sample of samples) {
      visemeCounts[sample.dominantViseme] = (visemeCounts[sample.dominantViseme] ?? 0) + 1;
      if (sample.dominantViseme !== 'viseme_sil') {
        nonSilSamples += 1;
        if (firstNonSilMs === null) firstNonSilMs = sample.elapsedMs;
        lastNonSilMs = sample.elapsedMs;
      }
    }

    const topVisemes = Object.entries(visemeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([viseme, count]) => ({ viseme, samples: count }));

    const audioNowMs = audioElementRef.current
      ? Math.round(audioElementRef.current.currentTime * 1000)
      : null;
    const lipNowMs = samples[samples.length - 1]?.elapsedMs ?? 0;
    const timelineDriftMs = audioNowMs !== null ? lipNowMs - audioNowMs : null;
    const currentOffsetMs = avatarRef.current?.getDebugStats?.().offsetMs ?? 0;

    const summary = {
      samples: samples.length,
      nonSilSamples,
      nonSilRatio: `${((nonSilSamples / samples.length) * 100).toFixed(1)}%`,
      firstNonSilMs: firstNonSilMs ?? 'none',
      lastNonSilMs: lastNonSilMs ?? 'none',
      lipNowMs,
      audioNowMs: audioNowMs ?? 'n/a',
      timelineDriftMs: timelineDriftMs ?? 'n/a',
      offsetMs: currentOffsetMs,
    };

    const full = samples.map((entry) => ({
      t_ms: entry.elapsedMs,
      frame: `${entry.frameIndex}/${entry.frameCount}`,
      jaw: entry.jawOpen,
      viseme: entry.dominantViseme,
      mouth: entry.dominantMouth,
      targets: entry.targetsApplied,
      clock: entry.clockSource,
    }));

    console.groupCollapsed(`🎬 Full Conv Log (${label}) samples=${samples.length}`);
    console.table(summary);
    console.table(topVisemes);
    console.table(full);
    console.groupEnd();
  }, []);

  // Stable audio ref callback to avoid rewiring avatar audio clock on every render.
  const bindAudioElementRef = useCallback((el: HTMLAudioElement | null) => {
    (audioElementRef as React.MutableRefObject<HTMLAudioElement | null>).current = el;
    if (el && avatarRef.current && !usingBrowserTTSRef.current) {
      avatarRef.current.setAudioElement(el);
    }
  }, []);

  // =====================================================
  // Full-Duplex WebSocket — progressive pipeline
  // =====================================================
  const { sendChat, sendRaw, interrupt, startSession, endSession, status: wsStatus, currentStage } =
    useALIAWebSocket({
      url: 'ws://localhost:3001',
      autoReconnect: true,

      // Stage 1 arrives: show text immediately
      onLLMText: (text, llmTime) => {
        console.log(`✅ LLM [${llmTime}ms]: "${text.substring(0, 60)}..."`);
        lastLLMTextRef.current = text;
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: text, timestamp: new Date() },
        ]);
      },

      // Stage 2 arrives: play audio (or browser TTS if mock)
      onTTSAudio: (audioBase64, duration, ttsTime, isMock, provider) => {
        console.log(`✅ TTS [${ttsTime}ms]: ${duration.toFixed(2)}s audio${isMock ? ' (mock → browser TTS)' : ''}`);
        console.log('   └─ TTS Response details:', {
          provider: provider || 'unknown',
          isMock,
          duration,
          audioSize: audioBase64 ? audioBase64.length : 0,
          audioPreview: audioBase64 ? audioBase64.substring(0, 50) + '...' : 'null',
        });

        setCurrentAudio(audioBase64);
        setIsSpeaking(true);
        window.setTimeout(() => setIsSpeaking(false), Math.max(400, Math.round(duration * 1000)));

        // Stamp the clock for BOTH paths so onLipSync never divides by a stale 0
        ttsStartTimeRef.current = performance.now();

        if (isMock) {
          console.log('🔊 Using browser TTS fallback');
          usingBrowserTTSRef.current = true;
          speakWithBrowserTTS(lastLLMTextRef.current);
        } else {
          console.log(`🔊 Using ${provider || 'azure-speech'} TTS audio`);
          usingBrowserTTSRef.current = false;
          playAudio(audioBase64, duration);
        }
      },

      // Stage 2b arrives: stream TTS chunks for Web Audio queue scheduling
      onTTSChunk: (chunkBase64, isFirst, isFinal) => {
        if (chunkBase64) {
          const bytes = base64ToUint8Array(chunkBase64);
          scheduleChunk(bytes, isFirst);
        }
        if (isFinal) {
          console.log('✅ TTS stream complete');
        }
      },

      // Stage 3 arrives: animate avatar mouth
      onLipSync: (blendshapes, lipsyncTime, _timeline, isMock) => {
        console.log(`✅ LipSync [${lipsyncTime}ms]: ${blendshapes.length} frames${isMock ? ' (mock)' : ''}`);

        if (usingBrowserTTSRef.current) {
          console.log('🕐 Browser TTS mode: using performance.now() for lip-sync clock');
          avatarRef.current?.setAudioElement(null);
        } else {
          // Wire <audio> element as master clock BEFORE play() so update() finds it
          avatarRef.current?.setAudioElement(audioElementRef.current);
        }
        // Inform animator of mock vs real data (affects smoothing + speaking speed)
        avatarRef.current?.setIsMockData?.(isMock === true);
        // Compute jaw range for debug overlay
        const jawVals = blendshapes.map(f => (f.blendshapes as any).jawOpen ?? 0);
        const jMin = jawVals.length ? Math.min(...jawVals) : 0;
        const jMax = jawVals.length ? Math.max(...jawVals) : 0;
        setLipSyncDebug(prev => ({
          jawMin: jMin,
          jawMax: jMax,
          jawCurrent: prev?.jawCurrent ?? 0,
          speakingFactor: prev?.speakingFactor ?? 0,
          elapsedMs: prev?.elapsedMs ?? 0,
          frameIndex: prev?.frameIndex ?? 0,
          frameCount: blendshapes.length,
          isPlaying: prev?.isPlaying ?? false,
          clockSource: prev?.clockSource ?? 'perf',
          offsetMs: prev?.offsetMs ?? 0,
          peakJaw: prev?.peakJaw ?? 0,
          peakFrame: prev?.peakFrame ?? 0,
          peakElapsed: prev?.peakElapsed ?? 0,
          appliedTargets: prev?.appliedTargets ?? 0,
          dominantViseme: prev?.dominantViseme ?? 'viseme_sil',
          dominantMouth: prev?.dominantMouth ?? 'jawOpen',
        }));

        // Apply a small lead for cloud TTS to improve perceived word-to-mouth sync.
        // Override in console if needed: window.__ALIA_LIPSYNC_OFFSET_MS__ = -40
        const configuredOffsetMs = isMock
          ? 0
          : Number((window as any).__ALIA_LIPSYNC_OFFSET_MS__ ?? -60);
        avatarRef.current?.setLipSyncOffset(configuredOffsetMs);
        console.log(`   └─ LipSync offset applied: ${configuredOffsetMs}ms`);

        animateAvatar(blendshapes, configuredOffsetMs / 1000);
      },

      // Full pipeline done
      onPipelineComplete: (totalTime, breakdown) => {
        setLatencyMs(totalTime);
        setIsLoading(false);
        console.log(
          `🎉 Pipeline [${totalTime}ms] = LLM(${breakdown.llmTime}) + TTS(${breakdown.ttsTime}) + LS(${breakdown.lipsyncTime})`
        );
      },

      onStageChange: (stage) => setPipelineStage(stage),

      onSTTResult: ({ text, confidence, language }) => {
        const transcript = text.trim();
        if (!transcript) return;

        console.log(
          `🎤 Azure STT [${language || sessionLanguage}]: "${transcript}"` +
            (typeof confidence === 'number' ? ` (${Math.round(confidence * 100)}%)` : '')
        );

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'user', content: transcript, timestamp: new Date() },
        ]);
      },

      onError: (msg) => {
        setError(msg);
        setIsLoading(false);
      },
    });

  // =====================================================
  // Audio Context Unlock (required for autoplay)
  // =====================================================
  const unlockAudioContext = useCallback((fromGesture: boolean = false, sourceEvent?: Event | null) => {
    if (audioUnlockedRef.current) return;
    if (!fromGesture) return;
    if (sourceEvent && sourceEvent.isTrusted === false) return;
    const userActivation = (navigator as any).userActivation;
    if (sourceEvent && userActivation && userActivation.isActive === false) return;
    if (audioUnlockingRef.current) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (audioContextRef.current.state === 'suspended') {
        audioUnlockingRef.current = true;
        audioContextRef.current.resume().then(() => {
          console.log('✅ AudioContext unlocked and resumed');
          audioUnlockedRef.current = true;
        }).catch((err) => {
          console.warn('⚠️ AudioContext resume blocked until user gesture:', err);
        }).finally(() => {
          audioUnlockingRef.current = false;
        });
      } else {
        console.log('✅ AudioContext already active');
        audioUnlockedRef.current = true;
        audioUnlockingRef.current = false;
      }
    } catch (err) {
      audioUnlockingRef.current = false;
      console.error('❌ AudioContext unlock failed:', err);
    }
  }, []);

  const handleGestureUnlock = useCallback((event?: any) => {
    setHasUserGesture(true);
    const nativeEvent = (event?.nativeEvent ?? event) as Event | undefined;
    unlockAudioContext(true, nativeEvent ?? null);
  }, [unlockAudioContext]);

  const scheduleChunk = useCallback((bytes: Uint8Array, isFirst: boolean) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    if (isFirst) {
      nextChunkTimeRef.current = ctx.currentTime + 0.05;
      setIsSpeaking(true);
      ttsStartTimeRef.current = performance.now();
    }
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    ctx.decodeAudioData(arrayBuffer as ArrayBuffer, (decoded) => {
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextChunkTimeRef.current);
      source.start(startAt);
      nextChunkTimeRef.current = startAt + decoded.duration;
    }, (err) => {
      console.warn('⚠️ Chunk decode failed:', err);
    });
  }, []);

  // =====================================================
  // Lip-sync debug stats polling (updates jawCurrent + speakingFactor each frame)
  // =====================================================
  useEffect(() => {
    let rafId: number;
    const poll = () => {
      const now = performance.now();
      const stats = avatarRef.current?.getDebugStats?.();
      if (stats && now - lastDebugUiUpdateRef.current >= 120) {
        lastDebugUiUpdateRef.current = now;
        setLipSyncDebug(prev =>
          prev ? {
            ...prev,
            jawCurrent: stats.jawOpen,
            speakingFactor: stats.speakingFactor,
            elapsedMs: stats.elapsedMs,
            frameIndex: stats.frameIndex,
            frameCount: stats.frameCount,
            isPlaying: stats.isPlaying,
            clockSource: stats.clockSource,
            offsetMs: stats.offsetMs,
            peakJaw: stats.peakJaw,
            peakFrame: stats.peakFrame,
            peakElapsed: stats.peakElapsed,
            appliedTargets: stats.appliedTargets,
            dominantViseme: stats.dominantViseme,
            dominantMouth: stats.dominantMouth,
          } : null
        );
      }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // =====================================================
  // Audio playback (browser-safe with debug logging)
  // =====================================================
  const playAudio = useCallback((audioBase64: string, duration: number) => {
    try {
      console.log('🔊 [Audio Debug] Starting playback flow...');
      console.log('   └─ Audio base64 length:', audioBase64.length);
      console.log('   └─ Expected duration:', duration, 'seconds');

      // Unlock audio on first playback attempt
      setIsSpeaking(true);

      // Clean up old URL
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      if (!audioElementRef.current) {
        console.error('❌ Audio element ref is null!');
        return;
      }

      const audioBytes = base64ToUint8Array(audioBase64);
      console.log('   └─ Decoded audio bytes:', audioBytes.length);

      const mimeType = detectAudioMime(audioBytes);
      const blob = new Blob([audioBytes as BlobPart], { type: mimeType });
      console.log('   └─ Blob created, size:', blob.size, 'bytes', 'mime:', mimeType);

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      console.log('   └─ Object URL created:', url.substring(0, 50) + '...');

      audioElementRef.current.src = url;
      audioElementRef.current.volume = 0.85;

      // Try to play with detailed error handling
      const playPromise = audioElementRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('✅ Audio playing successfully!');
            console.log('   └─ Audio element state:', {
              paused: audioElementRef.current?.paused,
              currentTime: audioElementRef.current?.currentTime,
              duration: audioElementRef.current?.duration,
              volume: audioElementRef.current?.volume,
              muted: audioElementRef.current?.muted,
              readyState: audioElementRef.current?.readyState,
            });
          })
          .catch((e) => {
            console.error('❌ Audio autoplay blocked or failed:', e);
            console.error('   └─ Error name:', e.name);
            console.error('   └─ Error message:', e.message);
            console.error('   └─ AudioContext state:', audioContextRef.current?.state);
            console.warn('💡 Solution: Click anywhere on the page first, then try again');
            setError('Audio blocked by browser - click anywhere on the page first');
          });
      }

      // Auto-stop speaking state after audio finishes
      audioElementRef.current.onended = () => {
        console.log('✅ Audio playback completed');
        dumpAnimationLog('audio-ended');
        setIsSpeaking(false);
      };

      audioElementRef.current.onerror = (e) => {
        console.error('❌ Audio element error event:', e);
        setIsSpeaking(false);
      };
    } catch (err) {
      console.error('❌ Playback error:', err);
      setIsSpeaking(false);
    }
  }, [unlockAudioContext]);

  // =====================================================
  // Browser TTS fallback (when NVIDIA TTS unavailable)
  // =====================================================
  const speakWithBrowserTTS = useCallback((text: string) => {
    try {
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      const isFrench = /[àâäéèêëîïôùûüç]/i.test(text) || /\b(avoir|être|faire|avec|pour)\b/i.test(text);
      const utteranceLang = isFrench ? 'fr-FR' : 'en-US';
      utterance.lang = utteranceLang;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Try to find a female voice
      const voices = window.speechSynthesis.getVoices();
      const langPrefix = utteranceLang.slice(0, 2).toLowerCase();
      const preferred = voices.find(v =>
        v.lang?.toLowerCase().startsWith(langPrefix) && (
          v.name.includes('Female') || v.name.includes('Zira') ||
          v.name.includes('Aria') || v.name.includes('Jenny') ||
          v.name.includes('Google')
        )
      ) || voices.find(v => v.lang?.toLowerCase().startsWith(langPrefix));
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => {
        dumpAnimationLog('browser-tts-ended');
        setIsSpeaking(false);
      };
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      console.log('🔊 Browser TTS speaking');
    } catch (err) {
      console.warn('⚠️ Browser TTS failed:', err);
      setIsSpeaking(false);
    }
  }, [dumpAnimationLog]);

  // =====================================================
  // Avatar lip-sync animation
  // =====================================================
  const animateAvatar = useCallback((blendshapes: Blendshape[], audioOffsetSec: number = 0) => {
    if (!blendshapes.length || !avatarRef.current) return;

    console.log(`▶️ Animating ${blendshapes.length} frames, offset=${(audioOffsetSec * 1000).toFixed(0)}ms`);
    avatarRef.current.playLipSync(blendshapes, audioOffsetSec);
  }, []);

  // =====================================================
  // Stop lip-sync when speaking ends (audio onended / browser TTS onend)
  // =====================================================
  useEffect(() => {
    if (!isSpeaking) {
      avatarRef.current?.stopLipSync();
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    }
  }, [isSpeaking]);

  // =====================================================
  // Wire audio element → Avatar as master clock (run once on mount only)
  // =====================================================
  useEffect(() => {
    // Don't re-wire when browser TTS is active — <audio> element won't be
    // playing so currentTime===0 would stall the animator on every re-render.
    if (audioElementRef.current && avatarRef.current && !usingBrowserTTSRef.current) {
      avatarRef.current.setAudioElement(audioElementRef.current);
      console.log('🔗 Audio element wired to lip-sync animator (clock: audio)', {
        paused: audioElementRef.current.paused,
        src: audioElementRef.current.src ? 'set' : 'empty',
        currentTime: audioElementRef.current.currentTime,
      });
    }
  }, []);

  const stopAudioCapture = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setIsListening(false);
  }, []);

  const startAudioCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedChunks = audioChunksRef.current;
        audioChunksRef.current = [];

        micStreamRef.current?.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;

        if (!recordedChunks.length) {
          return;
        }

        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();
        const audioBase64 = arrayBufferToBase64(buffer);

        setIsLoading(true);
        setError(null);
        requestStartRef.current = performance.now();
        sendRaw('stt_audio', { audio: audioBase64, language: sessionLanguage });
      };

      recorder.onerror = () => {
        setIsListening(false);
        setIsLoading(false);
        setError('Audio capture failed. Please try again.');
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsListening(true);
      setError(null);
      console.log('🎤 Listening (server STT mode)...');
      return true;
    } catch (err) {
      setError('Microphone access denied. Please allow microphone permissions.');
      return false;
    }
  }, [sendRaw, sessionLanguage]);

  // =====================================================
  // Microphone Input Fallback (Web Speech API)
  // =====================================================
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('⚠️ Web Speech API not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = sessionLanguage;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        const transcript = last[0].transcript.trim();
        if (transcript) {
          console.log(`🎤 Speech recognized: "${transcript}"`);
          setIsListening(false);
          handleSendMessage(transcript);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('🎤 Speech error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // no-op: recognition may already be stopped
      }
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [sessionLanguage]);

  const toggleMicrophone = useCallback(async () => {
    if (isListening) {
      stopAudioCapture();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // no-op
        }
      }
      return;
    }

    const startedCapture = await startAudioCapture();
    if (startedCapture) {
      return;
    }

    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser. Use Chrome or Edge.');
      return;
    }

    setError(null);
    recognitionRef.current.start();
    setIsListening(true);
    console.log('🎤 Listening (browser speech fallback)...');
  }, [isListening, startAudioCapture, stopAudioCapture]);

  // Initialize session id on mount
  useEffect(() => {
    // Set sessionId on client-side only to avoid hydration mismatch
    setSessionId(crypto.randomUUID());
  }, []);

  // Start session only once WebSocket is connected
  const hasStartedSession = useRef(false);
  useEffect(() => {
    if (wsStatus === 'connected' && !hasStartedSession.current) {
      hasStartedSession.current = true;
      // Set session language to default (en-US) or from browser preference
      setSessionLanguage('en-US');
      startSession();
    }
  }, [wsStatus, startSession]);

  // Expose gesture API to window for console testing
  useEffect(() => {
    const gestures = ['handup', 'index', 'ok', 'thumbup', 'thumbdown', 'side', 'shrug', 'namaste'];
    
    (window as any).alia = {
      playGesture: (name: string, duration?: number, mirror?: boolean) => {
        if (!avatarRef.current) {
          console.warn('❌ Avatar ref not ready');
          return;
        }
        console.log(`🎭 [Console API] Playing gesture: ${name} (${duration}s, mirror=${mirror})`);
        avatarRef.current.playGesture(name, duration, mirror);
      },
      
      listGestures: () => {
        console.log('Available gestures:', gestures);
        return gestures;
      },

      testAllGestures: (delayMs = 3000) => {
        console.log(`🎭 Testing all ${gestures.length} gestures with ${delayMs}ms delay...`);
        let index = 0;
        const playNext = () => {
          if (index < gestures.length) {
            const gesture = gestures[index];
            console.log(`  [${index + 1}/${gestures.length}] ${gesture}`);
            avatarRef.current?.playGesture(gesture, 2);
            index++;
            setTimeout(playNext, delayMs);
          } else {
            console.log('✅ Gesture sequence complete');
          }
        };
        playNext();
      },

      getDiagnostics: () => {
        if (!avatarRef.current) return null;
        const stats = avatarRef.current.getDebugStats();
        const log = avatarRef.current.getAnimationLog(20);
        return {
          stats,
          recentFrames: log.slice(-5)
        };
      },
    };

    return () => {
      delete (window as any).alia;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      endSession();
    };
  }, [endSession]);

  // =====================================================
  // Send message via WebSocket
  // =====================================================
  const handleSendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || wsStatus !== 'connected') return;

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content, timestamp: new Date() },
      ]);

      setIsLoading(true);
      setError(null);
      requestStartRef.current = performance.now();

      // Send through WebSocket — responses arrive progressively via callbacks
      sendChat(content);
    },
    [wsStatus, sendChat]
  );

  // Session controls
  const handlePause = () => setSessionStatus('paused');
  const handleResume = () => setSessionStatus('active');
  const handleEnd = () => {
    setSessionStatus('completed');
    endSession();
    alert(
      `Session Complete!\n\nMetrics:\n- Accuracy: ${metrics.accuracy.toFixed(0)}%\n- Compliance: ${metrics.compliance.toFixed(0)}%\n- Confidence: ${metrics.confidence.toFixed(0)}%\n- Clarity: ${metrics.clarity.toFixed(0)}%`
    );
  };

  // =====================================================
  // Audio Test Function (for debugging)
  // =====================================================
  const testAudio = useCallback((event?: any) => {
    console.log('🧪 Testing basic audio playback...');
    const nativeEvent = (event?.nativeEvent ?? event) as Event | undefined;
    unlockAudioContext(true, nativeEvent ?? null);

    if (!audioElementRef.current) {
      console.error('❌ Audio element not found!');
      return;
    }

    // Create a simple beep sound (440Hz for 0.5s)
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 440; // A4 note
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    console.log('✅ Test beep should play now (440Hz, 0.5s)');
    console.log('   └─ AudioContext state:', audioContext.state);

    // Also test with actual audio element
    setTimeout(() => {
      const testUrl = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      if (audioElementRef.current) {
        audioElementRef.current.src = testUrl;
        audioElementRef.current.play()
          .then(() => console.log('✅ Audio element test passed'))
          .catch((e) => console.error('❌ Audio element test failed:', e));
      }
    }, 600);
  }, [unlockAudioContext]);
  
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}
      onClick={handleGestureUnlock}
      onKeyDown={handleGestureUnlock}
    >
      {/* Hidden audio element for playback — also used as master clock for lip-sync */}
      <audio
        ref={bindAudioElementRef}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <header style={{
        padding: '16px 24px',
        backgroundColor: 'rgba(26, 26, 46, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
            <span style={{ color: '#5cb85c' }}>ALIA</span>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}> 2.0</span>
          </h1>
          <span style={{
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: wsStatus === 'connected'
              ? 'rgba(92, 184, 92, 0.2)'
              : wsStatus === 'connecting'
              ? 'rgba(240, 173, 78, 0.2)'
              : 'rgba(217, 83, 79, 0.2)',
            color: wsStatus === 'connected'
              ? '#5cb85c'
              : wsStatus === 'connecting'
              ? '#f0ad4e'
              : '#d9534f',
            fontSize: '12px',
          }}>
            {wsStatus === 'connected' ? '● Connected' : wsStatus === 'connecting' ? '◌ Connecting...' : '○ Disconnected'}
          </span>
        </div>
        <div>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
            Medical Sales Training
          </span>
        </div>
        {/* Audio Test Button (for debugging) */}
        <button
          onClick={testAudio}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid rgba(92, 184, 92, 0.5)',
            backgroundColor: 'rgba(92, 184, 92, 0.1)',
            color: '#5cb85c',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(92, 184, 92, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(92, 184, 92, 0.1)';
          }}
        >
          🔊 Test Audio
        </button>

        {/* Gesture Test Buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => (window as any).alia?.playGesture('handup', 2)}
            title="Play handup gesture"
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(135, 206, 250, 0.5)',
              backgroundColor: 'rgba(135, 206, 250, 0.1)',
              color: '#87cefa',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(135, 206, 250, 0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(135, 206, 250, 0.1)'}
          >
            ✋ Handup
          </button>

          <button
            type="button"
            onClick={() => (window as any).alia?.playGesture('thumbup', 2)}
            title="Play thumbup gesture"
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(135, 206, 250, 0.5)',
              backgroundColor: 'rgba(135, 206, 250, 0.1)',
              color: '#87cefa',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(135, 206, 250, 0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(135, 206, 250, 0.1)'}
          >
            👍 Thumbup
          </button>

          <button
            type="button"
            onClick={() => (window as any).alia?.testAllGestures(2000)}
            title="Test all 8 gestures in sequence"
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 165, 0, 0.5)',
              backgroundColor: 'rgba(255, 165, 0, 0.1)',
              color: '#ffa500',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 165, 0, 0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 165, 0, 0.1)'}
          >
            🎭 All
          </button>
        </div>
      </header>
      
      {/* Main Content */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr 360px',
        gap: '24px',
        padding: '24px',
        maxWidth: '1600px',
        margin: '0 auto',
      }}>
        {/* Left Panel - Session HUD */}
        <div style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}>
          <SessionHUD
            metrics={metrics}
            sessionId={sessionId}
            repName="Demo Rep"
            duration={0}
            status={sessionStatus}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
          />
          
          {/* Quick Stats */}
          <div style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
              💡 Training Tips
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
              <li style={{ marginBottom: '8px' }}>Practice handling objections</li>
              <li style={{ marginBottom: '8px' }}>Review product contraindications</li>
              <li style={{ marginBottom: '8px' }}>Focus on compliance best practices</li>
              <li>Ask about drug interactions</li>
            </ul>
          </div>
        </div>
        
        {/* Center - Avatar & Chat */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Avatar */}
          <div style={{
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            minHeight: '400px',
          }}>
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>ALIA Assistant</span>
              <span style={{
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: isSpeaking ? 'rgba(92, 184, 92, 0.2)' : isListening ? 'rgba(217, 83, 79, 0.2)' : pipelineStage ? 'rgba(240, 173, 78, 0.2)' : 'rgba(255,255,255,0.1)',
                color: isSpeaking ? '#5cb85c' : isListening ? '#d9534f' : pipelineStage ? '#f0ad4e' : 'rgba(255,255,255,0.5)',
                fontSize: '12px',
              }}>
                {isSpeaking ? '● Speaking' : isListening ? '🎤 Listening...' : pipelineStage ? `⏳ ${pipelineStage.toUpperCase()}...` : '○ Idle'}
              </span>
              {latencyMs !== null && (
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: latencyMs <= 5000 ? 'rgba(92, 184, 92, 0.15)' : 'rgba(217, 83, 79, 0.15)',
                  color: latencyMs <= 5000 ? '#5cb85c' : '#d9534f',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}>
                  ⏱ {(latencyMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <div style={{ height: '400px', position: 'relative' }}>
              {hydrated && (
                <Avatar
                  ref={avatarRef}
                  modelUrl="/avatars/femal.glb"
                  emotion="neutral"
                  isSpeaking={isSpeaking}
                />
              )}
              {lipSyncDebug && (
                <div style={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  padding: '6px 10px',
                  backgroundColor: 'rgba(0,0,0,0.72)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#7fff7f',
                  lineHeight: 1.6,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}>
                  <div>jawOpen: {lipSyncDebug.jawCurrent.toFixed(3)} &nbsp;range [{lipSyncDebug.jawMin.toFixed(3)} .. {lipSyncDebug.jawMax.toFixed(3)}]</div>
                  <div>speakingFactor: {lipSyncDebug.speakingFactor.toFixed(3)}</div>
                  <div>clock: {lipSyncDebug.clockSource} &nbsp;elapsed: {lipSyncDebug.elapsedMs.toFixed(0)}ms &nbsp;offset: {lipSyncDebug.offsetMs}ms</div>
                  <div>viseme: {lipSyncDebug.dominantViseme} &nbsp;mouth: {lipSyncDebug.dominantMouth}</div>
                  <div>frame: {lipSyncDebug.frameIndex}/{lipSyncDebug.frameCount} &nbsp;targets: {lipSyncDebug.appliedTargets} &nbsp;playing: {lipSyncDebug.isPlaying ? 'yes' : 'no'}
                    {lipSyncDebug.isPlaying && (
                      <span style={{ marginLeft: 8, color: lipSyncDebug.frameIndex > 0 ? '#7fff7f' : '#ff7f7f' }}>
                        {lipSyncDebug.frameIndex > 0 ? 'SYNC OK' : 'WAITING'}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#ffff7f', marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 2 }}>
                    peak: jaw={lipSyncDebug.peakJaw.toFixed(3)} frame={lipSyncDebug.peakFrame}/{lipSyncDebug.frameCount} elapsed={lipSyncDebug.peakElapsed.toFixed(0)}ms targets={lipSyncDebug.appliedTargets}
                  </div>
                </div>
              )}
              {/* Force Jaw test button removed — use debug panel instead */}
            </div>
          </div>
          
          {/* Chat Area */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {/* Messages */}
            <div style={{
              flex: 1,
              backgroundColor: 'rgba(26, 26, 46, 0.95)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '16px',
              overflowY: 'auto',
              maxHeight: '300px',
              minHeight: '200px',
            }}>
              {messages.length === 0 ? (
                <div style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.4)',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: '16px', marginBottom: '8px' }}>
                    👋 Welcome to ALIA 2.0!
                  </p>
                  <p style={{ fontSize: '14px', maxWidth: '300px' }}>
                    Start a conversation to begin your medical sales training session.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div style={{
                        maxWidth: '80%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: msg.role === 'user'
                          ? 'linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%)'
                          : 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        fontSize: '14px',
                        lineHeight: '1.5',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '14px',
                      }}>
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(217, 83, 79, 0.2)',
                borderLeft: '4px solid #d9534f',
                color: '#ffcccc',
                fontSize: '14px',
              }}>
                <strong>Error:</strong> {error}
              </div>
            )}
            
            {/* Input + Mic */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <ChatInput
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  disabled={sessionStatus !== 'active'}
                  placeholder={isListening
                    ? "🎤 Speak now..."
                    : sessionStatus === 'active' 
                      ? "Type your message or click the mic..." 
                      : "Session paused"}
                />
              </div>
              {/* Microphone Button */}
              <button
                type="button"
                onClick={toggleMicrophone}
                disabled={isLoading || sessionStatus !== 'active'}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: isListening ? '2px solid #d9534f' : '2px solid rgba(92, 184, 92, 0.5)',
                  backgroundColor: isListening ? 'rgba(217, 83, 79, 0.3)' : 'rgba(92, 184, 92, 0.1)',
                  color: isListening ? '#ff6b6b' : '#5cb85c',
                  fontSize: '20px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  opacity: isListening ? 0.7 : 1,
                  transform: isListening ? 'scale(1.05)' : 'scale(1)',
                  flexShrink: 0,
                  marginBottom: '16px',
                }}
              >
                {isListening ? '⏹' : '🎤'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Right Panel - Memory Context */}
        <div style={{ position: 'sticky', top: '24px', alignSelf: 'start' }}>
          <div style={{
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '16px',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
              🧠 Memory Context
            </h3>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
              <p style={{ marginBottom: '12px' }}>
                Recent conversations will appear here to help ALIA provide personalized responses.
              </p>
              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: '8px',
                marginTop: '12px',
              }}>
                <strong style={{ color: '#5cb85c' }}>Session Memory:</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                  {messages.length} messages in this session
                </p>
              </div>
            </div>
          </div>
          
          {/* Compliance Status */}
          <div style={{
            marginTop: '16px',
            backgroundColor: 'rgba(26, 26, 46, 0.95)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '16px',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
              ✅ Compliance Status
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: metrics.compliance >= 80 ? '#5cb85c' : metrics.compliance >= 60 ? '#f0ad4e' : '#d9534f',
              fontSize: '14px',
            }}>
              <span style={{ fontSize: '20px' }}>
                {metrics.compliance >= 80 ? '✓' : metrics.compliance >= 60 ? '!' : '✗'}
              </span>
              <span>{metrics.compliance >= 80 ? 'All Clear' : metrics.compliance >= 60 ? 'Warnings' : 'Issues'}</span>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
              FDA guidelines being monitored
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
