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

// Re-export all public LLM provider functions and types
export {
  generateResponse,
  streamResponse,
  getAvailableModels,
} from '../modules/ai-core/providers';

export type {
  LLMProvider,
  LLMResponse,
  LLMStreamChunk,
} from '../modules/ai-core/providers';
