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

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// ─────────────────────────────────────────────────
// Load .env
// ─────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────
const PORT = Number(process.env.WS_PORT) || 3001;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const AUDIO2FACE_URL =
  'https://health.api.nvidia.com/v1/nvidia/audio2face-3d';

const MODELS = {
  LLM: 'meta/llama-3.1-8b-instruct',
  TTS: 'nvidia/fastpitch-hifigan',
  A2F: 'nvidia/audio2face-3d',
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
    default:
      send(ws, 'error', { message: `Unknown type: ${msg.type}` });
  }
}

// ─────────────────────────────────────────────────
// Session lifecycle
// ─────────────────────────────────────────────────
function handleStartSession(ws, { rep_id, session_id }) {
  if (!session_id) session_id = crypto.randomUUID();
  const session = {
    rep_id,
    session_id,
    started_at: Date.now(),
    messages: [],
    metrics: { accuracy: 0, compliance: 0, confidence: 0, clarity: 0 },
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

  const pipelineStart = Date.now();

  try {
    // ─── Stage 1: LLM ──────────────────────────
    if (ac.signal.aborted) return;
    send(ws, 'stage', { stage: 'llm' });

    const llmStart = Date.now();
    const llmText = await runLLM(session.messages);
    const llmTime = Date.now() - llmStart;

    if (ac.signal.aborted) return;
    session.messages.push({
      role: 'assistant',
      content: llmText,
      timestamp: Date.now(),
    });
    send(ws, 'llm_text', { text: llmText, llmTime });
    console.log(
      `  ✅ LLM [${llmTime}ms]: "${llmText.substring(0, 60)}..."`
    );

    // ─── Stage 2: TTS ──────────────────────────
    if (ac.signal.aborted) return;
    send(ws, 'stage', { stage: 'tts' });

    const ttsStart = Date.now();
    const { audioBase64, duration, isMock } = await runTTS(llmText);
    const ttsTime = Date.now() - ttsStart;

    if (ac.signal.aborted) return;
    send(ws, 'tts_audio', { audio: audioBase64, duration, ttsTime, isMock: isMock || false });
    console.log(
      `  ✅ TTS [${ttsTime}ms]: ${duration.toFixed(2)}s audio`
    );

    // ─── Stage 3: LipSync ──────────────────────
    if (ac.signal.aborted) return;
    send(ws, 'stage', { stage: 'lipsync' });

    const lsStart = Date.now();
    const blendshapes = await runLipSync(audioBase64);
    const lipsyncTime = Date.now() - lsStart;
    const timeline = buildVisemeTimeline(blendshapes);

    if (ac.signal.aborted) return;
    send(ws, 'lipsync_blendshapes', { blendshapes, timeline, lipsyncTime });
    console.log(
      `  ✅ LipSync [${lipsyncTime}ms]: ${blendshapes.length} frames`
    );

    // ─── Done ──────────────────────────────────
    const totalTime = Date.now() - pipelineStart;
    send(ws, 'pipeline_complete', {
      totalTime,
      breakdown: { llmTime, ttsTime, lipsyncTime },
    });
    console.log(
      `🎉 Pipeline [${totalTime}ms] = LLM(${llmTime}) + TTS(${ttsTime}) + LS(${lipsyncTime})`
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

  // Fallback
  return "That's a great question about medical sales. Let me help you think through this.";
}

async function runTTS(text) {
  if (nvidia && NVIDIA_API_KEY) {
    try {
      const resp = await Promise.race([
        fetch(`${NVIDIA_BASE_URL}/audio/speech`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODELS.TTS,
            input: text,
            voice: 'default',
          }),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TTS timeout')), 10000)
        ),
      ]);

      if (!resp.ok) {
        throw new Error(`NVIDIA TTS API error: ${resp.status} ${resp.statusText}`);
      }

      const ab = await resp.arrayBuffer();
      const buf = Buffer.from(ab);
      const duration = buf.length / (16000 * 2);
      return { audioBase64: buf.toString('base64'), duration, isMock: false };
    } catch (e) {
      console.warn('⚠️ NVIDIA TTS failed, using mock:', e.message);
    }
  }
  return generateMockAudio(text);
}

async function runLipSync(audioBase64) {
  if (NVIDIA_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(AUDIO2FACE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audio: audioBase64, format: 'arkit' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.blendshapes)) {
          return data.blendshapes.map((f, i) => ({
            timestamp: f.timestamp ?? f.time ?? i * 33,
            blendshapes: normaliseBlendshapes(f.blendshapes ?? f.shapes ?? {}),
          }));
        }
      }
    } catch (_) {
      console.warn('⚠️ Audio2Face unavailable, using mock lip-sync');
    }
  }
  return generateMockBlendshapes(audioBase64);
}

