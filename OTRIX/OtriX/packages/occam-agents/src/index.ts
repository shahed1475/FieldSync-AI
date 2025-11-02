/**
 * OCCAM Agents Package
 * Phase 9: Orchestrator Hardening
 *
 * Exports workflow orchestrator, agent registry, and audit job
 */

// Export workflow orchestrator
export { WorkflowOrchestrator, workflowOrchestrator } from './workflow-orchestrator';
export type {
  DriftThreshold,
  WorkflowConfig,
  SharedContext,
  WorkflowExecutionResult
} from './workflow-orchestrator';

// Export agent registry
export { AgentRegistry, agentRegistry } from './agent-registry';
export type {
  AgentType,
  AgentStatus,
  AgentCapabilities,
  AgentMetadata,
  AgentExecutionContext,
  AgentExecutionResult
} from './agent-registry';

// Export audit job
export { WeeklyAuditJob, weeklyAuditJob } from './audit-job';

export default {
  WorkflowOrchestrator,
  workflowOrchestrator,
  AgentRegistry,
  agentRegistry,
  WeeklyAuditJob,
  weeklyAuditJob
};
