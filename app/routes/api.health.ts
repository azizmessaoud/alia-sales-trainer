/**
 * API Route: Health Check
 * GET /api/health
 */

import { json } from '@remix-run/node';

export async function loader() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {
      supabase: !!process.env.SUPABASE_URL,
      openai: !!process.env.OPENAI_API_KEY,
    },
    features: {
      memory_os: process.env.FEATURE_MEMORY_OS === 'true',
      multimodal: process.env.FEATURE_MULTIMODAL === 'true',
      compliance: process.env.FEATURE_COMPLIANCE === 'true',
      scenarios: process.env.FEATURE_SCENARIOS === 'true',
      orchestration: process.env.FEATURE_ORCHESTRATION === 'true',
      sdg_dashboard: process.env.FEATURE_SDG_DASHBOARD === 'true',
    },
  };

  return json(health);
}
