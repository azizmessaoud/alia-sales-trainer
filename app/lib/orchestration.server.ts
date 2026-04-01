/**
 * ALIA 2.0 Orchestration Layer (Refactored to LangGraph)
 * Multi-agent state machine for complete conversation pipeline
 * Coordinates: Compliance → Memory Retrieval → LLM → TTS → LipSync
 */
import 'dotenv/config';
import * as LangGraph from '@langchain/langgraph';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';

// Feature flags for Phase 3 optimization
const useStreaming  = process.env.USE_ELEVENLABS_STREAMING === 'true';
const useLipsync    = process.env.USE_ELEVENLABS_LIPSYNC   === 'true';

const tracer = process.env.LANGSMITH_API_KEY
  ? new LangChainTracer({
      projectName: process.env.LANGSMITH_PROJECT ?? 'alia-medical-training',
    })
  : null;

// LangGraph runtime-safe bindings. Some installed versions export
// `Annotation` while others do not export typings — provide a
// runtime fallback (shim) to keep runtime behavior stable.
const RealStateGraph = (LangGraph as any).StateGraph;
const END: any = (LangGraph as any).END ?? Symbol('END');

// If the library provides a real Annotation API, we'll use the library's
// StateGraph. If not (Annotation missing), create a lightweight local
// StateGraph implementation that runs nodes sequentially. This avoids
// passing undefined annotation values into the upstream implementation.
let StateGraph: any;
const LangGraphAnnotation = (LangGraph as any).Annotation;
if (RealStateGraph && LangGraphAnnotation) {
  StateGraph = RealStateGraph;
} else {
  class LocalStateGraph {
    private nodes = new Map<string, Function>();
    private edges: Array<[string, string]> = [];
    private entry: string | null = null;
    constructor(_schema?: any) {}
    addNode(name: string, fn: Function) { this.nodes.set(name, fn); return this; }
    addEdge(a: string, b: string) { this.edges.push([a, b]); return this; }
    setEntryPoint(name: string) { this.entry = name; return this; }
    compile() {
      const nodes = this.nodes;
      const order = ['compliance','memory','llm','tts','lipsync'];
      return {
        invoke: async (initialState: any) => {
          let state = { ...initialState };
          for (const name of order) {
            const node = nodes.get(name);
            if (!node) continue;
            const res = await node(state) || {};
            state = { ...state, ...res };
            if (state.stage === 'error') break;
          }
          return state;
        }
      };
    }
  }
  StateGraph = LocalStateGraph;
}

// Annotation shim: give it a proper generic callable type so TypeScript
// allows `Annotation<string>()` usages. Use the library export when
// available, otherwise fall back to a minimal shim with `Root` passthrough.
type AnnotationType = { <T = any>(_?: any): any; Root(obj: Record<string, any>): any };
// Re-evaluate Annotation after choosing StateGraph implementation
const LangAnnotationExport = (LangGraph as any).Annotation as AnnotationType | undefined;
const AnnotationShim: AnnotationType = ((<T>(_?: any) => undefined) as unknown) as AnnotationType;
AnnotationShim.Root = (obj: Record<string, any>) => obj;
const Annotation: AnnotationType = LangAnnotationExport ?? AnnotationShim;
import { NvidiaNIM } from './nvidia-nim.server.js';
import { evaluateCompliance, buildComplianceInterruptionText } from './compliance-gate.server.js';
import { MemoryOS, type RepProfile } from './memory-os.server.js';
import { RAGPipeline } from './rag-pipeline.server.js';
import { runTTS } from './tts.server.js';
import { alignmentToVisemes, generateMockBlendshapes, runLipSync } from './lipsync.server.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Runtime fallback for streaming/timestamps (not available in Phase 1a)
let runTTSStreaming: Function = async () => { throw new Error('runTTSStreaming not implemented'); };
let runTTSWithTimestamps: Function = async () => { throw new Error('runTTSWithTimestamps not implemented'); };
try {
  const ttsModule = await import('./tts.server.js');
  if (ttsModule.runTTSStreaming) runTTSStreaming = ttsModule.runTTSStreaming;
  if (ttsModule.runTTSWithTimestamps) runTTSWithTimestamps = ttsModule.runTTSWithTimestamps;
} catch (_) {
  console.warn('⚠️ Streaming/timestamps TTS functions not available yet (Phase 1b)');
}

// =====================================================
// Types & State Definition
// =====================================================

