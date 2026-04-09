/**
 * ALIA 2.0 - 3D Avatar Component
 * Renders a 3D avatar with lip-sync animation
 * 
 * Uses Three.js for 3D rendering
 * Loads GLB models with support for morph targets/blendshapes
 * Supports Audio2Face-3D lip-sync via blendshape animation
 * Only renders on client-side
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useImperativeHandle, forwardRef } from 'react';
import LipSyncAnimator from '~/tts-lipsync/lip-sync-animator.client';
import type { LipSyncDebugStats } from '~/tts-lipsync/lip-sync-animator.client';
import type { AnimationLogEntry } from '~/tts-lipsync/lip-sync-animator.client';

// =====================================================
// Types
// =====================================================

/** @deprecated — pass blendshape frames via playLipSync() instead */
export interface VisemeData {
  time: number;
  viseme: string;
}

export type Emotion =
  | 'neutral'
  | 'happy'
  | 'friendly'
  | 'empathetic'
  | 'reassuring'
  | 'sad'
  | 'disappointed'
  | 'surprised'
  | 'interested'
  | 'thinking'
  | 'concerned'
  | 'skeptical'
  | 'frustrated'
  | 'attentive'
  | 'confident';

export interface AvatarProps {
  isSpeaking?: boolean;
  isListening?: boolean;
  emotion?: Emotion;
  idleIntensity?: number;
  modelUrl?: string;
  className?: string;
}

interface BoneRotation {
  x?: number;
  y?: number;
  z?: number;
}

type GestureTemplate = Record<string, BoneRotation>;

type MoodState = 'idle' | 'speaking' | 'listening';

interface MoodVariant {
  p?: number;
  blendshapes?: Record<string, number>;
  bones?: Record<string, BoneRotation>;
}

interface MoodLayerSpec {
  name: string;
  interval: [number, number];
  duration: [number, number];
  default?: MoodVariant;
  idle?: MoodVariant;
  speaking?: MoodVariant;
  listening?: MoodVariant;
  alt?: MoodVariant[];
}

interface MoodProfile {
  baseline: Record<string, number>;
  layers: MoodLayerSpec[];
}

const GESTURE_TEMPLATES: Record<string, GestureTemplate> = {
  handup: {
    'LeftShoulder.rotation': { x: 0.675, y: 0.135, z: -0.63 },
    'LeftArm.rotation': { x: 0.72, y: -0.225, z: 0.495 },
    'LeftForeArm.rotation': { x: -0.36, y: -0.18, z: 0.72 },
    'LeftHand.rotation': { x: -0.225, y: -0.09, z: 0.0 },
    'LeftHandIndex1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandMiddle1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandRing1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandPinky1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandThumb1.rotation': { x: 0.135, y: 0.18, z: 0.09 },
  },
  index: {
    'LeftShoulder.rotation': { x: 1.2, y: 0.2, z: -1.2 },
    'LeftArm.rotation': { x: 1.4, y: -0.4, z: 0.9 },
    'LeftForeArm.rotation': { x: -0.6, y: -0.3, z: 1.4 },
    'LeftHand.rotation': { x: -0.3, y: -0.1, z: 0.0 },
    'LeftHandIndex1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandIndex2.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandIndex3.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandMiddle1.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandMiddle2.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandRing1.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandRing2.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandPinky1.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandPinky2.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandThumb1.rotation': { x: 0.5, y: 0.5, z: 0.3 },
  },
  ok: {
    'LeftShoulder.rotation': { x: 1.0, y: 0.2, z: -1.1 },
    'LeftArm.rotation': { x: 1.2, y: -0.3, z: 0.8 },
    'LeftForeArm.rotation': { x: -0.5, y: -0.2, z: 1.2 },
    'LeftHand.rotation': { x: -0.2, y: 0.0, z: 0.0 },
    'LeftHandIndex1.rotation': { x: 0.8, y: 0.0, z: 0.0 },
    'LeftHandIndex2.rotation': { x: 0.8, y: 0.0, z: 0.0 },
    'LeftHandMiddle1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandRing1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandPinky1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandThumb1.rotation': { x: 0.8, y: 0.6, z: 0.4 },
    'LeftHandThumb2.rotation': { x: 0.6, y: 0.0, z: 0.0 },
  },
  thumbup: {
    'LeftShoulder.rotation': { x: 0.52, y: 0.065, z: -0.65 },
    'LeftArm.rotation': { x: 0.65, y: -0.195, z: 0.455 },
    'LeftForeArm.rotation': { x: -0.26, y: -0.13, z: 0.715 },
    'LeftHand.rotation': { x: -0.065, y: 0.195, z: 0.0 },
    'LeftHandIndex1.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandIndex2.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandMiddle1.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandMiddle2.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandRing1.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandRing2.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandPinky1.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandPinky2.rotation': { x: 0.91, y: 0.0, z: 0.0 },
    'LeftHandThumb1.rotation': { x: -0.13, y: 0.13, z: -0.195 },
    'LeftHandThumb2.rotation': { x: -0.13, y: 0.0, z: 0.0 },
  },
  thumbdown: {
    'LeftShoulder.rotation': { x: 0.8, y: 0.1, z: -1.0 },
    'LeftArm.rotation': { x: 1.0, y: -0.3, z: 0.7 },
    'LeftForeArm.rotation': { x: -0.4, y: -0.2, z: 1.1 },
    'LeftHand.rotation': { x: -0.1, y: -0.3, z: 3.14 },
    'LeftHandIndex1.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandIndex2.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandMiddle1.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandMiddle2.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandRing1.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandRing2.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandPinky1.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandPinky2.rotation': { x: 1.4, y: 0.0, z: 0.0 },
    'LeftHandThumb1.rotation': { x: -0.2, y: 0.2, z: -0.3 },
  },
  side: {
    'LeftShoulder.rotation': { x: 1.3, y: 0.5, z: -0.8 },
    'LeftArm.rotation': { x: 1.5, y: -0.2, z: 0.5 },
    'LeftForeArm.rotation': { x: -0.3, y: 0.1, z: 0.8 },
    'LeftHand.rotation': { x: 0.2, y: 0.3, z: 0.3 },
    'LeftHandIndex1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandMiddle1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandRing1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandPinky1.rotation': { x: 0.0, y: 0.0, z: 0.0 },
    'LeftHandThumb1.rotation': { x: 0.2, y: 0.3, z: 0.1 },
  },
  shrug: {
    'LeftShoulder.rotation': { x: 0.0, y: 0.0, z: -0.7 },
    'LeftArm.rotation': { x: 0.2, y: 0.0, z: 0.6 },
    'LeftForeArm.rotation': { x: 0.5, y: 0.0, z: 0.3 },
    'RightShoulder.rotation': { x: 0.0, y: 0.0, z: 0.7 },
    'RightArm.rotation': { x: 0.2, y: 0.0, z: -0.6 },
    'RightForeArm.rotation': { x: 0.5, y: 0.0, z: -0.3 },
    'Head.rotation': { x: 0.05, y: 0.0, z: 0.0 },
    'Neck.rotation': { x: 0.05, y: 0.0, z: 0.0 },
  },
  namaste: {
    'LeftShoulder.rotation': { x: 0.8, y: 0.1, z: -0.5 },
    'LeftArm.rotation': { x: 1.0, y: -0.1, z: 0.4 },
    'LeftForeArm.rotation': { x: 0.8, y: 0.0, z: 0.6 },
    'LeftHand.rotation': { x: 0.0, y: 0.0, z: -0.2 },
    'RightShoulder.rotation': { x: 0.8, y: -0.1, z: 0.5 },
    'RightArm.rotation': { x: 1.0, y: 0.1, z: -0.4 },
    'RightForeArm.rotation': { x: 0.8, y: 0.0, z: -0.6 },
    'RightHand.rotation': { x: 0.0, y: 0.0, z: 0.2 },
  },
  nod: {
    'Head.rotation': { x: 0.18, y: 0.0, z: 0.0 },
    'Neck.rotation': { x: 0.12, y: 0.0, z: 0.0 },
  },
  small_nod: {
    'Head.rotation': { x: 0.22, y: 0.0, z: 0.0 },
  },
  lean_forward: {
    'Spine.rotation': { x: 0.25, y: 0.0, z: 0.0 },
    'Head.rotation': { x: 0.12, y: 0.0, z: 0.0 },
  },
  open_palm: {
    'LeftShoulder.rotation': { x: 0.6, y: 0.3, z: -0.4 },
    'LeftArm.rotation': { x: 0.8, y: -0.2, z: 0.6 },
    'LeftForeArm.rotation': { x: -0.3, y: -0.1, z: 1.1 },
    'LeftHand.rotation': { x: 0.1, y: 0.4, z: 0.2 },
  },
  soft_shrug: {
    'LeftShoulder.rotation': { x: 0.1, y: 0.0, z: -0.45 },
    'RightShoulder.rotation': { x: 0.1, y: 0.0, z: 0.45 },
    'Head.rotation': { x: 0.08, y: 0.05, z: 0.0 },
  },
};

