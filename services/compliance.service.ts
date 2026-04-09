/**
 * Compliance Gate Service Facade
 * ==============================
 * Thin re-export wrapper around modules/ai-core/compliance-gate.server.
 *
 * PURPOSE:
 *   Wraps the response compliance filter that checks ALIA outputs for:
 *   - Medical disclaimer requirements
 *   - Hallucination guards
 *   - Pharma regulatory compliance
 *
 * USAGE:
 *   import { checkCompliance } from '../../services/compliance.service';
 *
 * CONTRACT (DO NOT CHANGE SIGNATURES):
 *   checkCompliance(response: string, context: ComplianceContext) → Promise<ComplianceResult>
 *
 * CONSTRAINTS:
 *   - No business logic here — only re-exports
 *   - TypeScript strict: no `any`
 */

// Re-export public compliance functions and types
export {
  checkCompliance,
} from '../modules/ai-core/compliance-gate.server';

export type {
  ComplianceResult,
  ComplianceContext,
} from '../modules/ai-core/compliance-gate.server';
