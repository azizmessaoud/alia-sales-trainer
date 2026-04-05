/**
 * ALIA 2.0 - RAG Pipeline (Retrieval-Augmented Generation)
 * Uses Ollama for local embeddings + Groq for fast generation
 * 
 * Flow:
 * 1. Generate embedding from query (Ollama)
 * 2. Retrieve relevant memories from pgvector
 * 3. Retrieve rep profile
 * 4. Build augmented prompt
 * 5. Generate response (Groq)
 */

import {
  supabase,
  generateEmbedding,
  generateText,
  type EmbeddingResponse,
  type LLMResponse,
} from './providers';

// =====================================================
// Types
// =====================================================

export interface MemorySearchResult {
  memory_id: string;
  memory_text: string;
  similarity: number;
  session_date: string;
  learning_summary: {
    strengths: string[];
    struggles: string[];
    recommended_focus: string;
  };
}

export interface RepProfile {
  id: string;
  rep_id: string;
  personality_type: string;
  learning_style: string;
  communication_pace: string;
  confidence_trajectory: number[];
  total_sessions: number;
  avg_accuracy: number;
  avg_compliance_score: number;
  weak_topics: string[];
  strong_topics: string[];
  avatar_adaptation_rules: {
    speak_pace?: string;
    interruption_threshold?: string;
    feedback_style?: string;
    complexity_progression?: string;
  };
}

export interface RAGContext {
  query: string;
  rep_id: string;
  memories: MemorySearchResult[];
  profile: RepProfile | null;
  generation: LLMResponse;
}

export interface RAGConfig {
  memoryThreshold: number;
  memoryLimit: number;
  includeProfile: boolean;
  temperature: number;
  maxTokens: number;
}

const defaultConfig: RAGConfig = {
  memoryThreshold: 0.55,
  memoryLimit: 3,
  includeProfile: true,
  temperature: 0.7,
  maxTokens: 1024,
};

// =====================================================
// Memory Retrieval
// =====================================================

/**
 * Retrieve relevant episode memories via semantic search
 */
