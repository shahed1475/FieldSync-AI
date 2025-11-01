"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowOrchestrator = exports.WorkflowOrchestrator = void 0;
const occam_core_1 = require("@otrix/occam-core");
const occam_account_agent_1 = require("./agents/occam-account-agent");
const occam_form_agent_1 = require("./agents/occam-form-agent");
const occam_payment_agent_1 = require("./agents/occam-payment-agent");
const occam_status_agent_1 = require("./agents/occam-status-agent");
const occam_compliance_agent_1 = require("./agents/occam-compliance-agent");
const occam_consultancy_agent_1 = require("./agents/occam-consultancy-agent");
/**
 * Workflow Orchestrator Class
 * Manages the registration and execution of compliance workflows
 */
class WorkflowOrchestrator {
    constructor() {
        this.workflows = new Map();
        this.agents = new Map();
        // Initialize and register all 6 OCCAM agents
        this.initializeAgents();
    }
    /**
     * Initialize all OCCAM agents
     */
    initializeAgents() {
        try {
            // Initialize agents with shared services
            this.agents.set('account', new occam_account_agent_1.OCCAMAccountAgent());
            this.agents.set('form', new occam_form_agent_1.OCCAMFormAgent());
            this.agents.set('payment', new occam_payment_agent_1.OCCAMPaymentAgent());
            this.agents.set('status', new occam_status_agent_1.OCCAMStatusAgent());
            this.agents.set('compliance', new occam_compliance_agent_1.OCCAMComplianceAgent());
            this.agents.set('consultancy', new occam_consultancy_agent_1.OCCAMConsultancyAgent());
            (0, occam_core_1.logDecision)({
                nodeId: 'orchestrator',
                nodeName: 'Workflow Orchestrator',
                nodeType: 'system',
                timestamp: new Date(),
            }, {
                action: 'agents_initialized',
                metadata: { agentCount: this.agents.size },
                result: 'success',
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            (0, occam_core_1.logDecision)({
                nodeId: 'orchestrator',
                nodeName: 'Workflow Orchestrator',
                nodeType: 'system',
                timestamp: new Date(),
            }, {
                action: 'agents_initialization_failed',
                metadata: { error: errorMessage },
                result: 'failure',
            });
            throw error;
        }
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
            metadata: {
                workflowId: workflow.id,
                workflowName: workflow.name,
                stepCount: workflow.steps.length
            },
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
                workflowId,
                stepResults: [],
                totalDurationMs: 0,
                error: `Workflow ${workflowId} not found`,
            };
        }
        const startTime = Date.now();
        const stepResults = [];
        const context = {
            workflowId,
            stepId: '',
            userId: initialData.userId,
            entityId: initialData.entityId,
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
                // Execute step with the appropriate agent
                const output = await this.executeStep(step, context);
                const durationMs = Date.now() - stepStartTime;
                stepResults.push({
                    stepId: step.id,
                    stepName: step.name,
                    agentId: step.agentId,
                    success: true,
                    output,
                    durationMs,
                    timestamp: new Date(),
                });
                (0, occam_core_1.logDecision)({
                    nodeId: step.id,
                    nodeName: step.name,
                    nodeType: 'workflow_step',
                    timestamp: new Date(),
                }, {
                    action: 'step_complete',
                    metadata: {
                        agentId: step.agentId,
                        workflowId
                    },
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
                    agentId: step.agentId,
                    success: false,
                    error: errorMessage,
                    durationMs,
                    timestamp: new Date(),
                });
                (0, occam_core_1.logDecision)({
                    nodeId: step.id,
                    nodeName: step.name,
                    nodeType: 'workflow_step',
                    timestamp: new Date(),
                }, {
                    action: 'step_failed',
                    metadata: {
                        agentId: step.agentId,
                        error: errorMessage,
                        workflowId
                    },
                    result: 'failure',
                    latencyMs: durationMs,
                });
                // Stop workflow on error
                const totalDurationMs = Date.now() - startTime;
                return {
                    success: false,
                    workflowId,
                    stepResults,
                    totalDurationMs,
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
            metadata: {
                workflowId,
                stepCount: workflow.steps.length,
                totalDurationMs
            },
            result: 'success',
            latencyMs: totalDurationMs,
        });
        return {
            success: true,
            workflowId,
            stepResults,
            totalDurationMs,
        };
    }
    /**
     * Execute a single workflow step with the appropriate agent
     */
    async executeStep(step, context) {
        const agent = this.agents.get(step.agentId);
        if (!agent) {
            throw new Error(`Agent ${step.agentId} not found`);
        }
        // Route to appropriate agent method based on step configuration
        const action = step.config.action;
        const params = { ...step.config, ...context.data };
        // Agent-specific execution logic
        switch (step.agentId) {
            case 'account':
                return await this.executeAccountAgent(agent, action, params);
            case 'form':
                return await this.executeFormAgent(agent, action, params);
            case 'payment':
                return await this.executePaymentAgent(agent, action, params);
            case 'status':
                return await this.executeStatusAgent(agent, action, params);
            case 'compliance':
                return await this.executeComplianceAgent(agent, action, params);
            case 'consultancy':
                return await this.executeConsultancyAgent(agent, action, params);
            default:
                throw new Error(`Unknown agent: ${step.agentId}`);
        }
    }
    /**
     * Execute Account Agent actions
     */
    async executeAccountAgent(agent, action, params) {
        // Placeholder for agent method calls - to be implemented based on actual agent methods
        return {
            agent: 'account',
            action,
            timestamp: new Date(),
            result: 'Agent execution placeholder - integrate with actual methods',
        };
    }
    /**
     * Execute Form Agent actions
     */
    async executeFormAgent(agent, action, params) {
        return {
            agent: 'form',
            action,
            timestamp: new Date(),
            result: 'Agent execution placeholder - integrate with actual methods',
        };
    }
    /**
     * Execute Payment Agent actions
     */
    async executePaymentAgent(agent, action, params) {
        return {
            agent: 'payment',
            action,
            timestamp: new Date(),
            result: 'Agent execution placeholder - integrate with actual methods',
        };
    }
    /**
     * Execute Status Agent actions
     */
    async executeStatusAgent(agent, action, params) {
        return {
            agent: 'status',
            action,
            timestamp: new Date(),
            result: 'Agent execution placeholder - integrate with actual methods',
        };
    }
    /**
     * Execute Compliance Agent actions
     */
    async executeComplianceAgent(agent, action, params) {
        return {
            agent: 'compliance',
            action,
            timestamp: new Date(),
            result: 'Agent execution placeholder - integrate with actual methods',
        };
    }
    /**
     * Execute Consultancy Agent actions
     */
    async executeConsultancyAgent(agent, action, params) {
        return {
            agent: 'consultancy',
            action,
            timestamp: new Date(),
            result: 'Agent execution placeholder - integrate with actual methods',
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
    /**
     * Get all registered agents
     */
    getAgents() {
        return Array.from(this.agents.keys());
    }
    /**
     * Unregister a workflow
     */
    unregisterWorkflow(workflowId) {
        return this.workflows.delete(workflowId);
    }
}
exports.WorkflowOrchestrator = WorkflowOrchestrator;
// Singleton instance
exports.workflowOrchestrator = new WorkflowOrchestrator();
//# sourceMappingURL=workflow-orchestrator.js.map