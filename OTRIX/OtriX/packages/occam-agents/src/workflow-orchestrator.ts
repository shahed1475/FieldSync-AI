/**
 * Workflow Orchestrator
 * 
 * Runs agents in sequence with telemetry tracking
 */

import { logDecision } from '@otrix/occam-core';

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

export class WorkflowOrchestrator {
  private workflows: Map<string, WorkflowDefinition> = new Map();

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
        metadata: { workflowId: workflow.id, workflowName: workflow.name },
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
        stepResults: [],
        error: `Workflow ${workflowId} not found`,
      };
    }

    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let context: WorkflowExecutionContext = {
      workflowId,
      stepId: '',
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

        logDecision(
          {
            nodeId: step.id,
            nodeName: step.name,
            nodeType: 'workflow_step',
            timestamp: new Date(),
          },
          {
            action: 'step_complete',
            metadata: { agentId: step.agentId },
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
          success: false,
          error: errorMessage,
          durationMs,
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
            metadata: { agentId: step.agentId, error: errorMessage },
            result: 'failure',
            latencyMs: durationMs,
          }
        );

        // Stop workflow on error
        return {
          success: false,
          stepResults,
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
        metadata: { workflowId, stepCount: workflow.steps.length },
        result: 'success',
        latencyMs: totalDurationMs,
      }
    );

    return {
      success: true,
      stepResults,
    };
  }

  /**
   * Execute a single workflow step (stub)
   */
  private async executeStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<unknown> {
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
  getWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get a specific workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }
}

// Singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
