/**
 * Unified scoring service facade.
 * Thin wrapper over modules/session-scoring/competency-level.server.ts
 * Tracks rep competency progression and provides recommendations.
 *
 * Modules may import: const { getCurrentLevel } = await import('../../services/scoring.service.js');
 */

import {
  getCurrentLevel as getCurrentLevelImpl,
  determineNextLevel as determineNextLevelImpl,
  updateRepLevel as updateRepLevelImpl,
  getLevelRecommendations as getLevelRecommendationsImpl,
  getLevelPerformanceHistory as getLevelPerformanceHistoryImpl,
  getProgressionProgress as getProgressionProgressImpl,
  getRecommendedScenarios as getRecommendedScenariosImpl
} from '../modules/session-scoring/competency-level.server.ts';

/**
 * Get current competency level for a rep.
 * @param {string} repId - Rep profile ID
 * @returns {Promise<Object>} - { level: number, score: number, lastUpdated: Date }
 */
export async function getCurrentLevel(repId) {
  return getCurrentLevelImpl(repId);
}

/**
 * Determine recommended next level based on performance.
 * @param {string} repId - Rep profile ID
 * @param {Array<Object>} sessionMetrics - Performance data from session
 * @returns {Promise<Object>} - { nextLevel: number, reason: string, confidence: number }
 */
export async function determineNextLevel(repId, sessionMetrics) {
  return determineNextLevelImpl(repId, sessionMetrics);
}

/**
 * Update rep's competency level in database.
 * @param {string} repId - Rep profile ID
 * @param {number} newLevel - New competency level
 * @param {string} reason - Reason for update (e.g., 'session-complete', 'manual-override')
 * @returns {Promise<void>}
 */
export async function updateRepLevel(repId, newLevel, reason) {
  return updateRepLevelImpl(repId, newLevel, reason);
}

/**
 * Get training recommendations for current level.
 * @param {number} level - Competency level (1–5)
 * @returns {Promise<Array<Object>>} - Recommended training scenarios
 */
export async function getLevelRecommendations(level) {
  return getLevelRecommendationsImpl(level);
}

/**
 * Get performance history for a rep across sessions.
 * @param {string} repId - Rep profile ID
 * @param {number} limit - Max records (default: 10)
 * @returns {Promise<Array<Object>>} - Performance entries with { date, score, level }
 */
export async function getLevelPerformanceHistory(repId, limit = 10) {
  return getLevelPerformanceHistoryImpl(repId, limit);
}

/**
 * Get progression progress (0–100%) toward next level.
 * @param {string} repId - Rep profile ID
 * @returns {Promise<number>} - Progress percentage (0–100)
 */
export async function getProgressionProgress(repId) {
  return getProgressionProgressImpl(repId);
}

/**
 * Get scenario recommendations based on competency gaps.
 * @param {string} repId - Rep profile ID
 * @returns {Promise<Array<Object>>} - Recommended scenarios with { id, name, difficulty }
 */
export async function getRecommendedScenarios(repId) {
  return getRecommendedScenariosImpl(repId);
}

export default {
  getCurrentLevel,
  determineNextLevel,
  updateRepLevel,
  getLevelRecommendations,
  getLevelPerformanceHistory,
  getProgressionProgress,
  getRecommendedScenarios
};