// Tuned Gesture Timing Curves (easy to adjust)
const GESTURE_TIMING = {
  defaultDuration: 3,
  inRatio: 0.20,
  outRatio: 0.25,
  strength: 1.0,
} as const;

const easeInOutCubic = (p: number): number => {
  return p < 0.5
    ? 4 * p * p * p
    : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

const EMOTION_BLENDMAP: Record<Emotion, Record<string, number>> = {
  neutral: {
    mouthSmileLeft: 0, mouthSmileRight: 0,
    mouthFrownLeft: 0, mouthFrownRight: 0,
    browInnerUp: 0, browOuterUpLeft: 0, browOuterUpRight: 0,
    browDownLeft: 0, browDownRight: 0,
    eyeWideLeft: 0, eyeWideRight: 0,
    eyeSquintLeft: 0, eyeSquintRight: 0,
    jawOpen: 0, mouthPucker: 0, mouthFunnel: 0,
    cheekPuff: 0, mouthRollLower: 0, mouthRollUpper: 0,
    noseSneerLeft: 0, noseSneerRight: 0,
    mouthPressLeft: 0, mouthPressRight: 0,
  },
  happy: { mouthSmileLeft: 0.65, mouthSmileRight: 0.65, cheekPuff: 0.22, eyeSquintLeft: 0.35, eyeSquintRight: 0.35 },
  friendly: { mouthSmileLeft: 0.48, mouthSmileRight: 0.48, browInnerUp: 0.18, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 },
  empathetic: { mouthSmileLeft: 0.38, mouthSmileRight: 0.38, browInnerUp: 0.55, eyeSquintLeft: 0.28, eyeSquintRight: 0.28 },
  reassuring: { mouthSmileLeft: 0.45, mouthSmileRight: 0.45, browInnerUp: 0.32, cheekPuff: 0.12 },
  sad: { mouthFrownLeft: 0.55, mouthFrownRight: 0.55, browDownLeft: 0.42, browDownRight: 0.42, eyeSquintLeft: 0.3, eyeSquintRight: 0.3 },
  disappointed: { mouthFrownLeft: 0.48, mouthFrownRight: 0.48, browInnerUp: 0.2, eyeSquintLeft: 0.25, eyeSquintRight: 0.25 },
  surprised: { eyeWideLeft: 0.65, eyeWideRight: 0.65, browInnerUp: 0.58, browOuterUpLeft: 0.45, browOuterUpRight: 0.45, jawOpen: 0.18 },
  interested: { browInnerUp: 0.52, eyeWideLeft: 0.28, eyeWideRight: 0.28, mouthSmileLeft: 0.18, mouthSmileRight: 0.18 },
  thinking: { browInnerUp: 0.45, mouthRollLower: 0.32, eyeLookDownLeft: 0.18, eyeLookDownRight: 0.18 },
  concerned: { browDownLeft: 0.52, browDownRight: 0.52, mouthFrownLeft: 0.25, mouthFrownRight: 0.25, eyeSquintLeft: 0.22, eyeSquintRight: 0.22 },
  skeptical: { browOuterUpLeft: 0.45, browOuterUpRight: 0.18, mouthPressLeft: 0.32, mouthPressRight: 0.32, eyeSquintLeft: 0.35, eyeSquintRight: 0.18 },
  frustrated: { browDownLeft: 0.48, browDownRight: 0.48, mouthPressLeft: 0.35, mouthPressRight: 0.35, noseSneerLeft: 0.15, noseSneerRight: 0.15 },
  attentive: { browInnerUp: 0.38, eyeWideLeft: 0.25, eyeWideRight: 0.25, mouthSmileLeft: 0.12, mouthSmileRight: 0.12 },
  confident: { mouthSmileLeft: 0.52, mouthSmileRight: 0.52, browInnerUp: 0.22, eyeSquintLeft: 0.15, eyeSquintRight: 0.15 },
};

const BASE_MOOD_LAYERS: MoodLayerSpec[] = [
  {
    name: 'breathing',
    interval: [1200, 3400],
    duration: [850, 1400],
    default: { blendshapes: { browInnerUp: 0.02, mouthRollLower: 0.02 } },
    speaking: { blendshapes: { browInnerUp: 0.015, mouthRollLower: 0.015 } },
    listening: { blendshapes: { browInnerUp: 0.03, mouthRollLower: 0.01 } },
  },
  {
    name: 'blink',
    interval: [1000, 6000],
    duration: [70, 150],
    alt: [
      { p: 0.84, blendshapes: { eyeBlinkLeft: 1, eyeBlinkRight: 1 } },
      { p: 0.16, blendshapes: { eyeBlinkLeft: 1, eyeBlinkRight: 1, eyeSquintLeft: 0.12, eyeSquintRight: 0.12 } },
    ],
  },
  {
    name: 'head',
    interval: [2400, 6400],
    duration: [650, 1100],
    default: {
      bones: {
        Head: { x: 0.03, y: 0.015, z: 0 },
        Neck: { x: 0.02, y: 0, z: 0 },
      },
    },
    speaking: {
      bones: {
        Head: { x: 0.055, y: 0.02, z: 0 },
        Neck: { x: 0.03, y: 0, z: 0 },
      },
    },
    listening: {
      bones: {
        Head: { x: 0.045, y: 0.01, z: 0 },
        Neck: { x: 0.025, y: 0, z: 0 },
      },
    },
  },
  {
    name: 'mouth',
    interval: [1700, 5200],
    duration: [420, 950],
    default: { blendshapes: { mouthRollLower: 0.03, mouthRollUpper: 0.02 } },
    speaking: { blendshapes: { mouthRollLower: 0.06, mouthRollUpper: 0.05, mouthPressLeft: 0.03, mouthPressRight: 0.03 } },
    listening: { blendshapes: { mouthPressLeft: 0.04, mouthPressRight: 0.04, mouthRollLower: 0.015 } },
    alt: [
      { p: 0.7, blendshapes: { mouthPucker: 0.08, mouthRollLower: 0.04 } },
      { p: 0.3, blendshapes: { mouthSmileLeft: 0.05, mouthSmileRight: 0.05 } },
    ],
  },
  {
    name: 'misc',
    interval: [1400, 6200],
    duration: [360, 900],
    default: { blendshapes: { browInnerUp: 0.06, eyeSquintLeft: 0.04, eyeSquintRight: 0.04 } },
    speaking: { blendshapes: { browInnerUp: 0.05, eyeSquintLeft: 0.03, eyeSquintRight: 0.03 } },
    listening: { blendshapes: { browInnerUp: 0.08, eyeSquintLeft: 0.05, eyeSquintRight: 0.05 } },
    alt: [
      { p: 0.5, blendshapes: { browOuterUpLeft: 0.05, browOuterUpRight: 0.05 } },
      { p: 0.5, blendshapes: { mouthSmileLeft: 0.04, mouthSmileRight: 0.04 } },
    ],
  },
];

const animMoods: Record<Emotion, MoodProfile> = {
  neutral: {
    baseline: { browInnerUp: 0.03, eyeSquintLeft: 0.02, eyeSquintRight: 0.02 },
    layers: BASE_MOOD_LAYERS,
  },
  happy: {
    baseline: { mouthSmileLeft: 0.14, mouthSmileRight: 0.14, cheekPuff: 0.08, eyeSquintLeft: 0.06, eyeSquintRight: 0.06 },
    layers: BASE_MOOD_LAYERS,
  },
  friendly: {
    baseline: { mouthSmileLeft: 0.1, mouthSmileRight: 0.1, browInnerUp: 0.08, eyeSquintLeft: 0.05, eyeSquintRight: 0.05 },
    layers: BASE_MOOD_LAYERS,
  },
  empathetic: {
    baseline: { mouthSmileLeft: 0.08, mouthSmileRight: 0.08, browInnerUp: 0.18, eyeSquintLeft: 0.08, eyeSquintRight: 0.08 },
    layers: BASE_MOOD_LAYERS,
  },
  reassuring: {
    baseline: { mouthSmileLeft: 0.1, mouthSmileRight: 0.1, browInnerUp: 0.1, cheekPuff: 0.04 },
    layers: BASE_MOOD_LAYERS,
  },
  sad: {
    baseline: { mouthFrownLeft: 0.12, mouthFrownRight: 0.12, browDownLeft: 0.08, browDownRight: 0.08 },
    layers: BASE_MOOD_LAYERS,
  },
  disappointed: {
    baseline: { mouthFrownLeft: 0.1, mouthFrownRight: 0.1, browInnerUp: 0.06, eyeSquintLeft: 0.04, eyeSquintRight: 0.04 },
    layers: BASE_MOOD_LAYERS,
  },
  surprised: {
    baseline: { eyeWideLeft: 0.12, eyeWideRight: 0.12, browInnerUp: 0.1, browOuterUpLeft: 0.06, browOuterUpRight: 0.06 },
    layers: BASE_MOOD_LAYERS,
  },
  interested: {
    baseline: { browInnerUp: 0.14, eyeWideLeft: 0.05, eyeWideRight: 0.05, mouthSmileLeft: 0.04, mouthSmileRight: 0.04 },
    layers: BASE_MOOD_LAYERS,
  },
  thinking: {
    baseline: { browInnerUp: 0.1, mouthRollLower: 0.05, mouthPressLeft: 0.03, mouthPressRight: 0.03 },
    layers: BASE_MOOD_LAYERS,
  },
  concerned: {
    baseline: { browDownLeft: 0.12, browDownRight: 0.12, mouthFrownLeft: 0.06, mouthFrownRight: 0.06 },
    layers: BASE_MOOD_LAYERS,
  },
  skeptical: {
    baseline: { browOuterUpLeft: 0.1, browOuterUpRight: 0.04, mouthPressLeft: 0.08, mouthPressRight: 0.08 },
    layers: BASE_MOOD_LAYERS,
  },
  frustrated: {
    baseline: { browDownLeft: 0.12, browDownRight: 0.12, mouthPressLeft: 0.1, mouthPressRight: 0.1, noseSneerLeft: 0.04, noseSneerRight: 0.04 },
    layers: BASE_MOOD_LAYERS,
  },
  attentive: {
    baseline: { browInnerUp: 0.1, eyeWideLeft: 0.05, eyeWideRight: 0.05, mouthSmileLeft: 0.03, mouthSmileRight: 0.03 },
    layers: BASE_MOOD_LAYERS,
  },
  confident: {
    baseline: { mouthSmileLeft: 0.12, mouthSmileRight: 0.12, browInnerUp: 0.05, eyeSquintLeft: 0.03, eyeSquintRight: 0.03 },
    layers: BASE_MOOD_LAYERS,
  },
};

// VISEME_MORPH_MAP and ARKIT_BLENDSHAPES removed — LipSyncAnimator is the
// sole driver of morph targets, using ARKit blendshape frames clocked to
// the <audio> element's currentTime. See lib/lip-sync-animator.client.ts.

// =====================================================
// Avatar Instance Methods (for parent control)
// =====================================================

export interface AvatarHandle {
  playLipSync: (blendshapeData: any[], startTime?: number) => void;
  pauseLipSync: () => void;
  stopLipSync: () => void;
  applyBlendshapes: (blendshapes: Record<string, number>) => void;
  getLipSyncDuration: () => number;
  getLipSyncPlaying: () => boolean;
  /** Pass the <audio> element so LipSyncAnimator uses it as the master clock */
  setAudioElement: (el: HTMLAudioElement | null) => void;
  /** Inform the animator whether current blendshape data came from the mock generator */
  setIsMockData: (isMock: boolean) => void;
  /** Adjust timing offset in ms (positive = visemes arrive later, negative = earlier) */
  setLipSyncOffset: (offsetMs: number) => void;
  /** Apply a single Azure TTS viseme (ID 0-21) during streaming */
  applyAzureViseme: (visemeId: number, audioOffsetTicks: number) => void;
  /** Return live jaw and speaking-factor values for the debug overlay */
  getDebugStats: () => LipSyncDebugStats;
  /** Return recent animation samples for viseme/mouth diagnostics */
  getAnimationLog: (limit?: number) => AnimationLogEntry[];
  /** Direct access to the primary morph-target mesh (for diagnostic bypass) */
  getMesh: () => any;
  /**
   * Play a TalkingHead-style bone gesture.
   * @param name handup | index | ok | thumbup | thumbdown | side | shrug | namaste | nod | lean_forward | open_palm | soft_shrug | small_nod
   * @param duration Seconds (default 3)
   */
  playGesture: (name: string, duration?: number, mirror?: boolean) => void;
  playEmotion: (emotion: Emotion, duration?: number) => void;
  setListening: (listening: boolean) => void;
  clearGestures: () => void;
  setMood: (mood: Emotion) => void;
}

interface GestureBoneEntry {
  bone: any;
  targetX: number;
  targetY: number;
  targetZ: number;
  startX: number;
  startY: number;
  startZ: number;
  restX: number;
  restY: number;
  restZ: number;
  startTime: number;
  inDuration: number;
  holdDuration: number;
  outDuration: number;
}

// =====================================================
// Client-only Avatar implementation
// =====================================================

export const AvatarCore = forwardRef<AvatarHandle, AvatarProps>(
  (
    {
      isSpeaking = false,
      isListening = false,
      emotion = 'neutral',
      idleIntensity = 1,
      modelUrl = '/avatar.glb',
      className = ''
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<any>(null);
    const sceneRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const meshRef = useRef<any>(null);
    const allMorphMeshesRef = useRef<any[]>([]);
    const blinkMirrorCacheRef = useRef<Array<{ mesh: any; blinkL: number; blinkR: number }>>([]);
    const animationRef = useRef<number>(0);
    const modelRef = useRef<any>(null);
    const lipSyncAnimatorRef = useRef<LipSyncAnimator | null>(null);
    const restPoseRef = useRef<{ positionY: number; rotationX: number; rotationY: number; rotationZ: number } | null>(null);
    const boneRestPoseRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());
    const gestureBonesRef = useRef<GestureBoneEntry[]>([]);
    const listeningRef = useRef<boolean>(isListening);
    const moodRef = useRef<Emotion>(emotion);
    const moodPulseRef = useRef<Array<{
      id: string;
      startTime: number;
      duration: number;
      blendshapes: Record<string, number>;
      boneTargets: Array<{
        bone: any;
        startX: number;
        startY: number;
        startZ: number;
        targetX: number;
        targetY: number;
        targetZ: number;
      }>;
    }>>([]);
    const nextMoodPulseRef = useRef<number>(0);
    const lastMoodStateRef = useRef<MoodState>('idle');
    const lastMoodNameRef = useRef<Emotion>(emotion);
    
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usesFallback, setUsesFallback] = useState(false);

    const getModelBoneNames = (root: any = modelRef.current): string[] => {
      if (!root) return [];

      const boneNames: string[] = [];
      root.traverse((child: any) => {
        if (child.isBone && typeof child.name === 'string' && child.name.length > 0) {
          boneNames.push(child.name);
        }
      });

      return boneNames;
    };

    const applyBlendshapesToMesh = (blendshapes: Record<string, number>) => {
      if (!meshRef.current?.morphTargetInfluences) return;

      const morphTargetDictionary = meshRef.current.morphTargetDictionary || {};
      for (const [blendshapeName, value] of Object.entries(blendshapes)) {
        if (blendshapeName in morphTargetDictionary) {
          const index = morphTargetDictionary[blendshapeName];
          if (index >= 0 && index < meshRef.current.morphTargetInfluences.length) {
            meshRef.current.morphTargetInfluences[index] = Math.max(0, Math.min(1, value));
          }
        }
      }
    };

    const applyEmotionToMesh = useCallback((targetEmotion: Emotion) => {
      applyBlendshapesToMesh(EMOTION_BLENDMAP[targetEmotion] ?? EMOTION_BLENDMAP.neutral);
    }, []);

    const getMoodState = useCallback((): MoodState => {
      if (listeningRef.current) return 'listening';
      if (lipSyncAnimatorRef.current?.getIsPlaying?.()) return 'speaking';
      return 'idle';
    }, []);

    const pickWeightedVariant = useCallback((variants: MoodVariant[]) => {
      if (variants.length === 0) return null;
      if (variants.length === 1) return variants[0];

      const coin = Math.random();
      let cumulative = 0;
      for (let index = 0; index < variants.length; index += 1) {
        const variant = variants[index];
        const remaining = 1 - cumulative;
        const probability = typeof variant.p === 'number'
          ? variant.p
          : remaining / (variants.length - index);
        cumulative += probability;
        if (coin < cumulative) return variant;
      }

      return variants[variants.length - 1];
    }, []);

    const resolveLayerVariant = useCallback((layer: MoodLayerSpec, state: MoodState) => {
      const baseVariant = layer[state] ?? layer.default ?? layer.idle ?? layer.speaking ?? layer.listening ?? null;
      const variantPool: MoodVariant[] = [];

      if (baseVariant) {
        variantPool.push(baseVariant as MoodVariant);
      }
      if (layer.alt?.length) {
        variantPool.push(...layer.alt);
      }

      if (variantPool.length > 0) {
        return pickWeightedVariant(variantPool);
      }
      return null;
    }, [pickWeightedVariant]);

    const startMoodPulse = useCallback((layer: MoodLayerSpec, state: MoodState, nowMs: number) => {
      if (!modelRef.current) return;
      const variant = resolveLayerVariant(layer, state);
      if (!variant) return;

      const duration = layer.duration[0] + Math.random() * Math.max(0, layer.duration[1] - layer.duration[0]);
      const pulse = {
        id: `${layer.name}-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
        startTime: nowMs,
        duration,
        blendshapes: variant.blendshapes ?? {},
        boneTargets: [] as Array<{
          bone: any;
          startX: number;
          startY: number;
          startZ: number;
          targetX: number;
          targetY: number;
          targetZ: number;
        }>,
      };

      if (variant.bones) {
        modelRef.current.traverse((child: any) => {
          if (!child.isBone) return;
          const target = variant.bones?.[child.name];
          if (!target) return;
          pulse.boneTargets.push({
            bone: child,
            startX: child.rotation.x,
            startY: child.rotation.y,
            startZ: child.rotation.z,
            targetX: target.x ?? child.rotation.x,
            targetY: target.y ?? child.rotation.y,
            targetZ: target.z ?? child.rotation.z,
          });
        });
      }

      moodPulseRef.current.push(pulse);
    }, [resolveLayerVariant]);

    const applyMoodBaseline = useCallback((targetMood: Emotion) => {
      if (!meshRef.current?.morphTargetInfluences) return;
      const baseline = animMoods[targetMood]?.baseline ?? animMoods.neutral.baseline;
      applyBlendshapesToMesh(baseline);
    }, []);

    const restoreActiveGesturesToRest = useCallback(() => {
      if (gestureBonesRef.current.length === 0) return;
      for (const gesture of gestureBonesRef.current) {
        gesture.bone.rotation.x = gesture.restX;
        gesture.bone.rotation.y = gesture.restY;
        gesture.bone.rotation.z = gesture.restZ;
      }
      gestureBonesRef.current = [];
    }, []);

    const setMoodInternal = useCallback((targetMood: Emotion) => {
      moodRef.current = targetMood;
      lastMoodNameRef.current = targetMood;
      nextMoodPulseRef.current = 0;
      moodPulseRef.current = [];
      applyEmotionToMesh(targetMood);
      applyMoodBaseline(targetMood);
    }, [applyEmotionToMesh, applyMoodBaseline]);

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      playLipSync: (blendshapeData: any[], startTime: number = 0) => {
        if (!blendshapeData.length || !meshRef.current) return;

        // Ensure animator exists (fallback if model load didn't create it)
        if (!lipSyncAnimatorRef.current) {
          const additionalMeshes = allMorphMeshesRef.current.filter((m: any) => m !== meshRef.current);
          lipSyncAnimatorRef.current = new LipSyncAnimator({
            mesh: meshRef.current,
            additionalMeshes,
            smoothing: 0.15,
          });
        }

        lipSyncAnimatorRef.current.setBlendshapeData(blendshapeData);
        lipSyncAnimatorRef.current.setIsSpeaking(true);
        // Pre-set speakingFactor to 1 so first frames are immediately visible
        (lipSyncAnimatorRef.current as any).speakingFactor = 1;
        lipSyncAnimatorRef.current.play(startTime);

        const shouldDumpDiagnostics =
          typeof window !== 'undefined' &&
          (window as any).__ALIA_DUMP_LIPSYNC_DIAGNOSTICS__ === true;
        if (shouldDumpDiagnostics) {
          // Capture diagnostics after playback starts so applied runtime values are meaningful.
          setTimeout(() => {
            lipSyncAnimatorRef.current?.dumpFullDiagnostics();
          }, 300);
        }
      },
      pauseLipSync: () => {
        lipSyncAnimatorRef.current?.setIsSpeaking(false);
        lipSyncAnimatorRef.current?.pause();
      },
      stopLipSync: () => {
        lipSyncAnimatorRef.current?.setIsSpeaking(false);
        lipSyncAnimatorRef.current?.stop();
      },
      applyBlendshapes: (blendshapes: Record<string, number>) => {
        applyBlendshapesToMesh(blendshapes);
      },
      getLipSyncDuration: () => {
        return lipSyncAnimatorRef.current?.getDuration?.() ?? 0;
      },
      getLipSyncPlaying: () => {
        return lipSyncAnimatorRef.current?.getIsPlaying?.() ?? false;
      },
      setAudioElement: (el: HTMLAudioElement | null) => {
        // Create animator lazily if mesh is ready but animator isn't yet
        if (el && meshRef.current && !lipSyncAnimatorRef.current) {
          lipSyncAnimatorRef.current = new LipSyncAnimator({
            mesh: meshRef.current,
            smoothing: 0.15,
          });
        }
        lipSyncAnimatorRef.current?.setAudioElement(el);
      },
      setIsMockData: (isMock: boolean) => {
        lipSyncAnimatorRef.current?.setIsMockData(isMock);
      },
      setLipSyncOffset: (offsetMs: number) => {
        lipSyncAnimatorRef.current?.setLipSyncOffset(offsetMs);
      },
      applyAzureViseme: (visemeId: number, audioOffsetTicks: number) => {
        if (!lipSyncAnimatorRef.current) {
          if (!meshRef.current) {
            console.warn('[Avatar] Cannot apply viseme: mesh not ready');
            return;
          }
          const additionalMeshes = allMorphMeshesRef.current.filter((m: any) => m !== meshRef.current);
          lipSyncAnimatorRef.current = new LipSyncAnimator({
            mesh: meshRef.current,
            additionalMeshes,
            smoothing: 0.15,
          });
        }
        lipSyncAnimatorRef.current.applyAzureViseme(visemeId, audioOffsetTicks);
      },
      getDebugStats: () => {
        return lipSyncAnimatorRef.current?.getDebugStats?.() ?? { jawOpen: 0, speakingFactor: 0, elapsedMs: 0, frameIndex: 0, frameCount: 0, isPlaying: false, clockSource: 'perf' as const, offsetMs: 0, peakJaw: 0, peakFrame: 0, peakElapsed: 0, appliedTargets: 0, dominantViseme: 'viseme_sil', dominantMouth: 'jawOpen' };
      },
      getAnimationLog: (limit: number = 80) => {
        return lipSyncAnimatorRef.current?.getAnimationLog?.(limit) ?? [];
      },
      getMesh: () => meshRef.current ?? null,
      playGesture: (name: string, duration: number = GESTURE_TIMING.defaultDuration, mirror: boolean = false) => {
        if (!modelRef.current) return;
        restoreActiveGesturesToRest();

        const template = GESTURE_TEMPLATES[name];
        if (!template) {
          console.warn(`[Avatar] Unknown gesture "${name}"`);
          return;
        }

        let resolvedTemplate: GestureTemplate = template;
        if (mirror) {
          const mirrored: GestureTemplate = {};
          for (const [key, value] of Object.entries(template)) {
            const mk = key.startsWith('Left')
              ? key.replace(/^Left/, 'Right')
              : key.startsWith('Right')
                ? key.replace(/^Right/, 'Left')
                : key;
            mirrored[mk] = value;
          }
          resolvedTemplate = mirrored;
        }

        const totalMs = duration * 1000;
        const inMs = Math.max(320, Math.min(600, totalMs * GESTURE_TIMING.inRatio));
        const outMs = Math.max(420, Math.min(800, totalMs * GESTURE_TIMING.outRatio));
        const holdMs = Math.max(400, totalMs - inMs - outMs);
        const now = performance.now();
        const entries: GestureBoneEntry[] = [];

        modelRef.current.traverse((child: any) => {
          if (!child.isBone) return;
          const rotation = resolvedTemplate[`${child.name}.rotation`];
          if (!rotation) return;
          const rest = boneRestPoseRef.current.get(child.name) ?? {
            x: child.rotation.x,
            y: child.rotation.y,
            z: child.rotation.z,
          };
          entries.push({
            bone: child,
            targetX: rest.x + (rotation.x ?? 0) * GESTURE_TIMING.strength,
            targetY: rest.y + (rotation.y ?? 0) * GESTURE_TIMING.strength,
            targetZ: rest.z + (rotation.z ?? 0) * GESTURE_TIMING.strength,
            startX: child.rotation.x,
            startY: child.rotation.y,
            startZ: child.rotation.z,
            restX: rest.x,
            restY: rest.y,
            restZ: rest.z,
            startTime: now,
            inDuration: inMs,
            holdDuration: holdMs,
            outDuration: outMs,
          });
        });

        gestureBonesRef.current = entries;
        console.log(`🎭 Gesture "${name}" (mirror=${mirror}) — ${entries.length} bones | in:${inMs.toFixed(0)}ms hold:${holdMs.toFixed(0)}ms out:${outMs.toFixed(0)}ms`);
        if (entries.length > 0) {
          const first = entries[0];
          console.log(
            `[Gesture] ${first.bone.name} rest:(${first.restX.toFixed(3)}, ${first.restY.toFixed(3)}, ${first.restZ.toFixed(3)}) -> target:(${first.targetX.toFixed(3)}, ${first.targetY.toFixed(3)}, ${first.targetZ.toFixed(3)})`
          );
        }
      },
      playEmotion: (targetEmotion: Emotion, duration: number = 0) => {
        applyEmotionToMesh(targetEmotion);
        if (duration > 0) {
          window.setTimeout(() => applyEmotionToMesh(emotion), duration * 1000);
        }
      },
      setListening: (listening: boolean) => {
        listeningRef.current = listening;
      },
      clearGestures: () => {
        restoreActiveGesturesToRest();
      },
      setMood: (targetMood: Emotion) => {
        setMoodInternal(targetMood);
      },
    }), [applyEmotionToMesh, emotion, restoreActiveGesturesToRest, setMoodInternal]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    let isMounted = true;
    
    async function initScene() {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        
        if (!isMounted || !containerRef.current) return;
        
        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        sceneRef.current = scene;
        
        // Camera
        const camera = new THREE.PerspectiveCamera(
          50,
          containerRef.current.clientWidth / containerRef.current.clientHeight,
          0.1,
          1000
        );
        camera.position.z = 5;
        cameraRef.current = camera;
        
        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);
        
        const backLight = new THREE.DirectionalLight(0x4a90d9, 0.5);
        backLight.position.set(-5, -5, -5);
        scene.add(backLight);
        
        // Load GLB Model
        const loader = new GLTFLoader();
        
        loader.load(
          modelUrl,
          // Success callback
          (gltf) => {
            if (!isMounted) return;
            
            console.log('✅ GLB model loaded successfully');
            const model = gltf.scene;
            
            // Center and scale the model
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 3 / maxDim; // Scale to fit in view
            model.scale.setScalar(scale);
            
            model.position.sub(center.multiplyScalar(scale));
            model.position.y -= 0.5; // Adjust vertical position
            
            // Zoom camera to head / upper-body (bust shot)
            const scaledHeight = size.y * scale;
            const headY = -0.5 + scaledHeight * 0.35;
            camera.position.set(0, headY + 0.15, 1.8);
            camera.lookAt(0, headY, 0);
            camera.updateProjectionMatrix();

            restPoseRef.current = {
              positionY: model.position.y,
              rotationX: model.rotation.x,
              rotationY: model.rotation.y,
              rotationZ: model.rotation.z,
            };
            
            scene.add(model);
            modelRef.current = model;

            const boneRestPose = new Map<string, { x: number; y: number; z: number }>();
            model.traverse((child: any) => {
              if (!child.isBone) return;
              boneRestPose.set(child.name, {
                x: child.rotation.x,
                y: child.rotation.y,
                z: child.rotation.z,
              });
            });
            boneRestPoseRef.current = boneRestPose;

            const boneNames = getModelBoneNames(model);
            console.log(`🦴 GLB skeleton detected: ${boneNames.length} bones`);
            if (boneNames.length > 0) {
              console.log('[Avatar] GLB bone names:\n' + boneNames.join('\n'));
            }
            
            // Find meshes with morph targets for lip-sync
            let morphTargetCount = 0;
            const availableTargets: string[] = [];
            allMorphMeshesRef.current = [];
            
            model.traverse((child: any) => {
              if (child.isMesh && child.morphTargetInfluences && child.morphTargetDictionary) {
                allMorphMeshesRef.current.push(child);
                meshRef.current = child; // last mesh wins (Wolf3D_Teeth)
                morphTargetCount++;
                const targets = Object.keys(child.morphTargetDictionary);
                availableTargets.push(...targets);
                
                console.log(`✅ Mesh "${child.name}" - ${targets.length} morph targets`);
              }
            });

            // Use Wolf3D_Head as primary (contains the most relevant jaw/mouth geometry)
            // Fall back to first available mesh if Wolf3D_Head not found
            const primaryMesh =
              allMorphMeshesRef.current.find((m: any) => m.name === 'Wolf3D_Head') ??
              allMorphMeshesRef.current[0];
            if (primaryMesh) {
              meshRef.current = primaryMesh;
              const additionalMeshes = allMorphMeshesRef.current.filter((m: any) => m !== primaryMesh);
              lipSyncAnimatorRef.current = new LipSyncAnimator({
                mesh: primaryMesh,
                additionalMeshes,
                smoothing: 0.15,
              });

              blinkMirrorCacheRef.current = additionalMeshes
                .filter((m: any) => m?.morphTargetInfluences && m?.morphTargetDictionary)
                .map((m: any) => ({
                  mesh: m,
                  blinkL: m.morphTargetDictionary['eyeBlinkLeft'] ?? -1,
                  blinkR: m.morphTargetDictionary['eyeBlinkRight'] ?? -1,
                }))
                .filter((entry) => entry.blinkL !== -1 || entry.blinkR !== -1);
            }
            
            if (morphTargetCount > 0) {
              console.log(`✅ Model ready: ${morphTargetCount} mesh(es), ${new Set(availableTargets).size} unique targets`);
            } else {
              console.warn('⚠️  Model loaded but no morph targets found - static avatar only');
            }
            
            setIsLoaded(true);
            setUsesFallback(false);
          },
          // Progress callback
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`Loading model: ${percent.toFixed(0)}%`);
          },
          // Error callback - fallback to sphere
          (err) => {
            const error = err as Error;
            console.warn('⚠️  GLB model loading failed, using fallback sphere:', error.message);
            
            if (!isMounted) return;
            
            // Create fallback avatar (simple sphere)
            const geometry = new THREE.SphereGeometry(1.5, 32, 32);
            const fallbackMorphNames = [
              'jawOpen',
              'mouthSmileLeft',
              'mouthSmileRight',
              'mouthFunnel',
              'mouthPucker',
            ];
            
            // Create named morph targets so Three.js builds a usable morphTargetDictionary
            const morphAttributes: any[] = [];
            const positions = geometry.attributes.position;
            
            for (let i = 0; i < fallbackMorphNames.length; i++) {
              const morphPositions = [];
              for (let j = 0; j < positions.count; j++) {
                const x = positions.getX(j);
                const y = positions.getY(j);
                const z = positions.getZ(j);

                let nextX = x;
                let nextY = y;
                let nextZ = z;

                if (fallbackMorphNames[i] === 'jawOpen' && y < 0) {
                  nextY = y * 0.82;
                  nextZ = z * 1.04;
                } else if (fallbackMorphNames[i] === 'mouthSmileLeft' && y < 0.1 && x < 0) {
                  nextX = x * 1.08;
                  nextY = y * 1.03;
                } else if (fallbackMorphNames[i] === 'mouthSmileRight' && y < 0.1 && x > 0) {
                  nextX = x * 1.08;
                  nextY = y * 1.03;
                } else if (fallbackMorphNames[i] === 'mouthFunnel' && y < 0.15) {
                  nextX = x * 0.88;
                  nextZ = z * 1.08;
                } else if (fallbackMorphNames[i] === 'mouthPucker' && y < 0.15) {
                  nextX = x * 0.80;
                  nextZ = z * 1.12;
                }

                morphPositions.push(nextX, nextY, nextZ);
              }
              const attr = new THREE.Float32BufferAttribute(morphPositions, 3);
              attr.name = fallbackMorphNames[i];
              morphAttributes.push(attr);
            }
            
            geometry.morphAttributes.position = morphAttributes;
            
            const material = new THREE.MeshStandardMaterial({
              color: 0x4a90d9,
              roughness: 0.5,
              metalness: 0.1,
            });
            
            const head = new THREE.Mesh(geometry, material);
            head.name = 'avatarHead';
            head.updateMorphTargets();
            scene.add(head);
            meshRef.current = head;
            modelRef.current = head;
            allMorphMeshesRef.current = [head];
            blinkMirrorCacheRef.current = [];
            lipSyncAnimatorRef.current = new LipSyncAnimator({
              mesh: head,
              additionalMeshes: [],
              smoothing: 0.15,
            });
            console.log('✅ Fallback avatar ready with morph targets:', Object.keys(head.morphTargetDictionary || {}));
            
            // Eyes
            const eyeGeometry = new THREE.SphereGeometry(0.15, 16, 16);
            const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const pupilGeometry = new THREE.SphereGeometry(0.08, 16, 16);
            const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
            
            // Left eye
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-0.4, 0.3, 1.3);
            scene.add(leftEye);
            
            const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
            leftPupil.position.set(-0.4, 0.3, 1.45);
            scene.add(leftPupil);
            
            // Right eye
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(0.4, 0.3, 1.3);
            scene.add(rightEye);
            
            const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
            rightPupil.position.set(0.4, 0.3, 1.45);
            scene.add(rightPupil);
            
            setIsLoaded(true);
            setUsesFallback(true);
          }
        );
        
        if (!isMounted) {
          renderer.dispose();
          return;
        }
        
        // Procedural eye blink state
        let nextBlinkTime = Date.now() + 3000 + Math.random() * 2000;
        let blinkStart = 0;
        let doubleBlink = false;
        let doubleBlinkStart = 0;
        const BLINK_DURATION = 150; // ms

        // Micro-saccade state: slow gaze drift
        let gazeTargetX = 0;
        let gazeTargetY = 0;
        let gazeCurrX = 0;
        let gazeCurrY = 0;
        let nextGazeShift = Date.now() + 1500 + Math.random() * 2000;
        let prevBlinkVal = -1;

        // Animation loop
        const animate = (timestamp: number) => {
          if (!isMounted) return;
          
          animationRef.current = requestAnimationFrame(animate);
          
          // Head micro-motion: very subtle idle breathing sway only — no speech bobbing
          if (modelRef.current) {
            const t = Date.now() * 0.001;
            const restPose = restPoseRef.current;
            const speakingNow = lipSyncAnimatorRef.current?.getIsPlaying() ?? false;
            const motionScale = (speakingNow ? 0.5 : 1) * Math.max(0, Math.min(1, idleIntensity));
            const listeningLift = listeningRef.current ? 0.01 * motionScale : 0;
            const breathRock = Math.sin(t * 1.8) * 0.004 * motionScale;
            const headSway = Math.sin(t * 0.55) * 0.02 * motionScale;
            const headNod = Math.sin(t * 0.32 + 0.8) * 0.01 * motionScale;
            const torsoShift = Math.sin(t * 0.9 + 0.4) * 0.012 * motionScale;

            if (restPose) {
              modelRef.current.position.y = restPose.positionY + torsoShift;
              modelRef.current.rotation.y = restPose.rotationY + headSway;
              modelRef.current.rotation.x = restPose.rotationX + headNod + breathRock + listeningLift;
              modelRef.current.rotation.z = restPose.rotationZ + Math.sin(t * 0.28) * 0.006 * motionScale;
            } else {
              modelRef.current.rotation.y = headSway;
              modelRef.current.rotation.x = headNod + breathRock + listeningLift;
              modelRef.current.rotation.z = Math.sin(t * 0.28) * 0.006 * motionScale;
            }
          }

          // Drive lip-sync morph targets — MUST be before renderer.render()
          lipSyncAnimatorRef.current?.update(timestamp);

          // Reapply mood baseline after lip-sync so mood channels are additive and never overwritten.
          if (meshRef.current?.morphTargetInfluences) {
            const baseline = animMoods[moodRef.current]?.baseline ?? {};
            const dict = meshRef.current.morphTargetDictionary ?? {};
            for (const [name, value] of Object.entries(baseline)) {
              const idx = dict[name];
              if (idx !== undefined) {
                meshRef.current.morphTargetInfluences[idx] = Math.max(
                  meshRef.current.morphTargetInfluences[idx] ?? 0,
                  value
                );
              }
            }
          }

          if (gestureBonesRef.current.length > 0) {
            const nowG = performance.now();
            gestureBonesRef.current = gestureBonesRef.current.filter((g) => {
              const elapsed = nowG - g.startTime;
              const totalDuration = g.inDuration + g.holdDuration + g.outDuration;

              let rx: number;
              let ry: number;
              let rz: number;

              if (elapsed < g.inDuration) {
                const p = elapsed / g.inDuration;
                const eased = easeInOutCubic(p);
                rx = g.startX + (g.targetX - g.startX) * eased;
                ry = g.startY + (g.targetY - g.startY) * eased;
                rz = g.startZ + (g.targetZ - g.startZ) * eased;
              } else if (elapsed < g.inDuration + g.holdDuration) {
                rx = g.targetX;
                ry = g.targetY;
                rz = g.targetZ;
              } else if (elapsed < totalDuration) {
                const p = (elapsed - g.inDuration - g.holdDuration) / g.outDuration;
                const eased = easeInOutCubic(p);
                rx = g.targetX + (g.restX - g.targetX) * eased;
                ry = g.targetY + (g.restY - g.targetY) * eased;
                rz = g.targetZ + (g.restZ - g.targetZ) * eased;
              } else {
                g.bone.rotation.x = g.restX;
                g.bone.rotation.y = g.restY;
                g.bone.rotation.z = g.restZ;
                return false;
              }

              g.bone.rotation.x = rx;
              g.bone.rotation.y = ry;
              g.bone.rotation.z = rz;
              return true;
            });
          }

          const nowMs = Date.now();
          const currentMood = moodRef.current;
          const currentMoodState = getMoodState();
          const moodProfile = animMoods[currentMood] ?? animMoods.neutral;

          if (currentMood !== lastMoodNameRef.current || currentMoodState !== lastMoodStateRef.current) {
            lastMoodNameRef.current = currentMood;
            lastMoodStateRef.current = currentMoodState;
            nextMoodPulseRef.current = 0;
          }

          if (nowMs >= nextMoodPulseRef.current) {
            const layer = moodProfile.layers[Math.floor(Math.random() * moodProfile.layers.length)];
            if (layer) {
              startMoodPulse(layer, currentMoodState, nowMs);
            }

            const idleMultiplier = Math.max(0.6, Math.min(1.4, idleIntensity));
            const nextWindow = currentMoodState === 'speaking'
              ? [900, 2600]
              : currentMoodState === 'listening'
                ? [1200, 3400]
                : [1500, 5200];
            nextMoodPulseRef.current = nowMs + nextWindow[0] + Math.random() * (nextWindow[1] - nextWindow[0]) * idleMultiplier;
          }

          if (moodPulseRef.current.length > 0 && meshRef.current?.morphTargetInfluences) {
            moodPulseRef.current = moodPulseRef.current.filter((pulse) => {
              const progress = Math.min((nowMs - pulse.startTime) / pulse.duration, 1);
              const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

              for (const [blendshapeName, value] of Object.entries(pulse.blendshapes)) {
                const index = meshRef.current.morphTargetDictionary?.[blendshapeName];
                if (index !== undefined && index >= 0 && index < meshRef.current.morphTargetInfluences.length) {
                  const currentValue = meshRef.current.morphTargetInfluences[index] ?? 0;
                  meshRef.current.morphTargetInfluences[index] = Math.max(currentValue, Math.max(0, Math.min(1, value * eased)));
                }
              }

              for (const target of pulse.boneTargets) {
                target.bone.rotation.x = target.startX + (target.targetX - target.startX) * eased;
                target.bone.rotation.y = target.startY + (target.targetY - target.startY) * eased;
                target.bone.rotation.z = target.startZ + (target.targetZ - target.startZ) * eased;
              }

              if (progress >= 1) {
                for (const target of pulse.boneTargets) {
                  target.bone.rotation.x = target.startX;
                  target.bone.rotation.y = target.startY;
                  target.bone.rotation.z = target.startZ;
                }
                return false;
              }
              return true;
            });
          }

          // Procedural eye blink (more frequent during speech: 2-3.5s vs 3-5s idle)
          const isSpeakingNow = lipSyncAnimatorRef.current?.getIsPlaying() ?? false;
          if (nowMs >= nextBlinkTime) {
            blinkStart = nowMs;
            // 15% chance of double-blink
            doubleBlink = Math.random() < 0.15;
            doubleBlinkStart = 0;
            const minInterval = isSpeakingNow ? 2000 : 3000;
            const maxExtra = isSpeakingNow ? 1500 : 2000;
            nextBlinkTime = nowMs + minInterval + Math.random() * maxExtra;
          }
          // Trigger double-blink after first blink completes
          if (doubleBlink && blinkStart > 0 && nowMs - blinkStart > BLINK_DURATION + 80 && doubleBlinkStart === 0) {
            doubleBlinkStart = nowMs;
          }

          if (meshRef.current?.morphTargetInfluences && meshRef.current?.morphTargetDictionary) {
            const dict = meshRef.current.morphTargetDictionary;
            const blinkL = dict['eyeBlinkLeft'];
            const blinkR = dict['eyeBlinkRight'];

            // Primary blink
            const blinkElapsed = nowMs - blinkStart;
            let blinkVal = 0;
            if (blinkStart > 0 && blinkElapsed < BLINK_DURATION) {
              const halfDur = BLINK_DURATION / 2;
              blinkVal = blinkElapsed < halfDur
                ? blinkElapsed / halfDur
                : 1 - (blinkElapsed - halfDur) / halfDur;
            }
            // Double-blink overlay
            if (doubleBlinkStart > 0) {
              const dblElapsed = nowMs - doubleBlinkStart;
              if (dblElapsed < BLINK_DURATION) {
                const halfDur = BLINK_DURATION / 2;
                const dblVal = dblElapsed < halfDur
                  ? dblElapsed / halfDur
                  : 1 - (dblElapsed - halfDur) / halfDur;
                blinkVal = Math.max(blinkVal, dblVal);
              }
            }
            if (blinkL !== undefined) meshRef.current.morphTargetInfluences[blinkL] = blinkVal;
            if (blinkR !== undefined) meshRef.current.morphTargetInfluences[blinkR] = blinkVal;

            // Micro-saccades: slow gaze drift for natural eye movement
            if (nowMs >= nextGazeShift) {
              gazeTargetX = (Math.random() - 0.5) * 0.12; // subtle horizontal
              gazeTargetY = (Math.random() - 0.5) * 0.06; // subtle vertical
              nextGazeShift = nowMs + 1200 + Math.random() * 2500;
            }
            // Smooth drift toward target
            gazeCurrX += (gazeTargetX - gazeCurrX) * 0.03;
            gazeCurrY += (gazeTargetY - gazeCurrY) * 0.03;

            const lookInL = dict['eyeLookInLeft'];
            const lookOutL = dict['eyeLookOutLeft'];
            const lookInR = dict['eyeLookInRight'];
            const lookOutR = dict['eyeLookOutRight'];
            const lookUpL = dict['eyeLookUpLeft'];
            const lookDownL = dict['eyeLookDownLeft'];
            const lookUpR = dict['eyeLookUpRight'];
            const lookDownR = dict['eyeLookDownRight'];

            // Horizontal: positive = look right (InLeft + OutRight), negative = look left
            if (gazeCurrX > 0) {
              if (lookInL !== undefined) meshRef.current.morphTargetInfluences[lookInL] = gazeCurrX;
              if (lookOutR !== undefined) meshRef.current.morphTargetInfluences[lookOutR] = gazeCurrX;
              if (lookOutL !== undefined) meshRef.current.morphTargetInfluences[lookOutL] = 0;
              if (lookInR !== undefined) meshRef.current.morphTargetInfluences[lookInR] = 0;
            } else {
              if (lookOutL !== undefined) meshRef.current.morphTargetInfluences[lookOutL] = -gazeCurrX;
              if (lookInR !== undefined) meshRef.current.morphTargetInfluences[lookInR] = -gazeCurrX;
              if (lookInL !== undefined) meshRef.current.morphTargetInfluences[lookInL] = 0;
              if (lookOutR !== undefined) meshRef.current.morphTargetInfluences[lookOutR] = 0;
            }
            // Vertical: positive = look up
            if (gazeCurrY > 0) {
              if (lookUpL !== undefined) meshRef.current.morphTargetInfluences[lookUpL] = gazeCurrY;
              if (lookUpR !== undefined) meshRef.current.morphTargetInfluences[lookUpR] = gazeCurrY;
              if (lookDownL !== undefined) meshRef.current.morphTargetInfluences[lookDownL] = 0;
              if (lookDownR !== undefined) meshRef.current.morphTargetInfluences[lookDownR] = 0;
            } else {
              if (lookDownL !== undefined) meshRef.current.morphTargetInfluences[lookDownL] = -gazeCurrY;
              if (lookDownR !== undefined) meshRef.current.morphTargetInfluences[lookDownR] = -gazeCurrY;
              if (lookUpL !== undefined) meshRef.current.morphTargetInfluences[lookUpL] = 0;
              if (lookUpR !== undefined) meshRef.current.morphTargetInfluences[lookUpR] = 0;
            }

            // Subtle smile during speech (muscles naturally engage)
            if (isSpeakingNow) {
              const smileL = dict['mouthSmileLeft'];
              const smileR = dict['mouthSmileRight'];
              const subtleSmile = 0.008 + Math.sin(Date.now() * 0.001 * 0.7) * 0.004;
              if (smileL !== undefined) {
                meshRef.current.morphTargetInfluences[smileL] = Math.max(
                  meshRef.current.morphTargetInfluences[smileL],
                  subtleSmile
                );
              }
              if (smileR !== undefined) {
                meshRef.current.morphTargetInfluences[smileR] = Math.max(
                  meshRef.current.morphTargetInfluences[smileR],
                  subtleSmile
                );
              }
            }

            // Mirror blink only when the value materially changes.
            if (Math.abs(blinkVal - prevBlinkVal) > 0.005) {
              prevBlinkVal = blinkVal;
              for (const { mesh: extraMesh, blinkL: eBL, blinkR: eBR } of blinkMirrorCacheRef.current) {
                if (!extraMesh?.morphTargetInfluences) continue;
                if (eBL !== -1) extraMesh.morphTargetInfluences[eBL] = blinkVal;
                if (eBR !== -1) extraMesh.morphTargetInfluences[eBR] = blinkVal;
              }
            }
          }
          
          renderer.render(scene, camera);
        };
        animate(performance.now());
        
        // Handle resize
        const handleResize = () => {
          if (!containerRef.current || !camera || !renderer) return;
          
          camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        
        window.addEventListener('resize', handleResize);
        
        return () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (err) {
        console.error('Avatar initialization error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize avatar');
        }
      }
    }
    
    initScene();
    
    return () => {
      isMounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      lipSyncAnimatorRef.current?.stop();
      if (rendererRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(rendererRef.current.domElement);
        } catch (e) {}
        rendererRef.current.dispose();
      }
    };
  }, [modelUrl]);

  // Drive speaking envelope when prop changes
  useEffect(() => {
    lipSyncAnimatorRef.current?.setIsSpeaking(isSpeaking);
  }, [isSpeaking]);

  useEffect(() => {
    listeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    setMoodInternal(emotion);
  }, [emotion, setMoodInternal]);
  
  // Emotion changes
  useEffect(() => {
    if (!modelRef.current || !isLoaded) return;
    
    const colors: Record<string, number> = {
      neutral: 0x4a90d9,
      happy: 0x5cb85c,
      friendly: 0x5cb85c,
      empathetic: 0x5bc0de,
      reassuring: 0x4a90d9,
      sad: 0x5bc0de,
      disappointed: 0x6f7d8c,
      surprised: 0xf0ad4e,
      interested: 0x4a90d9,
      thinking: 0x9b59b6,
      concerned: 0xd9534f,
      skeptical: 0xf0ad4e,
      frustrated: 0xd9534f,
      attentive: 0x5cb85c,
      confident: 0x5cb85c,
    };
    
    // Only apply color changes if using fallback sphere
    if (usesFallback && meshRef.current) {
      const material = meshRef.current.material as any;
      if (material && material.color) {
        material.color.setHex(colors[emotion] || colors.neutral);
      }
    } else {
      // GLB model expressions are already applied by the emotion effect above.
    }
  }, [emotion, isLoaded, usesFallback, applyEmotionToMesh]);

  return (
    <div className={`avatar-container ${className}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Model info badge */}
      {isLoaded && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          backgroundColor: usesFallback ? 'rgba(255, 193, 7, 0.8)' : 'rgba(92, 184, 92, 0.8)',
          color: '#fff',
          fontFamily: 'monospace'
        }}>
          {usesFallback ? '⚠️ Fallback' : '✓ GLB Loaded'}
        </div>
      )}
      
      {/* Loading state */}
      {!isLoaded && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '10px' }}>Loading 3D avatar...</div>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>Loading model.glb</div>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ff6b6b',
          textAlign: 'center'
        }}>
          <p>Avatar unavailable</p>
          <small>{error}</small>
        </div>
      )}
      
      {/* Speaking indicator */}
      {isSpeaking && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '4px'
        }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#5cb85c',
                animation: `pulse 1s infinite ${i * 0.2}s`
              }}
            />
          ))}
        </div>
      )}
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
});

