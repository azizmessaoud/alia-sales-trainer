/**
 * ALIA 2.0 — Full-Duplex WebSocket Server
 * Progressive pipeline: LLM → TTS → LipSync
 * Streams each stage to the client as it completes
 * Port: 3001
 *
 * Protocol (Client → Server):
 *   { type: 'start_session', payload: { rep_id, session_id } }
 *   { type: 'end_session',   payload: { session_id } }
 *   { type: 'chat',          payload: { message } }
 *   { type: 'interrupt' }
 *
 * Protocol (Server → Client):
 *   { type: 'connected'             }
 *   { type: 'session_started'       }
 *   { type: 'message_received'      }
 *   { type: 'stage',                payload: { stage } }
 *   { type: 'llm_text',             payload: { text, llmTime } }
 *   { type: 'tts_audio',            payload: { audio, duration, ttsTime } }
 *   { type: 'lipsync_blendshapes',  payload: { blendshapes, lipsyncTime } }
 *   { type: 'pipeline_complete',    payload: { totalTime, breakdown } }
 *   { type: 'error',                payload: { message } }
 */

// ─────────────────────────────────────────────────
// Load .env FIRST (before imports)
// ─────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        process.env[key.trim()] = valueParts
          .join('=')
          .trim()
          .replace(/^["']|["']$/g, '');
      }
    }
  });
  console.log('✅ .env loaded');
}

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import OpenAI from 'openai';
import crypto from 'node:crypto';
import {
  orchestrateConversation,
} from './app/lib/orchestration.server.ts';
import {
  runTTSStreaming,
  runTTSWithTimestamps,
} from './app/lib/tts.server.js';

// ─────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────
const PORT = Number(process.env.WS_PORT) || 3001;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

const MODELS = {
  LLM: 'meta/llama-3.1-8b-instruct',
};

// OpenAI-compatible client → NVIDIA NIM
let nvidia;
if (NVIDIA_API_KEY) {
  nvidia = new OpenAI({ baseURL: NVIDIA_BASE_URL, apiKey: NVIDIA_API_KEY });
  console.log('✅ NVIDIA NIM client initialised');
} else {
  console.warn(
    '⚠️  NVIDIA_API_KEY not set — pipeline will use mock fallbacks'
  );
}

// ─────────────────────────────────────────────────
// Session + client state
// ─────────────────────────────────────────────────
const sessions = new Map();
const clients = new Map(); // ws → { session_id, abortController }

function logPipelineTiming({ sessionId, stage, durationMs, error = null, meta = {} }) {
  const payload = {
    kind: 'pipeline_timing',
    sessionId,
    stage,
    durationMs,
    error,
    timestamp: Date.now(),
    ...meta,
  };
  console.log(JSON.stringify(payload));
}

// ─────────────────────────────────────────────────
// WebSocket Server
// ─────────────────────────────────────────────────
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || 'unknown';
  console.log(`[WS] Client connected from ${origin}`);
  clients.set(ws, { abortController: null });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      await handleMessage(ws, msg);
    } catch (err) {
      send(ws, 'error', { message: 'Invalid JSON' });
    }
  });

  ws.on('close', () => {
    const state = clients.get(ws);
    if (state?.abortController) state.abortController.abort();
    if (state?.session_id) sessions.delete(state.session_id);
    clients.delete(ws);
    console.log('[WS] Client disconnected');
  });

  ws.on('error', (e) => console.error('[WS] Error:', e.message));

  send(ws, 'connected', {
    message: 'ALIA Full-Duplex Pipeline v2',
    timestamp: Date.now(),
  });
});

// ─────────────────────────────────────────────────
// Message Router
// ─────────────────────────────────────────────────
async function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'start_session':
      return handleStartSession(ws, msg.payload || {});
    case 'end_session':
      return handleEndSession(ws, msg.payload || {});
    case 'chat':
      return handleChat(ws, msg.payload || {});
    case 'interrupt':
      return handleInterrupt(ws);
    case 'debug_lipsync':
      return handleDebugLipSync(ws, msg.payload || {});
    default:
      send(ws, 'error', { message: `Unknown type: ${msg.type}` });
  }
}

