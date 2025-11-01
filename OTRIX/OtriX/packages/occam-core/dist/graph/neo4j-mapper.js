"use strict";
/**
 * OCCAM Neo4j Graph Mapper
 * Phase 1: Ontology & Schema Engineering
 *
 * Maps compliance objects as graph nodes with relationships for dependency analysis
 * Supports DEPENDS_ON, CONTAINS, DERIVED_FROM relationships
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.neo4jMapper = exports.Neo4jMapper = void 0;
const telemetry_1 = require("../telemetry");
/**
 * Neo4j Graph Mapper
 */
class Neo4jMapper {
    constructor() {
        this.nodes = new Map();
        this.relationships = new Map();
    }
    /**
     * Map Policy to graph node
     */
    mapPolicyToNode(policy) {
        const node = {
            id: policy.id,
            type: 'Policy',
            properties: {
                title: policy.title,
                version: policy.version,
                createdAt: policy.createdAt?.toISOString(),
                updatedAt: policy.updatedAt?.toISOString(),
                sectionCount: policy.sections.length,
            },
            labels: ['Policy', 'ComplianceEntity'],
        };
        this.nodes.set(node.id, node);
        (0, telemetry_1.logDecision)({
            nodeId: 'neo4j-mapper',
            nodeName: 'Neo4j Mapper',
            nodeType: 'system',
            timestamp: new Date(),
        }, {
            action: 'map_policy_to_node',
            metadata: { policyId: policy.id, title: policy.title },
            result: 'success',
        });
        return node;
    }
    /**
     * Map SOP to graph node
     */
    mapSOPToNode(sop) {
        const node = {
            id: sop.id,
            type: 'SOP',
            properties: {
                name: sop.name,
                version: sop.version,
                owner: sop.owner,
                policyId: sop.policyId,
                stepCount: sop.steps.length,
            },
            labels: ['SOP', 'ComplianceEntity'],
        };
        this.nodes.set(node.id, node);
        return node;
    }
    /**
     * Map Section to graph node
     */
    mapSectionToNode(section) {
        const node = {
            id: section.id,
            type: 'Section',
            properties: {
                name: section.name,
                order: section.order,
                sopId: section.sopId,
                clauseCount: section.clauses.length,
            },
            labels: ['Section', 'ComplianceEntity'],
        };
        this.nodes.set(node.id, node);
        return node;
    }
    /**
     * Map Step to graph node
     */
    mapStepToNode(step) {
        const node = {
            id: step.id,
            type: 'Step',
            properties: {
                description: step.description,
                completed: step.completed,
                responsible: step.responsible,
                sectionId: step.sectionId,
                order: step.order,
            },
            labels: ['Step', 'ComplianceEntity'],
        };
        this.nodes.set(node.id, node);
        return node;
    }
    /**
     * Map Clause to graph node
     */
    mapClauseToNode(clause) {
        const node = {
            id: clause.id,
            type: 'Clause',
            properties: {
                text: clause.text,
                riskLevel: clause.riskLevel,
                jurisdiction: clause.jurisdiction,
                stepId: clause.stepId,
                type: clause.type,
            },
            labels: ['Clause', 'ComplianceEntity', `Risk_${clause.riskLevel}`],
        };
        this.nodes.set(node.id, node);
        return node;
    }
    /**
     * Create CONTAINS relationship (parent contains child)
     */
    createContainsRelationship(parentId, childId) {
        const relationshipId = `contains-${parentId}-${childId}`;
        const relationship = {
            id: relationshipId,
            type: 'CONTAINS',
            from: parentId,
            to: childId,
        };
        this.relationships.set(relationshipId, relationship);
        return relationship;
    }
    /**
     * Create DEPENDS_ON relationship (source depends on target)
     */
    createDependsOnRelationship(sourceId, targetId, properties) {
        const relationshipId = `depends-${sourceId}-${targetId}`;
        const relationship = {
            id: relationshipId,
            type: 'DEPENDS_ON',
            from: sourceId,
            to: targetId,
            properties,
        };
        this.relationships.set(relationshipId, relationship);
        return relationship;
    }
    /**
     * Create DERIVED_FROM relationship (child derived from parent)
     */
    createDerivedFromRelationship(childId, parentId, properties) {
        const relationshipId = `derived-${childId}-${parentId}`;
        const relationship = {
            id: relationshipId,
            type: 'DERIVED_FROM',
            from: childId,
            to: parentId,
            properties,
        };
        this.relationships.set(relationshipId, relationship);
        return relationship;
    }
    /**
     * Create REFERENCES relationship (source references target)
     */
    createReferencesRelationship(sourceId, targetId, properties) {
        const relationshipId = `ref-${sourceId}-${targetId}`;
        const relationship = {
            id: relationshipId,
            type: 'REFERENCES',
            from: sourceId,
            to: targetId,
            properties,
        };
        this.relationships.set(relationshipId, relationship);
        return relationship;
    }
    /**
     * Map complete ontology to graph
     */
    mapOntologyToGraph(policies) {
        const startTime = Date.now();
        (0, telemetry_1.logDecision)({
            nodeId: 'neo4j-mapper',
            nodeName: 'Neo4j Mapper',
            nodeType: 'system',
            timestamp: new Date(),
        }, {
            action: 'map_ontology_to_graph',
            metadata: { policyCount: policies.length },
        });
        // Clear existing graph
        this.nodes.clear();
        this.relationships.clear();
        for (const policy of policies) {
            // Map policy node
            this.mapPolicyToNode(policy);
            // Map sections
            for (const section of policy.sections) {
                this.mapSectionToNode(section);
                this.createContainsRelationship(policy.id, section.id);
                // Map section steps
                if (section.steps) {
                    for (const step of section.steps) {
                        this.mapStepToNode(step);
                        this.createContainsRelationship(section.id, step.id);
                        // Map step clauses
                        if (step.clauses) {
                            for (const clause of step.clauses) {
                                this.mapClauseToNode(clause);
                                this.createContainsRelationship(step.id, clause.id);
                            }
                        }
                    }
                }
                // Map section clauses
                for (const clause of section.clauses) {
                    if (!this.nodes.has(clause.id)) {
                        this.mapClauseToNode(clause);
                        this.createContainsRelationship(section.id, clause.id);
                    }
                }
            }
        }
        const result = {
            nodes: Array.from(this.nodes.values()),
            relationships: Array.from(this.relationships.values()),
        };
        (0, telemetry_1.logDecision)({
            nodeId: 'neo4j-mapper',
            nodeName: 'Neo4j Mapper',
            nodeType: 'system',
            timestamp: new Date(),
        }, {
            action: 'map_ontology_to_graph_complete',
            metadata: {
                nodeCount: result.nodes.length,
                relationshipCount: result.relationships.length,
            },
            result: 'success',
            latencyMs: Date.now() - startTime,
        });
        return result;
    }
    /**
     * Query graph relationships
     */
    queryGraph(query) {
        const { nodeId, relationshipTypes, direction = 'both', maxDepth = 3 } = query;
        const node = this.nodes.get(nodeId);
        if (!node) {
            return { nodes: [], relationships: [] };
        }
        const visitedNodes = new Set([nodeId]);
        const resultNodes = [node];
        const resultRelationships = [];
        // Breadth-first traversal
        const queue = [{ id: nodeId, depth: 0 }];
        while (queue.length > 0) {
            const current = queue.shift();
            if (current.depth >= maxDepth) {
                continue;
            }
            // Find related relationships
            for (const relationship of this.relationships.values()) {
                if (relationshipTypes && !relationshipTypes.includes(relationship.type)) {
                    continue;
                }
                let relatedNodeId = null;
                if ((direction === 'outgoing' || direction === 'both') && relationship.from === current.id) {
                    relatedNodeId = relationship.to;
                }
                if ((direction === 'incoming' || direction === 'both') && relationship.to === current.id) {
                    relatedNodeId = relationship.from;
                }
                if (relatedNodeId && !visitedNodes.has(relatedNodeId)) {
                    visitedNodes.add(relatedNodeId);
                    const relatedNode = this.nodes.get(relatedNodeId);
                    if (relatedNode) {
                        resultNodes.push(relatedNode);
                        resultRelationships.push(relationship);
                        queue.push({ id: relatedNodeId, depth: current.depth + 1 });
                    }
                }
                else if (relatedNodeId && !resultRelationships.some(r => r.id === relationship.id)) {
                    resultRelationships.push(relationship);
                }
            }
        }
        return { nodes: resultNodes, relationships: resultRelationships };
    }
    /**
     * Perform impact analysis - find all nodes affected by changes to a given node
     */
    performImpactAnalysis(nodeId) {
        const startTime = Date.now();
        (0, telemetry_1.logDecision)({
            nodeId: 'neo4j-mapper',
            nodeName: 'Neo4j Mapper',
            nodeType: 'system',
            timestamp: new Date(),
        }, {
            action: 'perform_impact_analysis',
            metadata: { targetNodeId: nodeId },
        });
        // Find all nodes that depend on this node
        const impactQuery = {
            nodeId,
            relationshipTypes: ['DEPENDS_ON', 'REFERENCES'],
            direction: 'incoming',
            maxDepth: 5,
        };
        const queryResult = this.queryGraph(impactQuery);
        // Calculate risk score based on impacted nodes
        let riskScore = 0;
        for (const node of queryResult.nodes) {
            if (node.properties.riskLevel === 'high')
                riskScore += 30;
            else if (node.properties.riskLevel === 'medium')
                riskScore += 20;
            else if (node.properties.riskLevel === 'low')
                riskScore += 10;
            else
                riskScore += 5;
        }
        const summary = `Impact analysis: ${queryResult.nodes.length} nodes affected, risk score: ${riskScore}`;
        (0, telemetry_1.logDecision)({
            nodeId: 'neo4j-mapper',
            nodeName: 'Neo4j Mapper',
            nodeType: 'system',
            timestamp: new Date(),
        }, {
            action: 'perform_impact_analysis_complete',
            metadata: {
                targetNodeId: nodeId,
                impactedNodeCount: queryResult.nodes.length,
                riskScore,
            },
            result: 'success',
            latencyMs: Date.now() - startTime,
        });
        return {
            impactedNodes: queryResult.nodes,
            dependencyChain: [], // TODO: compute actual paths
            riskScore,
            summary,
        };
    }
    /**
     * Get all nodes
     */
    getAllNodes() {
        return Array.from(this.nodes.values());
    }
    /**
     * Get all relationships
     */
    getAllRelationships() {
        return Array.from(this.relationships.values());
    }
    /**
     * Get node by ID
     */
    getNode(id) {
        return this.nodes.get(id);
    }
    /**
     * Clear graph
     */
    clear() {
        this.nodes.clear();
        this.relationships.clear();
    }
    /**
     * Export graph to Cypher query format (for actual Neo4j import)
     */
    exportToCypher() {
        const queries = [];
        // Create node queries
        for (const node of this.nodes.values()) {
            const labels = node.labels.join(':');
            const props = JSON.stringify(node.properties).replace(/"/g, "'");
            queries.push(`CREATE (n:${labels} ${props})`);
        }
        // Create relationship queries
        for (const rel of this.relationships.values()) {
            const props = rel.properties ? JSON.stringify(rel.properties).replace(/"/g, "'") : '{}';
            queries.push(`MATCH (a {id: '${rel.from}'}), (b {id: '${rel.to}'}) CREATE (a)-[:${rel.type} ${props}]->(b)`);
        }
        return queries;
    }
}
exports.Neo4jMapper = Neo4jMapper;
// Singleton instance
exports.neo4jMapper = new Neo4jMapper();
//# sourceMappingURL=neo4j-mapper.js.map