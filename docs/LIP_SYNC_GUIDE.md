# 3D Avatar Lip-Sync Animation Guide

## Overview

This guide shows how to implement realistic lip-sync animation for your 3D avatar using NVIDIA Audio2Face-3D and the ALIA lip-sync system.

## Components

### 1. **LipSyncAnimator** (`app/lib/lip-sync-animator.client.ts`)
Core animation engine that:
- Maps Audio2Face blendshapes to Three.js morph targets
- Handles frame interpolation and smooth animation
- Supports playback control (play, pause, stop)
- Debug logging for troubleshooting

### 2. **Avatar Component** (`app/components/Avatar.tsx`)
Renders the 3D model with lip-sync support:
- Loads `.glb` models with embedded morph targets
- Exposes `AvatarHandle` ref for external control
- Automatically detects available blendshapes
- Falls back to procedural sphere if model fails

### 3. **Audio2Face Integration** (`app/lib/nvidia-nim.server.ts`)
Connects to NVIDIA's free Audio2Face-3D API:
- Generates blendshape animation from audio
- Returns ARKit-compatible blendshape data
- Zero setup required (free tier)

## Quick Start

### Step 1: Prepare Your 3D Model

Your `.glb` model should have:
- **Morph targets** named with ARKit standard names
- Common names: `jawOpen`, `mouthSmile`, `mouthFrown`, `eyeBlinkLeft`, etc.

If unsure about morph target names:
```typescript
// Enable debug logging in Avatar
const avatarRef = useRef<AvatarHandle>(null);
// Component will log available morph targets at load time
```

### Step 2: Use Avatar Component with Ref

```tsx
import { useRef } from 'react';
import { Avatar, AvatarHandle } from '~/components/Avatar';

export function MyComponent() {
  const avatarRef = useRef<AvatarHandle>(null);

  return (
    <Avatar
      ref={avatarRef}
      modelUrl="/avatar.glb"
      emotion="neutral"
      isSpeaking={true}
    />
  );
}
```

### Step 3: Generate Lip-Sync from Audio

```typescript
import { generateLipSync } from '~/lib/nvidia-nim.server';

const audioBuffer = /* your audio data as Buffer */;
const blendshapeData = await generateLipSync(audioBuffer);

// blendshapeData format:
// [
//   { timestamp: 0, blendshapes: { jawOpen: 0.5, mouthSmile: 0.3 } },
//   { timestamp: 33, blendshapes: { jawOpen: 0.7, mouthSmile: 0.2 } },
//   ...
// ]
```

### Step 4: Play Animation

```typescript
avatarRef.current?.playLipSync(blendshapeData, startTime);
```

## Complete Example

```tsx
import { useRef } from 'react';
import { Avatar, AvatarHandle } from '~/components/Avatar';
import { generateLipSync } from '~/lib/nvidia-nim.server';

export function ChatWithAvatar() {
  const avatarRef = useRef<AvatarHandle>(null);

  const handleAudioResponse = async (audioBuffer: Buffer) => {
    try {
      // Generate lip-sync data
      const blendshapeData = await generateLipSync(audioBuffer);
      
      // Play animation
      avatarRef.current?.playLipSync(blendshapeData, 0);
      
      // Play audio simultaneously (manage with Web Audio API)
    } catch (error) {
      console.error('Lip-sync failed:', error);
    }
  };

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <Avatar
        ref={avatarRef}
        modelUrl="/avatar.glb"
        emotion="neutral"
        isSpeaking={true}
      />
      
      <button onClick={() => handleAudioResponse(/* audio */)}>
        Chat
      </button>
    </div>
  );
}
```

## API Reference

### Avatar Component Props

```typescript
interface AvatarProps {
  visemes?: VisemeData[];        // Legacy viseme data (optional)
  isSpeaking?: boolean;           // Shows speaking indicator
  emotion?: 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking';
  modelUrl?: string;              // Path to .glb file (default: '/avatar.glb')
  className?: string;             // CSS class
}
```

### AvatarHandle Methods

```typescript
interface AvatarHandle {
  // Play lip-sync animation
  playLipSync(blendshapeData: Audio2FaceBlendshape[], startTime?: number): void;
  
  // Pause animation (can resume)
  pauseLipSync(): void;
  
  // Stop animation and reset to neutral
  stopLipSync(): void;
  
  // Apply blendshapes directly (for testing)
  applyBlendshapes(blendshapes: Record<string, number>): void;
  
  // Get animation duration in seconds
  getLipSyncDuration(): number;
  
  // Check if animation is playing
  getLipSyncPlaying(): boolean;
}
```

