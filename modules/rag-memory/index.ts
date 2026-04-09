/**
 * RAG Memory Module Public API
 * Exports stable contract for memory storage and retrieval
 */

import { MemoryOS } from './memory-os.server';
import { RAGPipeline } from './rag-pipeline.server';

export {
  MemoryOS,
  type RepProfile,
  type EpisodeMemory,
  type ConsolidatedMemory,
  type MemorySearchResult,
  generateEmbedding,
} from './memory-os.server';

export { RAGPipeline } from './rag-pipeline.server';

// Convenience functions
export async function storeEpisode(episode: any) {
  return MemoryOS.storeEpisodeMemory(episode);
}

export async function retrieveContext(
  query: string,
  repId: string,
  limit: number = 5
) {
  return RAGPipeline.retrieveMemories(repId, query);
}

export async function getRepProfile(repId: string) {
  return MemoryOS.getRepProfile(repId);
}

