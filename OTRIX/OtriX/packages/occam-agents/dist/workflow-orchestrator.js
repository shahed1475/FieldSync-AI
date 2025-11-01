"use strict";
/**
 * Workflow Orchestrator
 *
 * Runs agents in sequence with telemetry tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowOrchestrator = exports.WorkflowOrchestrator = void 0;
const occam_core_1 = require("@otrix/occam-core");
class WorkflowOrchestrator {
    constructor() {
        this.workflows = new Map();
    }
    /**
     * Register a workflow definition
     */
    registerWorkflow(workflow) {
        this.workflows.set(workflow.id, workflow);
        (0, occam_core_1.logDecision)({
            nodeId: 'orchestrator',
            nodeName: 'Workflow Orchestrator',
            nodeType: 'system',
            timestamp: new Date(),
        }, {
            action: 'register_workflow',
            metadata: { workflowId: workflow.id, workflowName: workflow.name },
            result: 'success',
        });
    }
    /**
     * Execute a workflow by ID
     */
    async executeWorkflow(workflowId, initialData = {}) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            return {
                success: false,
                stepResults: [],
                error: `Workflow ${workflowId} not found`,
            };
        }
        const startTime = Date.now();
        const stepResults = [];
        const context = {
            workflowId,
            stepId: '',
            data: initialData,
        };
        (0, occam_core_1.logDecision)({
            nodeId: workflowId,
            nodeName: workflow.name,
            nodeType: 'workflow',
            timestamp: new Date(),
        }, {
            action: 'workflow_start',
            metadata: { workflowId, stepCount: workflow.steps.length },
        });
        // Execute steps in sequence
        for (const step of workflow.steps) {
            const stepStartTime = Date.now();
            context.stepId = step.id;
            try {
                // Execute step (stub - actual agent execution would go here)
                const output = await this.executeStep(step, context);
                const durationMs = Date.now() - stepStartTime;
                stepResults.push({
                    stepId: step.id,
                    stepName: step.name,
                    success: true,
                    output,
                    durationMs,
                });
                (0, occam_core_1.logDecision)({
                    nodeId: step.id,
                    nodeName: step.name,
                    nodeType: 'workflow_step',
                    timestamp: new Date(),
                }, {
                    action: 'step_complete',
                    metadata: { agentId: step.agentId },
                    result: 'success',
                    latencyMs: durationMs,
                });
                // Update context with step output
                context.data = { ...context.data, [step.id]: output };
            }
            catch (error) {
                const durationMs = Date.now() - stepStartTime;
                const errorMessage = error instanceof Error ? error.message : String(error);
                stepResults.push({
                    stepId: step.id,
                    stepName: step.name,
                    success: false,
                    error: errorMessage,
                    durationMs,
                });
                (0, occam_core_1.logDecision)({
                    nodeId: step.id,
                    nodeName: step.name,
                    nodeType: 'workflow_step',
                    timestamp: new Date(),
                }, {
                    action: 'step_failed',
                    metadata: { agentId: step.agentId, error: errorMessage },
                    result: 'failure',
                    latencyMs: durationMs,
                });
                // Stop workflow on error
                return {
                    success: false,
                    stepResults,
                    error: `Step ${step.name} failed: ${errorMessage}`,
                };
            }
        }
        const totalDurationMs = Date.now() - startTime;
        (0, occam_core_1.logDecision)({
            nodeId: workflowId,
            nodeName: workflow.name,
            nodeType: 'workflow',
            timestamp: new Date(),
        }, {
            action: 'workflow_complete',
            metadata: { workflowId, stepCount: workflow.steps.length },
            result: 'success',
            latencyMs: totalDurationMs,
        });
        return {
            success: true,
            stepResults,
        };
    }
    /**
     * Execute a single workflow step (stub)
     */
    async executeStep(step, context) {
        // TODO: Integrate with actual agent execution
        // For now, return a placeholder result
        return {
            stepId: step.id,
            agentId: step.agentId,
            executedAt: new Date(),
            input: context.data,
        };
    }
    /**
     * Get all registered workflows
     */
    getWorkflows() {
        return Array.from(this.workflows.values());
    }
    /**
     * Get a specific workflow by ID
     */
    getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
    }
}
exports.WorkflowOrchestrator = WorkflowOrchestrator;
// Singleton instance
exports.workflowOrchestrator = new WorkflowOrchestrator();
//# sourceMappingURL=workflow-orchestrator.js.map