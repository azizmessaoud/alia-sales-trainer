/**
 * Type definitions for compliance-gate.server.js
 * Pharma compliance checking for ALIA responses
 */

export interface ComplianceResult {
  is_compliant: boolean;
  violations?: string[];
  warnings?: string[];
  score?: number;
  tier: 1 | 2;
  reason?: string;
  interruption_text?: string;
  blockReason?: string;
}

export interface ComplianceContext {
  language?: string;
  sessionId?: string;
  repId?: string | null;
}

export function checkCompliance(
  message: string,
  context?: ComplianceContext
): Promise<ComplianceResult>;

export function evaluateCompliance(
  message: string,
  context?: ComplianceContext
): Promise<ComplianceResult>;

export function buildComplianceInterruptionText(
  violationType: string,
  language?: string
): string;



