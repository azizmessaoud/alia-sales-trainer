'use client';

import { useEffect, useRef, useState } from 'react';
import { TalkingHead } from '@met4citizen/talkinghead/modules/talkinghead.mjs';

interface Props {
  audioBase64: string | null;
  audioDurationMs?: number;
  playbackStartedAtMs?: number | null;
  timeline?: {
    visemes: string[];
    vtimes: number[];
    vdurations: number[];
  } | null;
  canInitializeAudio?: boolean;
  language?: string;
  avatarUrl?: string;
  isActive?: boolean;
}

function TalkingHeadAvatar({
  audioBase64,
  audioDurationMs = 0,
  playbackStartedAtMs = null,
  timeline = null,
  canInitializeAudio = false,
  language = 'en-US',
  avatarUrl = '/avatars/alia.glb',
  isActive = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);
  const initializingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const activeKeysRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visemeToTargets: Record<string, Array<{ key: string; value: number }>> = {
    sil: [],
    PP: [{ key: 'visemePP', value: 0.95 }, { key: 'viseme_PP', value: 0.95 }, { key: 'mouthClose', value: 0.14 }, { key: 'jawOpen', value: 0.1 }],
    FF: [{ key: 'visemeFF', value: 0.9 }, { key: 'viseme_FF', value: 0.9 }, { key: 'jawOpen', value: 0.22 }],
    TH: [{ key: 'visemeTH', value: 0.75 }, { key: 'jawOpen', value: 0.28 }],
    DD: [{ key: 'visemeDD', value: 0.8 }, { key: 'jawOpen', value: 0.3 }],
    kk: [{ key: 'visemekk', value: 0.85 }, { key: 'jawOpen', value: 0.18 }],
    CH: [{ key: 'visemeCH', value: 0.8 }, { key: 'jawOpen', value: 0.3 }],
    SS: [{ key: 'visemeSS', value: 0.7 }, { key: 'mouthStretchLeft', value: 0.28 }, { key: 'mouthStretchRight', value: 0.28 }],
    nn: [{ key: 'visemenn', value: 0.78 }, { key: 'jawOpen', value: 0.18 }],
    RR: [{ key: 'visemeRR', value: 0.75 }],
    aa: [{ key: 'visemeaa', value: 0.95 }, { key: 'visemeAA', value: 0.95 }, { key: 'viseme_AA', value: 0.95 }, { key: 'jawOpen', value: 0.82 }],
    E: [{ key: 'visemeE', value: 0.8 }, { key: 'mouthSmileLeft', value: 0.25 }, { key: 'mouthSmileRight', value: 0.25 }],
    I: [{ key: 'visemeI', value: 0.78 }, { key: 'mouthSmileLeft', value: 0.18 }, { key: 'mouthSmileRight', value: 0.18 }],
    O: [{ key: 'visemeO', value: 0.92 }, { key: 'viseme_O', value: 0.92 }, { key: 'jawOpen', value: 0.3 }],
    U: [{ key: 'visemeU', value: 0.9 }, { key: 'viseme_U', value: 0.9 }, { key: 'jawOpen', value: 0.14 }],
  };

  useEffect(() => {
    if (!canInitializeAudio || !containerRef.current || initializingRef.current) return;

    let cancelled = false;
    initializingRef.current = true;

    const initTalkingHead = async () => {
      try {
          console.log('[TalkingHead] Attempting to load from:', avatarUrl);
        if (cancelled || !containerRef.current) return;
  console.log('[TalkingHead] Creating instance...');

        headRef.current = new TalkingHead(containerRef.current, {
          ttsEndpoint: null,
          cameraView: 'head',
          cameraDistance: 0.15,
          cameraY: 0.08,
          cameraRotateEnable: false,
          modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          avatarMood: 'neutral',
        });

        // showAvatar returns a promise or void, handle both cases
          console.log('[TalkingHead] Showing avatar...');
        const showPromise = headRef.current.showAvatar({ url: avatarUrl });
        if (showPromise && typeof showPromise.then === 'function') {
          await showPromise;
        }
        headRef.current?.setView?.('head', {
          cameraDistance: 0.1,
          cameraY: 0.05,
          cameraX: 0,
          cameraRotateX: 0,
          cameraRotateY: 0,
        });
        console.log('[ALIA] TalkingHead ready with avatar:', avatarUrl);
        setLoading(false);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[TalkingHead] init error:', msg, error);
        setError(msg);
        setLoading(false);
      }
    };

    initTalkingHead();

    return () => {
      cancelled = true;
      if (headRef.current?.stopSpeaking) {
        headRef.current.stopSpeaking();
      }
    };
  }, [avatarUrl, canInitializeAudio]);

  useEffect(() => {
    if (!canInitializeAudio || !headRef.current?.setFixedValue || !timeline || timeline.visemes.length === 0 || playbackStartedAtMs == null) return;

    const len = Math.min(timeline.visemes.length, timeline.vtimes.length, timeline.vdurations.length);
    if (len <= 0) return;

    const visemes = timeline.visemes.slice(0, len);
    const vtimes = timeline.vtimes.slice(0, len);
    const vdurations = timeline.vdurations.slice(0, len);
    const head = headRef.current;
    const allKeys = Array.from(new Set(Object.values(visemeToTargets).flat().map((x) => x.key)));

    const resetAll = () => {
      for (const key of allKeys) {
        try {
          head.setFixedValue(key, 0, 0);
        } catch {
          // Ignore unknown keys for this avatar rig
        }
      }
      activeKeysRef.current = [];
    };

    resetAll();

    const timelineTotal = vtimes[len - 1] + Math.max(1, vdurations[len - 1]);
    const audioTotal = Math.max(1, audioDurationMs || timelineTotal);
    const timeScale = timelineTotal > 0 ? timelineTotal / audioTotal : 1;

    const tick = () => {
      const elapsedAudio = Math.max(0, performance.now() - playbackStartedAtMs);
      const elapsed = elapsedAudio * timeScale;

      let idx = -1;
      for (let i = 0; i < len; i++) {
        const t0 = vtimes[i];
        const t1 = t0 + Math.max(1, vdurations[i]);
        if (elapsed >= t0 && elapsed < t1) {
          idx = i;
          break;
        }
      }

      if (idx >= 0) {
        for (const key of activeKeysRef.current) {
          try {
            head.setFixedValue(key, 0, 0);
          } catch {
            // Ignore unknown keys
          }
        }

        const targets = visemeToTargets[visemes[idx]] ?? [];
        const nextKeys: string[] = [];
        for (const target of targets) {
          try {
            head.setFixedValue(target.key, target.value, 0);
            nextKeys.push(target.key);
          } catch {
            // Ignore unknown keys
          }
        }
        activeKeysRef.current = nextKeys;
      }

      if (elapsedAudio < audioTotal) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        resetAll();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    console.log('[TalkingHead] timeline lip-sync manual frames:', len, 'scale=', timeScale.toFixed(3));

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      resetAll();
    };
  }, [timeline, canInitializeAudio, audioBase64, playbackStartedAtMs, audioDurationMs]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{
        minHeight: 400,
        opacity: isActive ? 1 : 0.98,
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading && !canInitializeAudio && <div style={{ color: '#f0ad4e', fontSize: '13px' }}>Tap anywhere to enable avatar</div>}
      {loading && canInitializeAudio && <div style={{ color: '#5cb85c', fontSize: '14px' }}>Loading avatar...</div>}
      {error && (
        <div style={{
          color: '#d9534f',
          fontSize: '12px',
          padding: '16px',
          textAlign: 'center',
          maxWidth: '300px',
        }}>
          ❌ Avatar Error: {error}
        </div>
      )}
    </div>
  );
}

export default TalkingHeadAvatar;
