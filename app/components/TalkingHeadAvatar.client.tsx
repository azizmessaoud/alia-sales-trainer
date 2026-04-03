'use client';

import { useEffect, useRef } from 'react';

interface Props {
  audioBase64: string | null;
  language?: string;
  avatarUrl?: string;
  isActive?: boolean;
}

export function TalkingHeadAvatar({
  audioBase64,
  language = 'en-US',
  avatarUrl = '/avatars/alia.glb',
  isActive = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    import('@met4citizen/talkinghead').then(({ TalkingHead }) => {
      if (cancelled || !containerRef.current) return;

      headRef.current = new TalkingHead(containerRef.current, {
        ttsEndpoint: null,
        cameraView: 'upper',
        avatarMood: 'neutral',
      });

      headRef.current.showAvatar({ url: avatarUrl }, () => {
        console.log('[ALIA] TalkingHead ready');
      });
    }).catch((error: Error) => {
      console.warn('[TalkingHead] init error:', error.message);
    });

    return () => {
      cancelled = true;
      headRef.current?.stopSpeaking?.();
    };
  }, [avatarUrl]);

  useEffect(() => {
    if (!audioBase64 || !headRef.current) return;

    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    headRef.current
      .speakAudio(url, { lang: language })
      .catch((error: Error) => {
        console.warn('[TalkingHead] speakAudio error:', error.message);
      })
      .finally(() => {
        URL.revokeObjectURL(url);
      });
  }, [audioBase64, language]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ minHeight: 400, opacity: isActive ? 1 : 0.98 }}
    />
  );
}
