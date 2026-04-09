/**
 * Lip-Sync Animator for ReadyPlayerMe Avatars
 * Optimized for RPM's 67-target morph structure
 * Maps NVIDIA Audio2Face-3D ARKit → RPM viseme/morph targets
 */

import * as THREE from 'three';

export interface Audio2FaceBlendshape {
  timestamp: number;
  blendshapes: Record<string, number>;
}

export interface LipSyncAnimatorConfig {
  mesh: THREE.Mesh;
  additionalMeshes?: THREE.Mesh[];
  audioContext?: AudioContext;
  smoothing?: number;
}

export interface LipSyncDebugStats {
  jawOpen: number;
  speakingFactor: number;
  elapsedMs: number;
  frameIndex: number;
  frameCount: number;
  isPlaying: boolean;
  clockSource: 'audio' | 'perf';
  offsetMs: number;
  peakJaw: number;
  peakFrame: number;
  peakElapsed: number;
  appliedTargets: number;
  dominantViseme: string;
  dominantMouth: string;
}

export interface AnimationLogEntry {
  elapsedMs: number;
  frameIndex: number;
  frameCount: number;
  jawOpen: number;
  dominantViseme: string;
  dominantMouth: string;
  targetsApplied: number;
  clockSource: 'audio' | 'perf';
}

export type AvatarMode = 'idle' | 'teaching' | 'presenting' | 'listening' | 'interview';

interface IdleGestureConfig {
  name: 'breathing' | 'nod' | 'subtle_tilt' | 'micro_brow' | 'handup' | 'index';
  durationMs: number;
  weight: number;
}

const SKIP_POKING_BLENDSHAPES = new Set([
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'mouthFunnel',
  'mouthPucker',
]);

const VISEME_RUNTIME_CAP: Record<string, number> = {
  viseme_sil: 0.05,
  viseme_pp: 0.10,
  viseme_ff: 0.12,
  viseme_th: 0.12,
  viseme_dd: 0.14,
  viseme_kk: 0.12,
  viseme_ch: 0.15,
  viseme_ss: 0.12,
  viseme_nn: 0.12,
  viseme_rr: 0.14,
  viseme_aa: 0.55,
  viseme_e: 0.36,
  viseme_i: 0.32,
  viseme_o: 0.52,
  viseme_u: 0.38,
};

const EMOTION_CHANNEL_PREFIXES = [
  'mouthsmile',
  'mouthfrown',
  'browdown',
  'browinnerup',
  'browouterup',
  'eyewide',
  'eyesquint',
  'cheekpuff',
  'nosesneer',
  'mouthpress',
];

/**
 * NVIDIA Audio2Face-3D ARKit 52 → ReadyPlayerMe Complete Mapping
 * Verified against Wolf3D_Head (67 morph targets)
 */
const AUDIO2FACE_TO_RPM: Record<string, string[]> = {
  // === JAW (Index 49 - MOST CRITICAL) ===
  'jawOpen': ['jawOpen'],
  'jawForward': ['jawForward'],
  'jawLeft': ['jawLeft'],
  'jawRight': ['jawRight'],

  // === MOUTH PRIMARY (Indices 50-66) ===
  'mouthClose': ['mouthClose'],
  'mouthFunnel': ['mouthFunnel'],
  'mouthPucker': ['mouthPucker'],
  'mouthLeft': ['mouthLeft'],
  'mouthRight': ['mouthRight'],

  // === MOUTH SMILE/FROWN (Split L/R) ===
  'mouthSmileLeft': ['mouthSmileLeft'],
  'mouthSmileRight': ['mouthSmileRight'],
  'mouthFrownLeft': ['mouthFrownLeft'],
  'mouthFrownRight': ['mouthFrownRight'],

  // === MOUTH DIMPLE/STRETCH ===
  'mouthDimpleLeft': ['mouthDimpleLeft'],
  'mouthDimpleRight': ['mouthDimpleRight'],
  'mouthStretchLeft': ['mouthStretchLeft'],
  'mouthStretchRight': ['mouthStretchRight'],

  // === MOUTH ROLL/SHRUG ===
  'mouthRollLower': ['mouthRollLower'],
  'mouthRollUpper': ['mouthRollUpper'],
  'mouthShrugLower': ['mouthShrugLower'],
  'mouthShrugUpper': ['mouthShrugUpper'],

  // === MOUTH PRESS ===
  'mouthPressLeft': ['mouthPressLeft'],
  'mouthPressRight': ['mouthPressRight'],

  // === MOUTH LIP PARTING (Indices 34-35, 60-61 - KEY for speech) ===
  // === CHEEKS ===
  'cheekPuff': ['cheekPuff'],
  'cheekSquintLeft': ['cheekSquintLeft'],
  'cheekSquintRight': ['cheekSquintRight'],

  // === NOSE ===
  'noseSneerLeft': ['noseSneerLeft'],
  'noseSneerRight': ['noseSneerRight'],

  // === EYES BLINK (Indices 65-66) ===
  'eyeBlinkLeft': ['eyeBlinkLeft'],
  'eyeBlinkRight': ['eyeBlinkRight'],

  // === EYES LOOK ===
  'eyeLookDownLeft': ['eyeLookDownLeft'],
  'eyeLookDownRight': ['eyeLookDownRight'],
  'eyeLookInLeft': ['eyeLookInLeft'],
  'eyeLookInRight': ['eyeLookInRight'],
  'eyeLookOutLeft': ['eyeLookOutLeft'],
  'eyeLookOutRight': ['eyeLookOutRight'],
  'eyeLookUpLeft': ['eyeLookUpLeft'],
  'eyeLookUpRight': ['eyeLookUpRight'],

  // === EYES SQUINT/WIDE ===
  'eyeSquintLeft': ['eyeSquintLeft'],
  'eyeSquintRight': ['eyeSquintRight'],
  'eyeWideLeft': ['eyeWideLeft'],
  'eyeWideRight': ['eyeWideRight'],

  // === BROWS (Indices 15-19 - Emotion) ===
  'browDownLeft': ['browDownLeft'],
  'browDownRight': ['browDownRight'],
  'browInnerUp': ['browInnerUp'],
  'browOuterUpLeft': ['browOuterUpLeft'],
  'browOuterUpRight': ['browOuterUpRight'],

  // === TONGUE ===
  'tongueOut': ['tongueOut'],

  // === READYPLAYERME VISEMES (Indices 0-14) ===
  'viseme_sil': ['visemesil'],
  'viseme_PP': ['visemePP'],
  'viseme_FF': ['visemeFF'],
  'viseme_TH': ['visemeTH'],
  'viseme_DD': ['visemeDD'],
  'viseme_kk': ['visemekk'],
  'viseme_CH': ['visemeCH'],
  'viseme_SS': ['visemeSS'],
  'viseme_nn': ['visemenn'],
  'viseme_RR': ['visemeRR'],
  'viseme_aa': ['visemeaa'],
  'viseme_E': ['visemeE'],
  'viseme_I': ['visemeI'],
  'viseme_O': ['visemeO'],
  'viseme_U': ['visemeU'],
};

