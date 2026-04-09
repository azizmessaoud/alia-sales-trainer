/**
 * Memory / RAG Service Facade
 * ===========================
 * Thin re-export wrapper around modules/rag-memory/.
 *
 * PURPOSE:
 *   Provides a stable interface for episode storage, context retrieval,
 *   and rep profile management used by the ALIA orchestration pipeline.
 *
 * USAGE:
 *   import { storeEpisode, retrieveContext, getRepProfile } from '../../services/memory.service';
 *
 * CONTRACT (DO NOT CHANGE SIGNATURES):
 *   storeEpisode(episode: Episode) → Promise<void>
 *   retrieveContext(query: string, repId: string, topK?: number) → Promise<MemoryContext>
 *   getRepProfile(repId: string) → Promise<RepProfile>
 *   generateEmbedding(text: string) → Promise<number[]>
 *
 * CONSTRAINTS:
 *   - No business logic here — only re-exports
 *   - TypeScript strict: no `any`
 *
 * ENVIRONMENT VARS REQUIRED (validated in module):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, OLLAMA_BASE_URL
 */

// Re-export all public memory functions and types
export {
  storeEpisode,
  retrieveContext,
  getRepProfile,
  generateEmbedding,
} from '../modules/rag-memory/index';

export type {
  Episode,
  MemoryContext,
  RepProfile,
} from '../modules/rag-memory/index';
