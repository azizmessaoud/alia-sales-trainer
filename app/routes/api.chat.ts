/**
 * @file api.chat.ts
 * @route POST /api/chat
 * @module app/routes
 *
 * Chat API Route — ALIA Sales Trainer
 * =====================================
 * HTTP entry point for a single conversation turn.
 *
 * PIPELINE (per request):
 *   1. Parse + validate ChatRequest (message, sessionId, repId, language)
 *   2. Normalize IDs: accept both camelCase and snake_case variants
 *   3. Call orchestrateConversation() → runs the full AI pipeline:
 *        LLM (Ollama / NVIDIA NIM)
 *        → Azure TTS synthesis
 *        → Audio2Face blendshape generation
 *        → ARKit frame array construction
 *   4. stateToResponse() converts the internal ALIAState to a flat HTTP response
 *   5. Return { success, data: { text, audio, blendshapes, duration, metadata } }
 *
 * FROZEN CONTRACT:
 *   Response shape defined here is consumed by the frontend WS handler and
 *   avatar animation pipeline. Do NOT change field names without updating
 *   AvatarWithLipSync.tsx and the WebSocket client in _index.tsx.
 *
 * RELATED FILES:
 *   modules/ai-core/orchestration.server.ts  — orchestrateConversation, stateToResponse
 *   server-websocket.js                      — real-time streaming equivalent (frozen)
 *   modules/tts-lipsync/lip-sync-animator.client.ts — consumes blendshapes on frontend
 *
 * @see docs/FROZEN_CONTRACTS.md
 * @see docs/ARCHITECTURE.md
 */

import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

/**
 * Import the two public functions from the AI-core orchestration layer.
 *
 * NOTE: Import path is ~/modules/ai-core/orchestration.server (not ~/ai-core).
 * The `~` alias resolves to the `app/` directory in this Remix project,
 * so the full resolution is: app/modules/ai-core/orchestration.server.ts
 *
 * If orchestration.server.ts moves to modules/ at repo root, update to:
 *   import { ... } from '../../modules/ai-core/orchestration.server';
 * or use the services facade:
 *   import { orchestrateConversation } from '../../services/llm.service';
 */
import {
  orchestrateConversation,
  stateToResponse,
} from '~/modules/ai-core/orchestration.server';

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * UUID v4 regex — used to validate repId before passing to Supabase.
 * Accepts lowercase hex groups: 8-4-4-4-12.
 * Rejects empty strings, "undefined", or arbitrary user-supplied values
 * that could cause pgvector lookup errors downstream.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Request / Response Types ──────────────────────────────────────────────────

/**
 * Shape of the JSON body expected in POST /api/chat.
 *
 * Both camelCase and snake_case variants of sessionId/repId are accepted
 * for backward compatibility with older frontend versions and the WebSocket
 * client, which may send either form.
 */
interface ChatRequest {
  /** The sales rep's message text. Required. Max 2000 chars recommended. */
  message: string;

  /** Session ID (camelCase variant). UUID v4 preferred; falls back to crypto.randomUUID(). */
  sessionId?: string;

  /** Session ID (snake_case variant). Takes precedence over sessionId if both present. */
  session_id?: string;

  /**
   * Sales rep identifier (camelCase). Must be a valid UUID v4 matching a row in
   * the `reps` table in Supabase. If invalid or missing, memory retrieval is skipped
   * and the avatar responds without personalization context.
   */
  repId?: string;

  /** Rep identifier (snake_case variant). Same semantics as repId. */
  rep_id?: string;

  /**
   * BCP-47 language tag for TTS synthesis and viseme mapping.
   * Supported: 'en-US', 'fr-FR', 'ar-SA', 'es-ES', 'de-DE'.
   * Defaults to 'en-US' if not provided.
   * Controls Azure TTS voice selection and viseme intensity multiplier.
   * @see modules/avatar-ui/config/viseme-languages.ts
   */
  language?: string;
}

/**
 * HTTP response shape returned by POST /api/chat.
 *
 * FROZEN: This shape is consumed by the frontend avatar animation pipeline.
 * Any field rename or removal is a breaking change.
 * @see docs/FROZEN_CONTRACTS.md
 */
interface ChatResponse {
  /** true if the full pipeline completed without error */
  success: boolean;

