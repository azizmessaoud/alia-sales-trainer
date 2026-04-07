/**
 * ALIA 2.0 - Multimodal Processor (Client-side)
 * Processes video, audio, and pose data in real-time
 * Uses MediaPipe for pose/face detection + Web Audio API for voice analysis
 */

import { PoseDetector, createDetector, SupportedModels } from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';

// =====================================================
// Types
// =====================================================

export interface MultimodalMetrics {
  timestamp: number;

  // Body Language
  gesture_state: 'open' | 'closed' | 'defensive' | 'engaged' | 'neutral';
  posture_score: number; // 0-100
  shoulder_width_normalized: number;
  lean_angle: number;

  // Facial
  eye_contact_percent: number;
  eye_gaze_direction: 'screen' | 'down' | 'left' | 'right' | 'up' | 'camera';
  blink_rate: number;
  emotion: 'confident' | 'uncertain' | 'stressed' | 'engaged' | 'defensive' | 'neutral';
  micro_expressions: string[];

  // Voice
  speaking_pace: number; // words per minute
  voice_stress_level: number; // 0-1
  filler_word_count: number;
  volume_level: number;
  pitch_variance: number;

  // Overall
  confidence_index: number; // 0-100
  engagement_score: number; // 0-100
}

export interface PoseKeypoints {
  shoulders: { left: { x: number; y: number }, right: { x: number; y: number } };
  elbows: { left: { x: number; y: number }, right: { x: number; y: number } };
  nose: { x: number; y: number };
}

// =====================================================
// Multimodal Processor Class
// =====================================================

export class MultimodalProcessor {
  private poseDetector: PoseDetector | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;

  private metrics: Partial<MultimodalMetrics> = {};
  private lastUpdateTime = 0;
  private frameCount = 0;
  private blinkCount = 0;
  private lastBlinkTime = 0;
  private transcriptBuffer: string[] = [];

  // Configuration
  private readonly UPDATE_INTERVAL_MS = 1000; // Send metrics every 1 second
  private readonly BLINK_COOLDOWN_MS = 200;

