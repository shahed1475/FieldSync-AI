/**
 * Agent Registry
 */

export interface Agent {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'error';
}

export interface AgentRegistry {
  register(agent: Agent): void;
  unregister(agentId: string): void;
  getAgent(agentId: string): Agent | undefined;
  listAgents(): Agent[];
}

export class DefaultAgentRegistry implements AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  register(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
}
