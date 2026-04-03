import { lazy, Suspense } from 'react';

const TalkingHeadAvatar = lazy(() => import('./TalkingHeadAvatar.client'));

interface Props {
  audioBase64: string | null;
  language?: string;
  avatarUrl?: string;
  isActive?: boolean;
}

export function AvatarContainer({
  audioBase64,
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
        language={language}
        avatarUrl={avatarUrl}
        isActive={isActive}
      />
    </Suspense>
  );
}
