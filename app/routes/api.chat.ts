/**
 * Chat API Route
 * Handles: LLM response → TTS → Audio2Face → Avatar animation
 * Uses new orchestration.server.ts for unified pipeline
 */

import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';
import { orchestrateConversation, stateToResponse } from '~/lib/orchestration.server';

interface ChatRequest {
  message: string;
  sessionId?: string;
}

interface ChatResponse {
  success: boolean;
  data?: {
    text: string;
    audio: string;
    blendshapes: Array<{
      timestamp: number;
      blendshapes: Record<string, number>;
    }>;
    duration: number;
    metadata: {
      llmTime: number;
      ttsTime: number;
      lipsyncTime: number;
      totalTime: number;
    };
  };
  error?: string;
}

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as ChatRequest;
    const { message, sessionId } = body;

    if (!message) {
      return json({ error: 'Message required' }, { status: 400 });
    }

    console.log(`\n=== [Chat API] New Request ===`);
    console.log(`Session: ${sessionId || 'anonymous'}`);
    console.log(`User: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`);

    // Execute complete orchestration pipeline
    const session = sessionId || crypto.randomUUID();
    const state = await orchestrateConversation(message, 'demo-rep', session);

    // Convert state to HTTP response
    const response = stateToResponse(state);

    return json(response);
  } catch (error) {
    console.error('\n❌ CHAT API ERROR:', error instanceof Error ? error.message : error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
};
