/**
 * OCCAM Agents - Intelligent Compliance Agents
 * Phase 0: Foundation Setup
 */

// Export agent registry
export * from './agent-registry';

// Export all 6 OCCAM agents
export { OCCAMComplianceAgent } from './agents/occam-compliance-agent';
export { OCCAMConsultancyAgent } from './agents/occam-consultancy-agent';
export { OCCAMFormAgent } from './agents/occam-form-agent';
export { OCCAMPaymentAgent } from './agents/occam-payment-agent';
export { OCCAMAccountAgent } from './agents/occam-account-agent';
export { OCCAMStatusAgent } from './agents/occam-status-agent';

// Export workflow orchestrator
export {
  WorkflowOrchestrator,
  workflowOrchestrator,
  type WorkflowStep,
  type WorkflowDefinition,
  type WorkflowExecutionContext,
  type WorkflowExecutionResult,
  type StepResult
} from './workflow-orchestrator';

// Export services
export { AuditService } from './services/audit.service';
export { FactBoxService } from './services/FactBoxService';

// Export types
export * from './types';

export const VERSION = '1.0.0';
