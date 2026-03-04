/**
 * Lip-Sync Animator for 3D GLB Models
 * Maps NVIDIA Audio2Face blendshapes to Three.js morph targets
 * Syncs animation with audio playback
 */

import * as THREE from 'three';

export interface Audio2FaceBlendshape {
  timestamp: number;
  blendshapes: Record<string, number>;
}

export interface LipSyncAnimatorConfig {
  mesh: THREE.Mesh;
  /** Additional meshes to mirror blendshape influences to (e.g. Wolf3D_Teeth, EyeLeft) */
  additionalMeshes?: THREE.Mesh[];
  audioContext?: AudioContext;
  smoothing?: number; // 0-1, higher = smoother but more delayed
}

/**
 * ARKit to Three.js Blendshape Mapping
 * Maps standard ARKit face blendshape names to common morph target names
 */
const BLENDSHAPE_MAPPING: Record<string, string[]> = {
  // Jaw
  'jawOpen': ['jawOpen', 'jaw_open'],
  'jawLeft': ['jawLeft', 'jaw_left'],
  'jawRight': ['jawRight', 'jaw_right'],
  'jawForward': ['jawForward', 'jaw_forward'],

  // Mouth corners (also map to split Left/Right targets for RPM models)
  'mouthSmile': ['mouthSmile', 'mouthSmileLeft', 'mouthSmileRight', 'mouth_smile_left', 'mouth_smile_right'],
  'mouthFrown': ['mouthFrown', 'mouth_frown_left', 'mouth_frown_right'],
  'mouthDimple': ['mouthDimple', 'mouth_dimple_left', 'mouth_dimple_right'],

  // Mouth shape
  'mouthFunnel': ['mouthFunnel', 'mouth_funnel'],
  'mouthPucker': ['mouthPucker', 'mouth_pucker'],
  'mouthPress': ['mouthPress', 'mouth_press'],
  'mouthStretch': ['mouthStretch', 'mouth_stretch'],

  // Mouth movement
  'mouthLeft': ['mouthLeft', 'mouth_left'],
  'mouthRight': ['mouthRight', 'mouth_right'],
  'mouthClose': ['mouthClose', 'mouth_close'],
  'mouthUpperUp': ['mouthUpperUp', 'mouth_upper_up'],
  'mouthLowerDown': ['mouthLowerDown', 'mouth_lower_down'],

  // Lips
  'lipsPucker': ['lipsPucker', 'lips_pucker'],
  'lipsPressTogetherLeft': ['lipsPressTogetherLeft', 'lips_press_together_left'],
  'lipsPressTogetherRight': ['lipsPressTogetherRight', 'lips_press_together_right'],
  'lipsUpperUp': ['lipsUpperUp', 'lips_upper_up'],
  'lipsLowerDown': ['lipsLowerDown', 'lips_lower_down'],

  // Cheeks
  'cheekPuff': ['cheekPuff', 'cheek_puff_left', 'cheek_puff_right'],
  'cheekSquint': ['cheekSquint', 'cheek_squint_left', 'cheek_squint_right'],

  // Eyes
  'eyeBlinkLeft': ['eyeBlinkLeft', 'eye_blink_left'],
  'eyeBlinkRight': ['eyeBlinkRight', 'eye_blink_right'],
  'eyeLookUpLeft': ['eyeLookUpLeft', 'eye_look_up_left'],
  'eyeLookUpRight': ['eyeLookUpRight', 'eye_look_up_right'],
  'eyeLookDownLeft': ['eyeLookDownLeft', 'eye_look_down_left'],
  'eyeLookDownRight': ['eyeLookDownRight', 'eye_look_down_right'],

  // Eyebrows
  'browDownLeft': ['browDownLeft', 'brow_down_left'],
  'browDownRight': ['browDownRight', 'brow_down_right'],
  'browOuterUpLeft': ['browOuterUpLeft', 'brow_outer_up_left'],
  'browOuterUpRight': ['browOuterUpRight', 'brow_outer_up_right'],
  'browInnerUp': ['browInnerUp', 'brow_inner_up'],

  // Legacy combined names → split Left/Right
  'browDown': ['browDownLeft', 'browDownRight', 'brow_down_left', 'brow_down_right'],
  'mouthSmileLeft': ['mouthSmileLeft', 'mouth_smile_left'],
  'mouthSmileRight': ['mouthSmileRight', 'mouth_smile_right'],

  // ReadyPlayerMe / Oculus viseme targets
  'viseme_aa': ['viseme_aa'],
  'viseme_E': ['viseme_E'],
  'viseme_I': ['viseme_I'],
  'viseme_O': ['viseme_O'],
  'viseme_U': ['viseme_U'],
  'viseme_CH': ['viseme_CH'],
  'viseme_DD': ['viseme_DD'],
  'viseme_FF': ['viseme_FF'],
  'viseme_kk': ['viseme_kk'],
  'viseme_nn': ['viseme_nn'],
  'viseme_PP': ['viseme_PP'],
  'viseme_RR': ['viseme_RR'],
  'viseme_sil': ['viseme_sil'],
  'viseme_SS': ['viseme_SS'],
  'viseme_TH': ['viseme_TH'],
};