/**
 * Update Event for progressive streaming
 */
export interface PipelineUpdate {
  type: 'stage' | 'llm_text' | 'tts_audio' | 'lipsync_blendshapes' | 'compliance_violation' | 'error';
  payload: any;
}

/**
 * Orchestration State - shared across all graph nodes
 */
export interface OrchestrationState {
  // Input
  userMessage: string;
  repId: string;
  sessionId: string;
  timestamp: number;
  session?: { language?: string; [key: string]: any };
  language?: string;

  // intermediate processing
  isCompliant: boolean;
  complianceReason?: string;
  memories?: any[];
  memoryContext?: string;
  repProfile?: RepProfile | null;
  
  // Output data
  llmResponse?: string;
  audioBase64?: string;
  audioDuration?: number;
  isMock?: boolean;
  blendshapes?: Array<{
    timestamp: number;
    blendshapes: Record<string, number>;
  }>;

  // Control & Metrics
  stage: 'compliance' | 'memory' | 'llm' | 'tts' | 'lipsync' | 'complete' | 'error';
  error?: string;
  metrics: {
    complianceTime: number;
    memoryTime: number;
    llmTime: number;
    ttsTime: number;
    lipsyncTime: number;
    totalTime: number;
  };

  // Callback for real-time updates (optional)
  onUpdate?: (event: PipelineUpdate) => void;
}

// =====================================================
// State Definition (using modern Annotation API)
// =====================================================

const StateAnnotation = Annotation.Root({
  userMessage: Annotation<string>(),
  repId: Annotation<string>(),
  sessionId: Annotation<string>(),
  timestamp: Annotation<number>(),
  session: Annotation<any | undefined>(),
  language: Annotation<string | undefined>(),
  isCompliant: Annotation<boolean>(),
  complianceReason: Annotation<string | undefined>(),
  memories: Annotation<any[] | undefined>(),
  memoryContext: Annotation<string | undefined>(),
  repProfile: Annotation<RepProfile | null | undefined>(),
  llmResponse: Annotation<string | undefined>(),
  audioBase64: Annotation<string | undefined>(),
  audioDuration: Annotation<number | undefined>(),
  isMock: Annotation<boolean | undefined>(),
  blendshapes: Annotation<any[] | undefined>(),
  stage: Annotation<'compliance' | 'memory' | 'llm' | 'tts' | 'lipsync' | 'complete' | 'error'>(),
  error: Annotation<string | undefined>(),
  metrics: Annotation<{
    complianceTime: number;
    memoryTime: number;
    llmTime: number;
    ttsTime: number;
    lipsyncTime: number;
    totalTime: number;
  }>({
    reducer: (x: any, y: any) => ({ ...x, ...y }),
    default: () => ({
      complianceTime: 0,
      memoryTime: 0,
      llmTime: 0,
      ttsTime: 0,
      lipsyncTime: 0,
      totalTime: 0,
    }),
  }),
  onUpdate: Annotation<((event: PipelineUpdate) => void) | undefined>(),
});

// =====================================================
// Graph Nodes (Agents)
// =====================================================

/**
 * NODE 1: Compliance Checker
 */
const complianceNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const start = Date.now();
  const timerLabel = `[ALIA] ${state.sessionId} compliance`;
  console.time(timerLabel);
  try {
    if (state.onUpdate) state.onUpdate({ type: 'stage', payload: { stage: 'compliance' } });
    const result = await evaluateCompliance(state.userMessage);
    
    if (!result.is_compliant && state.onUpdate) {
      state.onUpdate({ 
        type: 'compliance_violation', 
        payload: { 
          message: buildComplianceInterruptionText(result.reason ?? ''),
          compliance: result
        } 
      });
    }

    return {
      isCompliant: result.is_compliant,
      complianceReason: result.reason,
      metrics: { ...state.metrics, complianceTime: Date.now() - start },
    };
  } catch (error) {
    return {
      error: `Compliance failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'error',
    };
  } finally {
    console.timeEnd(timerLabel);
  }
};

/**
 * NODE 2: Memory Retriever (RAG)
 */
const retrievalNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const start = Date.now();
  const timerLabel = `[ALIA] ${state.sessionId} retrieval`;
  console.time(timerLabel);
  try {
    if (state.onUpdate) state.onUpdate({ type: 'stage', payload: { stage: 'memory' } });
    // Skip if non-compliant
    if (!state.isCompliant) return {};

    // Retrieve memories and profile in parallel
    const [memories, profile] = await Promise.all([
      MemoryOS.retrieveEpisodeMemories({
        rep_id: state.repId,
        query: state.userMessage,
        limit: 3,
      }),
      MemoryOS.getRepProfile(state.repId)
    ]);

    // Derive memoryContext as a string summary from memories
    const memoryContext = memories
      ?.map((m: any) => m.memory_text || m.text || m.content || '')
      .filter((t: string) => t.length > 0)
      .join(' ')
      || '';

    const memoryDuration = Date.now() - start;
    console.log(JSON.stringify({
      kind: 'rag_timing',
      sessionId: state.sessionId,
      repId: state.repId,
      language: state.language ?? 'en-US',
      memoryCount: memories?.length ?? 0,
      durationMs: memoryDuration,
      timestamp: Date.now(),
    }));

    return {
      memories,
      memoryContext,
      repProfile: profile,
      metrics: { ...state.metrics, memoryTime: memoryDuration },
    };
  } catch (error) {
    console.warn('⚠️ Memory retrieval failed, continuing without context:', error);
    return {};
  } finally {
    console.timeEnd(timerLabel);
  }
};

/**
 * NODE 3: Strategic LLM (The "Brain")
 */
const llmNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const start = Date.now();
  const timerLabel = `[ALIA] ${state.sessionId} llm`;
  console.time(timerLabel);
  try {
    if (state.onUpdate) state.onUpdate({ type: 'stage', payload: { stage: 'llm' } });
    let responseText: string;

    if (!state.isCompliant) {
      responseText = buildComplianceInterruptionText(state.complianceReason || '');
    } else {
      // Use RAG Pipeline to build a rich augmented prompt
      // @ts-ignore - buildAugmentedPrompt expects MemorySearchResult but types might differ slightly
      const systemPrompt = RAGPipeline.buildAugmentedPrompt(
        state.userMessage,
        state.memories || [],
        state.repProfile || null
      );

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: state.userMessage },
      ];

      const result = await NvidiaNIM.generateResponse(messages, {
        system_prompt: systemPrompt,
        max_tokens: 150,
      });
      responseText = result.text;
    }

    const duration = Date.now() - start;
    if (state.onUpdate) state.onUpdate({ type: 'llm_text', payload: { text: responseText, llmTime: duration } });

    return {
      llmResponse: responseText,
      metrics: { ...state.metrics, llmTime: duration },
    };
  } catch (error) {
    return {
      error: `LLM failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'error',
    };
  } finally {
    console.timeEnd(timerLabel);
  }
};


/**
 * NODE 4: TTS Synthesis (with optional parallel streaming)
 */
const ttsNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const start = Date.now();
  const timerLabel = `[ALIA] ${state.sessionId} tts`;
  console.time(timerLabel);
  try {
    if (state.onUpdate) state.onUpdate({ type: 'stage', payload: { stage: 'tts' } });
    if (!state.llmResponse) throw new Error('No LLM response for TTS');

    const session = state.session;

    // Phase 3: Promise.allSettled parallel path (if both flags enabled)
    if (useStreaming && useLipsync) {
      const [streamRes, tsRes] = await Promise.allSettled([
        runTTSStreaming(state.llmResponse, session as any),
        runTTSWithTimestamps(state.llmResponse, session as any),
      ]);

      // audioBase64 from tsRes (full audio) or fallback runTTS
      let audioBase64: string;
      let isMock = false;
      let blendshapes: any[] = [];

      if (tsRes.status === 'fulfilled' && tsRes.value?.audioBase64) {
        audioBase64 = tsRes.value.audioBase64;
        // blendshapes from alignment or mock fallback
        if (tsRes.value.alignment) {
          blendshapes = alignmentToVisemes(tsRes.value.alignment);
        } else {
          blendshapes = generateMockBlendshapes(audioBase64);
          isMock = true;
        }
      } else {
        // Fallback to sequential runTTS
        const fallbackResult = await runTTS(state.llmResponse, session as any);
        audioBase64 = fallbackResult.audioBase64;
        isMock = fallbackResult.isMock;
        blendshapes = generateMockBlendshapes(audioBase64);
      }

      const duration = Date.now() - start;
      if (state.onUpdate) {
        state.onUpdate({
          type: 'tts_audio',
          payload: { audio: audioBase64, duration, ttsTime: duration, isMock },
        });
      }

      return {
        audioBase64,
        blendshapes,
        isMock,
        metrics: { ...state.metrics, ttsTime: duration },
      };
    } else {
      // Compatibility path — existing tests pass through here
      const ttsResult = await runTTS(state.llmResponse, session as any);
      const { frames } = await runLipSync(ttsResult.audioBase64, state.language ?? 'en-US');

      const duration = Date.now() - start;
      if (state.onUpdate) {
        state.onUpdate({
          type: 'tts_audio',
          payload: { audio: ttsResult.audioBase64, duration, ttsTime: duration, isMock: ttsResult.isMock },
        });
      }

      return {
        audioBase64: ttsResult.audioBase64,
        audioDuration: ttsResult.duration,
        blendshapes: frames,
        isMock: ttsResult.isMock,
        metrics: { ...state.metrics, ttsTime: duration },
      };
    }
  } catch (error) {
    return {
      error: `TTS failed: ${error instanceof Error ? error.message : String(error)}`,
      stage: 'error',
    };
  } finally {
    console.timeEnd(timerLabel);
  }
};

