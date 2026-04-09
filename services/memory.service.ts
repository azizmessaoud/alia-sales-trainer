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
 *   import { MemoryOS, RAGPipeline, getRepProfile } from '../../services/memory.service';
 *
 * CONTRACT (DO NOT CHANGE SIGNATURES):
 *   MemoryOS.retrieveEpisodeMemories() → Promise<Memory[]>
 *   MemoryOS.getRepProfile(repId: string) → Promise<RepProfile>
 *   RAGPipeline.buildAugmentedPrompt() → string
 *
 * CONSTRAINTS:
 *   - No business logic here — only re-exports
 *
 * ENVIRONMENT VARS REQUIRED (validated in module):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, OLLAMA_BASE_URL
 */

// Import for internal use
import { MemoryOS as _MemoryOS } from '../modules/rag-memory/memory-os.server';

// Re-export all public memory functions and types
export { MemoryOS, type RepProfile } from '../modules/rag-memory/memory-os.server';
export { RAGPipeline } from '../modules/rag-memory/rag-pipeline.server';

// Convenience export for getRepProfile
export async function getRepProfile(repId: string) {
  return _MemoryOS.getRepProfile(repId);
}