  // =====================================================
  // Initialization
  // =====================================================

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    try {
      // 1. Setup video stream (WebRTC)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: true,
      });

      videoElement.srcObject = this.mediaStream;
      await videoElement.play();

      // 2. Initialize MediaPipe Pose Detector
      this.poseDetector = await createDetector(SupportedModels.MoveNet, {
        modelType: 'SinglePose.Lightning', // Fast, real-time model
      });

      // 3. Initialize Web Audio API for voice analysis
      this.audioContext = new AudioContext();
      const audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      audioSource.connect(this.analyser);

      console.log('✅ Multimodal processor initialized');
    } catch (error) {
      console.error('❌ Failed to initialize multimodal processor:', error);
      throw error;
    }
  }

  // =====================================================
  // Processing Loop
  // =====================================================

  async processFrame(videoElement: HTMLVideoElement): Promise<MultimodalMetrics | null> {
    const now = Date.now();

    // Throttle updates to UPDATE_INTERVAL_MS
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL_MS) {
      return null;
    }

    this.frameCount++;
    this.lastUpdateTime = now;

    try {
      // 1. Detect pose
      const poses = await this.poseDetector!.estimatePoses(videoElement);
      const pose = poses[0]; // Single person

      if (!pose) {
        return null;
      }

      // 2. Extract body language metrics
      const bodyMetrics = this.analyzeBodyLanguage(pose);

      // 3. Extract facial metrics (simplified - MediaPipe Face Mesh would be better)
      const faceMetrics = this.analyzeFacialCues(pose);

      // 4. Extract voice metrics
      const voiceMetrics = this.analyzeVoiceMetrics();

      // 5. Calculate composite scores
      const compositeScores = this.calculateCompositeScores(bodyMetrics, faceMetrics, voiceMetrics);

      // 6. Combine all metrics
      const metrics: MultimodalMetrics = {
        timestamp: now,
        ...bodyMetrics,
        ...faceMetrics,
        ...voiceMetrics,
        ...compositeScores,
      };

      this.metrics = metrics;
      return metrics;
    } catch (error) {
      console.error('Error processing frame:', error);
      return null;
    }
  }

  // =====================================================
  // Body Language Analysis
  // =====================================================

  private analyzeBodyLanguage(pose: any) {
    const keypoints = pose.keypoints;

    // Extract relevant keypoints
    const leftShoulder = keypoints.find((kp: any) => kp.name === 'left_shoulder');
    const rightShoulder = keypoints.find((kp: any) => kp.name === 'right_shoulder');
    const leftElbow = keypoints.find((kp: any) => kp.name === 'left_elbow');
    const rightElbow = keypoints.find((kp: any) => kp.name === 'right_elbow');
    const nose = keypoints.find((kp: any) => kp.name === 'nose');

    // Calculate shoulder width (normalized)
    const shoulderDistance = Math.sqrt(
      Math.pow(rightShoulder.x - leftShoulder.x, 2) +
      Math.pow(rightShoulder.y - leftShoulder.y, 2)
    );
    const shoulder_width_normalized = Math.min(shoulderDistance / 200, 1); // Normalize to 0-1

    // Calculate posture score (how upright)
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const posture_score = Math.max(0, Math.min(100, (1 - avgShoulderY / 480) * 100));

    // Calculate lean angle (forward engagement)
    const lean_angle = nose.y < avgShoulderY ? Math.abs(nose.y - avgShoulderY) : 0;

    // Classify gesture
    const gesture_state = this.classifyGesture(shoulder_width_normalized, leftElbow, rightElbow);

    return {
      gesture_state,
      posture_score,
      shoulder_width_normalized,
      lean_angle,
    };
  }

  private classifyGesture(
    shoulderWidth: number,
    leftElbow: any,
    rightElbow: any
  ): 'open' | 'closed' | 'defensive' | 'engaged' | 'neutral' {
    // Open: Wide shoulders, arms out
    if (shoulderWidth > 0.7) {
      return 'open';
    }
    // Closed: Narrow shoulders, arms in
    if (shoulderWidth < 0.4) {
      return 'closed';
    }
    // Defensive: Arms crossed (elbows in front)
    if (leftElbow.y < 240 && rightElbow.y < 240) {
      return 'defensive';
    }
    // Engaged: Moderate shoulder width, active
    if (shoulderWidth > 0.5) {
      return 'engaged';
    }
    return 'neutral';
  }

  // =====================================================
  // Facial Analysis (Simplified)
  // =====================================================

  private analyzeFacialCues(pose: any) {
    const keypoints = pose.keypoints;
    const nose = keypoints.find((kp: any) => kp.name === 'nose');
    const leftEye = keypoints.find((kp: any) => kp.name === 'left_eye');
    const rightEye = keypoints.find((kp: any) => kp.name === 'right_eye');

    // Estimate eye contact (nose centered = looking at camera)
    const noseCenteredness = 1 - Math.abs(nose.x - 320) / 320; // Normalized
    const eye_contact_percent = Math.max(0, Math.min(100, noseCenteredness * 100));

    // Estimate gaze direction
    let eye_gaze_direction: 'screen' | 'down' | 'left' | 'right' | 'up' | 'camera' = 'camera';
    if (nose.x < 200) eye_gaze_direction = 'left';
    else if (nose.x > 440) eye_gaze_direction = 'right';
    else if (nose.y > 300) eye_gaze_direction = 'down';
    else if (nose.y < 180) eye_gaze_direction = 'up';

    // Detect blinks (simplified - eye distance change)
    const eyeDistance = Math.abs(leftEye.y - rightEye.y);
    const now = Date.now();
    if (eyeDistance < 5 && now - this.lastBlinkTime > this.BLINK_COOLDOWN_MS) {
      this.blinkCount++;
      this.lastBlinkTime = now;
    }
    const blink_rate = (this.blinkCount / (this.frameCount / 30)) * 60; // Blinks per minute

    // Emotion estimation (simplified - would use dedicated model)
    const emotion = this.estimateEmotion(eye_contact_percent, eyeDistance);

    return {
      eye_contact_percent,
      eye_gaze_direction,
      blink_rate,
      emotion,
      micro_expressions: [], // Would require face mesh
    };
  }

  private estimateEmotion(eyeContact: number, eyeDistance: number):
    'confident' | 'uncertain' | 'stressed' | 'engaged' | 'defensive' | 'neutral' {
    if (eyeContact > 70 && eyeDistance > 10) return 'confident';
    if (eyeContact < 40) return 'uncertain';
    if (this.blinkCount > 30) return 'stressed';
    if (eyeContact > 60) return 'engaged';
    return 'neutral';
  }

  // =====================================================
  // Voice Analysis
  // =====================================================

  private analyzeVoiceMetrics() {
    if (!this.analyser) {
      return {
        speaking_pace: 120,
        voice_stress_level: 0,
        filler_word_count: 0,
        volume_level: 50,
        pitch_variance: 0,
      };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate volume level (RMS)
    const sum = dataArray.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(sum / bufferLength);
    const volume_level = Math.min(100, (rms / 128) * 100);

    // Calculate pitch variance (frequency spread)
    const nonZero = dataArray.filter(val => val > 0);
    const mean = nonZero.reduce((acc, val) => acc + val, 0) / nonZero.length;
    const variance = nonZero.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / nonZero.length;
    const pitch_variance = Math.sqrt(variance) / 128;

    // Voice stress level (simplified - higher variance = more stress)
    const voice_stress_level = Math.min(1, pitch_variance);

    // Speaking pace (estimated from transcript - would need real STT)
    const speaking_pace = this.estimateSpeakingPace();

    // Filler words (from transcript buffer)
    const filler_word_count = this.countFillerWords();

    return {
      speaking_pace,
      voice_stress_level,
      filler_word_count,
      volume_level,
      pitch_variance,
    };
  }

  private estimateSpeakingPace(): number {
    // Simplified - would need real speech-to-text
    // Assume average speaking pace for now
    return 120 + Math.random() * 40; // 120-160 WPM
  }

  private countFillerWords(): number {
    const fillerWords = ['um', 'uh', 'like', 'you know', 'so', 'actually'];
    const text = this.transcriptBuffer.join(' ').toLowerCase();
    return fillerWords.reduce((count, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      return count + (text.match(regex)?.length || 0);
    }, 0);
  }

  // =====================================================
  // Composite Scores
  // =====================================================

  private calculateCompositeScores(body: any, face: any, voice: any) {
    // Confidence index (weighted combination)
    const confidence_index = Math.round(
      body.posture_score * 0.3 +
      face.eye_contact_percent * 0.3 +
      (100 - voice.voice_stress_level * 100) * 0.2 +
      voice.volume_level * 0.2
    );

    // Engagement score
    const engagement_score = Math.round(
      (body.gesture_state === 'engaged' ? 80 : 50) * 0.4 +
      face.eye_contact_percent * 0.4 +
      (voice.speaking_pace > 100 && voice.speaking_pace < 160 ? 80 : 50) * 0.2
    );

    return {
      confidence_index: Math.max(0, Math.min(100, confidence_index)),
      engagement_score: Math.max(0, Math.min(100, engagement_score)),
    };
  }

  // =====================================================
  // Transcript Management
  // =====================================================

  addTranscript(text: string) {
    this.transcriptBuffer.push(text);
    // Keep only last 1 minute of transcript
    if (this.transcriptBuffer.length > 60) {
      this.transcriptBuffer.shift();
    }
  }

  // =====================================================
  // Cleanup
  // =====================================================

  async cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      await this.audioContext.close();
    }
    if (this.poseDetector) {
      this.poseDetector.dispose();
    }
  }

  // =====================================================
  // Getters
  // =====================================================

  getCurrentMetrics(): Partial<MultimodalMetrics> {
    return this.metrics;
  }

  isInitialized(): boolean {
    return this.poseDetector !== null && this.audioContext !== null;
  }
}

// =====================================================
// Singleton Instance
// =====================================================

let processorInstance: MultimodalProcessor | null = null;

export function getMultimodalProcessor(): MultimodalProcessor {
  if (!processorInstance) {
    processorInstance = new MultimodalProcessor();
  }
  return processorInstance;
}
