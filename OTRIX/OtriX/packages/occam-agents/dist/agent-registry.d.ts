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
export declare class DefaultAgentRegistry implements AgentRegistry {
    private agents;
    register(agent: Agent): void;
    unregister(agentId: string): void;
    getAgent(agentId: string): Agent | undefined;
    listAgents(): Agent[];
}
//# sourceMappingURL=agent-registry.d.ts.map