// ─────────────────────────────────────────────────
// Session lifecycle
// ─────────────────────────────────────────────────
function handleStartSession(ws, { rep_id, session_id, voice_id, tts_voice, language }) {
  if (!session_id) session_id = crypto.randomUUID();
  const session = {
    rep_id,
    session_id,
    started_at: Date.now(),
    messages: [],
    metrics: { accuracy: 0, compliance: 0, confidence: 0, clarity: 0 },
    voice_id:  voice_id  || null,  // ElevenLabs per-rep voice override
    tts_voice: tts_voice || null,  // NVIDIA per-rep voice override
    language:  language  || 'en-US', // BCP-47 tag, e.g. 'ar-SA', 'fr-FR', 'es-ES'
  };
  sessions.set(session_id, session);
  const clientState = clients.get(ws);
  if (clientState) clientState.session_id = session_id;

  console.log(`[WS] Session started: ${session_id}`);
  send(ws, 'session_started', {
    session_id,
    rep_id,
    started_at: session.started_at,
  });
}

function handleEndSession(ws, { session_id }) {
  const session = sessions.get(session_id);
  if (!session) return send(ws, 'error', { message: 'Session not found' });

  const duration = Date.now() - session.started_at;
  sessions.delete(session_id);
  const clientState = clients.get(ws);
  if (clientState) delete clientState.session_id;

  console.log(`[WS] Session ended: ${session_id}`);
  send(ws, 'session_ended', {
    session_id,
    duration,
    message_count: session.messages.length,
  });
}

// ─────────────────────────────────────────────────
// Interrupt — cancel running pipeline
// ─────────────────────────────────────────────────
function handleInterrupt(ws) {
  const state = clients.get(ws);
  if (state?.abortController) {
    state.abortController.abort();
    state.abortController = null;
    console.log('[WS] Pipeline interrupted by client');
    send(ws, 'interrupted', { message: 'Pipeline cancelled' });
  }
}

// ─────────────────────────────────────────────────
// Chat — Progressive Pipeline
//   1. llm_text        → display text immediately
//   2. tts_audio       → start audio playback
//   3. lipsync_blendshapes → animate mouth
//   4. pipeline_complete
// ─────────────────────────────────────────────────
async function handleChat(ws, { message }) {
  if (!message?.trim())
    return send(ws, 'error', { message: 'Empty message' });

  // Auto-create session if needed
  const clientState = clients.get(ws);
  let session_id = clientState?.session_id;
  if (!session_id) {
    session_id = crypto.randomUUID();
    handleStartSession(ws, { session_id });
  }
  const session = sessions.get(session_id);

  // Abort any in-flight pipeline
  if (clientState.abortController) clientState.abortController.abort();
  const ac = new AbortController();
  clientState.abortController = ac;

  // Record user message
  session.messages.push({
    role: 'user',
    content: message,
    timestamp: Date.now(),
  });
  send(ws, 'message_received', { message_id: crypto.randomUUID() });

  try {
    // Run LangGraph Orchestration
    await orchestrateConversation(
      message,
      session.rep_id || 'demo-rep',
      session_id,
      (event) => {
        if (ac.signal.aborted) return;

        // Debug: log orchestration events to help diagnose missing stages
        try {
          const evt = typeof event === 'string' ? event : JSON.stringify(event, (k, v) => (k === 'audio' ? '[binary]' : v));
          console.log('[WS] Orchestration event:', evt.substring ? evt.substring(0, 1000) : evt);
        } catch (e) {
          console.log('[WS] Orchestration event (unserializable)');
        }

        // Map LangGraph events to WebSocket protocol
        switch (event.type) {
          case 'stage':
            if (event.payload.stage === 'complete') {
              send(ws, 'pipeline_complete', {
                totalTime: event.payload.totalTime,
                breakdown: event.payload.breakdown
              });
            } else {
              send(ws, 'stage', event.payload);
            }
            break;
          case 'llm_text':
            session.messages.push({ role: 'assistant', content: event.payload.text, timestamp: Date.now() });
            send(ws, 'llm_text', event.payload);
            
            // Fire parallel TTS paths immediately after LLM text
            (async () => {
              const llmText = event.payload.text;
              const [streamResult, tsResult] = await Promise.allSettled([
                runTTSStreaming(llmText, session),
                runTTSWithTimestamps(llmText, session),
              ]);

              // Stream audio chunks
              if (streamResult.status === 'fulfilled' && streamResult.value) {
                try {
                  const reader = streamResult.value.getReader();
                  let isFirst = true;
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                      send(ws, 'tts_chunk', { chunkBase64: null, isFirst: false, isFinal: true });
                      break;
                    }
                    send(ws, 'tts_chunk', {
                      chunkBase64: Buffer.from(value).toString('base64'),
                      isFirst,
                      isFinal: false
                    });
                    isFirst = false;
                  }
                } catch (streamErr) {
                  console.warn('⚠️ TTS stream read failed:', streamErr.message);
                }
              }

              // Send blendshapes from timestamp result
              const blendshapes = (tsResult.status === 'fulfilled' && tsResult.value?.blendshapes?.length)
                ? tsResult.value.blendshapes
                : [];
              if (blendshapes.length) {
                send(ws, 'lipsync_blendshapes', { frames: blendshapes });
              }

              // Also send legacy tts_audio for fallback clients
              if (tsResult.status === 'fulfilled' && tsResult.value?.audioBase64) {
                send(ws, 'tts_audio', {
                  audio: tsResult.value.audioBase64,
                  duration: tsResult.value.duration,
                  ttsTime: tsResult.value.duration ? 0 : null,
                  isMock: false
                });
              }
            })();
            break;
          case 'tts_audio':
            send(ws, 'tts_audio', event.payload);
            break;
          case 'lipsync_blendshapes':
            send(ws, 'lipsync_blendshapes', event.payload);
            break;
          case 'compliance_violation':
            send(ws, 'compliance_violation', event.payload);
            break;
          case 'error':
            send(ws, 'error', event.payload);
            break;
        }
      }
    );
  } catch (err) {
    if (ac.signal.aborted) return;
    console.error('[WS] Pipeline error:', err.message || err);
    send(ws, 'error', { message: err.message || 'Pipeline failed' });
  } finally {
    clientState.abortController = null;
  }
}

