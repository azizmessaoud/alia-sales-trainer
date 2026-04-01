/**
 * ALIA 2.0 Compliance Gate
 * Evaluates user messages for medical compliance and safety.
 */

/**
 * Evaluates the compliance of a user message.
 * @param {string} message - The user's message.
 * @returns {Promise<{is_compliant: boolean, reason?: string, interruption_text?: string}>}
 */
export async function evaluateCompliance(message) {
  // TODO: Implement actual compliance logic (e.g., using a dedicated LLM or rule engine)
  console.log(`[Compliance] Evaluating: "${message.substring(0, 50)}..."`);
  
  // For now, assume all messages are compliant
  return {
    is_compliant: true
  };
}

/**
 * Builds the text to be spoken if a compliance violation occurs.
 * @param {string} reason - The reason for the violation.
 * @returns {string}
 */
export function buildComplianceInterruptionText(reason) {
  return `I'm sorry, but I can't continue this part of the conversation as it may involve non-compliant medical information. ${reason || 'Let\'s refocus on the training goals.'}`;
}
