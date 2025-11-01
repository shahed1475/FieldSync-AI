/**
 * Workflow Orchestrator
 *
 * Runs agents in sequence with telemetry tracking
 */
export interface WorkflowStep {
    id: string;
    name: string;
    agentId: string;
    config: Record<string, unknown>;
}
export interface WorkflowDefinition {
    id: string;
    name: string;
    steps: WorkflowStep[];
}
export interface WorkflowExecutionContext {
    workflowId: string;
    stepId: string;
    data: Record<string, unknown>;
}
export interface WorkflowExecutionResult {
    success: boolean;
    stepResults: StepResult[];
    error?: string;
}
export interface StepResult {
    stepId: string;
    stepName: string;
    success: boolean;
    output?: unknown;
    error?: string;
    durationMs: number;
}
export declare class WorkflowOrchestrator {
    private workflows;
    /**
     * Register a workflow definition
     */
    registerWorkflow(workflow: WorkflowDefinition): void;
    /**
     * Execute a workflow by ID
     */
    executeWorkflow(workflowId: string, initialData?: Record<string, unknown>): Promise<WorkflowExecutionResult>;
    /**
     * Execute a single workflow step (stub)
     */
    private executeStep;
    /**
     * Get all registered workflows
     */
    getWorkflows(): WorkflowDefinition[];
    /**
     * Get a specific workflow by ID
     */
    getWorkflow(workflowId: string): WorkflowDefinition | undefined;
}
export declare const workflowOrchestrator: WorkflowOrchestrator;
//# sourceMappingURL=workflow-orchestrator.d.ts.map