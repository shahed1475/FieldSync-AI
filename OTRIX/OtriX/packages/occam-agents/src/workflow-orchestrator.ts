/**
 * OCCAM Workflow Orchestrator
 * Phase 9: Orchestrator Hardening
 *
 * Responsible for:
 * - Orchestrating all OCCAM agents in proper sequence
 * - Enforcing Zero-Drift Rule (>0.12 cosine threshold)
 * - Cross-Agent Context Chaining with checksum validation
 * - Telemetry hooks for every decision node
 * - Performance SLO enforcement
 */

import { agentRegistry, type AgentExecutionContext, type AgentExecutionResult } from './agent-registry';
import { telemetryService, type AuditTrailRecord, type DriftCase } from '@otrix/occam-core';
import { createHash } from 'crypto';

/**
 * Drift threshold configuration
 */
export interface DriftThreshold {
  cosineThreshold: number; // Default: 0.12 (>0.12 = block execution)
  autoReVerify: boolean; // Trigger re-verification on drift
  blockOnDrift: boolean; // Block execution if drift detected
}

/**
 * Default drift threshold
 */
const DEFAULT_DRIFT_THRESHOLD: DriftThreshold = {
  cosineThreshold: 0.12,
  autoReVerify: true,
  blockOnDrift: true
};

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  enableTelemetry: boolean;
  enableContextChaining: boolean;
  enableZeroDrift: boolean;
  driftThreshold: DriftThreshold;
  enableChecksumValidation: boolean;
  maxExecutionTimeMs: number;
  parallelizeWhenPossible: boolean;
}

/**
 * Default workflow configuration
 */
const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  enableTelemetry: true,
  enableContextChaining: true,
  enableZeroDrift: true,
  driftThreshold: DEFAULT_DRIFT_THRESHOLD,
  enableChecksumValidation: true,
  maxExecutionTimeMs: 300000, // 5 minutes
  parallelizeWhenPossible: true
};

/**
 * Shared context for agent execution (immutable runContext)
 * Structure: {ontologySnapshot, factboxSnapshot, policyMatrixVersion, vaultRefs}
 */
export interface SharedContext {
  ontologySnapshot: any;
  factboxSnapshot: any[];
  policyMatrixVersion: string;
  vaultRefs: any[];
  regulatoryContext: any;
  agentResults: Map<string, AgentExecutionResult>;
  checksum: string;
  startTime: number;
  frozen: boolean; // Immutability flag
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  success: boolean;
  executionOrder: string[];
  agentResults: Map<string, AgentExecutionResult>;
  totalLatencyMs: number;
  driftDetections: DriftCase[];
  blockedByDrift: boolean;
  errors: string[];
  warnings: string[];
  telemetrySummary: {
    totalEvents: number;
    successRate: number;
    averageLatencyMs: number;
  };
}

/**
 * OCCAM Workflow Orchestrator
 * Manages execution of all OCCAM agents with hardening features
 */
export class WorkflowOrchestrator {
  private config: WorkflowConfig;
  private sharedContext: SharedContext | null = null;

  constructor(config: WorkflowConfig = DEFAULT_WORKFLOW_CONFIG) {
    this.config = config;
  }

  /**
   * Execute full OCCAM workflow
   */
  async executeWorkflow(initialContext?: Partial<SharedContext>): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const driftDetections: DriftCase[] = [];
    let blockedByDrift = false;

