// modules/session-scoring/index.ts — public barrel
// Scaffold: real implementation goes in scoring-engine.server.ts

export type SessionScore = {
  sessionId: string;
  repId: string;
  totalScore: number;
  competencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  sdgMetrics: Record<string, number>;
  timestamp: Date;
};

export type ScoringContext = {
  transcript: string;
  duration: number;
  language: string;
};

// Additional types required by scoring.service.ts
export type ConversationTurn = {
  repMessage: string;
  avatarResponse: string;
  timestamp: Date;
};

export type CompetencyScore = {
  repId: string;
  overallScore: number;
  competencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  dimensionScores: Record<string, number>;
  lastUpdated: Date;
};

export type SDGMetrics = {
  sessionId: string;
  repId: string;
  goal3Health: number;  // Good Health and Well-being
  goal5Gender: number;  // Gender Equality
  goal10Inequality: number;  // Reduced Inequalities
  goal17Partnerships: number;  // Partnerships for the Goals
  timestamp: Date;
};

export type ScoringResult = {
  score: SessionScore;
  competency: CompetencyScore;
  metrics: SDGMetrics;
};

// Scaffold functions
export async function scoreSession(
  _context: ScoringContext
): Promise<SessionScore> {
  throw new Error('scoreSession: not yet implemented');
}

export async function scoreResponse(
  _turn: ConversationTurn
): Promise<ScoringResult> {
  throw new Error('scoreResponse: not yet implemented');
}

export async function getCompetencyLevel(
  _repId: string
): Promise<CompetencyScore> {
  throw new Error('getCompetencyLevel: not yet implemented');
}

export async function updateSDGMetrics(
  _sessionId: string,
  _metrics: Partial<SDGMetrics>
): Promise<void> {
  throw new Error('updateSDGMetrics: not yet implemented');
}
