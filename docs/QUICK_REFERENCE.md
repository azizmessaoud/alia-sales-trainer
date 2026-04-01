# ALIA 2.0 - Developer Quick Reference

## 🚀 Quick Start

```bash
# Start dev server
npm run dev

# Visit URLs:
http://localhost:5173              # Chat interface
http://localhost:5173/status       # System dashboard
http://localhost:5173/test.audio2face  # Setup guide
http://localhost:5173/api/test.audio2face  # API test
```

---

## 📦 Core Imports

### Avatar Component
```tsx
import { Avatar } from '~/components/Avatar';

<Avatar 
  ref={avatarRef}
  modelUrl="/avatar.glb"
  isSpeaking={true}
/>
```

### High-Level Integration
```tsx
import { AvatarWithLipSync } from '~/components/AvatarWithLipSync';

<AvatarWithLipSync
  audioBuffer={buffer}
  onLipSyncStart={() => {}}
  onLipSyncEnd={() => {}}
/>
```

### Animation Engine (Client-side)
```tsx
import { LipSyncAnimator } from '~/lib/lip-sync-animator.client';

const animator = new LipSyncAnimator(modelRef, 44100);
animator.play(blendshapes, startTime);
animator.pause();
animator.stop();
```

### API Client (Server-side)
```tsx
import { generateLipSync } from '~/lib/nvidia-nim.server';

const blendshapes = await generateLipSync(audioBuffer);
```

---

## 🎭 Avatar Component Interface

### Props
```typescript
interface AvatarProps {
  ref?: React.Ref<AvatarHandle>;
  modelUrl?: string;           // Path to GLB model
  isSpeaking?: boolean;        // Visual indicator
  visemes?: Array<{            // Blendshape frames
    time: number;
    viseme: string;
  }>;
  emotion?: 'happy' | 'neutral' | 'thinking';
}
```

### Methods (via ref)
```typescript
interface AvatarHandle {
  playLipSync(
    blendshapes: Audio2FaceBlendshape[],
    startTime: number
  ): void;
  
  pauseLipSync(): void;
  stopLipSync(): void;
  
  applyBlendshapes(
    frameIndex: number,
    smoothingFactor?: number
  ): void;
  
  getLipSyncDuration(): number;
  getLipSyncPlaying(): boolean;
}
```

### Usage Example
```tsx
const avatarRef = useRef<AvatarHandle>(null);

// Play animation
avatarRef.current?.playLipSync(blendshapes, 0);

// Check status
const isPlaying = avatarRef.current?.getLipSyncPlaying();
const duration = avatarRef.current?.getLipSyncDuration();
```

---

## 🎬 Animation System

### LipSyncAnimator Class

```typescript
class LipSyncAnimator {
  constructor(
    modelRef: THREE.Group | THREE.Object3D,
    sampleRate?: number  // Default: 44100
  );

  // Lifecycle
  play(blendshapes: Audio2FaceBlendshape[], startTime: number): void;
  pause(): void;
  stop(): void;
  seek(timeMs: number): void;

  // State
  getLipSyncPlaying(): boolean;
  getLipSyncDuration(): number;
  getCurrentFrame(): number;

  // Advanced
  applyBlendshapes(frameIndex: number, smoothingFactor?: number): void;
  setPlaybackRate(rate: number): void;
  
  // Events
  onFrameChange: (frameIndex: number) => void;
  onPlaybackComplete: () => void;
}
```

