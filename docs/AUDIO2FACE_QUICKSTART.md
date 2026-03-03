/**
 * AUDIO2FACE QUICK START GUIDE
 * 
 * How to integrate NVIDIA Audio2Face lip-sync into your ALIA application
 */

// =====================================================
// 1. BASIC USAGE IN A ROUTE
// =====================================================

import { useRef } from 'react';
import { Avatar, AvatarHandle } from '~/components/Avatar';
import { AvatarWithLipSync } from '~/components/AvatarWithLipSync';
import { generateLipSync } from '~/lib/nvidia-nim.server';

/**
 * Simple example: Use AvatarWithLipSync component
 */
export function SimpleChatExample() {
  const audioBuffer = new Buffer([...]).buffer as Buffer; // Your audio data

  return <AvatarWithLipSync audioBuffer={audioBuffer} />;
}

// =====================================================
// 2. ADVANCED USAGE WITH CUSTOM CONTROL
// =====================================================

/**
 * Advanced example: Direct control over avatar
 * Useful for integrating with larger workflows (LangGraph, WebSocket, etc.)
 */
export function AdvancedChatExample() {
  const avatarRef = useRef<AvatarHandle>(null);

  const handleGenerateResponse = async (audioBuffer: Buffer) => {
    try {
      // Step 1: Generate lip-sync data
      console.log('Generating lip-sync animation...');
      const blendshapes = await generateLipSync(audioBuffer);

      // Step 2: Play animation
      console.log(`Playing ${blendshapes.length} blendshape frames`);
      avatarRef.current?.playLipSync(blendshapes, 0);

      // Step 3: Play audio (your responsibility to manage audio playback)
      const audioContext = new AudioContext();
      const audioBuffer2 = await audioContext.decodeAudioData(audioBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer2;
      source.connect(audioContext.destination);
      source.start(0);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <Avatar ref={avatarRef} modelUrl="/avatar.glb" />
      <button onClick={() => handleGenerateResponse(/* audio data */)}>
        Generate Response
      </button>
    </div>
  );
}

// =====================================================
// 3. INTEGRATION WITH TEXT-TO-SPEECH
// =====================================================

/**
 * Full workflow: Text → TTS → Lip-sync Animation
 */
export async function fullWorkflow(text: string) {
  // Step 1: Generate speech from text
  // (Use your TTS provider: Azure, Eleven Labs, etc.)
  const audioBuffer = await generateSpeechFromText(text);

  // Step 2: Generate lip-sync from audio
  const blendshapes = await generateLipSync(audioBuffer);

  // Step 3: Play on avatar
  const avatarRef = useRef<AvatarHandle>(null);
  avatarRef.current?.playLipSync(blendshapes, 0);

  return { audioBuffer, blendshapes };
}

// =====================================================
// 4. API REFERENCE
// =====================================================

/**
 * generateLipSync(audioBuffer, format?)
 *
 * @param audioBuffer - Raw audio data (Buffer, WAV or PCM)
 * @param format - Output format, default: 'arkit'
 *
 * @returns Promise<Audio2FaceBlendshape[]>
 *   [{
 *     timestamp: 0,        // milliseconds
 *     blendshapes: {
 *       jawOpen: 0.5,      // 0-1 range
 *       mouthSmile: 0.3,
 *       eyeBlinkLeft: 1,
 *       ...
 *     }
 *   }, ...]
 *
 * @throws Error if API fails
 *   - Returns mock data in development mode
 *   - Throws error in production if API unavailable
 */

// =====================================================
// 5. TESTING THE API
// =====================================================

/**
 * Test Audio2Face API integration:
 * 
 * 1. Start your dev server:
 *    npm run dev
 *
 * 2. Visit test endpoint:
 *    http://localhost:5173/api/test.audio2face
 *
 * 3. Should return:
 *    {
 *      "status": "✅ API Working",
 *      "frames": 1800,
 *      "duration": 60000,
 *      "sample": [{...}, {...}]
 *    }
 */

// =====================================================
// 6. DEBUGGING
// =====================================================

/**
 * Enable detailed logging:
 */
// In your browser console:
// - Avatar loads: "✓ GLB Loaded" badge appears
// - Lip-sync generates: "✅ Audio2Face: Generated X frames"
// - Animation plays: "▶️ Lip-sync animation started"

/**
 * Common issues:
 */

// Issue: "NVIDIA_API_KEY not configured"
// Fix: Add to .env:
//   NVIDIA_API_KEY=nvapi-your-key-here

// Issue: "Audio buffer is empty"
// Fix: Ensure you're passing a valid Buffer with audio data

// Issue: API timeout / 30 second error
// Fix: Check network connectivity
//   Try shorter audio clips first (< 10 seconds)

// Issue: "Unexpected API response format"
// Fix: Component auto-falls back to mock data for testing
//   In production, ensures consistent experience

// =====================================================
// 7. PERFORMANCE TIPS
// =====================================================

/**
 * • Cache blendshape data (don't regenerate for same audio)
 * • Use Web Audio API for precise audio sync timing
 * • Test with small audio clips first (1-2 seconds)
 * • Monitor API rate limits (40 requests/min on free tier)
 * • Profile animation frame rate (should stay at 60fps)
 */

// =====================================================
// 8. CONFIGURATION
// =====================================================

/**
 * Environment variables in .env:
 */

// NVIDIA NIM API Key (required for lip-sync)
// Get free key at: https://build.nvidia.com
// NVIDIA_API_KEY=nvapi-your-key-here

// Optional: Disable mock data in development
// NODE_ENV=production  // Falls back to mock data in dev

// =====================================================
// 9. NEXT STEPS
// =====================================================

/**
 * Week 2 Integration:
 * 
 * 1. Add to LangGraph orchestration:
 *    async function audioWithLipSync(state) {
 *      const blendshapes = await generateLipSync(state.audioBuffer);
 *      return { ...state, visemes: blendshapes };
 *    }
 *
 * 2. Connect WebSocket:
 *    ws.send({ type: 'speak', audio, visemes });
 *
 * 3. Test with full chat flow:
 *    User input → LLM → TTS → Lip-sync → Avatar speaks
 */

export const audioFaceQuickStart = true;