/**
 * ReadyPlayerMe-specific fallback: Drive visemes from ARKit shapes
 * Used when Audio2Face sends ARKit names but RPM has viseme targets
 */
const ARKIT_TO_RPM_VISEME: Record<string, Array<{ target: string; weight: number }>> = {
  'jawOpen': [
    { target: 'visemeaa', weight: 1.0 },
    { target: 'visemeO', weight: 0.5 },
  ],
  'mouthFunnel': [
    { target: 'visemeO', weight: 1.0 },
    { target: 'visemeU', weight: 0.6 },
  ],
  'mouthPucker': [
    { target: 'visemeU', weight: 1.0 },
  ],
  'mouthSmileLeft': [
    { target: 'visemeE', weight: 0.7 },
    { target: 'visemeI', weight: 0.4 },
  ],
  'mouthSmileRight': [
    { target: 'visemeE', weight: 0.7 },
    { target: 'visemeI', weight: 0.4 },
  ],
  'mouthPressLeft': [
    { target: 'visemePP', weight: 0.8 },
  ],
  'mouthPressRight': [
    { target: 'visemePP', weight: 0.8 },
  ],
  'mouthFrownLeft': [
    { target: 'visemeFF', weight: 0.6 },
  ],
  'mouthFrownRight': [
    { target: 'visemeFF', weight: 0.6 },
  ],
  'cheekSquintLeft': [
    { target: 'visemeSS', weight: 0.5 },
  ],
  'cheekSquintRight': [
    { target: 'visemeSS', weight: 0.5 },
  ],
};

/**
 * Azure TTS Viseme IDs (0–21) → NVIDIA Audio2Face ARKit blendshape frames
 * Maps Azure's 21-category phoneme system to the 52-channel ARKit space
 * Reference: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme
 */
const AZURE_VISEME_TO_ARKIT: Record<number, Partial<Record<string, number>>> = {
  0:  { jawOpen: 0.0 },                                          // silence
  1:  { mouthPressLeft: 0.6, mouthPressRight: 0.6, jawOpen: 0.05 }, // p, b, m
  2:  { mouthFrownLeft: 0.4, mouthFrownRight: 0.4, jawOpen: 0.1 },  // f, v
  3:  { tongueOut: 0.3, mouthOpen: 0.2, jawOpen: 0.15 },            // th
  4:  { jawOpen: 0.15, tongueOut: 0.2 },                            // t, d
  5:  { jawOpen: 0.2, mouthFunnel: 0.1 },                           // k, g
  6:  { mouthFunnel: 0.5, jawOpen: 0.1 },                           // ch, sh
  7:  { cheekSquintLeft: 0.2, cheekSquintRight: 0.2, jawOpen: 0.08 }, // s, z
  8:  { jawOpen: 0.1, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },    // n, l
  9:  { mouthLeft: 0.15, mouthRight: 0.1, jawOpen: 0.12 },            // r
  10: { jawOpen: 0.55, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 },   // aa (father)
  11: { jawOpen: 0.3, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 },    // e (bed)
  12: { jawOpen: 0.2, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 },    // i (see)
  13: { jawOpen: 0.4, mouthFunnel: 0.3 },                             // o (go)
  14: { mouthPucker: 0.6, jawOpen: 0.1 },                             // u (blue)
  15: { jawOpen: 0.45, mouthFunnel: 0.2 },                            // ao diphthong
  16: { jawOpen: 0.25, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },   // ei diphthong
  17: { jawOpen: 0.35, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 },   // ia diphthong
  18: { jawOpen: 0.35, mouthFunnel: 0.25, mouthPucker: 0.1 },         // ou diphthong
  19: { jawOpen: 0.5, mouthSmileLeft: 0.25, mouthSmileRight: 0.25 },  // ai diphthong
  20: { jawOpen: 0.35, mouthFunnel: 0.25, mouthSmileLeft: 0.1 },      // oi diphthong
  21: { jawOpen: 0.3, mouthPucker: 0.4, mouthSmileLeft: 0.1 },        // ua diphthong
};

