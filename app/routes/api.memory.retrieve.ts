/**
 * API Route: Retrieve Episode Memories
 * POST /api/memory/retrieve
 */

import { json, type ActionFunctionArgs } from '@remix-run/node';
import { MemoryOS } from '~/rag-memory/memory-os.server';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { rep_id, query, threshold, limit } = body;

    // Validation
    if (!rep_id || !query) {
      return json(
        { error: 'Missing required fields: rep_id, query' },
        { status: 400 }
      );
    }

    // Retrieve memories
    const memories = await MemoryOS.retrieveEpisodeMemories({
      rep_id,
      query,
      threshold,
      limit,
    });

    return json({
      success: true,
      count: memories.length,
      memories,
    });
  } catch (error: any) {
    console.error('Error in retrieve API:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