### Blendshape Format
```typescript
interface Audio2FaceBlendshape {
  // Eyes
  eyeBlinkLeft?: number;        // 0-1
  eyeBlinkRight?: number;       // 0-1
  eyeLookDownLeft?: number;     // 0-1
  eyeLookDownRight?: number;    // 0-1
  eyeLookInLeft?: number;       // 0-1
  eyeLookInRight?: number;      // 0-1
  eyeLookOutLeft?: number;      // 0-1
  eyeLookOutRight?: number;     // 0-1
  eyeLookUpLeft?: number;       // 0-1
  eyeLookUpRight?: number;      // 0-1
  
  // Mouth
  mouthClose?: number;          // 0-1
  mouthFunnel?: number;         // 0-1
  mouthOpen?: number;           // 0-1
  mouthPressLeft?: number;      // 0-1
  mouthPressRight?: number;     // 0-1
  mouthSmile?: number;          // 0-1
  mouthDimple?: number;         // 0-1
  mouthFrown?: number;          // 0-1
  
  // Jaw
  jawOpen?: number;             // 0-1
  jawForward?: number;          // 0-1
  jawLeft?: number;             // 0-1
  jawRight?: number;            // 0-1
  
  // Face
  cheekPuff?: number;           // 0-1
  cheekSquintLeft?: number;     // 0-1
  cheekSquintRight?: number;    // 0-1
  browDownLeft?: number;        // 0-1
  browDownRight?: number;       // 0-1
  browInnerUp?: number;         // 0-1
  browOuterUpLeft?: number;     // 0-1
  browOuterUpRight?: number;    // 0-1
  noseSneerLeft?: number;       // 0-1
  noseSneerRight?: number;      // 0-1
  
  // Tongue
  tongueOut?: number;           // 0-1
  tongueUp?: number;            // 0-1
}
```

---

## 🔌 Audio2Face API

### Function Signature
```typescript
async function generateLipSync(
  audioBuffer: ArrayBuffer | Buffer,
  format?: 'pcm' | 'wav'  // Default: 'pcm'
): Promise<Audio2FaceBlendshape[]>
```

### Features
- ✅ Validates API key
- ✅ Validates audio buffer
- ✅ 30-second timeout
- ✅ Automatic mock fallback
- ✅ Response validation
- ✅ Error logging

### Usage Example - Server Route
```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Get audio buffer from request body
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const audioBuffer = await audioFile.arrayBuffer();

    // Generate lip-sync
    const blendshapes = await generateLipSync(audioBuffer);

    return json({
      success: true,
      data: {
        frameCount: blendshapes.length,
        duration: blendshapes.length * 33, // ms
        frames: blendshapes,
      },
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
};
```

### Usage Example - Client Component
```tsx
const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer>();

useEffect(() => {
  if (audioBuffer) {
    generateLipSync(audioBuffer)
      .then((blendshapes) => {
        // Play animation
        avatarRef.current?.playLipSync(blendshapes, Date.now());
      })
      .catch((error) => {
        console.error('❌ Lip-sync failed:', error);
      });
  }
}, [audioBuffer]);
```

---

## 🧪 Testing & Debugging

### Test the API
```bash
curl http://localhost:5173/api/test.audio2face | jq
```

### Expected Response
```json
{
  "success": true,
  "data": {
    "frameCount": 30,
    "duration": 1000,
    "frames": [
      {
        "jawOpen": 0.12,
        "mouthSmile": 0.08,
        "eyeBlinkLeft": 0.0,
        ...
      },
      ...
    ]
  }
}
```

### Browser Console Debugging
```javascript
// Check available models
console.log('Models loaded:', THREE.loader.cache.keys());

// Check animation status
console.log('Playing:', avatarRef.current?.getLipSyncPlaying());
console.log('Duration:', avatarRef.current?.getLipSyncDuration());

// Verify blendshapes
const blendshapes = await generateLipSync(buffer);
console.log('✅ Generated', blendshapes.length, 'frames');

// Test fallback
// Disconnect API key to trigger mock data generation
```

---

## 🛠️ Configuration

### Environment Variables (.env)
```bash
# Required
NVIDIA_API_KEY=nvapi-your-api-key-here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

# Optional
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
GROQ_API_KEY=your-groq-key
OLLAMA_API_BASE=http://localhost:11434
```

### Model Configuration
```tsx
// In Avatar.tsx
const FALLBACK_SCALE = 2;        // Model scale multiplier
const FALLBACK_Y_OFFSET = 0;     // Y-axis offset
const IDLE_ANIMATION_SPEED = 0.3; // Breathing animation speed

// In LipSyncAnimator
const INTERPOLATION_SMOOTHING = 0.3;  // 0-1, higher = smoother
const ANIMATION_FPS = 30;              // Frames per second
const FRAME_INTERVAL = 33;             // ms per frame (1000/30)
```

