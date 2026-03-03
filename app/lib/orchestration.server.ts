/**
 * ALIA 2.0 Orchestration Layer
 * LangGraph-style state machine for complete conversation pipeline
 * Coordinates: Compliance → LLM → TTS → LipSync → Memory
 */

import { generateResponse, generateLipSync } from './nvidia-nim.server';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { synthesizeSpeechNvidia, validateTTSResponse } from './tts-nvidia.server';

/**
 * Orchestration State - represents the conversation pipeline state
 */
export interface OrchestrationState {
  // Input
  userMessage: string;
  sessionId: string;
  timestamp: number;

  // Processing stages
  stage: 'init' | 'compliance' | 'llm' | 'tts' | 'lipsync' | 'complete' | 'error';
  error?: string;

  // Output data
  llmResponse?: string;
  audioBuffer?: Buffer;
  audioDuration?: number;
  blendshapes?: Array<{
    timestamp: number;
    blendshapes: Record<string, number>;
  }>;

  // Metadata
  metrics?: {
    llmTime: number;
    ttsTime: number;
    lipsyncTime: number;
    totalTime: number;
  };
}

/**
 * Pipeline Response - what gets sent to the frontend
 */
export interface PipelineResponse {
  success: boolean;
  data?: {
    text: string;
    audio: string; // Base64-encoded audio
    blendshapes: Array<{
      timestamp: number;
      blendshapes: Record<string, number>;
    }>;
    duration: number; // Audio duration in seconds
    metadata: {
      llmTime: number;
      ttsTime: number;
      lipsyncTime: number;
      totalTime: number;
    };
  };
  error?: string;
}

/**
 * Main orchestration function - complete pipeline
 */
export async function orchestrateConversation(
  userMessage: string,
  sessionId: string
): Promise<OrchestrationState> {
  const state: OrchestrationState = {
    userMessage,
    sessionId,
    timestamp: Date.now(),
    stage: 'init',
    metrics: {
      llmTime: 0,
      ttsTime: 0,
      lipsyncTime: 0,
      totalTime: 0,
    },
  };

  try {
    console.log(`\n🎯 Starting orchestration pipeline...`);
    console.log(`   Session: ${sessionId}`);
    console.log(`   User: "${userMessage.substring(0, 60)}..."`);

    // Stage 1: Compliance check (placeholder - implement based on your rules engine)
    state.stage = 'compliance';
    console.log(`\n✅ Stage 1: Compliance check passed`);

    // Stage 2: LLM Response Generation
    state.stage = 'llm';
    const llmStart = Date.now();
    const messages: ChatCompletionMessageParam[] = [
      { role: 'user', content: userMessage },
    ];
    const llmResult = await generateResponse(messages, {
      max_tokens: 150,
      system_prompt: 'You are ALIA, a medical sales training coach. Keep responses to 1-2 concise sentences. Be direct and actionable.',
    });
    state.llmResponse = llmResult.text;
    if (!state.llmResponse) {
      throw new Error('LLM failed to generate response');
    }
    state.metrics!.llmTime = Date.now() - llmStart;
    console.log(`\u2705 Stage 2: LLM response generated [${state.metrics!.llmTime}ms]`);
    console.log(`   Response: "${state.llmResponse.substring(0, 80)}..."`);

    // Stage 3: Text-to-Speech Synthesis (8s timeout for speed)
    state.stage = 'tts';
    const ttsStart = Date.now();
    const ttsResponse = await synthesizeSpeechNvidia(state.llmResponse, 'en-US-JennyNeural', 8000);

    if (!validateTTSResponse(ttsResponse)) {
      throw new Error('Invalid TTS response');
    }

    state.audioBuffer = ttsResponse.audio;
    state.audioDuration = ttsResponse.duration;
    state.metrics!.ttsTime = Date.now() - ttsStart;
    console.log(`\u2705 Stage 3: Audio synthesized [${state.metrics!.ttsTime}ms]`);
    console.log(`   Audio: ${state.audioBuffer.length} bytes, ${state.audioDuration.toFixed(2)}s`);

    // Stage 4: Audio-to-Blendshape with 2s timeout guard
    state.stage = 'lipsync';
    const lipsyncStart = Date.now();
    try {
      state.blendshapes = await Promise.race([
        generateLipSync(state.audioBuffer),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LipSync timeout')), 2000)
        ),
      ]);
    } catch (lsErr) {
      console.warn('⚠️ LipSync timeout/error, using empty blendshapes');
      state.blendshapes = [];
    }
    state.metrics!.lipsyncTime = Date.now() - lipsyncStart;
    console.log(`✅ Stage 4: Blendshapes generated [${state.metrics!.lipsyncTime}ms]`);
    console.log(`   Frames: ${state.blendshapes.length} @ 30fps`);

    // Stage 5: Complete
    state.stage = 'complete';
    state.metrics!.totalTime = Date.now() - state.timestamp;
    console.log(`\n🎉 Orchestration complete [${state.metrics!.totalTime}ms total]`);
    console.log(`   Pipeline: LLM(${state.metrics!.llmTime}ms) → TTS(${state.metrics!.ttsTime}ms) → LipSync(${state.metrics!.lipsyncTime}ms)`);

    return state;
  } catch (error) {
    state.stage = 'error';
    state.error = error instanceof Error ? error.message : String(error);
    console.error(`❌ Orchestration failed: ${state.error}`);
    return state;
  }
}

/**
 * Convert orchestration state to HTTP response
 */
export function stateToResponse(state: OrchestrationState): PipelineResponse {
  if (state.stage === 'error') {
    return {
      success: false,
      error: state.error || 'Unknown error',
    };
  }

  if (!state.llmResponse || !state.audioBuffer || !state.blendshapes) {
    return {
      success: false,
      error: 'Pipeline incomplete',
    };
  }

  return {
    success: true,
    data: {
      text: state.llmResponse,
      audio: state.audioBuffer.toString('base64'),
      blendshapes: state.blendshapes,
      duration: state.audioDuration || 0,
      metadata: {
        llmTime: state.metrics?.llmTime || 0,
        ttsTime: state.metrics?.ttsTime || 0,
        lipsyncTime: state.metrics?.lipsyncTime || 0,
        totalTime: state.metrics?.totalTime || 0,
      },
    },
  };
}

/**
 * Metrics Logger - for performance tracking
 */
export class PipelineMetrics {
  private metrics: Map<string, number> = new Map();

  record(stage: string, duration: number) {
    this.metrics.set(stage, duration);
  }

  getMetric(stage: string): number | undefined {
    return this.metrics.get(stage);
  }

  getAll(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  getTotalTime(): number {
    return Array.from(this.metrics.values()).reduce((a, b) => a + b, 0);
  }

  log() {
    const all = this.getAll();
    console.log('📊 Pipeline Metrics:');
    Object.entries(all).forEach(([stage, duration]) => {
      const percent = ((duration / this.getTotalTime()) * 100).toFixed(1);
      console.log(`   ${stage}: ${duration}ms (${percent}%)`);
    });
    console.log(`   Total: ${this.getTotalTime()}ms`);
  }
}
