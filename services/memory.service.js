/**
 * Unified memory service facade.
 * Thin wrapper over modules/rag-memory/rag-pipeline.server.ts
 * Handles RAG retrieval, episode storage, and profile management.
 *
 * Modules may import: const { retrieveMemories } = await import('../../services/memory.service.js');
 */

import {
  retrieveMemories as retrieveMemoriesImpl,
  retrieveConsolidatedMemories as retrieveConsolidatedMemoriesImpl,
  retrieveRepProfile as retrieveRepProfileImpl,
  buildAugmentedPrompt as buildAugmentedPromptImpl,
  executeRAG as executeRAGImpl,
  storeEpisodeMemory as storeEpisodeMemoryImpl
} from '../modules/rag-memory/rag-pipeline.server.ts';

/**
 * Retrieve relevant episode memories for a query.
 * @param {string} query - User query or context
 * @param {Object} options - Retrieval options
 * @param {number} options.limit - Max memories to return (default: 5)
 * @param {number} options.minSimilarity - Similarity threshold (0–1, default: 0.5)
 * @returns {Promise<Array<Object>>} - Relevant memories with { text, timestamp, similarity }
 */
export async function retrieveMemories(query, options = {}) {
  return retrieveMemoriesImpl(query, options);
}

/**
 * Retrieve consolidated memories (cached or newly calculated).
 * @param {string} repId - Rep profile ID
 * @returns {Promise<Array<Object>>} - Consolidated episode summaries
 */
export async function retrieveConsolidatedMemories(repId) {
  return retrieveConsolidatedMemoriesImpl(repId);
}

/**
 * Retrieve rep profile with competency state.
 * @param {string} repId - Rep profile ID
 * @returns {Promise<Object>} - { id, name, competencyLevel, learningStyle, ... }
 */
export async function retrieveRepProfile(repId) {
  return retrieveRepProfileImpl(repId);
}

/**
 * Build augmented prompt with RAG context.
 * @param {string} userMessage - User input
 * @param {Array<Object>} retrievedMemories - Memories from retrieveMemories()
 * @returns {Promise<string>} - Augmented system prompt for LLM
 */
export async function buildAugmentedPrompt(userMessage, retrievedMemories) {
  return buildAugmentedPromptImpl(userMessage, retrievedMemories);
}

/**
 * Execute full RAG pipeline: retrieve → augment → synthesize.
 * @param {string} query - User query
 * @param {string} repId - Rep profile ID (for profile context)
 * @returns {Promise<Object>} - { augmentedPrompt, sourceMemories, summary }
 */
export async function executeRAG(query, repId) {
  return executeRAGImpl(query, repId);
}

/**
 * Store a new episode memory.
 * @param {Object} episode - Episode data
 * @param {string} episode.repId - Rep profile ID
 * @param {string} episode.conversationId - Session ID
 * @param {string} episode.userInput - User message
 * @param {string} episode.aiResponse - AI response
 * @param {Object} episode.metadata - Additional context
 * @returns {Promise<void>}
 */
export async function storeEpisodeMemory(episode) {
  return storeEpisodeMemoryImpl(episode);
}

export default {
  retrieveMemories,
  retrieveConsolidatedMemories,
  retrieveRepProfile,
  buildAugmentedPrompt,
  executeRAG,
  storeEpisodeMemory
};
