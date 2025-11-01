/**
 * OCCAM Workflow Orchestrator
 *
 * Orchestrates the execution of all 6 OCCAM agents in sequence:
 * 1. Account Agent - Handle user account management and 2FA
 * 2. Form Agent - Generate and validate compliance forms
 * 3. Payment Agent - Process payments and handle transactions
 * 4. Status Agent - Track and update workflow status
 * 5. Compliance Agent - Validate regulatory compliance
 * 6. Consultancy Agent - Provide AI-driven compliance consultation
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
    description?: string;
    steps: WorkflowStep[];
}
export interface WorkflowExecutionContext {
    workflowId: string;
    stepId: string;
    userId?: string;
    entityId?: string;
    data: Record<string, unknown>;
}
export interface WorkflowExecutionResult {
    success: boolean;
    workflowId: string;
    stepResults: StepResult[];
    totalDurationMs: number;
    error?: string;
}
export interface StepResult {
    stepId: string;
    stepName: string;
    agentId: string;
    success: boolean;
    output?: unknown;
    error?: string;
    durationMs: number;
    timestamp: Date;
}
/**
 * Workflow Orchestrator Class
 * Manages the registration and execution of compliance workflows
 */
export declare class WorkflowOrchestrator {
    private workflows;
    private agents;
    constructor();
    /**
     * Initialize all OCCAM agents
     */
    private initializeAgents;
    /**
     * Register a workflow definition
     */
    registerWorkflow(workflow: WorkflowDefinition): void;
    /**
     * Execute a workflow by ID
     */
    executeWorkflow(workflowId: string, initialData?: Record<string, unknown>): Promise<WorkflowExecutionResult>;
    /**
     * Execute a single workflow step with the appropriate agent
     */
    private executeStep;
    /**
     * Execute Account Agent actions
     */
    private executeAccountAgent;
    /**
     * Execute Form Agent actions
     */
    private executeFormAgent;
    /**
     * Execute Payment Agent actions
     */
    private executePaymentAgent;
    /**
     * Execute Status Agent actions
     */
    private executeStatusAgent;
    /**
     * Execute Compliance Agent actions
     */
    private executeComplianceAgent;
    /**
     * Execute Consultancy Agent actions
     */
    private executeConsultancyAgent;
    /**
     * Get all registered workflows
     */
    getWorkflows(): WorkflowDefinition[];
    /**
     * Get a specific workflow by ID
     */
    getWorkflow(workflowId: string): WorkflowDefinition | undefined;
    /**
     * Get all registered agents
     */
    getAgents(): string[];
    /**
     * Unregister a workflow
     */
    unregisterWorkflow(workflowId: string): boolean;
}
export declare const workflowOrchestrator: WorkflowOrchestrator;
//# sourceMappingURL=workflow-orchestrator.d.ts.map