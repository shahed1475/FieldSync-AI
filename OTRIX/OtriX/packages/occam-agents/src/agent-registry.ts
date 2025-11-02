/**
 * OCCAM Agent Registry
 * Phase 9: Orchestrator Hardening
 *
 * Responsible for:
 * - Registering all OCCAM agents
 * - Managing agent metadata and capabilities
 * - Providing agent discovery and lookup
 * - Tracking agent health and availability
 */

import type { telemetryService } from '@otrix/occam-core';

/**
 * Agent types in OCCAM system
 */
export type AgentType =
  | 'meta-bootstrap'
  | 'ontology-schema'
  | 'regulatory-intelligence'
  | 'kb-ingestor'
  | 'audit-verifier'
  | 'risk-analytics'
  | 'learning-adaptive'
  | 'publisher';

/**
 * Agent status
 */
export type AgentStatus = 'active' | 'inactive' | 'error' | 'initializing';

/**
 * Agent capabilities
 */
export interface AgentCapabilities {
  supportsContextChaining: boolean;
  supportsZeroDrift: boolean;
  requiresOntology: boolean;
  requiresFactBox: boolean;
  canParallelize: boolean;
  estimatedLatencyMs: number;
}

/**
 * Agent metadata
 */
export interface AgentMetadata {
  id: string;
  name: string;
  type: AgentType;
  version: string;
  description: string;
  capabilities: AgentCapabilities;
  dependencies: string[]; // Agent IDs this agent depends on
  status: AgentStatus;
  lastHealthCheck?: Date;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageLatencyMs: number;
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  agentId: string;
  ontologySnapshot?: any; // Latest ontology state
  factBoxEntries?: any[]; // Relevant FactBox entries
  regulatoryContext?: any; // Regulatory intelligence context
  previousResults?: Record<string, any>; // Results from previous agents
  checksum?: string; // For deterministic runs
  telemetry?: typeof telemetryService;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  agentId: string;
  success: boolean;
  data: any;
  latencyMs: number;
  confidenceScore?: number;
  errors?: string[];
  warnings?: string[];
  metadata?: Record<string, any>;
}

/**
 * Agent Registry
 * Manages all OCCAM agents and their metadata
 */
export class AgentRegistry {
  private agents: Map<string, AgentMetadata> = new Map();
  private agentDependencyGraph: Map<string, Set<string>> = new Map();

  constructor() {
    this.initializeAgents();
  }