// ═════════════════════════════════════════════════
// TalkingHead-style viseme timeline builder
// Derives { visemes, vtimes, vdurations } from A2F blendshape frames.
// The dominant viseme_* key is picked per frame; falls back to 'sil'.
// This is forwarded alongside the raw blendshapes so the client can use
// whichever representation it prefers.
// ═════════════════════════════════════════════════
function buildVisemeTimeline(frames) {
  const visemes = [];
  const vtimes = [];
  const vdurations = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const next = frames[i + 1] ?? frame;

    // Find the dominant viseme_* key in this frame
    let winner = 'sil';
    let winnerVal = 0;
    for (const [k, v] of Object.entries(frame.blendshapes)) {
      if (k.startsWith('viseme_') && v > winnerVal) {
        winner = k.replace('viseme_', '') || 'sil';
        winnerVal = v;
      }
    }

    visemes.push(winner);
    vtimes.push(frame.timestamp);
    vdurations.push(Math.max(1, next.timestamp - frame.timestamp));
  }

  return { visemes, vtimes, vdurations };
}

// ═════════════════════════════════════════════════
// Mock Generators
// ═════════════════════════════════════════════════

function generateMockAudio(text) {
  const wordCount = text.split(/\s+/).length;
  const durationSeconds = Math.min(8, Math.max(0.5, wordCount / 3));
  const sampleRate = 16000;
  const samples = Math.floor(sampleRate * durationSeconds);
  // Silent WAV — browser TTS will provide actual voice
  const audioData = new Int16Array(samples); // all zeros = silence

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audioData.byteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(audioData.byteLength, 40);

  const buf = Buffer.concat([header, Buffer.from(audioData.buffer)]);
  return { audioBase64: buf.toString('base64'), duration: durationSeconds, isMock: true };
}

function generateMockBlendshapes(audioBase64) {
  const rawBytes = (audioBase64.length * 3) / 4;
  const durationMs = (rawBytes / (16000 * 2)) * 1000;
  const cappedMs = Math.min(durationMs, 8000);
  const frames = [];

  for (let ts = 0; ts < cappedMs; ts += 33) {
    const t = ts / cappedMs;
    const tSec = ts / 1000;
    const jaw = Math.sin(tSec * Math.PI * 5);   // ~2.5 syllables/sec
    const mouth = Math.cos(tSec * Math.PI * 7);
    frames.push({
      timestamp: Math.round(ts),
      blendshapes: {
        jawOpen: clamp(0.5 + jaw * 0.3),
        mouthSmileLeft: clamp(0.3 + mouth * 0.2),
        mouthSmileRight: clamp(0.3 + mouth * 0.2),
        mouthFunnel: clamp(Math.abs(jaw) * 0.4),
        mouthFrown: clamp(Math.abs(mouth) * 0.15),
        eyeBlinkLeft:
          Math.abs(Math.sin(t * Math.PI * 8)) < 0.3 ? 1.0 : 0.0,
        eyeBlinkRight:
          Math.abs(Math.sin(t * Math.PI * 8 - 0.2)) < 0.3 ? 1.0 : 0.0,
        browDownLeft: clamp(Math.abs(mouth) * 0.1),
        browDownRight: clamp(Math.abs(mouth) * 0.1),
        viseme_aa: clamp(jaw * 0.6),
        viseme_O: clamp(Math.abs(mouth) * 0.5),
        viseme_FF: clamp(Math.abs(jaw) * 0.2),
        viseme_SS: clamp(Math.abs(mouth) * 0.15),
      },
    });
  }
  return frames;
}

// ═════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════
function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, payload }));
}
function clamp(v) {
  return Math.max(0, Math.min(1, v));
}
function normaliseBlendshapes(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = clamp(Number(v) || 0);
  return out;
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
