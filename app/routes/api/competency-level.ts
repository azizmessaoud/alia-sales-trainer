/**
 * ALIA 2.0 - Competency Level API Routes
 * Single loader + action with ?type= dispatch so Remix wires them correctly.
 *
 * GET  /api/competency-level?rep_id=&type=current|progression|recommendations|performance|scenarios
 * POST /api/competency-level  body: { rep_id, session_id, metrics, type: 'determine'|'update' }
 */

import { json } from '@remix-run/node';
import {
  determineNextLevel,
  updateRepLevel,
  getLevelRecommendations,
  getLevelPerformanceHistory,
  getProgressionProgress,
  getRecommendedScenarios,
  getCurrentLevel,
  type LevelMetrics,
} from '~/lib/competency-level.server';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface LevelActionBody {
  type?: 'determine' | 'update';
  rep_id: string;
  session_id: string;
  metrics: LevelMetrics;
}

// =====================================================
// LOADER — handles all GET requests via ?type=
// =====================================================

export async function loader({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const repId = url.searchParams.get('rep_id');
    const type = url.searchParams.get('type') || 'current';

    if (!repId) {
      return json({ error: 'rep_id is required' }, { status: 400 });
    }

    switch (type) {
      case 'current': {
        const currentLevel = await getCurrentLevel(repId);
        if (!currentLevel) return json({ error: 'Rep not found' }, { status: 404 });
        return json({ currentLevel });
      }

      case 'progression': {
        const progress = await getProgressionProgress(repId);
        return json({ progress });
      }

      case 'recommendations': {
        const recommendations = await getLevelRecommendations(repId);
        return json({ recommendations });
      }

      case 'performance': {
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);
        const performanceHistory = await getLevelPerformanceHistory(repId, limit);
        return json({ performanceHistory });
      }

      case 'scenarios': {
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);
        const scenarios = await getRecommendedScenarios(repId, limit);
        return json({ scenarios });
      }

      default:
        return json(
          { error: `Unknown type: ${type}. Use current|progression|recommendations|performance|scenarios` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error in competency-level loader:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

// =====================================================
// ACTION — handles all POST requests via body.type
// =====================================================

export async function action({ request }: { request: Request }) {
  try {
    const body: LevelActionBody = await request.json();
    const type = body.type || 'determine';

    if (!body.rep_id || !body.session_id || !body.metrics) {
      return json({ error: 'rep_id, session_id, and metrics are required' }, { status: 400 });
    }

    switch (type) {
      case 'determine': {
        const result = await determineNextLevel(body.rep_id, body.metrics);
        return json({ result });
      }

      case 'update': {
        const result = await updateRepLevel(body.rep_id, body.metrics, body.session_id);
        return json(result);
      }

      default:
        return json({ error: `Unknown type: ${type}. Use determine|update` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in competency-level action:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