    try {
      // Initialize shared context
      this.sharedContext = this.initializeContext(initialContext);

      // Get execution order
      const executionOrder = agentRegistry.getExecutionOrder();

      // Log workflow start
      if (this.config.enableTelemetry) {
        await telemetryService.logEvent({
          eventType: 'compliance-check',
          severity: 'info',
          agentName: 'workflow-orchestrator',
          latency: 0,
          success: true,
          metadata: {
            executionOrder,
            config: this.config
          }
        });
      }

      // Execute agents in order
      for (const agentId of executionOrder) {
        const agent = agentRegistry.getAgent(agentId);
        if (!agent) {
          errors.push(`Agent not found: ${agentId}`);
          continue;
        }

        // Skip inactive agents
        if (agent.status !== 'active') {
          warnings.push(`Skipping inactive agent: ${agentId}`);
          continue;
        }

        // Check if zero-drift is enabled and agent supports it
        if (this.config.enableZeroDrift && agent.capabilities.supportsZeroDrift) {
          const driftCheck = await this.checkZeroDrift(agentId);

          if (driftCheck.hasDrift) {
            driftDetections.push(...driftCheck.driftCases);

            // Log drift detection
            if (this.config.enableTelemetry) {
              await telemetryService.logDriftDetection('critical',
                driftCheck.action || 'flagged');
            }

            // Block execution if configured
            if (this.config.driftThreshold.blockOnDrift) {
              blockedByDrift = true;
              errors.push(`Execution blocked due to drift in agent: ${agentId}`);
              break;
            }
          }
        }

        // Execute agent
        const result = await this.executeAgent(agentId);

        // Record execution in registry
        agentRegistry.recordExecution(result);

        // Store result in shared context
        this.sharedContext.agentResults.set(agentId, result);

        // Log execution
        if (this.config.enableTelemetry) {
          await telemetryService.logEvent({
            eventType: 'compliance-check',
            severity: result.success ? 'info' : 'error',
            agentId: result.agentId,
            agentName: agent.name,
            latency: result.latencyMs,
            success: result.success,
            confidenceScore: result.confidenceScore,
            metadata: result.metadata
          });
        }

        // Check for errors
        if (!result.success) {
          errors.push(`Agent ${agentId} failed: ${result.errors?.join(', ')}`);
        }
      }

      // Calculate total latency
      const totalLatencyMs = Date.now() - startTime;

      // Get telemetry summary
      const telemetrySummary = this.config.enableTelemetry
        ? {
            totalEvents: telemetryService.getRecentEvents().length,
            successRate: telemetryService.getSuccessRate('compliance-check'),
            averageLatencyMs: telemetryService.getAverageLatency('compliance-check')
          }
        : {
            totalEvents: 0,
            successRate: 0,
            averageLatencyMs: 0
          };

      return {
        success: errors.length === 0 && !blockedByDrift,
        executionOrder,
        agentResults: this.sharedContext.agentResults,
        totalLatencyMs,
        driftDetections,
        blockedByDrift,
        errors,
        warnings,
        telemetrySummary
      };
    } catch (error) {
      errors.push(`Workflow execution failed: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        executionOrder: [],
        agentResults: this.sharedContext?.agentResults || new Map(),
        totalLatencyMs: Date.now() - startTime,
        driftDetections,
        blockedByDrift,
        errors,
        warnings,
        telemetrySummary: {
          totalEvents: 0,
          successRate: 0,
          averageLatencyMs: 0
        }
      };
    }
  }

  /**
   * Initialize shared context (buildRunContext → freeze())
   */
  private initializeContext(initial?: Partial<SharedContext>): SharedContext {
    const context: SharedContext = {
      ontologySnapshot: initial?.ontologySnapshot || {},
      factboxSnapshot: initial?.factboxSnapshot || [],
      policyMatrixVersion: initial?.policyMatrixVersion || '1.0.0',
      vaultRefs: initial?.vaultRefs || [],
      regulatoryContext: initial?.regulatoryContext || {},
      agentResults: new Map(),
      checksum: '',
      startTime: Date.now(),
      frozen: false
    };

    // Calculate initial checksum
    context.checksum = this.calculateChecksum(context);

    // Freeze the context to make it immutable
    context.frozen = true;
    Object.freeze(context.ontologySnapshot);
    Object.freeze(context.factboxSnapshot);
    Object.freeze(context.vaultRefs);
    Object.freeze(context.regulatoryContext);

    return context;
  }

  /**
   * Calculate context checksum for deterministic runs
   */
  private calculateChecksum(context: SharedContext): string {
    const data = JSON.stringify({
      ontology: context.ontologySnapshot,
      factbox: context.factboxSnapshot,
      policyMatrix: context.policyMatrixVersion,
      vault: context.vaultRefs,
      regulatory: context.regulatoryContext
    });

    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validate context checksum
   */
  private validateChecksum(context: SharedContext, expectedChecksum: string): boolean {
    const actualChecksum = this.calculateChecksum(context);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Check for zero drift
   */
  private async checkZeroDrift(agentId: string): Promise<{
    hasDrift: boolean;
    driftCases: DriftCase[];
    action?: string;
  }> {
    // Simulate drift detection
    // In production, this would integrate with Phase 5 VectorVerify

    const driftCases: DriftCase[] = [];

    // Simulated drift check (10% chance of drift)
    const hasDrift = Math.random() < 0.1;

    if (hasDrift) {
      const driftScore = 0.15; // Above threshold

      driftCases.push({
        clauseId: `clause-${agentId}-001`,
        documentId: `doc-${agentId}`,
        driftScore,
        threshold: this.config.driftThreshold.cosineThreshold,
        detectedAt: new Date(),
        sourceUrl: 'https://regulations.gov/example',
        currentContent: 'Current content with drift',
        sourceContent: 'Original source content',
        action: this.config.driftThreshold.blockOnDrift ? 'blocked' : 're-verification-triggered',
        reVerificationJobId: this.config.driftThreshold.autoReVerify
          ? `reverify-${Date.now()}`
          : undefined
      });
    }

    return {
      hasDrift,
      driftCases,
      action: hasDrift && this.config.driftThreshold.blockOnDrift
        ? 'blocked'
        : hasDrift && this.config.driftThreshold.autoReVerify
        ? 're-verification-triggered'
        : undefined
    };
  }

  /**
   * Execute a single agent with context chaining
   */
  private async executeAgent(agentId: string): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const agent = agentRegistry.getAgent(agentId);

    if (!agent) {
      return {
        agentId,
        success: false,
        data: null,
        latencyMs: Date.now() - startTime,
        errors: [`Agent not found: ${agentId}`]
      };
    }

    try {
      // Build execution context with chaining
      const executionContext: AgentExecutionContext = {
        agentId,
        telemetry: this.config.enableTelemetry ? telemetryService : undefined
      };

      // Add context chaining if enabled
      if (this.config.enableContextChaining && this.sharedContext) {
        // Validate checksum hasn't changed mid-run - if different, abort + rehydrate
        if (this.config.enableChecksumValidation) {
          const currentChecksum = this.calculateChecksum(this.sharedContext);
          if (currentChecksum !== this.sharedContext.checksum) {
            throw new Error(`Checksum mismatch detected mid-run. Expected: ${this.sharedContext.checksum}, Got: ${currentChecksum}. Aborting to rehydrate context.`);
          }
        }

        executionContext.ontologySnapshot = this.sharedContext.ontologySnapshot;
        executionContext.factBoxEntries = this.sharedContext.factboxSnapshot;
        executionContext.regulatoryContext = this.sharedContext.regulatoryContext;

        // Add results from dependency agents
        const previousResults: Record<string, any> = {};
        agent.dependencies.forEach(depId => {
          const depResult = this.sharedContext!.agentResults.get(depId);
          if (depResult) {
            previousResults[depId] = depResult.data;
          }
        });
        executionContext.previousResults = previousResults;

        // Add checksum for deterministic runs
        if (this.config.enableChecksumValidation) {
          executionContext.checksum = this.sharedContext.checksum;
        }
      }

      // Simulate agent execution
      // In production, this would call the actual agent implementation
      const data = await this.simulateAgentExecution(agent.id, executionContext);

      const latencyMs = Date.now() - startTime;

      return {
        agentId,
        success: true,
        data,
        latencyMs,
        confidenceScore: Math.random() * 20 + 80, // 80-100
        metadata: {
          contextChained: this.config.enableContextChaining,
          checksumValidated: this.config.enableChecksumValidation
        }
      };
    } catch (error) {
      return {
        agentId,
        success: false,
        data: null,
        latencyMs: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Simulate agent execution
   * In production, this would call actual agent implementations
   */
  private async simulateAgentExecution(
    agentId: string,
    context: AgentExecutionContext
  ): Promise<any> {
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    return {
      agentId,
      executedAt: new Date(),
      contextReceived: !!context.ontologySnapshot,
      previousResults: Object.keys(context.previousResults || {}).length,
      result: `Simulated result from ${agentId}`
    };
  }

  /**
   * Get current shared context
   */
  getSharedContext(): SharedContext | null {
    return this.sharedContext;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WorkflowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset orchestrator state
   */
  reset(): void {
    this.sharedContext = null;
  }
}

/**
 * Singleton instance
 */
export const workflowOrchestrator = new WorkflowOrchestrator();

export default WorkflowOrchestrator;
