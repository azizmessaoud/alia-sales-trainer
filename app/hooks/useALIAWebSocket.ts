/**
 * ALIA 2.0 — Full-Duplex WebSocket Hook
 *
 * Connects to ws://localhost:3001 and exposes:
 *   sendChat(message)    — fires the progressive pipeline
 *   interrupt()          — cancels an in-flight pipeline
 *   startSession / endSession
 *
 * The hook delivers each pipeline stage via the `onX` callbacks
 * so the UI can render progressively (text → audio → blendshapes).
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ─── Types ──────────────────────────────────────
export interface Blendshape {
  timestamp: number;
  blendshapes: Record<string, number>;
}

export interface LipSyncTimeline {
  visemes: string[];
  vtimes: number[];
  vdurations: number[];
}

export interface PipelineBreakdown {
  llmTime: number;
  ttsTime: number;
  lipsyncTime: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseALIAWebSocketOptions {
  /** WebSocket URL (default: ws://localhost:3001) */
  url?: string;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnection delay in ms (default: 5000) */
  maxReconnectDelay?: number;

  // ─── Progressive callbacks ───────────────────
  /** Fired when LLM text arrives (display immediately) */
  onLLMText?: (text: string, llmTime: number) => void;
  /** Fired when TTS audio arrives (start playback, or browser TTS if mock) */
  onTTSAudio?: (audioBase64: string, duration: number, ttsTime: number, isMock: boolean) => void;
  /** Fired when TTS stream chunk arrives (for Web Audio queue scheduling) */
  onTTSChunk?: (chunkBase64: string | null, isFirst: boolean, isFinal: boolean) => void;
  /** Fired when lip-sync blendshapes arrive (animate avatar) */
  onLipSync?: (blendshapes: Blendshape[], lipsyncTime: number, timeline?: LipSyncTimeline, isMock?: boolean) => void;
  /** Fired when the full pipeline is done */
  onPipelineComplete?: (totalTime: number, breakdown: PipelineBreakdown) => void;
  /** Fired on each pipeline stage change */
  onStageChange?: (stage: string) => void;
  /** Fired on errors from the server */
  onError?: (message: string) => void;
  /** Fired when session is started */
  onSessionStarted?: (sessionId: string) => void;
}

/** Return value of the hook */
export interface ALIAWebSocket {
  /** Send a chat message through the pipeline */
  sendChat: (message: string) => void;
  /** Interrupt in-flight pipeline */
  interrupt: () => void;
  /** Start a new session */
  startSession: (repId?: string) => void;
  /** End the current session */
  endSession: () => void;
  /** Current connection status */
  status: ConnectionStatus;
  /** Current pipeline stage (null when idle) */
  currentStage: string | null;
  /** Send a raw message (type + payload) */
  sendRaw: (type: string, payload?: any) => void;
}

