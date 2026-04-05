/**
 * ALIA 2.0 - Memory OS (Layer 1)
 * TeleMem-inspired 3-tier memory hierarchy
 * 
 * Tier 1: Episode Memory (per-session storage with embeddings)
 * Tier 2: Consolidated Memory (weekly summaries)
 * Tier 3: Rep Profile (long-term archetype)
 */

import {
  supabase,
  generateEmbedding as providersGenerateEmbedding,
  generateText,
} from './providers.js';

// =====================================================
// Types
// =====================================================

export interface EpisodeMemory {
  id: string;
  rep_id: string;
  session_id: string;
  episode_text: string;
  episode_embedding: number[];
  learning_summary: {
    strengths: string[];
    struggles: string[];
    recommended_focus: string;
  };
  accuracy: number;
  compliance: number;
  confidence: number;
  salience_score: number;
  session_date: string;
}

export interface ConsolidatedMemory {
  id: string;
  rep_id: string;
  memory_narrative: string;
  memory_embedding: number[];
  week_start: string;
  week_end: string;
  sessions_count: number;
  avg_accuracy: number;
  avg_compliance: number;
  avg_confidence: number;
  confidence_trajectory: number[];
  recurring_struggles: string[];
  emerging_strengths: string[];
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

export interface MemorySearchResult {
  memory_id: string;
  memory_text: string;
  similarity: number;
  session_date: string;
  learning_summary: any;
}

// =====================================================
// Embedding Generation
// =====================================================

/**
 * Generate 384-dimensional embedding using HuggingFace (intfloat/multilingual-e5-small)
 * via providers abstraction layer. Supports EN/FR/AR/ES natively.
 */
export async function generateEmbedding(
  text: string,
  options: { prefixType?: 'query' | 'passage' | 'none' } = {}
): Promise<number[]> {
  const result = await providersGenerateEmbedding(text, options);
  return result.embedding;
}

// =====================================================
// Episode Memory Operations (Tier 1)
// =====================================================

/**
 * Store a new episode memory after a training session
 */
export async function storeEpisodeMemory(params: {
  rep_id: string;
  session_id: string;
  transcript: string;
  scores: {
    accuracy: number;
    compliance: number;
    confidence: number;
    clarity: number;
  };
  feedback?: string;
}): Promise<{ success: boolean; memory_id?: string; error?: string }> {
  try {
    const { rep_id, session_id, transcript, scores, feedback } = params;

    // 1. Generate episode narrative
    const episodeText = await generateEpisodeNarrative({
      transcript,
      scores,
      feedback,
    });

    // 2. Generate embedding
    const embedding = await generateEmbedding(episodeText, { prefixType: 'passage' });

    // 3. Extract learning summary using LLM
    const learningSummary = await extractLearningSummary(transcript, scores);

    // 4. Calculate salience score (higher for significant events)
    const salienceScore = calculateSalienceScore(scores);

    // 5. Insert into database
    const { data, error } = await supabase
      .from('episode_memories')
      .insert({
        rep_id,
        session_id,
        episode_text: episodeText,
        episode_embedding: embedding,
        learning_summary: learningSummary,
        accuracy: scores.accuracy,
        compliance: scores.compliance,
        confidence: scores.confidence,
        salience_score: salienceScore,
        session_date: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase error storing episode:', error);
      return { success: false, error: error.message };
    }

    // 6. Update rep profile
    await updateRepProfileAfterSession(rep_id, scores);

    return { success: true, memory_id: data.id };
  } catch (error: any) {
    console.error('Error storing episode memory:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieve relevant episode memories via semantic search
 */
export async function retrieveEpisodeMemories(params: {
  rep_id: string;
  query: string;
  language?: string;
  ragNamespace?: string;
  threshold?: number;
  limit?: number;
}): Promise<MemorySearchResult[]> {
  const {
    rep_id,
    query,
    threshold = parseFloat(process.env.MEMORY_SIMILARITY_THRESHOLD || '0.55'),
    limit = parseInt(process.env.MEMORY_MAX_RESULTS || '3'),
  } = params;

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query, { prefixType: 'query' });

    // Call Supabase RPC function
    const { data, error } = await supabase.rpc('search_episode_memories', {
      p_rep_id: rep_id,
      p_query_embedding: queryEmbedding,
      p_similarity_threshold: threshold,
      p_limit: limit,
    });

    if (error) {
      console.error('Error searching memories:', error);
      return [];
    }

    return (data || []).filter((memory: any) => (memory.salience_score ?? 0.5) >= 0.4);
  } catch (error) {
    console.error('Error retrieving episode memories:', error);
    return [];
  }
}

// =====================================================
// Rep Profile Operations (Tier 3)
// =====================================================

/**
 * Get rep profile with learning trajectory
 */
export async function getRepProfile(rep_id: string): Promise<RepProfile | null> {
  try {
    const { data, error } = await supabase
      .from('rep_profiles')
      .select('*')
      .eq('rep_id', rep_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No profile found, return null (will be created on first session)
        return null;
      }
      console.error('Error fetching rep profile:', error);
      return null;
    }

    return data as RepProfile;
  } catch (error) {
    console.error('Error getting rep profile:', error);
    return null;
  }
}

/**
 * Update rep profile after a training session
 */
async function updateRepProfileAfterSession(
  rep_id: string,
  scores: { accuracy: number; compliance: number; confidence: number; clarity: number }
): Promise<void> {
  try {
    // Call Supabase function to update profile
    const { error } = await supabase.rpc('update_rep_profile_after_session', {
      p_rep_id: rep_id,
      p_session_scores: scores,
    });

    if (error) {
      console.error('Error updating rep profile:', error);
    }
  } catch (error) {
    console.error('Error in updateRepProfileAfterSession:', error);
  }
}

/**
 * Analyze rep's learning trajectory and recommend next focus
 */
export async function analyzeRepProgress(rep_id: string): Promise<{
  trajectory_trend: 'improving' | 'stable' | 'declining';
  confidence_change: number;
  recommended_focus: string[];
  weak_areas: string[];
}> {
  const profile = await getRepProfile(rep_id);

  if (!profile || profile.confidence_trajectory.length < 2) {
    return {
      trajectory_trend: 'stable',
      confidence_change: 0,
      recommended_focus: ['Complete more sessions for analysis'],
      weak_areas: [],
    };
  }

  // Calculate trend from last 5 sessions
  const recentTrajectory = profile.confidence_trajectory.slice(-5);
  const firstScore = recentTrajectory[0];
  const lastScore = recentTrajectory[recentTrajectory.length - 1];
  const confidenceChange = lastScore - firstScore;

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (confidenceChange > 5) trend = 'improving';
  if (confidenceChange < -5) trend = 'declining';

  return {
    trajectory_trend: trend,
    confidence_change: confidenceChange,
    recommended_focus: profile.weak_topics || [],
    weak_areas: profile.weak_topics || [],
  };
}

// =====================================================
// LLM-Powered Analysis
// =====================================================

/**
 * Generate episode narrative from session data
 */
async function generateEpisodeNarrative(params: {
  transcript: string;
  scores: any;
  feedback?: string;
}): Promise<string> {
  const { transcript, scores, feedback } = params;

  // Create concise narrative (for embedding)
  const narrative = `Training Session Summary:
Performance: Accuracy ${scores.accuracy}%, Compliance ${scores.compliance}%, Confidence ${scores.confidence}%
Key moments: ${transcript.slice(0, 500)}...
${feedback ? `Feedback: ${feedback}` : ''}`;

  return narrative;
}

/**
 * Extract structured learning summary using LLM
 */
async function extractLearningSummary(
  transcript: string,
  scores: any
): Promise<{ strengths: string[]; struggles: string[]; recommended_focus: string }> {
  try {
    const prompt = `Analyze this medical sales training transcript and extract:
1. Strengths (what went well)
2. Struggles (what needs improvement)
3. Recommended focus for next session

Transcript: ${transcript.slice(0, 2000)}
Scores: Accuracy ${scores.accuracy}%, Compliance ${scores.compliance}%, Confidence ${scores.confidence}%

Return JSON format:
{
  "strengths": ["strength1", "strength2"],
  "struggles": ["struggle1", "struggle2"],
  "recommended_focus": "specific area to practice"
}`;

    const completion = await generateText(prompt, {
      temperature: 0.2,
      maxTokens: 500,
    });

    const result = JSON.parse(completion.text || '{}');
    return result;
  } catch (error) {
    console.error('Error extracting learning summary:', error);
    // Fallback to simple analysis
    return {
      strengths: scores.accuracy > 70 ? ['Good product knowledge'] : [],
      struggles: scores.compliance < 80 ? ['Compliance adherence'] : [],
      recommended_focus: 'Continue practicing core scenarios',
    };
  }
}

/**
 * Calculate salience score (importance) for memory retention
 */
function calculateSalienceScore(scores: {
  accuracy: number;
  compliance: number;
  confidence: number;
}): number {
  // Higher salience for:
  // - Very good or very poor performance (extremes)
  // - Compliance issues (critical)
  // - Significant confidence changes

  let salience = 0.5; // baseline

  // Extreme performance (memorable)
  if (scores.accuracy > 90 || scores.accuracy < 50) salience += 0.2;
  
  // Compliance issues (critical to remember)
  if (scores.compliance < 70) salience += 0.3;
  
  // High confidence (good example) or low (needs review)
  if (scores.confidence > 85 || scores.confidence < 60) salience += 0.15;

  return Math.min(salience, 1.0);
}

// =====================================================
// Consolidated Memory Operations (Tier 2)
// =====================================================

/**
 * Manually trigger weekly memory consolidation
 * (In production, this would be a cron job)
 */
export async function consolidateWeeklyMemories(
  rep_id: string,
  week_start: string,
  week_end: string
): Promise<{ success: boolean; consolidated_id?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('consolidate_weekly_memories', {
      p_rep_id: rep_id,
      p_week_start: week_start,
      p_week_end: week_end,
    });

    if (error) {
      console.error('Error consolidating memories:', error);
      return { success: false, error: error.message };
    }

    return { success: true, consolidated_id: data };
  } catch (error: any) {
    console.error('Error in consolidateWeeklyMemories:', error);
    return { success: false, error: error.message };
  }
}

// =====================================================
// Export all functions
// =====================================================

export const MemoryOS = {
  // Episode operations
  storeEpisodeMemory,
  retrieveEpisodeMemories,
  
  // Profile operations
  getRepProfile,
  analyzeRepProgress,
  
  // Consolidated operations
  consolidateWeeklyMemories,
  
  // Utilities
  generateEmbedding,
};
