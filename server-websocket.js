/**
 * ALIA WebSocket Server (Node.js + ws)
 * Real-time communication for avatar responses, transcripts, and metrics
 * Port: 3001
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = process.env.WS_PORT || 3001;

// Session state storage
const sessions = new Map();
const clients = new Map();

const server = createServer();
const wss = new WebSocketServer({ server });

// Groq client for LLM
let groq;
try {
  const Groq = (await import('groq-sdk')).default;
  if (process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
} catch (e) {
  console.log('Groq SDK not available');
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  clients.set(ws, {});

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMessage(ws, message);
    } catch (error) {
      console.error('[WS] Error parsing message:', error);
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
    }
  });

  ws.on('close', () => {
    const clientState = clients.get(ws);
    if (clientState && clientState.session_id) {
      sessions.delete(clientState.session_id);
    }
    clients.delete(ws);
    console.log('[WS] Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });

  ws.send(JSON.stringify({ type: 'connected', payload: { message: 'Connected to ALIA WebSocket server' } }));
});

async function handleMessage(ws, message) {
  const clientState = clients.get(ws);

  switch (message.type) {
    case 'start_session':
      await handleStartSession(ws, message.payload);
      break;
    case 'end_session':
      await handleEndSession(ws, message.payload);
      break;
    case 'chat':
      await handleChat(ws, message.payload);
      break;
    case 'transcript':
      handleTranscript(ws, message.payload);
      break;
    case 'metrics':
      handleMetrics(ws, message.payload);
      break;
    case 'multimodal_metrics':
      handleMultimodalMetrics(ws, message.payload);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown message type: ${message.type}` } }));
  }
}

async function handleStartSession(ws, payload) {
  const { rep_id, session_id } = payload;

  const session = {
    rep_id,
    session_id,
    started_at: new Date(),
    transcript: [],
    messages: [],
    metrics: { accuracy: 0, compliance: 0, confidence: 0, clarity: 0 },
  };

  sessions.set(session_id, session);
  clients.set(ws, { session_id, rep_id });

  console.log(`[WS] Session started: ${session_id} for rep: ${rep_id}`);

  ws.send(JSON.stringify({
    type: 'session_started',
    payload: {
      session_id,
      rep_id,
      started_at: session.started_at,
    },
  }));
}

async function handleEndSession(ws, payload) {
  const { session_id } = payload;
  const session = sessions.get(session_id);

  if (!session) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Session not found' } }));
    return;
  }

  const clientState = clients.get(ws);
  if (clientState) {
    delete clientState.session_id;
  }
  sessions.delete(session_id);

  console.log(`[WS] Session ended: ${session_id}`);

  ws.send(JSON.stringify({
    type: 'session_ended',
    payload: {
      session_id,
      duration: Date.now() - session.started_at.getTime(),
      message_count: session.messages.length,
    },
  }));
}

async function handleChat(ws, payload) {
  const { session_id, message } = payload;
  const session = sessions.get(session_id);

  if (!session) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Session not found' } }));
    return;
  }

  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    timestamp: new Date(),
  };
  session.messages.push(userMessage);

  ws.send(JSON.stringify({
    type: 'message_received',
    payload: { message_id: userMessage.id },
  }));

  try {
    const { response, metrics, visemes } = await processWithOrchestration(session, message);

    const assistantMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      visemes,
    };
    session.messages.push(assistantMessage);

    ws.send(JSON.stringify({
      type: 'avatar_response',
      payload: {
        message_id: assistantMessage.id,
        content: response,
        visemes,
        metrics: session.metrics,
      },
    }));

    if (metrics) {
      session.metrics = { ...session.metrics, ...metrics };
    }
  } catch (error) {
    console.error('[WS] Error processing chat:', error);
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'Failed to process message' },
    }));
  }
}

async function processWithOrchestration(session, message) {
  // Try Groq first
  if (groq) {
    try {
      const systemPrompt = `You are ALIA (AI Learning & Interactive Assistant), an AI-powered medical sales training platform.
You help medical sales representatives practice their pitch, handle objections, and improve their compliance.
Remember the user's previous conversations and adapt your teaching style to their skill level.`;

      const messages = session.messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      });

      const responseContent = completion.choices[0]?.message?.content || '';

      return {
        response: responseContent,
        metrics: { accuracy: 75, compliance: 90, confidence: 70, clarity: 80 },
        visemes: generateVisemes(responseContent),
      };
    } catch (error) {
      console.warn('[WS] Groq failed, using fallback:', error.message);
    }
  }

  // Fallback response
  const fallbackResponses = [
    "That's a great question about medical sales. Let me help you with that.",
    "I understand you're practicing your pitch. Here's what I'd recommend...",
    "Good point! When handling objections, always remember to listen first.",
    "Let me share some insights on how to approach this scenario effectively.",
  ];

  const response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

  return {
    response: response,
    metrics: { accuracy: 75, compliance: 90, confidence: 70, clarity: 80 },
    visemes: generateVisemes(response),
  };
}

function generateVisemes(text) {
  const words = text.split(' ');
  const visemes = [];
  let time = 0;

  for (const word of words) {
    time += word.length * 0.05;
    visemes.push({
      time,
      viseme: 'sil',
    });
  }

  return visemes;
}

function handleTranscript(ws, payload) {
  const { session_id, transcript } = payload;
  const session = sessions.get(session_id);

  if (!session) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Session not found' } }));
    return;
  }

  session.transcript.push(transcript);

  ws.send(JSON.stringify({
    type: 'transcript_stored',
    payload: { transcript_length: session.transcript.length },
  }));
}

function handleMetrics(ws, payload) {
  const { session_id, metrics } = payload;
  const session = sessions.get(session_id);

  if (!session) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Session not found' } }));
    return;
  }

  session.metrics = { ...session.metrics, ...metrics };

  ws.send(JSON.stringify({
    type: 'metrics_updated',
    payload: session.metrics,
  }));
}

function handleMultimodalMetrics(ws, payload) {
  const { session_id, metrics } = payload;
  const session = sessions.get(session_id);

  if (!session) {
    return;
  }

  // Detect anomalies and send interventions
  const anomalies = detectAnomalies(metrics);

  if (anomalies.length > 0) {
    ws.send(JSON.stringify({
      type: 'anomaly_detected',
      payload: {
        anomalies,
        metrics,
      },
    }));
  }

  // Send intervention if needed
  const intervention = getIntervention(anomalies);
  if (intervention) {
    ws.send(JSON.stringify({
      type: 'intervention',
      payload: intervention,
    }));
  }
}

function detectAnomalies(metrics) {
  const anomalies = [];

  if (metrics.eyeContact < 50) {
    anomalies.push({ type: 'low_eye_contact', severity: 'warning', message: 'Eye contact below 50%' });
  }

  if (metrics.stress > 0.7) {
    anomalies.push({ type: 'high_stress', severity: 'warning', message: 'Stress level high' });
  }

  if (metrics.posture < 40) {
    anomalies.push({ type: 'poor_posture', severity: 'info', message: 'Posture needs improvement' });
  }

  if (metrics.wordsPerMinute > 180) {
    anomalies.push({ type: 'speaking_too_fast', severity: 'warning', message: 'Speaking too fast' });
  }

  return anomalies;
}

function getIntervention(anomalies) {
  for (const anomaly of anomalies) {
    switch (anomaly.type) {
      case 'high_stress':
        return { type: 'pause', message: 'Take a deep breath. High stress detected.' };
      case 'low_eye_contact':
        return { type: 'reminder', message: 'Remember to maintain eye contact with the camera.' };
      case 'poor_posture':
        return { type: 'reminder', message: 'Sit up straight for better presence.' };
      case 'speaking_too_fast':
        return { type: 'pace', message: 'Slow down a bit. Take your time.' };
    }
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`[WS] ALIA WebSocket server running on port ${PORT}`);
});

export { wss, sessions };
