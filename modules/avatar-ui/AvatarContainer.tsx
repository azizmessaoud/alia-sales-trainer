import { lazy, Suspense } from 'react';

const TalkingHeadAvatar = lazy(() => import('./TalkingHeadAvatar.client'));

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

export function AvatarContainer({
  audioBase64,
  audioDurationMs = 0,
  playbackStartedAtMs = null,
  timeline,
  canInitializeAudio = false,
  language = 'en-US',
  avatarUrl = '/avatars/alia.glb',
  isActive = false,
}: Props) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          Loading avatar...
        </div>
      }
    >
      <TalkingHeadAvatar
        audioBase64={audioBase64}
        audioDurationMs={audioDurationMs}
        playbackStartedAtMs={playbackStartedAtMs}
        timeline={timeline ?? null}
        canInitializeAudio={canInitializeAudio}
        language={language}
        avatarUrl={avatarUrl}
        isActive={isActive}
      />
    </Suspense>
  );
}
