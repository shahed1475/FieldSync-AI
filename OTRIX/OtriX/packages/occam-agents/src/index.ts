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

import { WorkflowOrchestrator as WOClass, workflowOrchestrator as woInstance } from './workflow-orchestrator';
import { AgentRegistry as ARClass, agentRegistry as arInstance } from './agent-registry';
import { WeeklyAuditJob as WAJClass, weeklyAuditJob as wajInstance } from './audit-job';

export default {
  WorkflowOrchestrator: WOClass,
  workflowOrchestrator: woInstance,
  AgentRegistry: ARClass,
  agentRegistry: arInstance,
  WeeklyAuditJob: WAJClass,
  weeklyAuditJob: wajInstance
};