/**
 * Reverse map: GLB morph-target name → ARKit blendshape category
 * Lets us find a viseme target even when the incoming data uses ARKit names.
 * e.g. if the GLB has 'viseme_aa' but data sends 'jawOpen', we can still
 * drive viseme_aa from jawOpen intensity.
 */
const VISEME_FROM_ARKIT: Record<string, { target: string; scale: number }[]> = {
  'jawOpen':      [{ target: 'viseme_aa', scale: 0.7 }, { target: 'viseme_O', scale: 0.3 }],
  'mouthFunnel':  [{ target: 'viseme_O', scale: 0.8 }, { target: 'viseme_U', scale: 0.4 }],
  'mouthPucker':  [{ target: 'viseme_U', scale: 0.7 }],
  'mouthSmileLeft': [{ target: 'viseme_E', scale: 0.4 }],
  'mouthSmileRight': [{ target: 'viseme_E', scale: 0.4 }],
  'mouthFrown':   [{ target: 'viseme_FF', scale: 0.3 }],
  'mouthPress':   [{ target: 'viseme_PP', scale: 0.6 }],
};

export class LipSyncAnimator {
  private mesh: THREE.Mesh;
  private morphTargetDictionary: Record<string, number>;
  private currentFrameIndex: number = 0;
  private animationFrameId: number | null = null;
  private startTime: number = 0;
  private audioStartTime: number = 0;
  private lastTimestamp: number = performance.now();
  private lastBlendUpdate: number = 0;
  private blendshapeData: Audio2FaceBlendshape[] = [];
  private smoothingFactor: number;
  private lastBlendshapeValues: Record<string, number> = {};
  private isPlaying: boolean = false;
  private hasLoggedFirstFrame: boolean = false;
  speakingFactor: number = 0;
  private speakingTarget: number = 0;
  private speakingSpeed: number = 15; // higher = faster (~60-80ms ramp)
  private blendFps: number = 30;
  private neutralFadeDuration: number = 0.25;
  private neutralElapsed: number = 0;
  private neutralActive: boolean = false;
  private neutralSnapshot: number[] | null = null;

  /** Additional meshes that receive mirrored morph influences each frame */
  private additionalMeshes: THREE.Mesh[] = [];

  /**
   * Audio element used as the master clock for lip-sync timing.
   * When set, animation frames are driven by audio.currentTime
   * instead of performance.now(), ensuring perfect audio-visual sync.
   * Inspired by TalkingHead (met4citizen) architecture.
   */
  private audioElement: HTMLAudioElement | null = null;

  constructor(config: LipSyncAnimatorConfig) {
    this.mesh = config.mesh;
    this.additionalMeshes = config.additionalMeshes ?? [];
    this.smoothingFactor = config.smoothing ?? 0.3;

    // Build mapping of blendshape indices
    this.morphTargetDictionary = {};
    if (config.mesh.morphTargetDictionary) {
      this.morphTargetDictionary = config.mesh.morphTargetDictionary;
    }

    console.log('🎬 LipSyncAnimator initialized');
    const availableTargets = Object.keys(this.morphTargetDictionary);
    
    if (availableTargets.length > 0) {
      console.log(`   Available morph targets: ${availableTargets.length}`);
      console.log(`   Targets: ${availableTargets.slice(0, 15).join(', ')}${availableTargets.length > 15 ? '...' : ''}`);
    } else {
      console.warn('⚠️  No morph targets found - animation will have no visual effect');
    }
  }

  /**
   * Set the <audio> element to use as the master clock.
   * When provided, animation timing is driven by audio.currentTime
   * ensuring lip-sync stays perfectly aligned with audible speech.
   */
  setAudioElement(el: HTMLAudioElement | null): void {
    this.audioElement = el;
  }

