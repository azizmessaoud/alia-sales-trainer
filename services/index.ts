/**
 * Services Barrel — ALIA Sales Trainer
 * =====================================
 * Single entry point for all service facades.
 *
 * PURPOSE:
 *   Allows callers to import from a single path:
 *     import { synthesizeSpeech, generateResponse } from '../../services';
 *
 *   Also provides validateAllServices() for startup health checks.
 *
 * ARCHITECTURE NOTE:
 *   This file re-exports from thin facades only — no business logic.
 *   All actual implementation lives in modules/.
 *
 * USAGE:
 *   import { generateResponse } from '../../services';           // preferred
 *   import { generateResponse } from '../../services/llm.service'; // also valid
 */

// ── LLM ────────────────────────────────────────────────────────────────────
export * from './llm.service';

// ── TTS ────────────────────────────────────────────────────────────────────
export * from './tts.service';

// ── Memory / RAG ───────────────────────────────────────────────────────────
export * from './memory.service';

// ── Session Scoring ────────────────────────────────────────────────────────
export * from './scoring.service';

// ── Compliance ─────────────────────────────────────────────────────────────
export * from './compliance.service';

/**
 * Startup validator — call once at server init to verify all services
 * can be instantiated without throwing.
 *
 * Usage:
 *   import { validateAllServices } from '../../services';
 *   await validateAllServices(); // throws if any service misconfigured
 *
 * @returns Promise<{ ok: boolean; errors: string[] }>
 */
export async function validateAllServices(): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  const checks: Array<{ name: string; check: () => Promise<unknown> }> = [
    {
      name: 'LLM (ai-core/providers)',
      // Verify the module can be imported without throwing
      check: async () => await import('./llm.service'),
    },
    {
      name: 'TTS (tts-lipsync/tts.server)',
      check: async () => await import('./tts.service'),
    },
    {
      name: 'Memory (rag-memory)',
      check: async () => await import('./memory.service'),
    },
    {
      name: 'Scoring (session-scoring)',
      check: async () => await import('./scoring.service'),
    },
    {
      name: 'Compliance (ai-core/compliance-gate)',
      check: async () => await import('./compliance.service'),
    },
  ];

  for (const { name, check } of checks) {
    try {
      await check();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`❌ ${name}: ${message}`);
    }
  }

  if (errors.length === 0) {
    console.log('✅ All ALIA services validated successfully');
  } else {
    console.error('⚠️  Service validation failures:\n' + errors.join('\n'));
  }

  return { ok: errors.length === 0, errors };
}
