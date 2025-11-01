"use strict";
/**
 * Agent Registry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultAgentRegistry = void 0;
class DefaultAgentRegistry {
    constructor() {
        this.agents = new Map();
    }
    register(agent) {
        this.agents.set(agent.id, agent);
    }
    unregister(agentId) {
        this.agents.delete(agentId);
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    listAgents() {
        return Array.from(this.agents.values());
    }
}
exports.DefaultAgentRegistry = DefaultAgentRegistry;
//# sourceMappingURL=agent-registry.js.map