### Audio2Face Blendshape Format

```typescript
interface Audio2FaceBlendshape {
  timestamp: number;                    // Milliseconds since animation start
  blendshapes: Record<string, number>;  // Blendshape name -> value (0-1)
}
```

## Supported Blendshapes

### Mouth
- `mouthSmile`, `mouthFrown` - Smile/frown
- `mouthOpen`, `jawOpen` - Opening mouth
- `mouthFunnel`, `mouthPucker` - Puckering
- `mouthLeft`, `mouthRight` - Side movement
- `mouthStretch`, `mouthPress` - Stretching/pressing

### Lips
- `lipsPucker` - Puckering lips
- `lipsUpperUp`, `lipsLowerDown` - Lip movement
- `lipsPressTogetherLeft/Right` - Pressing together

### Eyes
- `eyeBlinkLeft`, `eyeBlinkRight` - Blinking
- `eyeLookUpLeft`, `eyeLookUpRight` - Looking up
- `eyeLookDownLeft`, `eyeLookDownRight` - Looking down

### Jaw & Cheeks
- `jawLeft`, `jawRight` - Jaw movement
- `cheekPuff` - Cheek puffing
- `cheekSquint` - Squinting

### Eyebrows
- `browDownLeft`, `browDownRight` - Brow down
- `browOuterUpLeft`, `browOuterUpRight` - Brow up
- `browInnerUp` - Inner brow up

## Troubleshooting

### Avatar loads but lips don't move

**Problem**: Model doesn't have expected morph targets.

**Solution**: Check available morph targets in browser console:
- Model will log: `Available morph targets: [...]`
- Verify your model has blendshape/morph target data
- Blendshape names must match ARKit standard names

### Choppy Animation

**Problem**: Animation stutters or feels laggy.

**Solution**: Adjust smoothing factor in LipSyncAnimator:
```typescript
smoothingFactor: 0.3  // 0 = no smoothing, 1 = max smoothing
```

### Audio/Lip Sync Out of Sync

**Problem**: Lips move at wrong time relative to audio.

**Solution**: 
- Ensure `startTime` matches audio playback position
- Use Web Audio API `AudioContext.currentTime` for accurate sync
- Account for audio processing delay (~50-100ms)

### NVIDIA API Error

**Problem**: `NVIDIA_API_KEY not set` warning.

**Solution**:
1. Get free key at [build.nvidia.com](https://build.nvidia.com)
2. Add to `.env`:
   ```
   NVIDIA_API_KEY=nvapi-your-key-here
   ```
3. Restart dev server

## Advanced Usage

### Manual Blendshape Control

Apply blendshapes without pre-generated animation:

```typescript
const blendshapes = {
  jawOpen: 0.5,
  mouthSmile: 0.7,
  eyeBlinkLeft: 0.3,
};

avatarRef.current?.applyBlendshapes(blendshapes);
```

### Real-Time Streaming

For live audio input (microphone):

```typescript
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
const processor = new ScriptProcessorNode(audioContext, 4096, 1, 1);

processor.onaudioprocess = (event) => {
  const audioBuffer = event.inputBuffer.getChannelData(0);
  // Convert to Buffer and send to generateLipSync()
};
```

### Performance Optimization

For high-refresh animations:
- Use `messagePort` for off-main-thread processing
- Cache blendshape computations
- Reduce morph target count in model

## Model Requirements

### Preferred

- **Format**: GLB/GLTF 2.0
- **Polycount**: <50k triangles (optimal: 10-20k)
- **Morph Targets**: ARKit 52 blendshapes (or subset)
- **File Size**: <5MB (optimal: <2MB)

### Example Creation Tools

- **Blender**: Export with shape keys as morph targets
- **ZBrush**: Create blendshapes, export as GLB
- **MetaHuman**: Automatically includes all blendshapes
- **Ready Player Me**: Has blendshape support

## Performance Metrics

| Aspect | Expected |
|--------|----------|
| Model Load Time | <500ms |
| Blendshape Application | <1ms |
| Animation Frame Rate | 60 FPS |
| Audio2Face Latency | <200ms |
| Memory Usage | 50-200MB (varies with model) |

## Next Steps

1. Prepare your 3D model with morph targets
2. Place `.glb` in `public/` folder
3. Use Avatar component in your routes
4. Connect to `generateLipSync()` for audio processing
5. Test with browser DevTools for performance metrics

## Support

- Check console logs for detailed error messages
- Use `getLipSyncDuration()` to verify animation loaded
- Enable debug logging: `animator.debugLogBlendshapes()`
- Test with simple shapes first (mouth only) before full facial animation

