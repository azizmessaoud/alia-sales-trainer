/**
 * API Route: Get Rep Profile
 * GET /api/memory/profile/:rep_id
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { MemoryOS } from '~/lib/memory-os.server';

export async function loader({ params }: LoaderFunctionArgs) {
  const { rep_id } = params;

  if (!rep_id) {
    return json({ error: 'Missing rep_id parameter' }, { status: 400 });
  }

  try {
    // Get profile
    const profile = await MemoryOS.getRepProfile(rep_id);

    if (!profile) {
      return json(
        { 
          error: 'Profile not found',
          message: 'No profile exists. Complete a training session to create one.'
        },
        { status: 404 }
      );
    }

    // Analyze progress
    const analysis = await MemoryOS.analyzeRepProgress(rep_id);

    return json({
      success: true,
      profile,
      analysis,
    });
  } catch (error: any) {
    console.error('Error in profile API:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
