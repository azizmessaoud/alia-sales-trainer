/**
 * Unified LLM service facade.
 * Thin wrapper over modules/ai-core/providers.ts
 * Abstracts NVIDIA NIM, Groq, OpenRouter; handles selection and fallback.
 *
 * Modules may import: const { generateText } = await import('../../services/llm.service.js');
 */

import {
  supabase,
  generateText as generateTextImpl,
  generateEmbedding as generateEmbeddingImpl,
  checkHealth as checkHealthImpl,
  config,
} from '../modules/ai-core/providers.ts';

export { supabase };

/**
 * Generate LLM response with provider selection and fallback.
 * Mirrors modules/ai-core/providers.ts signature and return shape.
 * @param {string} prompt - Prompt text
 * @param {Object} options - Generation options
 * @returns {Promise<{text: string, elapsed_ms: number, provider: 'nvidia'|'groq'|'ollama'}>}
 */
export async function generateText(prompt, options = {}) {
  return generateTextImpl(prompt, options);
}

/**
 * Generate embedding for text (vector retrieval, semantic search).
 * Mirrors modules/ai-core/providers.ts signature and return shape.
 * @param {string} text - Text to embed
 * @param {Object} options - Embedding options
 * @returns {Promise<{embedding: number[], elapsed_ms: number, provider: 'huggingface'|'nvidia'|'ollama'}>}
 */
export async function generateEmbedding(text, options = {}) {
  const result = await generateEmbeddingImpl(text, options);
  // Assert 768-dim as per ALIA spec (warn only; do not mutate behavior)
  if (Array.isArray(result?.embedding) && result.embedding.length !== 768) {
    console.warn(`⚠️  Embedding dimension mismatch: expected 768, got ${result.embedding.length}`);
  }
  return result;
}

/**
 * Health check for active LLM provider.
 * @returns {Promise<Object>} - { healthy: boolean, provider: string, message: string }
 */
export async function checkHealth() {
  return checkHealthImpl();
}

/**
 * Get the active provider name.
 * @returns {string} - 'nvidia' | 'groq' | 'openrouter' | 'unknown'
 */
export function getActiveProvider() {
  return config.llm?.provider || 'unknown';
}

export default {
  generateText,
  generateEmbedding,
  checkHealth,
  getActiveProvider
};