// ═════════════════════════════════════════════════
// Pipeline Stage Implementations
// ═════════════════════════════════════════════════

// Debug helper: send mock lipsync frames to a client
function generateMockFrames(count = 60, durationMs = 2000) {
  const frames = [];
  const interval = Math.max(10, Math.floor(durationMs / Math.max(1, count)));
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const jaw = Math.max(0, Math.min(1, 0.5 + Math.sin(t * Math.PI * 2) * 0.3));
    frames.push({ timestamp: Math.round(i * interval), blendshapes: { jawOpen: jaw } });
  }
  return frames;
}

function handleDebugLipSync(ws, { frames = 60, duration = 2000 } = {}) {
  // Send a small mock sequence so client can test animator mapping
  const payload = { blendshapes: generateMockFrames(frames, duration), lipsyncTime: 5, timeline: null, isMock: true };
  send(ws, 'lipsync_blendshapes', payload);
  return send(ws, 'pipeline_complete', { totalTime: duration, breakdown: { llmTime: 0, ttsTime: 0, lipsyncTime: 5 } });
}

async function runLLM(conversationMessages) {
  const systemPrompt =
    'You are ALIA, a medical sales training coach. Keep responses to 1-2 concise sentences. Be direct and actionable.';

  const history = conversationMessages.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (nvidia) {
    const completion = await nvidia.chat.completions.create({
      model: MODELS.LLM,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      temperature: 0.7,
      max_tokens: 150,
    });
    return (
      completion.choices[0]?.message?.content ||
      'I understand. Let me think about that.'
    );
  }

  // Ollama fallback (phi3 or any locally available model)
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3:latest';
  const ollamaController = new AbortController();
  const ollamaTimeout = setTimeout(() => ollamaController.abort(), 10000);
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ollamaController.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        stream: false,
        options: { temperature: 0.7, num_predict: 150 },
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const text = data.message?.content?.trim();
      if (text) {
        console.log(`  🦙 Ollama [${OLLAMA_MODEL}]: "${text.substring(0, 60)}..."`);
        return text;
      }
    } else {
      console.warn(`⚠️ Ollama HTTP ${resp.status}`);
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('⚠️ Ollama timed out after 10s');
    } else {
      console.warn('⚠️ Ollama unavailable:', e.message);
    }
  } finally {
    clearTimeout(ollamaTimeout);
  }

  return "That's a great question about medical sales. Let me help you think through this.";
}

// ═════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════
function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, payload }));
}

// ─────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚀 ALIA Full-Duplex WebSocket Server`);
  console.log(`   ws://localhost:${PORT}`);
  console.log(`   NVIDIA NIM: ${nvidia ? '✅ Connected' : '⚠️  Mock mode'}`);
  console.log(
    `   Pipeline: LLM → TTS → LipSync (progressive streaming)\n`
  );
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`   Run: Get-NetTCPConnection -LocalPort ${PORT} | Stop-Process -Force`);
    console.error(`   Then restart this server.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

export { wss, sessions };