export class LipSyncAnimator {
  private mesh: THREE.Mesh;
  private morphTargetDictionary: Record<string, number>;
  private canonicalMorphTargetDictionary: Record<string, number> = {};
  private targetIndexCache: Map<string, number> = new Map();
  private blendshapeTargetBindingsCache: Map<string, Array<{ idx: number; weight: number; mode: 'direct' | 'fallback' }> | null> = new Map();
  private currentFrameIndex: number = 0;
  private startTime: number = 0;
  private audioStartTime: number = 0;
  private lastTimestamp: number = performance.now();
  private blendshapeData: Audio2FaceBlendshape[] = [];
  private smoothingFactor: number;
  private lastBlendshapeValues: Record<string, number> = {};
  private isPlaying: boolean = false;
  speakingFactor: number = 0;
  private speakingTarget: number = 0;
  private speakingSpeed: number = 28;
  private neutralFadeDuration: number = 0.25;
  private neutralElapsed: number = 0;
  private neutralActive: boolean = false;
  private neutralSnapshot: number[] | null = null;
  private additionalMeshes: THREE.Mesh[] = [];

  lipSyncOffsetMs: number = 0;
  private _lastElapsedMs: number = 0;
  private _peakJaw: number = 0;
  private _peakFrame: number = 0;
  private _peakElapsed: number = 0;
  private _appliedTargetsCount: number = 0;
  private _peakAppliedTargetsCount: number = 0;
  private _sumAppliedTargetsCount: number = 0;
  private _appliedTargetsSamples: number = 0;
  private _dominantViseme: string = 'viseme_sil';
  private _dominantMouth: string = 'jawOpen';
  private animationLog: AnimationLogEntry[] = [];
  private readonly animationLogCapacity: number = 6000;
  private lastLogPrintMs: number = 0;
  private realtimeLogEnabled: boolean = false;

  private audioElement: HTMLAudioElement | null = null;
  private isMockData: boolean = false;
  private _applyBSCallCount: number = 0;
  private _firstUpdatePending: boolean = false;

  // TalkingHead-style additive idle gestures
  private lastIdleGestureTime: number = 0;
  private idleGestureInterval: ReturnType<typeof setInterval> | null = null;
  private idleReleaseTimeout: ReturnType<typeof setTimeout> | null = null;
  private modeRef: AvatarMode = 'idle';

  private readonly IDLE_GESTURE_POOL: IdleGestureConfig[] = [
    { name: 'breathing', durationMs: 2800, weight: 0.72 },
    { name: 'nod', durationMs: 1600, weight: 0.82 },
    { name: 'subtle_tilt', durationMs: 2100, weight: 0.60 },
    { name: 'micro_brow', durationMs: 900, weight: 0.85 },
    { name: 'handup', durationMs: 3200, weight: 0.65 },
    { name: 'index', durationMs: 2800, weight: 0.70 },
  ];

  constructor(config: LipSyncAnimatorConfig) {
    this.mesh = config.mesh;
    this.additionalMeshes = config.additionalMeshes ?? [];
    this.smoothingFactor = config.smoothing ?? 0.15;
    this.realtimeLogEnabled = typeof window !== 'undefined' && (window as any).__ALIA_LIPLOG__ === true;

    this.morphTargetDictionary = {};
    if (config.mesh.morphTargetDictionary) {
      this.morphTargetDictionary = config.mesh.morphTargetDictionary;
    }

    for (const [name, index] of Object.entries(this.morphTargetDictionary)) {
      const normalized = this.normalizeMorphName(name);
      this.canonicalMorphTargetDictionary[normalized] = index;
      this.targetIndexCache.set(name, index);
      this.targetIndexCache.set(normalized, index);
    }

    const hasJawOpen = this.resolveMorphTargetIndex('jawOpen') !== undefined;
    const visemeTargetCount = Object.keys(this.morphTargetDictionary).filter((k) => k.toLowerCase().includes('viseme')).length;
    const hasVisemes = visemeTargetCount > 0;
    console.log(`🎬 LipSyncAnimator (RPM): ${Object.keys(this.morphTargetDictionary).length} targets, jawOpen=${hasJawOpen}, visemes=${hasVisemes}, visemeTargets=${visemeTargetCount}`);

    this.startIdleGestures();
  }

