/**
 * RAG Memory Module Public API
 * Exports stable contract for memory storage and retrieval
 */

export {
  MemoryOS,
  type RepProfile,
} from './memory-os.server';

export { RAGPipeline } from './rag-pipeline.server';

// Re-export types for type safety
export type { Episode, MemoryContext } from './memory-os.server';

// Convenience functions
export async function storeEpisode(episode: any) {
  return MemoryOS.storeEpisode(episode);
}

export async function retrieveContext(
  query: string,
  repId: string,
  limit: number = 5
) {
  return MemoryOS.retrieveEpisodeMemories({
    rep_id: repId,
    query,
    limit,
  });
}

export async function getRepProfile(repId: string) {
  return MemoryOS.getRepProfile(repId);
}

export async function generateEmbedding(text: string) {
  return RAGPipeline.generateEmbedding(text);
}