---

## 📊 Common Patterns

### Load Audio from HTML Audio Element
```typescript
const audioElement = document.getElementById('audio') as HTMLAudioElement;
const audioContext = new AudioContext();
const source = audioContext.createMediaElementAudioSource(audioElement);
const destination = audioContext.createMediaElementAudioDestination();

const analyser = audioContext.createAnalyser();
source.connect(analyser);
analyser.connect(destination);

// Get audio data
const dataArray = new Uint8Array(analyser.frequencyBinCount);
analyser.getByteFrequencyData(dataArray);
const audioBuffer = dataArray.buffer;
```

### Load Audio from Blob
```typescript
const audioBlob = new Blob([audioData], { type: 'audio/wav' });
const audioBuffer = await audioBlob.arrayBuffer();
const blendshapes = await generateLipSync(audioBuffer);
```

### Stream Audio + Animate in Real-Time
```typescript
// This is handled by orchestration layer (TBD)
// For now, generate full animation from complete audio
```

---

## 🎯 Performance Optimization

### Reduce API Calls
```typescript
// Cache responses by audio hash
const hashAudio = (buffer: ArrayBuffer) => {
  return crypto.subtle.digest('SHA-256', buffer);
};

const cache = new Map<string, Audio2FaceBlendshape[]>();

async function generateLipSyncCached(buffer: ArrayBuffer) {
  const hash = await hashAudio(buffer);
  const hexHash = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  if (cache.has(hexHash)) {
    return cache.get(hexHash)!;
  }
  
  const blendshapes = await generateLipSync(buffer);
  cache.set(hexHash, blendshapes);
  return blendshapes;
}
```

### Pre-load Common Phrases
```typescript
// TBD - Medical training phrases can be pre-generated
const COMMON_RESPONSES = [
  'That\'s a great question.',
  'Let me explain the contraindications.',
  'Based on our conversation...',
];

// Pre-generate and cache on startup
for (const phrase of COMMON_RESPONSES) {
  const audioBuffer = await textToSpeech(phrase);
  await generateLipSyncCached(audioBuffer);
}
```

---

## 🐛 Troubleshooting

### Avatar Not Animating
```javascript
// Check if model has morph targets
const model = scene.children[0];
console.log(model.morphTargetDictionary);

// Check if blendshapes have values
console.log(blendshapes[0]);

// Try manual application
avatarRef.current?.applyBlendshapes(0, 1.0);
```

### API Returns 401
```bash
# Verify API key format
echo $NVIDIA_API_KEY
# Should start with "nvapi-"

# Test with valid key
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
  https://integrate.api.nvidia.com/v1/models
```

### Animation Too Fast/Slow
```typescript
// Adjust smoothing factor
animator.applyBlendshapes(frameIndex, 0.1);  // Smoother, slower
animator.applyBlendshapes(frameIndex, 0.9);  // Snappier, faster
animator.applyBlendshapes(frameIndex, 0.3);  // Default balanced
```

---

## 📚 Reference Links

- **Lip Sync Guide:** `docs/LIP_SYNC_GUIDE.md`
- **Audio2Face Quick Start:** `docs/AUDIO2FACE_QUICKSTART.md`
- **Implementation Details:** `AUDIO2FACE_IMPLEMENTATION.md`
- **Week 2 Progress:** `WEEK_2_PROGRESS.md`
- **Delivery Checklist:** `DELIVERY_CHECKLIST.md`

---

## 🎬 Next Phase: Orchestration

Ready to integrate:
```bash
npm install @langchain/core @langchain/langgraph
# Then create app/lib/orchestration.server.ts
```

Will connect:
- Memory OS retrieval → LLM → TTS → Audio2Face → Avatar

---

**Last Updated:** March 1, 2026  
**Status:** Production Ready ✅