// =====================================================
// Avatar Component (with loading state for SSR)
// =====================================================

export const Avatar = forwardRef<AvatarHandle, AvatarProps>((props, ref) => {
  const [isClient, setIsClient] = useState(false);
  const avatarRef = useRef<AvatarHandle>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Forward the ref to the actual AvatarCore.
  // Each method delegates through avatarRef AT CALL TIME so they work even
  // though AvatarCore only mounts after the isClient=false→true transition.
  useImperativeHandle(ref, () => ({
    playLipSync: (blendshapeData: any[], startTime?: number) =>
      avatarRef.current?.playLipSync(blendshapeData, startTime),
    pauseLipSync: () => avatarRef.current?.pauseLipSync(),
    stopLipSync: () => avatarRef.current?.stopLipSync(),
    applyBlendshapes: (blendshapes: Record<string, number>) =>
      avatarRef.current?.applyBlendshapes(blendshapes),
    getLipSyncDuration: () => avatarRef.current?.getLipSyncDuration() ?? 0,
    getLipSyncPlaying: () => avatarRef.current?.getLipSyncPlaying() ?? false,
    setAudioElement: (el: HTMLAudioElement | null) =>
      avatarRef.current?.setAudioElement(el),
    setIsMockData: (isMock: boolean) =>
      avatarRef.current?.setIsMockData(isMock),
    setLipSyncOffset: (offsetMs: number) =>
      avatarRef.current?.setLipSyncOffset(offsetMs),
    applyAzureViseme: (visemeId: number, audioOffsetTicks: number) =>
      avatarRef.current?.applyAzureViseme(visemeId, audioOffsetTicks),
    getDebugStats: () =>
      avatarRef.current?.getDebugStats() ?? { jawOpen: 0, speakingFactor: 0, elapsedMs: 0, frameIndex: 0, frameCount: 0, isPlaying: false, clockSource: 'perf' as const, offsetMs: 0, peakJaw: 0, peakFrame: 0, peakElapsed: 0, appliedTargets: 0, dominantViseme: 'viseme_sil', dominantMouth: 'jawOpen' },
    getAnimationLog: (limit?: number) =>
      avatarRef.current?.getAnimationLog(limit) ?? [],
    getMesh: () => avatarRef.current?.getMesh() ?? null,
    playGesture: (name: string, duration?: number, mirror?: boolean) =>
      avatarRef.current?.playGesture(name, duration, mirror),
    playEmotion: (emotion: Emotion, duration?: number) =>
      avatarRef.current?.playEmotion(emotion, duration),
    setListening: (listening: boolean) =>
      avatarRef.current?.setListening(listening),
    clearGestures: () =>
      avatarRef.current?.clearGestures(),
    setMood: (mood: Emotion) =>
      avatarRef.current?.setMood(mood),
  }), []);

  if (!isClient) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        minHeight: '300px',
        backgroundColor: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }}>
        Loading...
      </div>
    );
  }

  return <AvatarCore ref={avatarRef} {...props} />;
});

Avatar.displayName = 'Avatar';

export default Avatar;