/**
 * NODE 5: LipSync Generation (merged into ttsNode for Phase 3)
 */
const lipsyncNode = async (state: OrchestrationState): Promise<Partial<OrchestrationState>> => {
  const timerLabel = `[ALIA] ${state.sessionId} lipsync`;
  console.time(timerLabel);
  // In Phase 3, lipsync is handled within ttsNode via Promise.allSettled.
  // This node is now a no-op compatibility placeholder.
  try {
    return {};
  } finally {
    console.timeEnd(timerLabel);
  }
};

// =====================================================
// Graph Construction
// =====================================================

// Create the graph using Annotation.Root and the modern StateGraph API
const workflow = (new (StateGraph as any)(StateAnnotation) as any)
  .addNode('compliance', complianceNode)
  .addNode('memory', retrievalNode)
  .addNode('llm', llmNode)
  .addNode('tts', ttsNode)
  .addNode('lipsync', lipsyncNode)
  .addEdge('compliance', 'memory')
  .addEdge('memory', 'llm')
  .addEdge('llm', 'tts')
  .addEdge('tts', 'lipsync')
  .addEdge('lipsync', END);

// Compile the graph
const graph = (workflow as any).compile();

// =====================================================
// Public Interface
// =====================================================

/**
 * Main orchestration entry point
 */
export async function orchestrateConversation(
  userMessage: string,
  repId: string = 'demo-rep',
  sessionId: string = 'default',
  session?: { language?: string; [key: string]: any },
  onUpdate?: (event: PipelineUpdate) => void
): Promise<OrchestrationState> {
  const initialState: OrchestrationState = {
    userMessage,
    repId,
    sessionId,
    session,
    language: session?.language ?? 'en-US',
    onUpdate,
    timestamp: Date.now(),
    isCompliant: true,
    stage: 'compliance',
    metrics: {
      complianceTime: 0,
      memoryTime: 0,
      llmTime: 0,
      ttsTime: 0,
      lipsyncTime: 0,
      totalTime: 0,
    },
  };

  try {
    const result = await graph.invoke(initialState, {
      callbacks: tracer ? [tracer] : [],
      configurable: {
        thread_id: sessionId,
        run_name: `alia-pipeline-${repId}`,
      },
      metadata: {
        repId,
        sessionId,
        language: session?.language ?? 'en-US',
        useStreaming,
        useLipsync,
      },
    });
    result.metrics.totalTime = Date.now() - result.timestamp;
    result.stage = 'complete';
    
    // Send final completion message if callback exists
    if (onUpdate) {
      onUpdate({
        type: 'stage',
        payload: { 
          stage: 'complete',
          totalTime: result.metrics.totalTime,
          breakdown: result.metrics
        }
      });
    }

    return result;
  } catch (error) {
    console.error('❌ LangGraph Orchestration Error:', error);
    return {
      ...initialState,
      stage: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Response Formatter (matches existing API expectations)
 */
export function stateToResponse(state: OrchestrationState) {
  if (state.error) {
    return { success: false, error: state.error };
  }

  return {
    success: true,
    data: {
      text: state.llmResponse,
      audio: state.audioBase64,
      blendshapes: state.blendshapes,
      duration: state.audioDuration,
      metadata: state.metrics,
    },
  };
}
