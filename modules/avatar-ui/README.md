# avatar-ui Module

**Responsibilities:** 3D avatar rendering, lip-sync animation blending, gesture templates, and emotion state management.

## What This Module Does

- **Avatar** (`Avatar.tsx`): Main 3D RPM rig wrapper; gesture engine, emotion blending, imperative API (play gesture, set emotion, apply lip-sync).
- **Lip-Sync Animator** (`lip-sync-animator.client.ts`): Client-only timeline-driven blendshape application; maps viseme timelines to rig bone rotations.
- **TalkingHead Integration** (`TalkingHeadAvatar.client.tsx`): Lazy-loaded @met4citizen/talkinghead initialization with custom animator attachment.
- **Container** (`AvatarContainer.tsx`): Thin lazy-load wrapper for production use.

## Dependencies

- `@met4citizen/talkinghead` — RPM rigging engine and shader system
- `three` — 3D rendering engine
- `react` — component framework

## Run Standalone

```bash
# From this module folder:
cd modules/avatar-ui

# Set up environment (one-time)
cp .env.example .env

# Run the module's smoke test
npm run test
```

**What the test does:**
1. Verifies component exports and prop contracts.
2. Validates lip-sync animator timeline wiring (no browser).
3. Confirms gesture and emotion blending method signatures.
4. Tests AvatarHandle imperative API contract.

All tests are terminal-only; no browser needed.

## Public API

```typescript
// Avatar.tsx (TSX)
export function AvatarCore(props: AvatarCoreProps): JSX.Element
export function Avatar(props: AvatarProps): JSX.Element

export interface AvatarHandle {
  playGesture(gestureName: string, strength?: number): Promise<void>
  setEmotion(emotion: string, intensity?: number): Promise<void>
  applyLipSync(timeline: VisemeTimeline): void
  clearLipSync(): void
}

// lip-sync-animator.client.ts
export default class LipSyncAnimator {
  constructor(talkingHeadWorker: any, config: AnimatorConfig)
  applyVisemeTimeline(timeline: VisemeTimeline): void
  clearTimeline(): void
}

// TalkingHeadAvatar.client.tsx
export default function TalkingHeadAvatar(props: TalkingHeadProps): JSX.Element
```

## Who Should Modify This

- **Add a new gesture?** → Edit `Avatar.tsx` gesture templates and blending logic.
- **Tune emotion blending?** → Edit emotion channels in `Avatar.tsx`.
- **Fix lip-sync timing?** → Edit `lip-sync-animator.client.ts` viseme mapping.
- **Change avatar rendering settings?** → Edit `TalkingHeadAvatar.client.tsx` initialization.

## Imports Rule

Files in this module import:
- Only from local folder (`./*`)
- Or from Three.js / React / TalkingHead (external UI libraries)
- Or from shared services (`../../services/*`) if UI needs backend data

Example:
```typescript
import { Avatar } from './Avatar.tsx';
import { LipSyncAnimator } from './lip-sync-animator.client.ts';
// NOT allowed: import { runTTS } from '../tts-lipsync/tts.server.js';
```

Module imports are NOT allowed to reach into `../ai-core`, `../tts-lipsync`, or `../rag-memory` directly.

## Integration Points

- **Consumed by:** `app/routes/_index.tsx` (main training UI)
- **Receives from:** `services/tts.service.js` (TTS audio + word boundaries → lip-sync timeline)
- **Displays:** Real-time avatar response during conversation