  /**
   * Load blendshape animation data from Audio2Face
   */
  setBlendshapeData(data: Audio2FaceBlendshape[]): void {
    this.blendshapeData = data;
    this.currentFrameIndex = 0;
    console.log(`📊 Loaded ${data.length} blendshape frames`);
  }

  /**
   * Play lip-sync animation synced to audio.
   * Call update(timestamp) from the Three.js render loop each frame.
   */
  play(audioCurrentTime: number = 0): void {
    if (this.isPlaying) this.stop();

    this.isPlaying = true;
    const now = performance.now();
    this.startTime = now;
    this.lastTimestamp = now;
    this.lastBlendUpdate = now;
    this.audioStartTime = audioCurrentTime * 1000;
    this.currentFrameIndex = 0;
    this.hasLoggedFirstFrame = false;

    console.log('▶️  Lip-sync animation started');
  }

  /**
   * Control mouth ease-in/out
   */
  setIsSpeaking(isSpeaking: boolean): void {
    this.speakingTarget = isSpeaking ? 1 : 0;
    if (!isSpeaking) {
      this.startNeutralFade();
    }
  }

  /**
   * Pause animation (keeps current frame visible)
   */
  pause(): void {
    this.isPlaying = false;
    console.log('⏸️  Lip-sync animation paused');
  }

  /**
   * Stop animation and reset to neutral
   */
  stop(): void {
    this.isPlaying = false;
    this.currentFrameIndex = 0;
    this.resetBlendshapes();
    console.log('⏹️  Lip-sync animation stopped');
  }

  /**
   * Drive one frame of lip-sync animation.
   * MUST be called from the Three.js render loop BEFORE renderer.render()
   * so that morph target writes are committed in the same frame as the draw call.
   */
  update(timestamp: number): void {
    if (!this.isPlaying || this.blendshapeData.length === 0) return;

    const now = timestamp;
    const deltaSeconds = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    this.updateSpeakingFactor(deltaSeconds);
    this.updateNeutralFade(deltaSeconds);

    // ── Master clock ──
    let elapsedTime: number;
    if (this.audioElement) {
      const audioMs = this.audioElement.currentTime * 1000;
      if (this.audioElement.paused && audioMs === 0) return; // not started yet
      elapsedTime = audioMs;
    } else {
      // performance.now() fallback (browser TTS / mock)
      elapsedTime = now - this.startTime + this.audioStartTime;
    }

    // Advance frame pointer
    while (
      this.currentFrameIndex < this.blendshapeData.length - 1 &&
      this.blendshapeData[this.currentFrameIndex + 1].timestamp <= elapsedTime
    ) {
      this.currentFrameIndex++;
    }

    const currentFrame = this.blendshapeData[this.currentFrameIndex];
    const nextFrame =
      this.currentFrameIndex < this.blendshapeData.length - 1
        ? this.blendshapeData[this.currentFrameIndex + 1]
        : currentFrame;

    let t = 0;
    if (nextFrame.timestamp !== currentFrame.timestamp) {
      t = (elapsedTime - currentFrame.timestamp) / (nextFrame.timestamp - currentFrame.timestamp);
      t = Math.max(0, Math.min(1, t));
    }

    this.applyBlendshapes(currentFrame.blendshapes, nextFrame.blendshapes, t);

    if (this.currentFrameIndex >= this.blendshapeData.length - 1) {
      this.isPlaying = false;
      console.log('✅ Lip-sync animation completed');
    }
  }

