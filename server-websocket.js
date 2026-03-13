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

// ElevenLabs TTS (primary voice provider)
const ELEVENLABS_API_KEY  = process.env.ELEVENLABS_API_KEY  || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

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
  const wsReceiveStart = Date.now();
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
  logPipelineTiming({
    sessionId: session_id,
    stage: 'ws_receive',
    durationMs: Date.now() - wsReceiveStart,
  });

  const pipelineStart = Date.now();

  try {
    // ─── Stage 1: LLM ──────────────────────────
    if (ac.signal.aborted) return;
    send(ws, 'stage', { stage: 'llm' });

    const llmStart = Date.now();
    const llmText = await runLLM(session.messages);
    const llmTime = Date.now() - llmStart;
    logPipelineTiming({
      sessionId: session_id,
      stage: 'llm',
      durationMs: llmTime,
    });

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
    const { audioBase64, duration, isMock } = await runTTS(llmText, session);
    const ttsTime = Date.now() - ttsStart;
    logPipelineTiming({
      sessionId: session_id,
      stage: 'tts',
      durationMs: ttsTime,
      meta: { isMock: Boolean(isMock) },
    });

    if (ac.signal.aborted) return;
    send(ws, 'tts_audio', { audio: audioBase64, duration, ttsTime, isMock: isMock || false });
    console.log(
      `  ✅ TTS [${ttsTime}ms]: ${duration.toFixed(2)}s audio`
    );

    // ─── Stage 3: LipSync ──────────────────────
    if (ac.signal.aborted) return;
    send(ws, 'stage', { stage: 'lipsync' });

    const lsStart = Date.now();
    const { frames: blendshapes, isMock: lipsyncIsMock } = await runLipSync(audioBase64, session.language || 'en-US');
    const lipsyncTime = Date.now() - lsStart;
    logPipelineTiming({
      sessionId: session_id,
      stage: 'lipsync',
      durationMs: lipsyncTime,
      meta: { isMock: Boolean(lipsyncIsMock) },
    });
    const jawVals = blendshapes.map(f => f.blendshapes.jawOpen ?? 0);
    const jawMin = Math.min(...jawVals).toFixed(3);
    const jawMax = Math.max(...jawVals).toFixed(3);
    const timeline = buildVisemeTimeline(blendshapes);

    if (ac.signal.aborted) return;
    send(ws, 'lipsync_blendshapes', { blendshapes, timeline, lipsyncTime, isMock: lipsyncIsMock });
    console.log(
      `  ✅ LipSync [${lipsyncTime}ms]: ${blendshapes.length} frames | jawOpen=[${jawMin}..${jawMax}]${lipsyncIsMock ? ' (mock)' : ''}`
    );

    // ─── Done ──────────────────────────────────
    const totalTime = Date.now() - pipelineStart;
    const wsSendStart = Date.now();
    send(ws, 'pipeline_complete', {
      totalTime,
      breakdown: { llmTime, ttsTime, lipsyncTime },
    });
    logPipelineTiming({
      sessionId: session_id,
      stage: 'ws_send',
      durationMs: Date.now() - wsSendStart,
    });
    logPipelineTiming({
      sessionId: session_id,
      stage: 'pipeline_total',
      durationMs: totalTime,
      meta: { llmTime, ttsTime, lipsyncTime },
    });
    console.log(
      `🎉 Pipeline [${totalTime}ms] = LLM(${llmTime}) + TTS(${ttsTime}) + LS(${lipsyncTime})`
    );
  } catch (err) {
    if (ac.signal.aborted) return;
    logPipelineTiming({
      sessionId: session_id,
      stage: 'pipeline_error',
      durationMs: Date.now() - pipelineStart,
      error: err?.message || String(err),
    });
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

/**
 * Parse a WAV buffer's RIFF header to compute the actual duration in seconds.
 * Falls back to raw-byte estimate (16kHz mono 16-bit) if the header is missing.
 */
function parseWavDuration(buf) {
  try {
    if (buf.length >= 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
      const channels = buf.readUInt16LE(22);
      const sampleRate = buf.readUInt32LE(24);
      const bitsPerSample = buf.readUInt16LE(34);
      // Find the 'data' sub-chunk to get the actual audio data size
      let dataSize = buf.length - 44; // fallback
      for (let i = 36; i < buf.length - 8; i++) {
        if (buf.toString('ascii', i, i + 4) === 'data') {
          dataSize = buf.readUInt32LE(i + 4);
          break;
        }
      }
      const bytesPerSample = (bitsPerSample / 8) * channels;
      if (sampleRate > 0 && bytesPerSample > 0) {
        return dataSize / (sampleRate * bytesPerSample);
      }
    }
  } catch (_) { /* fall through */ }
  // Fallback: assume 16kHz mono 16-bit PCM
  return buf.length / (16000 * 2);
}

/**
 * TTS provider order: ElevenLabs → NVIDIA FastPitch → mock
 *
 * ElevenLabs returns 44.1 kHz 16-bit mono PCM WAV by default.
 * NVIDIA Audio2Face-3D accepts any sample rate ≥ 16 kHz — no resampling needed.
 * NOTE: if A2F ever rejects the sample rate, add a Sox/ffmpeg resampling step
 *   before handing `audioBase64` to `runLipSync`.
 */
async function runTTS(text, session = null) {
  const voices = getActiveVoice(session);

  // ── 1. ElevenLabs (primary) ───────────────────
  if (ELEVENLABS_API_KEY && voices.elevenLabsVoiceId) {
    try {
      const resp = await Promise.race([
        fetch(`${ELEVENLABS_BASE_URL}/v1/text-to-speech/${voices.elevenLabsVoiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/wav',
          },
          body: JSON.stringify({
            text,
            model_id: ELEVENLABS_MODEL_ID,
            // language_code is optional — eleven_multilingual_v2 auto-detects, but
            // providing it explicitly improves accent accuracy for AR/FR/ES.
            language_code: voices.languageCode,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ElevenLabs TTS timeout')), 15000)
        ),
      ]);

      if (!resp.ok) {
        throw new Error(`ElevenLabs TTS API error: ${resp.status} ${resp.statusText}`);
      }

      const ab = await resp.arrayBuffer();
      const buf = Buffer.from(ab);
      const duration = parseWavDuration(buf);
      console.log(`  🎙️ TTS provider: elevenlabs [${voices.elevenLabsVoiceId}] lang=${voices.languageCode}`);
      return { audioBase64: buf.toString('base64'), duration, isMock: false };
    } catch (e) {
      console.warn('⚠️ ElevenLabs TTS failed, falling back to NVIDIA:', e.message);
    }
  }

  // ── 2. NVIDIA FastPitch (fallback) ────────────
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
            voice: voices.nvidiaTtsVoice,
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
      const duration = parseWavDuration(buf);
      console.log(`  🎙️ TTS provider: nvidia [${voices.nvidiaTtsVoice}]`);
      return { audioBase64: buf.toString('base64'), duration, isMock: false };
    } catch (e) {
      console.warn('⚠️ NVIDIA TTS failed, using mock:', e.message);
    }
  }

  // ── 3. Mock fallback ──────────────────────────
  console.log(`  🎙️ TTS provider: mock`);
  return generateMockAudio(text);
}

/**
 * Resolve voice IDs and language code for a given session.
 * Per-rep overrides (set in start_session payload) win over env defaults.
 */
function getActiveVoice(session = null) {
  const bcp47 = session?.language || process.env.DEFAULT_LANGUAGE || 'en-US';
  return {
    elevenLabsVoiceId: session?.voice_id  || ELEVENLABS_VOICE_ID,
    nvidiaTtsVoice:    session?.tts_voice || process.env.TTS_VOICE || 'female',
    languageCode:      bcp47ToISO639(bcp47), // ISO 639-1 for ElevenLabs
  };
}

/**
 * Convert BCP-47 tag to ISO 639-1 code for the ElevenLabs language_code field.
 * Examples: 'en-US' → 'en', 'ar-SA' → 'ar', 'fr-FR' → 'fr', 'es-ES' → 'es'
 */
function bcp47ToISO639(tag) {
  if (!tag) return 'en';
  return tag.split('-')[0].toLowerCase();
}

async function runLipSync(audioBase64, language = 'en-US') {
  if (NVIDIA_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(AUDIO2FACE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          audio: audioBase64,
          fps: 30,
          emotion_strength: 0.5,
          face_mask_level: 0,
          face_mask_softness: 0.01,
          preferred_emotion: 'neutral',
          language: language,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.warn(`⚠️ A2F API ${resp.status}: ${errText.substring(0, 200)}`);
      } else {
        const data = await resp.json();
        const frames = parseA2FResponse(data);
        if (frames && frames.length > 0) {
          const jawVals = frames.map(f => f.blendshapes['jawOpen'] ?? 0);
          console.log(`  ✅ NVIDIA A2F: ${frames.length} frames, jawOpen=[${Math.min(...jawVals).toFixed(3)}..${Math.max(...jawVals).toFixed(3)}]`);
          return { frames, isMock: false };
        } else {
          console.warn('⚠️ A2F returned empty/unparseable response:', JSON.stringify(data).substring(0, 300));
        }
      }
    } catch (err) {
      console.warn('⚠️ Audio2Face error:', err.message);
    }
  }
  return { frames: generateMockBlendshapes(audioBase64), isMock: true };
}

/**
 * NVIDIA Audio2Face-3D returns one of several response shapes.
 * Normalise all into [{timestamp:ms, blendshapes:{camelCase:0-1}}].
 */
function parseA2FResponse(data) {
  if (!data) return null;
  const raw = data.blendshapes ?? data.animation?.blendshapes ?? data.frames;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const first = raw[0];

  // ── Format A: NVIDIA A2F-3D primary ── [{time_stamp, values:[...52], labels:[...]}, ...]
  if (first.values && Array.isArray(first.values) && first.labels) {
    return raw.map(frame => ({
      timestamp: Math.round((frame.time_stamp ?? frame.timeStamp ?? 0) * 1000),
      blendshapes: normaliseBlendshapes(
        Object.fromEntries(frame.labels.map((lbl, i) => [normBlendshapeName(lbl), frame.values[i]]))
      ),
    }));
  }

  // ── Format B: flat array ── [{name, value, timestamp}, ...]
  if (first.name !== undefined && first.value !== undefined) {
    const frameMap = {};
    for (const bs of raw) {
      // timestamp may be seconds (< 1000) or ms (>= 1000)
      const rawT = bs.timestamp ?? bs.time_stamp ?? 0;
      const t = Math.round(rawT < 100 ? rawT * 1000 : rawT);
      if (!frameMap[t]) frameMap[t] = { timestamp: t, blendshapes: {} };
      frameMap[t].blendshapes[normBlendshapeName(bs.name)] = bs.value;
    }
    return Object.values(frameMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(f => ({ ...f, blendshapes: normaliseBlendshapes(f.blendshapes) }));
  }

  // ── Format C: [{timestamp, blendshapes:{...}}, ...]
  if (first.blendshapes || first.shapes) {
    return raw.map((f, i) => ({
      timestamp: f.timestamp ?? f.time ?? i * 33,
      blendshapes: normaliseBlendshapes(
        Object.fromEntries(
          Object.entries(f.blendshapes ?? f.shapes ?? {}).map(([k, v]) => [normBlendshapeName(k), v])
        )
      ),
    }));
  }

  return null;
}

/**
 * NVIDIA A2F labels may be PascalCase ("JawOpen") or camelCase ("jawOpen").
 * RPM mapping and the animator both use camelCase — normalise here.
 */
function normBlendshapeName(name) {
  if (!name) return name;
  // Already camelCase (starts with lowercase)
  if (/^[a-z]/.test(name)) return name;
  // PascalCase → camelCase
  return name.charAt(0).toLowerCase() + name.slice(1);
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
  const durationSeconds = Math.min(15, Math.max(0.8, wordCount / 2.3));
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
  const cappedMs = Math.min(durationMs, 15000);
  const frames = [];

  // ── Extended phoneme palette with full facial engagement ──
  const PHONEMES = [
    // Open vowels
    { jaw: 0.65, funnel: 0.10, smile: 0.18, pucker: 0.0,  stretch: 0.10, cheekSq: 0.08, noseSnr: 0.0,  rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.05, tongueOut: 0.0  }, // 'ah'
    { jaw: 0.18, funnel: 0.00, smile: 0.50, pucker: 0.0,  stretch: 0.30, cheekSq: 0.15, noseSnr: 0.0,  rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.0,  tongueOut: 0.0  }, // 'ee'
    { jaw: 0.45, funnel: 0.50, smile: 0.00, pucker: 0.12, stretch: 0.0,  cheekSq: 0.0,  noseSnr: 0.0,  rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.08, tongueOut: 0.0  }, // 'oh'
    { jaw: 0.10, funnel: 0.65, smile: 0.00, pucker: 0.45, stretch: 0.0,  cheekSq: 0.0,  noseSnr: 0.0,  rollLo: 0.05, close: 0.0,  press: 0.0,  shrugLo: 0.10, tongueOut: 0.0  }, // 'oo'
    { jaw: 0.35, funnel: 0.12, smile: 0.25, pucker: 0.0,  stretch: 0.08, cheekSq: 0.05, noseSnr: 0.0,  rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.0,  tongueOut: 0.0  }, // 'eh'
    // Consonants - labiodental
    { jaw: 0.06, funnel: 0.18, smile: 0.08, pucker: 0.0,  stretch: 0.0,  cheekSq: 0.0,  noseSnr: 0.0,  rollLo: 0.15, close: 0.0,  press: 0.0,  shrugLo: 0.0,  tongueOut: 0.0  }, // 'ff/v'
    // Consonants - dental
    { jaw: 0.12, funnel: 0.04, smile: 0.10, pucker: 0.0,  stretch: 0.05, cheekSq: 0.0,  noseSnr: 0.0,  rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.0,  tongueOut: 0.12 }, // 'th'
    // Consonants - bilabial (lip closure)
    { jaw: 0.02, funnel: 0.00, smile: 0.15, pucker: 0.0,  stretch: 0.0,  cheekSq: 0.0,  noseSnr: 0.0,  rollLo: 0.08, close: 0.60, press: 0.50, shrugLo: 0.0,  tongueOut: 0.0  }, // 'mm/bb/pp'
    // Consonants - sibilant
    { jaw: 0.08, funnel: 0.00, smile: 0.20, pucker: 0.0,  stretch: 0.20, cheekSq: 0.10, noseSnr: 0.0,  rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.0,  tongueOut: 0.0  }, // 'ss/zz'
    // Consonants - velar/plosive
    { jaw: 0.30, funnel: 0.05, smile: 0.10, pucker: 0.0,  stretch: 0.0,  cheekSq: 0.12, noseSnr: 0.08, rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.06, tongueOut: 0.0  }, // 'k/g'
    // Consonants - nasal
    { jaw: 0.05, funnel: 0.00, smile: 0.12, pucker: 0.0,  stretch: 0.0,  cheekSq: 0.0,  noseSnr: 0.10, rollLo: 0.0,  close: 0.40, press: 0.25, shrugLo: 0.0,  tongueOut: 0.0  }, // 'nn'
    // Consonants - lateral
    { jaw: 0.20, funnel: 0.00, smile: 0.15, pucker: 0.0,  stretch: 0.12, cheekSq: 0.0,  noseSnr: 0.0,  rollLo: 0.0,  close: 0.0,  press: 0.0,  shrugLo: 0.0,  tongueOut: 0.06 }, // 'll'
  ];

  // Simple seeded pseudo-random for determinism
  let seed = audioBase64.length;
  function rand() { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; }

  // ── Pre-compute syllable events with natural variation ──
  const syllables = [];
  let cursor = 60 + rand() * 80;
  let syllableIndex = 0;
  while (cursor < cappedMs - 120) {
    const stress = 0.3 + rand() * 0.7;
    const dur = 100 + stress * 160 + rand() * 80;       // 100-340 ms
    const phoneme = PHONEMES[Math.floor(rand() * PHONEMES.length)];
    syllables.push({ start: cursor, duration: dur, stress, peak: 0.35 + stress * 0.50, phoneme, index: syllableIndex++ });
    // Gap: short within words, longer between words
    const isWordBound = rand() < 0.22;
    const isPhraseBreak = rand() < 0.06; // breathing pause
    if (isPhraseBreak) {
      cursor += dur + 350 + rand() * 300; // 350-650ms breathing break
    } else if (isWordBound) {
      cursor += dur + 180 + rand() * 250;
    } else {
      cursor += dur + 25 + rand() * 50;
    }
  }

  // ── Breathing rhythm: subtle jaw + nose movement at phrase breaks ──
  const breathCycle = 3200 + rand() * 1000; // 3.2-4.2s per breath cycle
  const breathPhase = rand() * Math.PI * 2;

  // ── Generate frames at 20 ms intervals (~50 fps) ──
  for (let ts = 0; ts < cappedMs; ts += 20) {
    // Find best active syllable envelope + coarticulation lookback
    let envelope = 0;
    let ph = null;
    let nextPh = null;
    let coarticulationT = 0;

    for (let si = 0; si < syllables.length; si++) {
      const syl = syllables[si];
      const rel = ts - syl.start;
      if (rel < 0 || rel > syl.duration) continue;
      const atkEnd = syl.duration * 0.15;
      const relStart = syl.duration * 0.70;
      let env;
      if (rel < atkEnd) env = rel / atkEnd;                              // fast attack
      else if (rel < relStart) env = 1.0;                                // sustain
      else env = 1.0 - (rel - relStart) / (syl.duration - relStart);     // release
      env *= syl.peak;
      if (env > envelope) {
        envelope = env;
        ph = syl.phoneme;
        // Coarticulation: blend towards next syllable's phoneme during release
        if (si + 1 < syllables.length && rel > relStart) {
          nextPh = syllables[si + 1].phoneme;
          coarticulationT = (rel - relStart) / (syl.duration - relStart) * 0.35; // up to 35% blend
        }
      }
    }
    if (!ph) ph = { jaw: 0, funnel: 0, smile: 0, pucker: 0, stretch: 0, cheekSq: 0, noseSnr: 0, rollLo: 0, close: 0, press: 0, shrugLo: 0, tongueOut: 0 };

    // Coarticulate: blend current phoneme toward next
    if (nextPh && coarticulationT > 0) {
      const ct = coarticulationT;
      ph = {
        jaw:       ph.jaw       * (1 - ct) + nextPh.jaw       * ct,
        funnel:    ph.funnel    * (1 - ct) + nextPh.funnel    * ct,
        smile:     ph.smile     * (1 - ct) + nextPh.smile     * ct,
        pucker:    ph.pucker    * (1 - ct) + nextPh.pucker    * ct,
        stretch:   ph.stretch   * (1 - ct) + nextPh.stretch   * ct,
        cheekSq:   ph.cheekSq   * (1 - ct) + nextPh.cheekSq   * ct,
        noseSnr:   ph.noseSnr   * (1 - ct) + nextPh.noseSnr   * ct,
        rollLo:    ph.rollLo    * (1 - ct) + nextPh.rollLo    * ct,
        close:     ph.close     * (1 - ct) + nextPh.close     * ct,
        press:     ph.press     * (1 - ct) + nextPh.press     * ct,
        shrugLo:   ph.shrugLo   * (1 - ct) + nextPh.shrugLo   * ct,
        tongueOut: ph.tongueOut * (1 - ct) + nextPh.tongueOut * ct,
      };
    }

    // Organic noise (layered incommensurate sine)
    const n1 = Math.sin(ts * 0.0137) * 0.020;
    const n2 = Math.sin(ts * 0.0071 + 1.7) * 0.015;
    const n3 = Math.sin(ts * 0.0193 + 0.8) * 0.010;
    // Left/right asymmetry wobble
    const asym = 0.94 + Math.sin(ts * 0.0031) * 0.06;
    // Breathing: subtle idle jaw + nose movement
    const breathVal = Math.sin((ts / breathCycle) * Math.PI * 2 + breathPhase);
    const breathJaw = (breathVal * 0.5 + 0.5) * 0.02; // 0-0.02 range
    const breathNose = (breathVal * 0.5 + 0.5) * 0.03;

    const jaw       = ph.jaw     * envelope + n1 + breathJaw;
    const funnel    = ph.funnel  * envelope;
    const smile     = ph.smile   * envelope + n2;
    const pucker    = ph.pucker  * envelope;
    const stretch   = ph.stretch * envelope;
    const cheekSq   = ph.cheekSq * envelope + (envelope > 0.3 ? 0.04 : 0); // subtle engagement during speech
    const noseSnr   = ph.noseSnr * envelope + breathNose * (1 - envelope);
    const rollLo    = ph.rollLo  * envelope;
    const mClose    = ph.close   * envelope;
    const press     = ph.press   * envelope;
    const shrugLo   = ph.shrugLo * envelope;
    const tongueOut = ph.tongueOut * envelope;
    // Brow raise correlates with stress
    const browUp    = envelope > 0.5 ? (envelope - 0.5) * 0.12 : 0;
    // Subtle brow micro-movement for liveliness
    const browMicro = Math.sin(ts * 0.0043 + 2.1) * 0.015;
    // Eye squint engagement during speech (muscles around eyes engage)
    const eyeSq     = envelope > 0.3 ? (envelope - 0.3) * 0.08 : 0;

    frames.push({
      timestamp: Math.round(ts),
      blendshapes: {
        jawOpen:              clamp(jaw),
        mouthLowerDownLeft:   clamp(jaw * 0.80 * asym),
        mouthLowerDownRight:  clamp(jaw * 0.80 / asym),
        mouthUpperUpLeft:     clamp(jaw * 0.40 * asym),
        mouthUpperUpRight:    clamp(jaw * 0.40 / asym),
        mouthSmileLeft:       clamp(smile * asym),
        mouthSmileRight:      clamp(smile / asym),
        mouthFunnel:          clamp(funnel),
        mouthPucker:          clamp(pucker),
        mouthStretchLeft:     clamp(stretch * asym),
        mouthStretchRight:    clamp(stretch / asym),
        mouthRollLower:       clamp(rollLo),
        mouthRollUpper:       clamp(rollLo * 0.3),
        mouthClose:           clamp(mClose),
        mouthPressLeft:       clamp(press * asym),
        mouthPressRight:      clamp(press / asym),
        mouthShrugLower:      clamp(shrugLo),
        mouthShrugUpper:      clamp(shrugLo * 0.4),
        mouthFrownLeft:       clamp((1 - envelope) * 0.03),
        mouthFrownRight:      clamp((1 - envelope) * 0.03),
        tongueOut:            clamp(tongueOut),
        cheekSquintLeft:      clamp(cheekSq * asym),
        cheekSquintRight:     clamp(cheekSq / asym),
        noseSneerLeft:        clamp(noseSnr * asym),
        noseSneerRight:       clamp(noseSnr / asym),
        eyeSquintLeft:        clamp(eyeSq),
        eyeSquintRight:       clamp(eyeSq),
        browInnerUp:          clamp(browUp + browMicro),
        browOuterUpLeft:      clamp(browUp * 0.6 + browMicro * 0.4 + n3),
        browOuterUpRight:     clamp(browUp * 0.6 + browMicro * 0.4 - n3),
        // Visemes for fallback pipeline
        viseme_aa: clamp(jaw > 0.30 ? envelope * 0.6 : 0),
        viseme_O:  clamp(funnel > 0.20 ? envelope * 0.5 : 0),
        viseme_FF: clamp(jaw < 0.10 && envelope > 0.2 ? envelope * 0.3 : 0),
        viseme_SS: clamp(jaw < 0.12 && stretch > 0.1 ? envelope * 0.25 : 0),
        viseme_PP: clamp(mClose > 0.3 ? envelope * 0.4 : 0),
        viseme_TH: clamp(tongueOut > 0.05 ? envelope * 0.3 : 0),
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
