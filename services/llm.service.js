/**
 * Unified LLM service facade.
 * Thin wrapper over modules/ai-core/providers.ts
 * Abstracts NVIDIA NIM, Groq, OpenRouter; handles selection and fallback.
 *
 * Modules may import: const { generateText } = await import('../../services/llm.service.js');
 */

import { generateText as generateTextImpl, generateEmbedding as generateEmbeddingImpl, checkHealth as checkHealthImpl, config } from '../modules/ai-core/providers.ts';

/**
 * Generate LLM response with provider selection and fallback.
 * @param {Array<Object>} messages - Chat messages in OpenAI format
 * @param {Object} options - Generation options
 * @param {number} options.temperature - Creativity (0–2, default: 0.7)
 * @param {number} options.max_tokens - Max output tokens (default: 1024)
 * @param {string} options.system_prompt - System message override
 * @returns {Promise<string>} - Generated text response
 */
export async function generateText(messages, options = {}) {
  return generateTextImpl(messages, options);
}

/**
 * Generate embedding for text (vector retrieval, semantic search).
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} - Embedding vector (768-dim for nomic-embed-text)
 */
export async function generateEmbedding(text) {
  const embedding = await generateEmbeddingImpl(text);
  // Assert 768-dim as per ALIA spec
  if (embedding.length !== 768) {
    console.warn(`⚠️  Embedding dimension mismatch: expected 768, got ${embedding.length}`);
  }
  return embedding;
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
  return config.provider || 'unknown';
}

export default {
  generateText,
  generateEmbedding,
  checkHealth,
  getActiveProvider
};
