/**
 * ALIA 2.0 - Competency Level Management Server
 * Handles competency level tracking, progression, and recommendations
 */

import { createClient } from '@supabase/supabase-js';

// =====================================================
// TYPES
// =====================================================

export interface CompetencyLevel {
  id: number;
  level_code: string;
  level_name_fr: string;
  level_name_en: string;
  level_number: number;
  description: string;
  profile_general: string;
  key_skills: string[];
  knowledge_scope: string;
  structure_compliance_percent: number;
  average_score: number;
  engagement_rate_percent: number;
  objection_handling_percent: number;
  crm_completeness_percent: number;
  profile_adaptation_percent: number;
  follow_up_quality_percent: number;
  coaching_quality_score: number;
  progression_threshold_score: number;
  progression_sessions_required: number;
  progression_kpis_required: Record<string, number>;
  can_handle_difficult_visits: boolean;
  can_act_as_coach: boolean;
  can_read_studies: boolean;
  is_active: boolean;
}

export interface LevelProgressionRule {
  id: number;
  from_level_code: string;
  to_level_code: string;
  required_score: number;
  required_sessions: number;
  required_kpis: Record<string, number>;
  description: string;
  is_active: boolean;
}

export interface LevelPerformance {
  id: string;
  rep_id: string;
  session_id: string;
  level_code: string;
  score: number;
  structure_compliance: number;
  engagement_rate: number;
  objection_handling: number;
  crm_completeness: number;
  profile_adaptation: number;
  follow_up_quality: number;
  completed_at: string;
}

export interface LevelRecommendation {
  id: string;
  rep_id: string;
  current_level_code: string;
  recommended_level_code: string;
  recommendation_reason: string;
  focus_areas: string[];
  next_steps: string;
  is_active: boolean;
  created_at: string;
}

export interface LevelDeterminationResult {
  current_level_code: string;
  current_level_number: number;
  next_level_code: string;
  next_level_number: number;
  can_progress: boolean;
  reason: string;
}

export interface LevelMetrics {
  score: number;
  structure_compliance: number;
  engagement_rate: number;
  objection_handling: number;
  crm_completeness: number;
  profile_adaptation: number;
  follow_up_quality: number;
}

// =====================================================
// DATABASE CLIENT
// =====================================================

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const competencyLevelDB = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// =====================================================
// LEVEL MANAGEMENT
// =====================================================

/**
 * Get all competency levels
 */