export async function retrieveMemories(
  rep_id: string,
  query: string,
  config: Partial<RAGConfig> = {}
): Promise<MemorySearchResult[]> {
  const cfg = { ...defaultConfig, ...config };
  
  // Generate query embedding
  const { embedding }: EmbeddingResponse = await generateEmbedding(query, { prefixType: 'query' });
  
  // Search in pgvector
  const { data, error } = await supabase.rpc('search_episode_memories', {
    p_rep_id: rep_id,
    p_query_embedding: embedding,
    p_similarity_threshold: cfg.memoryThreshold,
    p_limit: cfg.memoryLimit,
  });
  
  if (error) {
    console.error('Error searching memories:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Retrieve consolidated (weekly) memories for broader context
 */
export async function retrieveConsolidatedMemories(
  rep_id: string,
  query: string,
  limit = 3
): Promise<any[]> {
  const { embedding } = await generateEmbedding(query, { prefixType: 'query' });
  
  const { data, error } = await supabase.rpc('search_consolidated_memories', {
    p_rep_id: rep_id,
    p_query_embedding: embedding,
    p_similarity_threshold: 0.65,
    p_limit: limit,
  });
  
  if (error) {
    console.error('Error searching consolidated memories:', error);
    return [];
  }
  
  return data || [];
}

// =====================================================
// Profile Retrieval
// =====================================================

/**
 * Retrieve rep profile for personalization
 */
export async function retrieveRepProfile(rep_id: string): Promise<RepProfile | null> {
  const { data, error } = await supabase
    .from('rep_profiles')
    .select('*')
    .eq('rep_id', rep_id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // No profile yet
    }
    console.error('Error fetching rep profile:', error);
    return null;
  }
  
  return data;
}

// =====================================================
// Prompt Augmentation
// =====================================================

/**
 * Build augmented prompt with retrieved context
 */
export function buildAugmentedPrompt(
  query: string,
  memories: MemorySearchResult[],
  profile: RepProfile | null
): string {
  let context = `You are ALIA, an AI medical sales training assistant.`;
  
  // Add profile context if available
  if (profile) {
    context += `\n\n## Rep Profile:
- Personality: ${profile.personality_type || 'unknown'}
- Learning Style: ${profile.learning_style || 'unknown'}
- Communication Pace: ${profile.communication_pace || 'moderate'}
- Total Sessions: ${profile.total_sessions}
- Avg Accuracy: ${((profile.avg_accuracy || 0) * 100).toFixed(1)}%
- Strong Topics: ${profile.strong_topics?.join(', ') || 'none yet'}
- Weak Topics: ${profile.weak_topics?.join(', ') || 'none yet'}`;

    // Add avatar adaptation rules
    if (profile.avatar_adaptation_rules) {
      const rules = profile.avatar_adaptation_rules;
      context += `\n- Adapt your teaching style: ${rules.feedback_style || 'balanced'}, 
  pace: ${rules.speak_pace || 'moderate'}, 
  complexity: ${rules.complexity_progression || 'gradual'}`;
    }
  }
  
  // Add relevant memories
  if (memories.length > 0) {
    context += `\n\n## Relevant Past Sessions:`;
    
    memories.forEach((memory, i) => {
      const date = new Date(memory.session_date).toLocaleDateString();
      const summary = memory.learning_summary;
      
      context += `\n\n### Session ${i + 1} (${date}) - Similarity: ${(memory.similarity * 100).toFixed(0)}%
${memory.memory_text.slice(0, 300)}...

Strengths: ${summary?.strengths?.join(', ') || 'N/A'}
Struggles: ${summary?.struggles?.join(', ') || 'N/A'}
Focus: ${summary?.recommended_focus || 'N/A'}`;
    });
  }
  
  context += `\n\n## Current Question:
${query}

## Guidelines:
1. Reference relevant past sessions when helpful
2. Adapt your teaching style to the rep's learning style
3. Be encouraging but honest about areas needing improvement
4. Keep responses focused and actionable
5. If discussing products, ensure compliance with FDA guidelines

Provide a helpful, educational response:`;
  
  return context;
}

// =====================================================
// Full RAG Pipeline
// =====================================================

/**
 * Execute full RAG pipeline: retrieve → augment → generate
 */
export async function executeRAG(
  rep_id: string,
  query: string,
  config: Partial<RAGConfig> = {}
): Promise<RAGContext> {
  const startTime = Date.now();
  const cfg = { ...defaultConfig, ...config };
  
  console.log(`[RAG] Processing query for rep ${rep_id}: "${query.slice(0, 50)}..."`);
  
  // Step 1: Retrieve memories
  const memories = await retrieveMemories(rep_id, query, cfg);
  console.log(`[RAG] Retrieved ${memories.length} memories`);
  
  // Step 2: Retrieve profile
  let profile: RepProfile | null = null;
  if (cfg.includeProfile) {
    profile = await retrieveRepProfile(rep_id);
    console.log(`[RAG] Profile: ${profile ? 'found' : 'not found'}`);
  }
  
  // Step 3: Build augmented prompt
  const augmentedPrompt = buildAugmentedPrompt(query, memories, profile);
  
  // Step 4: Generate response
  const generation = await generateText(augmentedPrompt, {
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
  });
  
  const elapsed = Date.now() - startTime;
  console.log(`[RAG] Complete in ${elapsed}ms (provider: ${generation.provider})`);
  
  return {
    query,
    rep_id,
    memories,
    profile,
    generation,
  };
}

// =====================================================
// Store Episode Memory
// =====================================================

/**
 * Store a new episode memory after a training session
 */
export async function storeEpisodeMemory(params: {
  rep_id: string;
  session_id: string;
  episode_text: string;
  accuracy: number;
  compliance: number;
  confidence: number;
  salience_score?: number;
}): Promise<{ success: boolean; memory_id?: string; error?: string }> {
  try {
    // Generate embedding
    const { embedding } = await generateEmbedding(params.episode_text, { prefixType: 'passage' });
    
    // Extract learning summary with LLM
    const summaryPrompt = `Analyze this medical sales training session and provide JSON:
    
Session:
${params.episode_text.slice(0, 2000)}

Provide:
{
  "strengths": ["specific strength 1", "specific strength 2"],
  "struggles": ["specific struggle 1"],
  "recommended_focus": "one concise focus area"
}`;

    const summaryResult = await generateText(summaryPrompt, {
      temperature: 0.3,
      maxTokens: 256,
    });
    
    // Parse JSON from response
    let learning_summary;
    try {
      const jsonMatch = summaryResult.text.match(/\{[\s\S]*\}/);
      learning_summary = JSON.parse(jsonMatch ? jsonMatch[0] : summaryResult.text);
    } catch {
      learning_summary = {
        strengths: ['Completed session'],
        struggles: [],
        recommended_focus: 'Continue practicing',
      };
    }
    
    // Store in database
    const { data, error } = await supabase
      .from('episode_memories')
      .insert({
        rep_id: params.rep_id,
        session_id: params.session_id,
        episode_text: params.episode_text,
        episode_embedding: embedding,
        learning_summary,
        accuracy: params.accuracy,
        compliance: params.compliance,
        confidence: params.confidence,
        salience_score: params.salience_score || 0.5,
        session_date: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    return { success: true, memory_id: data.id };
  } catch (error: any) {
    console.error('Error storing episode:', error);
    return { success: false, error: error.message };
  }
}

// =====================================================
// Export
// =====================================================

export const RAGPipeline = {
  retrieveMemories,
  retrieveConsolidatedMemories,
  retrieveRepProfile,
  buildAugmentedPrompt,
  executeRAG,
  storeEpisodeMemory,
};