  /**
   * Apply blendshapes to morph targets with smooth interpolation
   */
  private applyBlendshapes(
    frame1: Record<string, number>,
    frame2: Record<string, number>,
    t: number
  ): void {
    if (!this.mesh.morphTargetInfluences) return;

    // Get all unique blendshape names
    const allBlendshapes = new Set([
      ...Object.keys(frame1),
      ...Object.keys(frame2),
    ]);

    for (const blendshapeName of allBlendshapes) {
      const value1 = frame1[blendshapeName] ?? 0;
      const value2 = frame2[blendshapeName] ?? 0;

      // Linear interpolation between frames
      const interpolatedValue = value1 + (value2 - value1) * t;

      // Ease mouth shapes when speaking toggles
      const isMouth =
        blendshapeName.startsWith('jaw') ||
        blendshapeName.startsWith('mouth') ||
        blendshapeName.startsWith('lip');
      const baseValue = interpolatedValue * (isMouth ? this.speakingFactor : 1);

      // --- Primary path: BLENDSHAPE_MAPPING or exact match ---
      const targetIndices = this.findMorphTargetIndices(blendshapeName);

      if (targetIndices.length > 0) {
        for (const index of targetIndices) {
          if (index >= 0 && index < this.mesh.morphTargetInfluences.length) {
            const prev = this.mesh.morphTargetInfluences[index] ?? 0;
            const smoothed = THREE.MathUtils.lerp(prev, baseValue, this.smoothingFactor);
            this.mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(smoothed, 0, 1);
          }
        }
      }
      // --- Fallback: VISEME_FROM_ARKIT with per-target scaling ---
      else if (blendshapeName in VISEME_FROM_ARKIT) {
        for (const { target, scale } of VISEME_FROM_ARKIT[blendshapeName]) {
          if (target in this.morphTargetDictionary) {
            const index = this.morphTargetDictionary[target];
            if (index >= 0 && index < this.mesh.morphTargetInfluences.length) {
              const scaledValue = baseValue * scale;
              const prev = this.mesh.morphTargetInfluences[index] ?? 0;
              // Use max() so multiple ARKit sources can contribute to same viseme
              const combined = Math.max(prev, scaledValue);
              const smoothed = THREE.MathUtils.lerp(
                this.mesh.morphTargetInfluences[index],
                combined,
                this.smoothingFactor
              );
              this.mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(smoothed, 0, 1);
            }
          }
        }
      }

      this.lastBlendshapeValues[blendshapeName] = baseValue;
    }

    // Mirror all influences to additional meshes (EyeLeft/EyeRight handled too)
    this.mirrorToAdditionalMeshes();
  }

  /** Copy primary mesh morph influences to all additional meshes */
  private mirrorToAdditionalMeshes(): void {
    if (!this.mesh.morphTargetInfluences || this.additionalMeshes.length === 0) return;
    const src = this.mesh.morphTargetInfluences;
    for (const m of this.additionalMeshes) {
      if (m.morphTargetInfluences && m.morphTargetInfluences.length === src.length) {
        for (let i = 0; i < src.length; i++) {
          m.morphTargetInfluences[i] = src[i];
        }
      }
    }
  }

  /**
   * Smoothly ramp mouth activity
   */
  private updateSpeakingFactor(deltaSeconds: number): void {
    this.speakingFactor = THREE.MathUtils.lerp(
      this.speakingFactor,
      this.speakingTarget,
      THREE.MathUtils.clamp(deltaSeconds * this.speakingSpeed, 0, 1)
    );
  }

  /**
   * Fade back to neutral when speech stops
   */
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

  /**
   * Find morph target indices for a blendshape name.
   * Uses BLENDSHAPE_MAPPING first, then exact-match fallback.
   * VISEME_FROM_ARKIT fallback is handled separately in applyBlendshapes
   * so that per-target scale factors can be applied.
   */
  private findMorphTargetIndices(blendshapeName: string): number[] {
    const possibleNames = BLENDSHAPE_MAPPING[blendshapeName] || [blendshapeName];
    const indices: number[] = [];

    for (const name of possibleNames) {
      if (name in this.morphTargetDictionary) {
        indices.push(this.morphTargetDictionary[name]);
      }
    }

    // Fallback: try exact match if no mapped names found
    if (indices.length === 0 && blendshapeName in this.morphTargetDictionary) {
      indices.push(this.morphTargetDictionary[blendshapeName]);
    }

    return indices;
  }

  /**
   * Reset all blendshapes to neutral
   */
  private resetBlendshapes(): void {
    if (!this.mesh.morphTargetInfluences) return;

    for (let i = 0; i < this.mesh.morphTargetInfluences.length; i++) {
      this.mesh.morphTargetInfluences[i] = 0;
    }

    this.lastBlendshapeValues = {};
  }

  /**
   * Get animation duration in seconds
   */
  getDuration(): number {
    if (this.blendshapeData.length === 0) return 0;
    const lastFrame = this.blendshapeData[this.blendshapeData.length - 1];
    return lastFrame.timestamp / 1000;
  }

  /**
   * Get current playback time in seconds
   */
  getCurrentTime(): number {
    if (!this.isPlaying) return 0;
    return (Date.now() - this.startTime + this.audioStartTime) / 1000;
  }

  /**
   * Check if animation is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Debug: Log available blendshapes
   */
  debugLogBlendshapes(): void {
    console.log('📋 Available Morph Targets:');
    for (const [name, index] of Object.entries(this.morphTargetDictionary)) {
      console.log(`   [${index}] ${name}`);
    }
  }
}

export default LipSyncAnimator;