export async function getAllLevels(): Promise<CompetencyLevel[]> {
  const { data, error } = await competencyLevelDB
    .from('competency_levels')
    .select('*')
    .eq('is_active', true)
    .order('level_number');

  if (error) {
    console.error('Error fetching levels:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a specific competency level by code
 */
export async function getLevelByCode(levelCode: string): Promise<CompetencyLevel | null> {
  const { data, error } = await competencyLevelDB
    .from('competency_levels')
    .select('*')
    .eq('level_code', levelCode)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') { // Not found is OK
    console.error('Error fetching level:', error);
    throw error;
  }

  return data;
}

/**
 * Get current level for a representative
 */
export async function getCurrentLevel(repId: string): Promise<CompetencyLevel | null> {
  const { data, error } = await competencyLevelDB
    .from('rep_profiles')
    .select('competency_level_code, competency_level_number')
    .eq('rep_id', repId)
    .single();

  if (error) {
    console.error('Error fetching current level:', error);
    return null;
  }

  return getLevelByCode(data.competency_level_code);
}

// =====================================================
// PROGRESSION LOGIC
// =====================================================

/**
 * Determine next level based on performance metrics
 */
export async function determineNextLevel(
  repId: string,
  metrics: LevelMetrics
): Promise<LevelDeterminationResult> {
  // Get current level
  const currentLevel = await getCurrentLevel(repId);

  if (!currentLevel) {
    // New rep starts at BEGINNER
    return {
      current_level_code: 'BEGINNER',
      current_level_number: 1,
      next_level_code: 'BEGINNER',
      next_level_number: 1,
      can_progress: false,
      reason: 'No previous level found, starting at BEGINNER',
    };
  }

  // Determine next level based on current level
  let nextLevelCode: string;
  let nextLevelNumber: number;

  switch (currentLevel.level_number) {
    case 1:
      nextLevelCode = 'JUNIOR';
      nextLevelNumber = 2;
      break;
    case 2:
      nextLevelCode = 'CONFIRMED';
      nextLevelNumber = 3;
      break;
    case 3:
      nextLevelCode = 'EXPERT';
      nextLevelNumber = 4;
      break;
    default:
      nextLevelCode = currentLevel.level_code;
      nextLevelNumber = currentLevel.level_number;
  }

  // Get next level requirements
  const nextLevel = await getLevelByCode(nextLevelCode);

  if (!nextLevel) {
    return {
      current_level_code: currentLevel.level_code,
      current_level_number: currentLevel.level_number,
      next_level_code: currentLevel.level_code,
      next_level_number: currentLevel.level_number,
      can_progress: false,
      reason: 'Next level not found',
    };
  }

  // Check if progression criteria are met
  const canProgress = (
    metrics.score >= nextLevel.progression_threshold_score &&
    metrics.structure_compliance >= (nextLevel.structure_compliance_percent / 100) &&
    metrics.engagement_rate >= (nextLevel.engagement_rate_percent / 100)
  );

  const reason = canProgress
    ? `Score ${metrics.score}/10 meets threshold of ${nextLevel.progression_threshold_score}/10`
    : `Score ${metrics.score}/10. Requires ${nextLevel.progression_threshold_score}/10 and higher compliance rates`;

  return {
    current_level_code: currentLevel.level_code,
    current_level_number: currentLevel.level_number,
    next_level_code: nextLevelCode,
    next_level_number: nextLevelNumber,
    can_progress: canProgress,
    reason: reason,
  };
}

/**
 * Update rep level after session completion
 */
export async function updateRepLevel(
  repId: string,
  metrics: LevelMetrics,
  sessionId: string
): Promise<{ success: boolean; message: string; newLevel?: string }> {
  try {
    // Determine next level
    const result = await determineNextLevel(repId, metrics);

    if (!result.can_progress) {
      // Log performance without level change
      await logLevelPerformance(repId, sessionId, result.current_level_code, metrics);

      return {
        success: true,
        message: result.reason,
        newLevel: result.current_level_code,
      };
    }

    // Update rep profile
    const { error: updateError } = await competencyLevelDB
      .from('rep_profiles')
      .update({
        competency_level_code: result.next_level_code,
        competency_level_number: result.next_level_number,
        level_progress_timestamp: new Date().toISOString(),
        level_progress_reason: result.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('rep_id', repId);

    if (updateError) {
      console.error('Error updating rep level:', updateError);
      throw updateError;
    }

    // Log performance history
    await logLevelPerformance(
      repId,
      sessionId,
      result.current_level_code,
      metrics
    );

    return {
      success: true,
      message: `Progressed from ${result.current_level_code} to ${result.next_level_code}`,
      newLevel: result.next_level_code,
    };
  } catch (error) {
    console.error('Error updating rep level:', error);
    return {
      success: false,
      message: 'Failed to update rep level',
    };
  }
}

/**
 * Log level performance for a session
 */
async function logLevelPerformance(
  repId: string,
  sessionId: string,
  levelCode: string,
  metrics: LevelMetrics
): Promise<void> {
  const { error } = await competencyLevelDB.from('level_performance_history').insert({
    rep_id: repId,
    session_id: sessionId,
    level_code: levelCode,
    score: metrics.score,
    structure_compliance: metrics.structure_compliance,
    engagement_rate: metrics.engagement_rate,
    objection_handling: metrics.objection_handling,
    crm_completeness: metrics.crm_completeness,
    profile_adaptation: metrics.profile_adaptation,
    follow_up_quality: metrics.follow_up_quality,
  });

  if (error) {
    console.error('Error logging level performance:', error);
  }
}

// =====================================================
// RECOMMENDATIONS
// =====================================================

/**
 * Get recommendations for a rep based on their level
 */
export async function getLevelRecommendations(repId: string): Promise<LevelRecommendation[]> {
  const currentLevel = await getCurrentLevel(repId);

  if (!currentLevel) {
    return [];
  }

  const { data, error } = await competencyLevelDB
    .from('level_recommendations')
    .select('*')
    .eq('rep_id', repId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching recommendations:', error);
    return [];
  }

  return data || [];
}

/**
 * Create a recommendation for a rep
 */
export async function createLevelRecommendation(
  repId: string,
  currentLevelCode: string,
  recommendedLevelCode: string,
  reason: string,
  focusAreas: string[],
  nextSteps: string
): Promise<void> {
  const { error } = await competencyLevelDB.from('level_recommendations').insert({
    rep_id: repId,
    current_level_code: currentLevelCode,
    recommended_level_code: recommendedLevelCode,
    recommendation_reason: reason,
    focus_areas: focusAreas,
    next_steps: nextSteps,
  });

  if (error) {
    console.error('Error creating recommendation:', error);
    throw error;
  }
}

// =====================================================
// PERFORMANCE TRACKING
// =====================================================

/**
 * Get performance history for a rep
 */
export async function getLevelPerformanceHistory(
  repId: string,
  limit: number = 10
): Promise<LevelPerformance[]> {
  const { data, error } = await competencyLevelDB
    .from('level_performance_history')
    .select('*')
    .eq('rep_id', repId)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching performance history:', error);
    return [];
  }

  return data || [];
}

/**
 * Get average scores by level
 */
export async function getAverageScoresByLevel(repId: string): Promise<Record<string, number>> {
  const { data, error } = await competencyLevelDB
    .from('level_performance_history')
    .select('level_code, score')
    .eq('rep_id', repId);

  if (error) {
    console.error('Error fetching average scores:', error);
    return {};
  }

  const scoresByLevel: Record<string, number[]> = {};

  data.forEach((record) => {
    if (!scoresByLevel[record.level_code]) {
      scoresByLevel[record.level_code] = [];
    }
    scoresByLevel[record.level_code].push(record.score);
  });

  const averages: Record<string, number> = {};

  Object.keys(scoresByLevel).forEach((levelCode) => {
    const scores = scoresByLevel[levelCode];
    const sum = scores.reduce((a, b) => a + b, 0);
    averages[levelCode] = sum / scores.length;
  });

  return averages;
}

/**
 * Get progression progress for a rep
 */
export async function getProgressionProgress(repId: string): Promise<{
  currentLevel: string;
  currentLevelNumber: number;
  nextLevel: string;
  nextLevelNumber: number;
  progressPercentage: number;
  remainingSessions: number;
}> {
  const currentLevel = await getCurrentLevel(repId);

  if (!currentLevel) {
    return {
      currentLevel: 'BEGINNER',
      currentLevelNumber: 1,
      nextLevel: 'BEGINNER',
      nextLevelNumber: 1,
      progressPercentage: 0,
      remainingSessions: 0,
    };
  }

  // Determine next level
  let nextLevelCode: string;
  let nextLevelNumber: number;

  switch (currentLevel.level_number) {
    case 1:
      nextLevelCode = 'JUNIOR';
      nextLevelNumber = 2;
      break;
    case 2:
      nextLevelCode = 'CONFIRMED';
      nextLevelNumber = 3;
      break;
    case 3:
      nextLevelCode = 'EXPERT';
      nextLevelNumber = 4;
      break;
    default:
      nextLevelCode = currentLevel.level_code;
      nextLevelNumber = currentLevel.level_number;
  }

  // Get next level requirements
  const nextLevel = await getLevelByCode(nextLevelCode);

  if (!nextLevel) {
    return {
      currentLevel: currentLevel.level_code,
      currentLevelNumber: currentLevel.level_number,
      nextLevel: currentLevel.level_code,
      nextLevelNumber: currentLevel.level_number,
      progressPercentage: 100,
      remainingSessions: 0,
    };
  }

  // Count sessions completed for this level
  const performanceHistory = await getLevelPerformanceHistory(repId, 100);
  const sessionsForCurrentLevel = performanceHistory.filter(
    (p) => p.level_code === currentLevel.level_code
  ).length;

  // Progress percentage based on sessions completed vs. sessions required for next level
  const sessionsRequired = nextLevel.progression_sessions_required || 1;
  const progressPercentage = Math.min(
    100,
    Math.round((sessionsForCurrentLevel / sessionsRequired) * 100)
  );

  const remainingSessions = Math.max(
    0,
    nextLevel.progression_sessions_required - sessionsForCurrentLevel
  );

  return {
    currentLevel: currentLevel.level_code,
    currentLevelNumber: currentLevel.level_number,
    nextLevel: nextLevelCode,
    nextLevelNumber: nextLevelNumber,
    progressPercentage: progressPercentage,
    remainingSessions: remainingSessions,
  };
}

// =====================================================
// LEVEL-BASED SCENARIOS
// =====================================================

/**
 * Get scenarios appropriate for a rep's level
 */
export async function getLevelScenarios(
  levelCode: string,
  limit: number = 10
): Promise<any[]> {
  const { data, error } = await competencyLevelDB
    .from('level_scenarios')
    .select('*')
    .eq('level_code', levelCode)
    .eq('is_active', true)
    .order('expected_difficulty', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching level scenarios:', error);
    return [];
  }

  return data || [];
}

/**
 * Get recommended scenarios for a rep based on their level and performance
 */
export async function getRecommendedScenarios(repId: string, limit: number = 10): Promise<any[]> {
  const currentLevel = await getCurrentLevel(repId);

  if (!currentLevel) {
    return [];
  }

  // Get scenarios for current level
  const scenarios = await getLevelScenarios(currentLevel.level_code, limit);

  // Get performance history to identify weak areas
  const performanceHistory = await getLevelPerformanceHistory(repId, 20);

  // Simple recommendation: prioritize scenarios with lower scores
  if (performanceHistory.length > 0) {
    const scoresByScenario: Record<string, number[]> = {};

    performanceHistory.forEach((record) => {
      if (!scoresByScenario[record.session_id]) {
        scoresByScenario[record.session_id] = [];
      }
      scoresByScenario[record.session_id].push(record.score);
    });

    // Sort by average score (lower first)
    scenarios.sort((a, b) => {
      const avgScoreA = scoresByScenario[a.id]?.reduce((a, b) => a + b, 0) / (scoresByScenario[a.id]?.length || 1) || 0;
      const avgScoreB = scoresByScenario[b.id]?.reduce((a, b) => a + b, 0) / (scoresByScenario[b.id]?.length || 1) || 0;
      return avgScoreA - avgScoreB;
    });
  }

  return scenarios.slice(0, limit);
}
