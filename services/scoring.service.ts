/**
 * Session Scoring Service Facade
 * ==============================
 * Thin re-export wrapper around modules/session-scoring/.
 *
 * PURPOSE:
 *   Provides a stable interface for evaluating sales rep competency per
 *   conversation turn and tracking SDG alignment metrics for compliance reporting.
 *
 * USAGE:
 *   import { scoreResponse, getCompetencyLevel, updateSDGMetrics } from '../../services/scoring.service';
 *
 * CONTRACT (DO NOT CHANGE SIGNATURES):
 *   scoreResponse(turn: ConversationTurn) → Promise<ScoringResult>
 *   getCompetencyLevel(repId: string) → Promise<CompetencyScore>
 *   updateSDGMetrics(sessionId: string, metrics: Partial<SDGMetrics>) → Promise<void>
 *
 * CONSTRAINTS:
 *   - No business logic here — only re-exports
 *   - TypeScript strict: no `any`
 */

// Re-export all public scoring functions and types
export {
  scoreResponse,
  getCompetencyLevel,
  updateSDGMetrics,
} from '../modules/session-scoring/index';

export type {
  CompetencyScore,
  SDGMetrics,
  ScoringResult,
  ConversationTurn,
} from '../modules/session-scoring/index';
