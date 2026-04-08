/**
 * Unified compliance service facade.
 * Thin wrapper over modules/ai-core/compliance-gate.server.js
 * Rule-based pharma compliance gating for LLM responses.
 *
 * Modules may import: const { evaluateCompliance } = await import('../../services/compliance.service.js');
 */

import {
  evaluateCompliance as evaluateComplianceImpl,
  buildComplianceInterruptionText as buildComplianceInterruptionTextImpl
} from '../modules/ai-core/compliance-gate.server.js';

/**
 * Evaluate user message against compliance rules.
 * @param {string} userMessage - User input to evaluate
 * @returns {Object} - { allowed: boolean, reason?: string, riskLevel?: 'low'|'medium'|'high' }
 */
export function evaluateCompliance(userMessage) {
  return evaluateComplianceImpl(userMessage);
}

/**
 * Build user-facing interruption text for compliance block.
 * @param {string} reason - Compliance block reason
 * @returns {string} - User-friendly message explaining why response was blocked
 */
export function buildComplianceInterruptionText(reason) {
  return buildComplianceInterruptionTextImpl(reason);
}

/**
 * Check if LLM response violates compliance rules.
 * @param {string} aiResponse - Generated AI response to validate
 * @returns {Object} - { compliant: boolean, violation?: string }
 */
export function validateResponse(aiResponse) {
  // NOTE: Detailed response validation may live in compliance-gate.server.js
  // This is a facade entry point for future expansion.
  const hasUnapprovedClaim = /(?:cure|treat|prevent)\s+(?:cancer|diabetes|heart disease)/i.test(aiResponse);
  if (hasUnapprovedClaim) {
    return { compliant: false, violation: 'Unauthorized medical claim in response' };
  }
  return { compliant: true };
}

export default {
  evaluateCompliance,
  buildComplianceInterruptionText,
  validateResponse
};