// ─── Hook ───────────────────────────────────────
export function useALIAWebSocket(
  options: UseALIAWebSocketOptions = {}
): ALIAWebSocket {
  const {
    url = 'ws://localhost:3001',
    autoReconnect = true,
    maxReconnectDelay = 5000,
    onLLMText,
    onTTSAudio,
    onLipSync,
    onPipelineComplete,
    onStageChange,
    onError,
    onSessionStarted,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const sessionIdRef = useRef<string | null>(null);
  /** Guard: false while the effect is cleaned up (React Strict Mode) */
  const mountedRef = useRef(false);
  /** Pending connection timer — lets us cancel before the socket is created */
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  // Keep latest callbacks in refs so we don't re-connect on every render
  const cbRef = useRef(options);
  cbRef.current = options;

  // ─── Connect / Reconnect ────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Close any lingering socket from a previous cycle
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Defer actual socket creation so React Strict Mode cleanup can cancel
    // before the browser even starts the TCP handshake.
    if (connectTimer.current) clearTimeout(connectTimer.current);
    setStatus('connecting');
    connectTimer.current = setTimeout(() => {
      connectTimer.current = null;
      if (!mountedRef.current) return; // Strict Mode already tore us down

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[WS] Connected to', url);
        setStatus('connected');
        reconnectDelay.current = 1000; // reset backoff
      };

      ws.onclose = () => {
        if (!mountedRef.current) return; // Strict Mode cleanup — don't reconnect
        console.log('[WS] Disconnected');
        setStatus('disconnected');
        setCurrentStage(null);
        wsRef.current = null;

        if (autoReconnect) {
          const delay = Math.min(reconnectDelay.current, maxReconnectDelay);
          console.log(`[WS] Reconnecting in ${delay}ms...`);
          reconnectTimer.current = setTimeout(() => {
            reconnectDelay.current = Math.min(
              reconnectDelay.current * 1.5,
              maxReconnectDelay
            );
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        // Suppress noisy error events during Strict Mode teardown
        if (!mountedRef.current) return;
        console.warn('[WS] Connection error');
      };

      ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          handleServerMessage(type, payload);
        } catch {
          console.warn('[WS] Invalid message from server');
        }
      };
    }, 0);
  }, [url, autoReconnect, maxReconnectDelay]);

  // ─── Server message dispatcher ──────────────
  function handleServerMessage(type: string, payload: any) {
    switch (type) {
      case 'connected':
        console.log('[WS]', payload.message);
        break;

      case 'session_started':
        sessionIdRef.current = payload.session_id;
        cbRef.current.onSessionStarted?.(payload.session_id);
        break;

      case 'stage':
        setCurrentStage(payload.stage);
        cbRef.current.onStageChange?.(payload.stage);
        break;

      case 'llm_text':
        cbRef.current.onLLMText?.(payload.text, payload.llmTime);
        break;

      case 'tts_audio':
        cbRef.current.onTTSAudio?.(
          payload.audio,
          payload.duration,
          payload.ttsTime,
          payload.isMock ?? false
        );
        break;

      case 'tts_chunk':
        cbRef.current.onTTSChunk?.(payload.chunkBase64 ?? null, payload.isFirst ?? false, payload.isFinal ?? false);
        break;

      case 'lipsync_blendshapes':
        cbRef.current.onLipSync?.(payload.blendshapes, payload.lipsyncTime, payload.timeline, payload.isMock ?? false);
        break;

      case 'pipeline_complete':
        setCurrentStage(null);
        cbRef.current.onPipelineComplete?.(
          payload.totalTime,
          payload.breakdown
        );
        break;

      case 'interrupted':
        setCurrentStage(null);
        break;

      case 'tts_done':
        // Server signals TTS stream finished — no UI action needed
        break;

      case 'session_ended':
        sessionIdRef.current = null;
        break;

      case 'message_received':
        // Server acknowledged message receipt
        console.log('[WS] Message acknowledged, id:', payload.message_id);
        break;

      case 'compliance':
        // Compliance evaluation result (informational)
        console.log('[WS] Compliance:', payload.isCompliant ? '✅ Pass' : '❌ Fail', payload.reason || '');
        break;

      case 'error':
        setCurrentStage(null);
        cbRef.current.onError?.(payload.message);
        break;

      default:
        console.log('[WS] Unhandled:', type, payload);
    }
  }

  // ─── Lifecycle ──────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (connectTimer.current) { clearTimeout(connectTimer.current); connectTimer.current = null; }
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // ─── Public API ─────────────────────────────
  const sendJSON = useCallback((type: string, payload: any = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('[WS] Not connected — cannot send', type);
    }
  }, []);

  const sendRaw = useCallback((type: string, payload: any = {}) => {
    sendJSON(type, payload);
  }, [sendJSON]);

  const sendChat = useCallback(
    (message: string) => sendJSON('chat', { message }),
    [sendJSON]
  );

  const interrupt = useCallback(
    () => sendJSON('interrupt'),
    [sendJSON]
  );

  const startSession = useCallback(
    (repId?: string) => {
      const session_id = crypto.randomUUID();
      sessionIdRef.current = session_id;
      sendJSON('start_session', { session_id, rep_id: repId || 'demo' });
    },
    [sendJSON]
  );

  const endSession = useCallback(() => {
    if (sessionIdRef.current) {
      sendJSON('end_session', { session_id: sessionIdRef.current });
      sessionIdRef.current = null;
    }
  }, [sendJSON]);

  return {
    sendChat,
    interrupt,
    startSession,
    endSession,
    status,
    currentStage,
    sendRaw,
  };
}