  private normalizeMorphName(name: string): string {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private resolveMorphTargetIndex(targetName: string): number | undefined {
    const cached = this.targetIndexCache.get(targetName);
    if (cached !== undefined) return cached;

    const normalized = this.normalizeMorphName(targetName);
    const normalizedCached = this.targetIndexCache.get(normalized);
    if (normalizedCached !== undefined) {
      this.targetIndexCache.set(targetName, normalizedCached);
      return normalizedCached;
    }

    const direct = this.morphTargetDictionary[targetName];
    if (direct !== undefined) {
      this.targetIndexCache.set(targetName, direct);
      this.targetIndexCache.set(normalized, direct);
      return direct;
    }

    const canonical = this.canonicalMorphTargetDictionary[normalized];
    if (canonical !== undefined) {
      this.targetIndexCache.set(targetName, canonical);
      this.targetIndexCache.set(normalized, canonical);
    }
    return canonical;
  }

  private getCachedTargetBindings(
    blendshapeName: string
  ): Array<{ idx: number; weight: number; mode: 'direct' | 'fallback' }> | null {
    const cached = this.blendshapeTargetBindingsCache.get(blendshapeName);
    if (cached !== undefined) return cached;

    const bindings: Array<{ idx: number; weight: number; mode: 'direct' | 'fallback' }> = [];
    const rpmTargets = AUDIO2FACE_TO_RPM[blendshapeName];

    if (rpmTargets) {
      for (const targetName of rpmTargets) {
        const idx = this.resolveMorphTargetIndex(targetName);
        if (idx !== undefined) {
          bindings.push({ idx, weight: 1, mode: 'direct' });
        }
      }
    } else if (blendshapeName in ARKIT_TO_RPM_VISEME) {
      for (const { target, weight } of ARKIT_TO_RPM_VISEME[blendshapeName]) {
        const idx = this.resolveMorphTargetIndex(target);
        if (idx !== undefined) {
          bindings.push({ idx, weight, mode: 'fallback' });
        }
      }
    } else {
      const idx = this.resolveMorphTargetIndex(blendshapeName);
      if (idx !== undefined) {
        bindings.push({ idx, weight: 1, mode: 'direct' });
      }
    }

    const result = bindings.length > 0 ? bindings : null;
    this.blendshapeTargetBindingsCache.set(blendshapeName, result);
    return result;
  }

  private getFrameBlendshapeValue(frame: Audio2FaceBlendshape, keys: string[]): number {
    for (const key of keys) {
      const value = frame.blendshapes[key];
      if (value !== undefined) return Number(value) || 0;
    }
    return 0;
  }

  private getBlendshapePeak(keys: string[]): number {
    let peak = 0;
    for (const frame of this.blendshapeData) {
      const value = this.getFrameBlendshapeValue(frame, keys);
      if (value > peak) peak = value;
    }
    return peak;
  }

  public dumpFullDiagnostics(): void {
    console.group('🔥 LipSync FULL Realism Diagnostics');
    console.log(`Frames: ${this.blendshapeData.length}`);
    console.log(`Speaking factor: ${this.speakingFactor.toFixed(3)}`);
    console.log(`Mode: ${this.modeRef}`);
    console.log(`Playing: ${this.isPlaying}`);
    console.log(`Idle gestures active: ${!!this.idleGestureInterval}`);

    if (this.blendshapeData.length === 0) {
      console.warn('No blendshape data loaded');
      console.groupEnd();
      return;
    }

    const jawValues = this.blendshapeData.map((f) => this.getFrameBlendshapeValue(f, ['jawOpen']));
    const jawSum = jawValues.reduce((a, b) => a + b, 0);

    console.table({
      rawMinJaw: Math.min(...jawValues).toFixed(3),
      rawMaxJaw: Math.max(...jawValues).toFixed(3),
      rawAvgJaw: (jawSum / jawValues.length).toFixed(3),
      appliedPeakJaw: this._peakJaw.toFixed(3),
    });

    const visemePeaks: Record<string, number> = {
      viseme_aa: this.getBlendshapePeak(['viseme_aa', 'viseme_AA']),
      viseme_e: this.getBlendshapePeak(['viseme_e', 'viseme_E']),
      viseme_i: this.getBlendshapePeak(['viseme_i', 'viseme_I']),
      viseme_o: this.getBlendshapePeak(['viseme_o', 'viseme_O']),
      viseme_u: this.getBlendshapePeak(['viseme_u', 'viseme_U']),
    };
    console.table(visemePeaks);

    console.table(
      this.blendshapeData.slice(0, 20).map((f) => ({
        t: f.timestamp,
        jaw: this.getFrameBlendshapeValue(f, ['jawOpen']).toFixed(3),
        viseme_aa: this.getFrameBlendshapeValue(f, ['viseme_aa', 'viseme_AA']).toFixed(3),
        viseme_o: this.getFrameBlendshapeValue(f, ['viseme_o', 'viseme_O']).toFixed(3),
        speakingFactor: this.speakingFactor.toFixed(2),
      }))
    );

    const avgAppliedTargets = this._appliedTargetsSamples > 0
      ? this._sumAppliedTargetsCount / this._appliedTargetsSamples
      : 0;
    console.table({
      lastAppliedTargets: this._appliedTargetsCount,
      peakAppliedTargets: this._peakAppliedTargetsCount,
      avgAppliedTargets: avgAppliedTargets.toFixed(1),
      peakFrameIndex: this._peakFrame,
      peakElapsedMs: Math.round(this._peakElapsed),
    });

    console.log(`Last idle gesture: ${this.lastIdleGestureTime ? new Date(this.lastIdleGestureTime).toLocaleTimeString() : 'never'}`);

    console.groupEnd();
  }

  setAudioElement(el: HTMLAudioElement | null): void {
    this.audioElement = el;
  }

  setIsMockData(flag: boolean): void {
    this.isMockData = flag;
  }

  setLipSyncOffset(offsetMs: number): void {
    this.lipSyncOffsetMs = offsetMs;
  }

  setBlendshapeData(data: Audio2FaceBlendshape[]): void {
    if (data.length > 0 && data[0].timestamp !== 0) {
      const offset = data[0].timestamp;
      this.blendshapeData = data.map(f => ({ ...f, timestamp: f.timestamp - offset }));
    } else {
      // Defensive copy — prevent external mutations from affecting the animator
      this.blendshapeData = data.map(f => ({ ...f }));
    }
    this.currentFrameIndex = 0;
    console.log(`📊 Loaded ${this.blendshapeData.length} frames for RPM avatar`);
  }

  /**
   * Append frames from streaming TTS (sentence-by-sentence)
   * Normalizes timestamps relative to the first accumulated frame
   * Auto-starts playback if idle
   * @param newFrames — Audio2FaceBlendshape[] from TTS chunk
   */
  appendBlendshapeFrames(newFrames: Audio2FaceBlendshape[]): void {
    if (newFrames.length === 0) return;

    const SENTENCE_GAP_MS = 80; // coarticulation buffer between sentences

    // First append ever: normalize all timestamps to 0
    if (this.blendshapeData.length === 0) {
      const offset = newFrames[0].timestamp ?? 0;
      const normalized = newFrames.map((f) => ({
        ...f,
        timestamp: f.timestamp - offset,
      }));
      this.blendshapeData = normalized;
      console.log(`📊 Initialized streaming: ${normalized.length} frames (first chunk)`);
    } else {
      // Subsequent appends: offset new frames relative to where buffer ends + gap
      const bufferEndMs = (this.blendshapeData[this.blendshapeData.length - 1]?.timestamp ?? 0) + SENTENCE_GAP_MS;
      const newOffset = newFrames[0].timestamp ?? 0;

      const normalized = newFrames.map((f) => ({
        ...f,
        timestamp: f.timestamp - newOffset + bufferEndMs,
      }));

      this.blendshapeData.push(...normalized);
      console.log(`➕ Appended: ${normalized.length} frames (total: ${this.blendshapeData.length})`);
    }

    // Auto-start if not already playing and we have content
    if (!this.isPlaying && this.blendshapeData.length > 0) {
      this.play();
    }
  }

  play(audioCurrentTime: number = 0): void {
    if (this.isPlaying) this.stop();

    this.isPlaying = true;
    const now = performance.now();
    this.startTime = now;
    this.lastTimestamp = now;
    this.audioStartTime = audioCurrentTime * 1000;
    this.currentFrameIndex = 0;
    this._applyBSCallCount = 0;
    this._firstUpdatePending = true;
    this._peakJaw = 0;
    this._peakFrame = 0;
    this._peakElapsed = 0;
    this._appliedTargetsCount = 0;
    this._peakAppliedTargetsCount = 0;
    this._sumAppliedTargetsCount = 0;
    this._appliedTargetsSamples = 0;
    this._dominantViseme = 'viseme_sil';
    this._dominantMouth = 'jawOpen';
    this.animationLog = [];
    this.lastLogPrintMs = 0;
    this.neutralActive = false;
    this.neutralSnapshot = null;

    this.startIdleGestures();

    console.log(`▶️  RPM lip-sync: ${this.blendshapeData.length} frames, clock=${this.audioElement ? 'audio' : 'perf'}`);
  }

  setIsSpeaking(isSpeaking: boolean): void {
    this.speakingTarget = isSpeaking ? 1 : 0;
    if (!isSpeaking && !this.isPlaying) {
      this.startNeutralFade();
    }
  }

  pause(): void {
    this.isPlaying = false;
    console.log('⏸️  Paused');
  }

  stop(): void {
    this.isPlaying = false;
    this.currentFrameIndex = 0;
    this._lastElapsedMs = 0;
    this.stopIdleGestures();
    this.resetBlendshapes();
    console.log('⏹️  Stopped');
  }

  setMode(mode: AvatarMode): void {
    this.modeRef = mode;
  }

  /**
   * Apply a single Azure TTS viseme (called as visemes stream in from the WebSocket)
   * @param visemeId — Azure viseme ID 0–21
   * @param audioOffsetTicks — Audio timestamp in 100-nanosecond units (from Azure)
   */
  applyAzureViseme(visemeId: number, audioOffsetTicks: number): void {
    if (visemeId < 0 || visemeId > 21) {
      console.warn(`⚠️  Invalid Azure viseme ID: ${visemeId}, ignoring`);
      return;
    }

    // Convert 100ns ticks → milliseconds
    const audioOffsetMs = audioOffsetTicks / 10000;

    // Convert Azure viseme to ARKit blendshape frame
    const arkit = AZURE_VISEME_TO_ARKIT[visemeId] ?? { jawOpen: 0 };

    // Create a single-frame blendshape entry
    const frame: Audio2FaceBlendshape = {
      timestamp: audioOffsetMs,
      blendshapes: Object.fromEntries(
        Object.entries(arkit).filter(([, v]) => v !== undefined)
      ) as Record<string, number>,
    };

    // Append to the animated frames
    this.appendBlendshapeFrames([frame]);

    if (import.meta.env.DEV) {
      console.log(`🟢 Azure viseme ${visemeId} → ${Object.keys(arkit).join(', ')} @ ${audioOffsetMs.toFixed(0)}ms`);
    }
  }

  private startIdleGestures(): void {
    if (this.idleGestureInterval) return;

    this.idleGestureInterval = setInterval(() => {
      // Breathing runs gently even during speech; stronger gestures remain mode-aware.
      if (this.modeRef === 'idle' || this.speakingFactor < 0.35) {
        this.triggerRandomIdleGesture();
      }
    }, 2200);
  }

  private triggerRandomIdleGesture(): void {
    const now = Date.now();
    if (now - this.lastIdleGestureTime < 3200) return;

    const gesture = this.IDLE_GESTURE_POOL[Math.floor(Math.random() * this.IDLE_GESTURE_POOL.length)];
    const boost: Record<string, number> = {};
    const idleDamping = this.speakingFactor > 0.4 ? 0.32 : 1.0;

    switch (gesture.name) {
      case 'breathing':
        boost.mouthSmileLeft = 0.05 * gesture.weight * idleDamping;
        boost.mouthSmileRight = 0.05 * gesture.weight * idleDamping;
        break;
      case 'nod':
        boost.browInnerUp = 0.22 * gesture.weight * idleDamping;
        break;
      case 'subtle_tilt':
        boost.browOuterUpLeft = 0.11 * gesture.weight * idleDamping;
        boost.browOuterUpRight = 0.08 * gesture.weight * idleDamping;
        break;
      case 'micro_brow':
        boost.browInnerUp = 0.18 * gesture.weight * idleDamping;
        break;
      case 'handup':
        boost.mouthSmileLeft = 0.08 * gesture.weight * idleDamping;
        boost.mouthSmileRight = 0.08 * gesture.weight * idleDamping;
        break;
      case 'index':
        boost.jawForward = 0.09 * gesture.weight * idleDamping;
        break;
      default:
        break;
    }

    if (Object.keys(boost).length === 0) return;

    this.applyBlendshapes(boost, {}, 0);

    if (this.idleReleaseTimeout) {
      clearTimeout(this.idleReleaseTimeout);
      this.idleReleaseTimeout = null;
    }

    this.idleReleaseTimeout = setTimeout(() => {
      const zeroed = Object.fromEntries(Object.keys(boost).map((key) => [key, 0])) as Record<string, number>;
      this.applyBlendshapes(zeroed, {}, 0);
      this.idleReleaseTimeout = null;
    }, gesture.durationMs);

    this.lastIdleGestureTime = now;
  }

  private stopIdleGestures(): void {
    if (this.idleGestureInterval) {
      clearInterval(this.idleGestureInterval);
      this.idleGestureInterval = null;
    }

    if (this.idleReleaseTimeout) {
      clearTimeout(this.idleReleaseTimeout);
      this.idleReleaseTimeout = null;
    }
  }

  update(timestamp: number): void {
    const now = timestamp;

    if (!this.isPlaying || this.blendshapeData.length === 0) return;

    if (this._firstUpdatePending) {
      this._firstUpdatePending = false;
      this.startTime = now;
      this.lastTimestamp = now;
    }

    const deltaSeconds = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    this.updateSpeakingFactor(deltaSeconds);
    this.updateNeutralFade(deltaSeconds);

    // Master clock
    let elapsedTime: number;
    if (this.audioElement && !this.audioElement.paused && this.audioElement.duration > 0) {
      const audioElapsedMs = this.audioElement.currentTime * 1000;
      const audioDurationMs = this.audioElement.duration * 1000;
      const frameTimelineMs = this.blendshapeData[this.blendshapeData.length - 1]?.timestamp ?? 0;
      
      // Normalize frame progression to audio progress so animation doesn't end before audio
      if (audioDurationMs > 0 && frameTimelineMs > 0 && frameTimelineMs < audioDurationMs) {
        const audioProgress = THREE.MathUtils.clamp(audioElapsedMs / audioDurationMs, 0, 1);
        elapsedTime = audioProgress * frameTimelineMs;
      } else {
        elapsedTime = audioElapsedMs;
      }
    } else {
      elapsedTime = now - this.startTime + this.audioStartTime;
    }
    elapsedTime += this.lipSyncOffsetMs;
    this._lastElapsedMs = elapsedTime;

    if (elapsedTime > this._peakElapsed) this._peakElapsed = elapsedTime;

    // Frame advance
    const MAX_FRAME_SKIP = 10;
    let skipped = 0;
    while (
      this.currentFrameIndex < this.blendshapeData.length - 1 &&
      this.blendshapeData[this.currentFrameIndex + 1].timestamp <= elapsedTime &&
      skipped < MAX_FRAME_SKIP
    ) {
      this.currentFrameIndex++;
      skipped++;
    }

    if (this.currentFrameIndex > this._peakFrame) this._peakFrame = this.currentFrameIndex;

    const currentFrame = this.blendshapeData[this.currentFrameIndex];
    const nextFrame =
      this.currentFrameIndex < this.blendshapeData.length - 1
        ? this.blendshapeData[this.currentFrameIndex + 1]
        : currentFrame;

    // During explicit silence visemes, ease speakingFactor down so residual mouth tension fades naturally.
    const frameViseme = this.getDominantChannel(currentFrame.blendshapes, 'viseme_', 'viseme_sil');
    if (frameViseme === 'viseme_sil') {
      // Keep visemes expressive during active playback while still allowing clean closure on true silence.
      const isActivelySpeaking = this.speakingTarget > 0.5;
      const silenceTarget = isActivelySpeaking ? 0.42 : 0.08;
      const silenceSpeed = isActivelySpeaking ? 12 : 24;
      const silenceFade = THREE.MathUtils.clamp(deltaSeconds * silenceSpeed, 0, 1);
      this.speakingFactor = THREE.MathUtils.lerp(this.speakingFactor, silenceTarget, silenceFade);

      // Only hard-clamp low when speech has ended.
      if (!isActivelySpeaking) {
        this.speakingFactor = Math.min(this.speakingFactor, 0.18);
      }
    }

    let t = 0;
    if (nextFrame.timestamp !== currentFrame.timestamp) {
      t = (elapsedTime - currentFrame.timestamp) / (nextFrame.timestamp - currentFrame.timestamp);
      t = Math.max(0, Math.min(1, t));
    }
    t = t * t * (3 - 2 * t); // Smoothstep

    this.applyBlendshapes(currentFrame.blendshapes, nextFrame.blendshapes, t);
    this.captureAnimationLog(elapsedTime);

    if (this.currentFrameIndex >= this.blendshapeData.length - 1) {
      // Check if audio has actually ended, not just frame buffer
      const audioEnded = this.audioElement 
        ? (this.audioElement.currentTime >= this.audioElement.duration - 0.05) 
        : false;
      
      if (this.isMockData && this.speakingTarget > 0) {
        // Voice still active — loop mock data so mouth keeps moving
        this.currentFrameIndex = 0;
        this.startTime = now;
        this.audioStartTime = 0;
        this._lastElapsedMs = 0;
      } else if (audioEnded || (!this.audioElement && this.currentFrameIndex >= this.blendshapeData.length - 1)) {
        this.isPlaying = false;
        this.startNeutralFade();
        const avgTargets = this._appliedTargetsSamples > 0
          ? this._sumAppliedTargetsCount / this._appliedTargetsSamples
          : 0;
        console.log(`✅ Complete: last=${this._appliedTargetsCount} peak=${this._peakAppliedTargetsCount} avg=${avgTargets.toFixed(1)} targets, peak jaw=${this._peakJaw.toFixed(3)}`);
      }
    }
  }

  private applyBlendshapes(
    frame1: Record<string, number>,
    frame2: Record<string, number>,
    t: number
  ): void {
    const influences = this.mesh.morphTargetInfluences;
    if (!influences) return;

    let appliedCount = 0;
    const skipped: string[] = [];

    // Reference jaw opening for this interpolation step; used to keep mouthClose/press from collapsing inward.
    const jaw1 = frame1.jawOpen ?? 0;
    const jaw2 = frame2.jawOpen ?? 0;
    const jawInterpolated = Math.min((jaw1 + (jaw2 - jaw1) * t) * 0.85, 0.48);
    const dominantVisemeFrame = this.getDominantChannel(frame1, 'viseme_', 'viseme_sil');

    // Procedural micro-expressions during speech for liveliness
    const now = performance.now();
    const microBrow = Math.sin(now * 0.0043) * 0.012 * this.speakingFactor;
    const microCheek = (Math.sin(now * 0.0031) * 0.5 + 0.5) * 0.05 * this.speakingFactor;

    const applyChannel = (blendshapeName: string) => {
      if (SKIP_POKING_BLENDSHAPES.has(blendshapeName)) {
        return;
      }

      const value1 = frame1[blendshapeName] ?? 0;
      const value2 = frame2[blendshapeName] ?? 0;
      let interpolated = value1 + (value2 - value1) * t;

      const prevVal = this.lastBlendshapeValues[blendshapeName] ?? 0;
      if (interpolated < 0.001 && prevVal < 0.001) {
        const bindings = this.getCachedTargetBindings(blendshapeName);
        const hasResidualInfluence = bindings?.some(({ idx }) => (influences[idx] ?? 0) >= 0.001) ?? false;
        if (!hasResidualInfluence) {
          this.lastBlendshapeValues[blendshapeName] = 0;
          return;
        }
      }

      // RPM-specific damping: allow stronger vowel articulation while keeping clip protection.
      const lower = blendshapeName.toLowerCase();
      const isEmotionChannel = EMOTION_CHANNEL_PREFIXES.some((prefix) => lower.startsWith(prefix));
      if (lower === 'jawopen' || blendshapeName === 'jawOpen') {
        // Keep silence closure intact while still boosting weak jaw streams.
        interpolated = Math.min(interpolated * 3.8, 0.72);
        if (this._peakJaw < interpolated) this._peakJaw = interpolated;
      } else if (lower.includes('mouth') || lower.includes('lip')) {
        if (!isEmotionChannel) {
          interpolated = Math.min(interpolated * 0.65, 0.30);

          // Prevent wide grin artifacts on RPM during SS/E/I visemes.
          if (lower.includes('mouthstretch')) {
            interpolated = Math.min(interpolated * 0.35, 0.08);
          } else if (lower.includes('mouthsmile')) {
            interpolated = Math.min(interpolated * 0.45, 0.10);
          }
        }
      }

      // Scale viseme amplitudes with speaking state so mouth relaxes toward silence.
      if (lower.startsWith('viseme')) {
        interpolated = interpolated * this.speakingFactor;
        interpolated = Math.min(interpolated, VISEME_RUNTIME_CAP[lower] ?? 0.50);
      }

      // Hard anti-collapse guard for RPM: mouth closure/press can never exceed jaw-relative caps.
      if (!isEmotionChannel && lower === 'mouthclose') {
        // Relax closure cap so silence can seal while speech keeps anti-collapse safety.
        const closeCap = this.speakingFactor < 0.25
            ? Math.max(0.85, jawInterpolated * 0.9)
          : jawInterpolated * 0.65;
        interpolated = Math.min(interpolated, closeCap);
      } else if (!isEmotionChannel && (lower === 'mouthpressleft' || lower === 'mouthpressright')) {
        interpolated = Math.min(interpolated, Math.max(0.02, jawInterpolated * 0.25));
      }

      // Add procedural micro-expressions to secondary channels
      if (lower === 'browinnerup') {
        interpolated += microBrow;
      } else if (lower === 'cheeksquintleft' || lower === 'cheeksquintright') {
        interpolated += microCheek;
      }

      // Asymmetric smoothing: fast onset (0.45), slower offset (0.82)
      const baseSmooth = this.isMockData ? 0.6 : 0.75;
      const isVisemeChannel = lower.startsWith('viseme');
      const smoothFactor = interpolated > prevVal
        ? Math.min(baseSmooth + 0.15, 0.85)   // fast attack
        : isVisemeChannel
          ? Math.max(baseSmooth - 0.30, 0.25) // visemes: faster release to silence
          : Math.max(baseSmooth - 0.10, 0.50); // other channels: slower release

      const bindings = this.getCachedTargetBindings(blendshapeName);
      if (bindings) {
        for (const binding of bindings) {
          const idx = binding.idx;
          if (idx < 0 || idx >= influences.length) continue;

          const prev = influences[idx] ?? 0;
          const nextValue = binding.mode === 'fallback'
            ? Math.max(prev, interpolated * binding.weight)
            : interpolated;
          const smoothed = THREE.MathUtils.lerp(prev, nextValue, smoothFactor);
          influences[idx] = THREE.MathUtils.clamp(smoothed, 0, 1);
          appliedCount++;
        }
      } else {
        skipped.push(blendshapeName);
      }

      this.lastBlendshapeValues[blendshapeName] = interpolated;
      if (blendshapeName === 'jawOpen' && interpolated > this._peakJaw) {
        this._peakJaw = interpolated;
      }
    };

    for (const blendshapeName of Object.keys(frame1)) {
      applyChannel(blendshapeName);
    }

    for (const blendshapeName of Object.keys(frame2)) {
      if (Object.prototype.hasOwnProperty.call(frame1, blendshapeName)) continue;
      applyChannel(blendshapeName);
    }

    this._dominantViseme = dominantVisemeFrame;
    this._dominantMouth = this.getDominantChannel(frame1, 'mouth', 'jawOpen', true);

    this._appliedTargetsCount = appliedCount;
    this._peakAppliedTargetsCount = Math.max(this._peakAppliedTargetsCount, appliedCount);
    this._sumAppliedTargetsCount += appliedCount;
    this._appliedTargetsSamples += 1;

    if (skipped.length > 0 && this._applyBSCallCount === 0) {
      console.warn(`⚠️  ${skipped.length} unmapped:`, skipped.slice(0, 8));
    }
    this._applyBSCallCount++;

    this.mirrorToAdditionalMeshes();
  }

  private getDominantChannel(
    values: Record<string, number>,
    prefix: string,
    fallback: string,
    includeJaw: boolean = false
  ): string {
    let winner = fallback;
    let best = -1;
    for (const [name, value] of Object.entries(values)) {
      const n = Number(value) || 0;
      const lower = name.toLowerCase();
      const matches = includeJaw
        ? lower.startsWith(prefix) || lower === 'jawopen'
        : lower.startsWith(prefix);
      if (!matches) continue;
      if (n > best) {
        best = n;
        winner = name;
      }
    }
    return winner;
  }

  private captureAnimationLog(elapsedTime: number): void {
    const clockSource: 'audio' | 'perf' = (this.audioElement && !this.audioElement.paused) ? 'audio' : 'perf';
    const entry: AnimationLogEntry = {
      elapsedMs: Math.round(elapsedTime),
      frameIndex: this.currentFrameIndex,
      frameCount: this.blendshapeData.length,
      jawOpen: Number((this.lastBlendshapeValues['jawOpen'] ?? 0).toFixed(3)),
      dominantViseme: this._dominantViseme,
      dominantMouth: this._dominantMouth,
      targetsApplied: this._appliedTargetsCount,
      clockSource,
    };

    this.animationLog.push(entry);
    if (this.animationLog.length > this.animationLogCapacity) {
      this.animationLog.shift();
    }

    if (this.realtimeLogEnabled && entry.elapsedMs - this.lastLogPrintMs >= 1000) {
      this.lastLogPrintMs = entry.elapsedMs;
      console.log('[LIPLOG]', entry);
    }
  }

  private mirrorToAdditionalMeshes(): void {
    if (!this.mesh.morphTargetInfluences || this.additionalMeshes.length === 0) return;
    const src = this.mesh.morphTargetInfluences;
    for (const m of this.additionalMeshes) {
      if (m.morphTargetInfluences) {
        const len = Math.min(src.length, m.morphTargetInfluences.length);
        for (let i = 0; i < len; i++) {
          m.morphTargetInfluences[i] = src[i];
        }
      }
    }
  }

  private updateSpeakingFactor(deltaSeconds: number): void {
    const speed = this.isMockData ? 30 : this.speakingSpeed;
    this.speakingFactor = THREE.MathUtils.lerp(
      this.speakingFactor,
      this.speakingTarget,
      THREE.MathUtils.clamp(deltaSeconds * speed, 0, 1)
    );
  }

  private startNeutralFade(): void {
    if (!this.mesh.morphTargetInfluences) return;
    this.neutralSnapshot = [...this.mesh.morphTargetInfluences];
    this.neutralElapsed = 0;
    this.neutralActive = true;
  }

  private updateNeutralFade(deltaSeconds: number): void {
    if (!this.neutralActive || !this.mesh.morphTargetInfluences || !this.neutralSnapshot) return;

    this.neutralElapsed += deltaSeconds;
    const t = THREE.MathUtils.clamp(this.neutralElapsed / this.neutralFadeDuration, 0, 1);

    for (let i = 0; i < this.mesh.morphTargetInfluences.length; i++) {
      const from = this.neutralSnapshot[i] ?? 0;
      this.mesh.morphTargetInfluences[i] = THREE.MathUtils.lerp(from, 0, t);
    }

    if (t >= 1) {
      this.neutralActive = false;
      this.neutralSnapshot = null;
    }
  }

  private resetBlendshapes(): void {
    if (!this.mesh.morphTargetInfluences) return;

    for (let i = 0; i < this.mesh.morphTargetInfluences.length; i++) {
      this.mesh.morphTargetInfluences[i] = 0;
    }

    this.lastBlendshapeValues = {};
  }

  getDuration(): number {
    if (this.blendshapeData.length === 0) return 0;
    const lastFrame = this.blendshapeData[this.blendshapeData.length - 1];
    return lastFrame.timestamp / 1000;
  }

  getCurrentTime(): number {
    if (!this.isPlaying) return 0;
    // Use performance.now() — same clock as startTime set in play() and update()'s RAF timestamp
    return (performance.now() - this.startTime + this.audioStartTime) / 1000;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  debugLogBlendshapes(): void {
    console.log('📋 RPM Morph Targets:');
    const sorted = Object.entries(this.morphTargetDictionary).sort((a, b) => a[1] - b[1]);
    for (const [name, idx] of sorted) {
      console.log(`   [${idx}] ${name}`);
    }
  }

  getDebugStats(): LipSyncDebugStats {
    return {
      jawOpen: this.lastBlendshapeValues['jawOpen'] ?? 0,
      speakingFactor: this.speakingFactor,
      elapsedMs: this._lastElapsedMs,
      frameIndex: this.currentFrameIndex,
      frameCount: this.blendshapeData.length,
      isPlaying: this.isPlaying,
      clockSource: (this.audioElement && !this.audioElement.paused) ? 'audio' : 'perf',
      offsetMs: this.lipSyncOffsetMs,
      peakJaw: this._peakJaw,
      peakFrame: this._peakFrame,
      peakElapsed: this._peakElapsed,
      appliedTargets: this._appliedTargetsCount,
      dominantViseme: this._dominantViseme,
      dominantMouth: this._dominantMouth,
    };
  }

  getAnimationLog(limit: number = 80): AnimationLogEntry[] {
    const safeLimit = Math.max(1, Math.min(this.animationLogCapacity, Math.floor(limit)));
    return this.animationLog.slice(-safeLimit);
  }
}

export default LipSyncAnimator;
