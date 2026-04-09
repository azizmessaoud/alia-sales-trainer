/**
 * LLM Service Facade
 * ==================
 * Thin re-export wrapper around modules/ai-core/providers.
 *
 * PURPOSE:
 *   Provides a stable import path for server-websocket.js, server-ollama.js,
 *   and any route that needs LLM access. If the underlying implementation moves
 *   or is refactored, only this file needs updating — callers remain unchanged.
 *
 * USAGE:
 *   import { generateResponse, streamResponse } from '../../services/llm.service';
 *
 * CONTRACT (DO NOT CHANGE SIGNATURES):
 *   generateResponse(prompt, options?) → Promise<LLMResponse>
 *   streamResponse(prompt, onChunk, options?) → Promise<void>
 *   getAvailableModels() → Promise<LLMProvider[]>
 *
 * CONSTRAINTS:
 *   - No business logic here — only re-exports
 *   - Must remain compatible with server-websocket.js import shapes
 *   - TypeScript strict: no `any`
 */

// ── Direct re-exports from providers.ts ────────────────────────────────────────
export {
  generateText,
  generateEmbedding,
  checkHealth,
  supabase,
  ollama,
  config,
} from '../modules/ai-core/providers';

export type { LLMResponse, EmbeddingResponse, HealthStatus } from '../modules/ai-core/providers';

// ── Compatibility aliases & shims for phantom types ────────────────────────────

// Alias: legacy callers expect generateResponse, but providers exports generateText
export { generateText as generateResponse };

// Type definitions for types that don't exist in providers.ts
export type LLMProvider = 'nvidia' | 'groq' | 'ollama';
export type LLMStreamChunk = { text: string; done: boolean };

// Shim: streamResponse doesn't exist in providers, provide a basic implementation
import { generateText } from '../modules/ai-core/providers';

export async function streamResponse(
  prompt: string,
  onChunk: (chunk: LLMStreamChunk) => void,
  options?: { temperature?: number; maxTokens?: number }
): Promise<void> {
  const result = await generateText(prompt, options);
  onChunk({ text: result.text, done: false });
  onChunk({ text: '', done: true });
}

// Shim: getAvailableModels doesn't exist in providers, provide a stub
export async function getAvailableModels(): Promise<LLMProvider[]> {
  return ['nvidia', 'groq', 'ollama'];
}
