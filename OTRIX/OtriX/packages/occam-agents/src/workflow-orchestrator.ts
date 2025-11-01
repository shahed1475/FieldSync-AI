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

import { logDecision } from '@otrix/occam-core';
import { OCCAMAccountAgent } from './agents/occam-account-agent';
import { OCCAMFormAgent } from './agents/occam-form-agent';
import { OCCAMPaymentAgent } from './agents/occam-payment-agent';
import { OCCAMStatusAgent } from './agents/occam-status-agent';
import { OCCAMComplianceAgent } from './agents/occam-compliance-agent';
import { OCCAMConsultancyAgent } from './agents/occam-consultancy-agent';

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
export class WorkflowOrchestrator {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private agents: Map<string, any> = new Map();

  constructor() {
    // Initialize and register all 6 OCCAM agents
    this.initializeAgents();
  }

  /**
   * Initialize all OCCAM agents
   */
  private initializeAgents(): void {
    try {
      // Initialize agents with shared services
      this.agents.set('account', new OCCAMAccountAgent());
      this.agents.set('form', new OCCAMFormAgent());
      this.agents.set('payment', new OCCAMPaymentAgent());
      this.agents.set('status', new OCCAMStatusAgent());
      this.agents.set('compliance', new OCCAMComplianceAgent());
      this.agents.set('consultancy', new OCCAMConsultancyAgent());

      logDecision(
        {
          nodeId: 'orchestrator',
          nodeName: 'Workflow Orchestrator',
          nodeType: 'system',
          timestamp: new Date(),
        },
        {
          action: 'agents_initialized',
          metadata: { agentCount: this.agents.size },
          result: 'success',
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logDecision(
        {
          nodeId: 'orchestrator',
          nodeName: 'Workflow Orchestrator',
          nodeType: 'system',
          timestamp: new Date(),
        },
        {
          action: 'agents_initialization_failed',
          metadata: { error: errorMessage },
          result: 'failure',
        }
      );
      throw error;
    }
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);

    logDecision(
      {
        nodeId: 'orchestrator',
        nodeName: 'Workflow Orchestrator',
        nodeType: 'system',
        timestamp: new Date(),
      },
      {
        action: 'register_workflow',
        metadata: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepCount: workflow.steps.length
        },
        result: 'success',
      }
    );
  }

  /**
   * Execute a workflow by ID
   */
  async executeWorkflow(
    workflowId: string,
    initialData: Record<string, unknown> = {}
  ): Promise<WorkflowExecutionResult> {
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
    const stepResults: StepResult[] = [];
    const context: WorkflowExecutionContext = {
      workflowId,
      stepId: '',
      userId: initialData.userId as string | undefined,
      entityId: initialData.entityId as string | undefined,
      data: initialData,
    };

    logDecision(
      {
        nodeId: workflowId,
        nodeName: workflow.name,
        nodeType: 'workflow',
        timestamp: new Date(),
      },
      {
        action: 'workflow_start',
        metadata: { workflowId, stepCount: workflow.steps.length },
      }
    );

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

        logDecision(
          {
            nodeId: step.id,
            nodeName: step.name,
            nodeType: 'workflow_step',
            timestamp: new Date(),
          },
          {
            action: 'step_complete',
            metadata: {
              agentId: step.agentId,
              workflowId
            },
            result: 'success',
            latencyMs: durationMs,
          }
        );

        // Update context with step output
        context.data = { ...context.data, [step.id]: output };
      } catch (error) {
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

        logDecision(
          {
            nodeId: step.id,
            nodeName: step.name,
            nodeType: 'workflow_step',
            timestamp: new Date(),
          },
          {
            action: 'step_failed',
            metadata: {
              agentId: step.agentId,
              error: errorMessage,
              workflowId
            },
            result: 'failure',
            latencyMs: durationMs,
          }
        );

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

    logDecision(
      {
        nodeId: workflowId,
        nodeName: workflow.name,
        nodeType: 'workflow',
        timestamp: new Date(),
      },
      {
        action: 'workflow_complete',
        metadata: {
          workflowId,
          stepCount: workflow.steps.length,
          totalDurationMs
        },
        result: 'success',
        latencyMs: totalDurationMs,
      }
    );

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
  private async executeStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
    const agent = this.agents.get(step.agentId);

    if (!agent) {
      throw new Error(`Agent ${step.agentId} not found`);
    }

    // Route to appropriate agent method based on step configuration
    const action = step.config.action as string;
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
  private async executeAccountAgent(agent: OCCAMAccountAgent, action: string, params: any): Promise<unknown> {
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
  private async executeFormAgent(agent: OCCAMFormAgent, action: string, params: any): Promise<unknown> {
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
  private async executePaymentAgent(agent: OCCAMPaymentAgent, action: string, params: any): Promise<unknown> {
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
  private async executeStatusAgent(agent: OCCAMStatusAgent, action: string, params: any): Promise<unknown> {
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
  private async executeComplianceAgent(agent: OCCAMComplianceAgent, action: string, params: any): Promise<unknown> {
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
  private async executeConsultancyAgent(agent: OCCAMConsultancyAgent, action: string, params: any): Promise<unknown> {
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
  getWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get a specific workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all registered agents
   */
  getAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Unregister a workflow
   */
  unregisterWorkflow(workflowId: string): boolean {
    return this.workflows.delete(workflowId);
  }
}

// Singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
