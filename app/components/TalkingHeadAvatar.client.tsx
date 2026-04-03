'use client';

import { useEffect, useRef } from 'react';

interface Props {
  audioBase64: string | null;
  language?: string;
  avatarUrl?: string;
  isActive?: boolean;
}

function TalkingHeadAvatar({
  audioBase64,
  language = 'en-US',
  avatarUrl = '/avatars/alia.glb',
  isActive = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);
  const initializingRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || initializingRef.current) return;

    let cancelled = false;
    initializingRef.current = true;

    const initTalkingHead = async () => {
      try {
        const module = await import('@met4citizen/talkinghead');
        const { TalkingHead } = module;

        if (cancelled || !containerRef.current) return;

        headRef.current = new TalkingHead(containerRef.current, {
          ttsEndpoint: null,
          cameraView: 'upper',
          avatarMood: 'neutral',
        });

        // showAvatar returns a promise or void, handle both cases
        const showPromise = headRef.current.showAvatar({ url: avatarUrl });
        if (showPromise && typeof showPromise.then === 'function') {
          await showPromise;
        }
        console.log('[ALIA] TalkingHead ready');
      } catch (error) {
        console.warn('[TalkingHead] init error:', error instanceof Error ? error.message : String(error));
      }
    };

    initTalkingHead();

    return () => {
      cancelled = true;
      if (headRef.current?.stopSpeaking) {
        headRef.current.stopSpeaking();
      }
    };
  }, [avatarUrl]);

  useEffect(() => {
    if (!audioBase64 || !headRef.current?.speakAudio) return;

    const handleAudio = async () => {
      try {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);

        try {
          // speakAudio might return a promise or void
          const result = headRef.current.speakAudio(url, { lang: language });
          if (result && typeof result.then === 'function') {
            await result;
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.warn('[TalkingHead] speakAudio error:', error instanceof Error ? error.message : String(error));
      }
    };

    handleAudio();
  }, [audioBase64, language]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ minHeight: 400, opacity: isActive ? 1 : 0.98 }}
    />
  );
}

export default TalkingHeadAvatar;