  /** Present on success */
  data?: {
    /** ALIA's text response (for chat UI display and subtitle rendering) */
    text: string;

    /**
     * Base64-encoded MP3 audio data from Azure TTS.
     * Frontend creates a Blob URL: URL.createObjectURL(new Blob([atob(audio)]))
     * and feeds it to the HTML <audio> element + LipSyncAnimator.setAudioElement().
     */
    audio: string;

    /**
     * Audio2Face ARKit blendshape frame array.
     * Each frame has a timestamp (ms) and a Record<string, number> of
     * ARKit channel names → morph target weight (0.0–1.0).
     *
     * Consumed by LipSyncAnimator.setBlendshapeData() or
     * LipSyncAnimator.appendBlendshapeFrames() for streaming playback.
     *
     * @example [{ timestamp: 0, blendshapes: { jawOpen: 0.42, viseme_aa: 0.55 } }]
     */
    blendshapes: Array<{
      timestamp: number;
      blendshapes: Record<string, number>;
    }>;

    /** Total audio duration in seconds (used for animation loop termination) */
    duration: number;

    /** Per-stage timing breakdown for performance monitoring and debugging */
    metadata: {
      /** Time from request receipt to first LLM token (ms) */
      llmTime: number;
      /** Time for full TTS synthesis including viseme generation (ms) */
      ttsTime: number;
      /** Time to convert viseme events → blendshape frames (ms) */
      lipsyncTime: number;
      /** Wall-clock time for entire pipeline (ms) */
      totalTime: number;
    };
  };

  /** Human-readable error message. Present only on failure (success: false). */
  error?: string;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

/**
 * Remix ActionFunction — handles POST /api/chat.
 *
 * Only POST is accepted; all other methods return 405.
 * All errors are caught and returned as { success: false, error: string }
 * with HTTP 500 to prevent the frontend from crashing on unhandled rejections.
 *
 * @param request - Remix Request object. Body must be JSON (Content-Type: application/json).
 * @returns JSON response conforming to ChatResponse interface.
 */
export const action: ActionFunction = async ({ request }) => {
  // Gate: only POST requests are valid for this mutation endpoint
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // ── 1. Parse request body ────────────────────────────────────────────────
    const body = (await request.json()) as ChatRequest;
    const { message, sessionId, session_id, repId, rep_id, language } = body;

    // Require message — the avatar cannot generate a response without input text
    if (!message) {
      return json({ error: 'Message required' }, { status: 400 });
    }

    console.log(`\n=== [Chat API] New Request ===`);
    console.log(`Session: ${sessionId ?? session_id ?? 'anonymous'}`);
    // Truncate message in logs to avoid polluting console with very long inputs
    console.log(
      `User: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`
    );

    // ── 2. Normalize IDs ─────────────────────────────────────────────────────

    // session_id takes precedence over sessionId (snake_case = newer frontend);
    // fall back to a new UUID if neither is provided.
    const session = session_id ?? sessionId ?? crypto.randomUUID();

    // Accept both rep_id (snake_case, from newer frontend) and repId (camelCase, legacy).
    // Validate against UUID_RE before passing to Supabase — invalid values would
    // cause a pgvector lookup error and degrade the response with no memory context.
    const repCandidate =
      typeof rep_id === 'string'
        ? rep_id
        : typeof repId === 'string'
          ? repId
          : null;
    const resolvedRepId =
      repCandidate && UUID_RE.test(repCandidate) ? repCandidate : null;

    if (repCandidate && !resolvedRepId) {
      // Log but don't fail — continue without personalization
      console.warn(
        `[Chat API] repId "${repCandidate}" is not a valid UUID — skipping memory retrieval`
      );
    }

    // ── 3. Run full orchestration pipeline ───────────────────────────────────
    // orchestrateConversation runs:
    //   a) RAG memory retrieval (if resolvedRepId is set)
    //   b) System prompt construction (persona + context + language)
    //   c) LLM inference (Ollama or NVIDIA NIM based on TTS_PROVIDER env)
    //   d) Azure TTS synthesis with viseme event capture
    //   e) Audio2Face blendshape frame generation
    //   f) Returns ALIAConversationState with all intermediate artifacts
    const state = await orchestrateConversation(
      message,
      resolvedRepId,
      session,
      { language: language ?? 'en-US' }
    );

    // ── 4. Convert state to HTTP response ────────────────────────────────────
    // stateToResponse() flattens ALIAConversationState into the frozen ChatResponse
    // shape. It also computes metadata timings from state timestamps.
    const response: ChatResponse = stateToResponse(state);

    console.log(
      `[Chat API] ✅ Pipeline complete — LLM: ${response.data?.metadata.llmTime}ms, ` +
      `TTS: ${response.data?.metadata.ttsTime}ms, ` +
      `Total: ${response.data?.metadata.totalTime}ms`
    );

    return json(response);
  } catch (error) {
    // Catch-all: log full error server-side, return sanitized message to client.
    // Never expose stack traces or internal paths in production responses.
    console.error(
      '\n❌ CHAT API ERROR:',
      error instanceof Error ? error.message : error
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
};