  /**
   * Initialize built-in OCCAM agents
   */
  private initializeAgents(): void {
    // Phase 1: Meta-Bootstrap
    this.registerAgent({
      id: 'meta-bootstrap',
      name: 'Meta-Bootstrap Agent',
      type: 'meta-bootstrap',
      version: '1.0.0',
      description: 'Initializes system state and determines jurisdictions',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: false,
        requiresOntology: false,
        requiresFactBox: false,
        canParallelize: false,
        estimatedLatencyMs: 500
      },
      dependencies: [],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Phase 2: Ontology Schema
    this.registerAgent({
      id: 'ontology-schema',
      name: 'Ontology Schema Agent',
      type: 'ontology-schema',
      version: '1.0.0',
      description: 'Builds domain ontology from regulatory corpus',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: false,
        requiresOntology: false,
        requiresFactBox: false,
        canParallelize: true,
        estimatedLatencyMs: 2000
      },
      dependencies: ['meta-bootstrap'],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Phase 3: Regulatory Intelligence
    this.registerAgent({
      id: 'regulatory-intelligence',
      name: 'Regulatory Intelligence Agent',
      type: 'regulatory-intelligence',
      version: '1.0.0',
      description: 'Ingests and processes regulatory documents',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: true,
        requiresOntology: true,
        requiresFactBox: false,
        canParallelize: true,
        estimatedLatencyMs: 3000
      },
      dependencies: ['ontology-schema'],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Phase 4: KB Ingestor
    this.registerAgent({
      id: 'kb-ingestor',
      name: 'Knowledge Base Ingestor',
      type: 'kb-ingestor',
      version: '1.0.0',
      description: 'Ingests compliance data into FactBox',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: true,
        requiresOntology: true,
        requiresFactBox: true,
        canParallelize: true,
        estimatedLatencyMs: 1500
      },
      dependencies: ['regulatory-intelligence'],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Phase 5: Audit Verifier
    this.registerAgent({
      id: 'audit-verifier',
      name: 'Audit & Source Verification Agent',
      type: 'audit-verifier',
      version: '1.0.0',
      description: 'Verifies citations and detects drift',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: true,
        requiresOntology: true,
        requiresFactBox: true,
        canParallelize: true,
        estimatedLatencyMs: 2500
      },
      dependencies: ['kb-ingestor'],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Phase 6: Risk Analytics
    this.registerAgent({
      id: 'risk-analytics',
      name: 'Risk Analytics & Predictive Compliance Agent',
      type: 'risk-analytics',
      version: '1.0.0',
      description: 'Calculates risk scores and predicts compliance',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: false,
        requiresOntology: true,
        requiresFactBox: true,
        canParallelize: true,
        estimatedLatencyMs: 1800
      },
      dependencies: ['audit-verifier'],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Phase 7: Learning Adaptive
    this.registerAgent({
      id: 'learning-adaptive',
      name: 'Learning & Adaptive Refinement Agent',
      type: 'learning-adaptive',
      version: '1.0.0',
      description: 'Learns from feedback and refines policies',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: false,
        requiresOntology: true,
        requiresFactBox: true,
        canParallelize: false,
        estimatedLatencyMs: 3500
      },
      dependencies: ['risk-analytics'],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Phase 8: Publisher
    this.registerAgent({
      id: 'publisher',
      name: 'Governance & Publishing Agent',
      type: 'publisher',
      version: '1.0.0',
      description: 'Compiles and publishes compliance documents',
      capabilities: {
        supportsContextChaining: true,
        supportsZeroDrift: true,
        requiresOntology: true,
        requiresFactBox: true,
        canParallelize: false,
        estimatedLatencyMs: 2000
      },
      dependencies: ['learning-adaptive', 'audit-verifier'],
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageLatencyMs: 0
    });

    // Build dependency graph
    this.buildDependencyGraph();
  }

  /**
   * Build dependency graph for execution ordering
   */
  private buildDependencyGraph(): void {
    this.agents.forEach((agent, agentId) => {
      const dependents = new Set<string>();

      // Find all agents that depend on this agent
      this.agents.forEach((otherAgent, otherId) => {
        if (otherAgent.dependencies.includes(agentId)) {
          dependents.add(otherId);
        }
      });

      this.agentDependencyGraph.set(agentId, dependents);
    });
  }

  /**
   * Register an agent
   */
  registerAgent(metadata: AgentMetadata): void {
    this.agents.set(metadata.id, metadata);
    this.buildDependencyGraph();
  }

  /**
   * Get agent metadata
   */
  getAgent(agentId: string): AgentMetadata | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: AgentType): AgentMetadata[] {
    return this.getAllAgents().filter(agent => agent.type === type);
  }

  /**
   * Get agent dependencies (agents this agent depends on)
   */
  getAgentDependencies(agentId: string): AgentMetadata[] {
    const agent = this.getAgent(agentId);
    if (!agent) return [];

    return agent.dependencies
      .map(depId => this.getAgent(depId))
      .filter(a => a !== undefined) as AgentMetadata[];
  }

  /**
   * Get agents that depend on this agent
   */
  getAgentDependents(agentId: string): AgentMetadata[] {
    const dependentIds = this.agentDependencyGraph.get(agentId) || new Set();
    return Array.from(dependentIds)
      .map(id => this.getAgent(id))
      .filter(a => a !== undefined) as AgentMetadata[];
  }

  /**
   * Get execution order (topological sort)
   */
  getExecutionOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (agentId: string) => {
      if (visited.has(agentId)) return;

      const agent = this.getAgent(agentId);
      if (!agent) return;

      // Visit dependencies first
      agent.dependencies.forEach(depId => visit(depId));

      visited.add(agentId);
      order.push(agentId);
    };

    // Visit all agents
    this.agents.forEach((_, agentId) => visit(agentId));

    return order;
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentStatus): void {
    const agent = this.getAgent(agentId);
    if (agent) {
      agent.status = status;
      agent.lastHealthCheck = new Date();
    }
  }

  /**
   * Record agent execution
   */
  recordExecution(result: AgentExecutionResult): void {
    const agent = this.getAgent(result.agentId);
    if (!agent) return;

    agent.totalExecutions++;
    if (result.success) {
      agent.successfulExecutions++;
    } else {
      agent.failedExecutions++;
    }

    // Update average latency (rolling average)
    const totalLatency = agent.averageLatencyMs * (agent.totalExecutions - 1) + result.latencyMs;
    agent.averageLatencyMs = totalLatency / agent.totalExecutions;
  }

  /**
   * Get agent health summary
   */
  getAgentHealth(agentId: string): {
    status: AgentStatus;
    successRate: number;
    averageLatencyMs: number;
    lastHealthCheck?: Date;
  } | undefined {
    const agent = this.getAgent(agentId);
    if (!agent) return undefined;

    const successRate = agent.totalExecutions > 0
      ? (agent.successfulExecutions / agent.totalExecutions) * 100
      : 0;

    return {
      status: agent.status,
      successRate,
      averageLatencyMs: agent.averageLatencyMs,
      lastHealthCheck: agent.lastHealthCheck
    };
  }

  /**
   * Get system health summary
   */
  getSystemHealth(): {
    totalAgents: number;
    activeAgents: number;
    inactiveAgents: number;
    errorAgents: number;
    overallSuccessRate: number;
    averageLatencyMs: number;
  } {
    const agents = this.getAllAgents();
    const active = agents.filter(a => a.status === 'active').length;
    const inactive = agents.filter(a => a.status === 'inactive').length;
    const error = agents.filter(a => a.status === 'error').length;

    const totalExecutions = agents.reduce((sum, a) => sum + a.totalExecutions, 0);
    const totalSuccesses = agents.reduce((sum, a) => sum + a.successfulExecutions, 0);
    const overallSuccessRate = totalExecutions > 0
      ? (totalSuccesses / totalExecutions) * 100
      : 0;

    const totalLatency = agents.reduce((sum, a) => sum + a.averageLatencyMs * a.totalExecutions, 0);
    const averageLatencyMs = totalExecutions > 0
      ? totalLatency / totalExecutions
      : 0;

    return {
      totalAgents: agents.length,
      activeAgents: active,
      inactiveAgents: inactive,
      errorAgents: error,
      overallSuccessRate,
      averageLatencyMs
    };
  }
}

/**
 * Singleton instance
 */
export const agentRegistry = new AgentRegistry();

export default AgentRegistry;
