/**
 * OCCAM Neo4j Graph Mapper
 * Phase 1: Ontology & Schema Engineering
 *
 * Maps compliance objects as graph nodes with relationships for dependency analysis
 * Supports DEPENDS_ON, CONTAINS, DERIVED_FROM relationships
 */
import { Policy, SOP, Section, Step, Clause } from '../types';
export type RelationshipType = 'DEPENDS_ON' | 'CONTAINS' | 'DERIVED_FROM' | 'REFERENCES';
export interface GraphNode {
    id: string;
    type: 'Policy' | 'SOP' | 'Section' | 'Step' | 'Clause';
    properties: Record<string, any>;
    labels: string[];
}
export interface GraphRelationship {
    id: string;
    type: RelationshipType;
    from: string;
    to: string;
    properties?: Record<string, any>;
}
export interface GraphQuery {
    nodeId: string;
    relationshipTypes?: RelationshipType[];
    direction?: 'outgoing' | 'incoming' | 'both';
    maxDepth?: number;
}
export interface GraphQueryResult {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    paths?: GraphPath[];
}
export interface GraphPath {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    length: number;
}
export interface ImpactAnalysisResult {
    impactedNodes: GraphNode[];
    dependencyChain: GraphPath[];
    riskScore: number;
    summary: string;
}
/**
 * Neo4j Graph Mapper
 */
export declare class Neo4jMapper {
    private nodes;
    private relationships;
    /**
     * Map Policy to graph node
     */
    mapPolicyToNode(policy: Policy): GraphNode;
    /**
     * Map SOP to graph node
     */
    mapSOPToNode(sop: SOP): GraphNode;
    /**
     * Map Section to graph node
     */
    mapSectionToNode(section: Section): GraphNode;
    /**
     * Map Step to graph node
     */
    mapStepToNode(step: Step): GraphNode;
    /**
     * Map Clause to graph node
     */
    mapClauseToNode(clause: Clause): GraphNode;
    /**
     * Create CONTAINS relationship (parent contains child)
     */
    createContainsRelationship(parentId: string, childId: string): GraphRelationship;
    /**
     * Create DEPENDS_ON relationship (source depends on target)
     */
    createDependsOnRelationship(sourceId: string, targetId: string, properties?: Record<string, any>): GraphRelationship;
    /**
     * Create DERIVED_FROM relationship (child derived from parent)
     */
    createDerivedFromRelationship(childId: string, parentId: string, properties?: Record<string, any>): GraphRelationship;
    /**
     * Create REFERENCES relationship (source references target)
     */
    createReferencesRelationship(sourceId: string, targetId: string, properties?: Record<string, any>): GraphRelationship;
    /**
     * Map complete ontology to graph
     */
    mapOntologyToGraph(policies: Policy[]): {
        nodes: GraphNode[];
        relationships: GraphRelationship[];
    };
    /**
     * Query graph relationships
     */
    queryGraph(query: GraphQuery): GraphQueryResult;
    /**
     * Perform impact analysis - find all nodes affected by changes to a given node
     */
    performImpactAnalysis(nodeId: string): ImpactAnalysisResult;
    /**
     * Get all nodes
     */
    getAllNodes(): GraphNode[];
    /**
     * Get all relationships
     */
    getAllRelationships(): GraphRelationship[];
    /**
     * Get node by ID
     */
    getNode(id: string): GraphNode | undefined;
    /**
     * Clear graph
     */
    clear(): void;
    /**
     * Export graph to Cypher query format (for actual Neo4j import)
     */
    exportToCypher(): string[];
}
export declare const neo4jMapper: Neo4jMapper;
//# sourceMappingURL=neo4j-mapper.d.ts.map