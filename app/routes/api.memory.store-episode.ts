/**
 * API Route: Store Episode Memory
 * POST /api/memory/store-episode
 */

import { json, type ActionFunctionArgs } from '@remix-run/node';
import { MemoryOS } from '~/rag-memory/memory-os.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { rep_id, session_id, transcript, scores, feedback } = body;

    // Validation
    if (!rep_id || !session_id || !transcript || !scores) {
      return json(
        { error: 'Missing required fields: rep_id, session_id, transcript, scores' },
        { status: 400 }
      );
    }

    if (
      typeof scores.accuracy !== 'number' ||
      typeof scores.compliance !== 'number' ||
      typeof scores.confidence !== 'number'
    ) {
      return json(
        { error: 'Invalid scores format. Expected numbers for accuracy, compliance, confidence' },
        { status: 400 }
      );
    }

    // Store memory
    const result = await MemoryOS.storeEpisodeMemory({
      rep_id,
      session_id,
      transcript,
      scores,
      feedback,
    });

    if (!result.success) {
      return json({ error: result.error }, { status: 500 });
    }

    return json({
      success: true,
      memory_id: result.memory_id,
      message: 'Episode memory stored successfully',
    });
  } catch (error: any) {
    console.error('Error in store-episode API:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
