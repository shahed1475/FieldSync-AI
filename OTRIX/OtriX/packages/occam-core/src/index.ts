/**
 * OCCAM Core - Policy, SOP, and Compliance Framework
 * Phase 1: Ontology & Schema Engineering
 */

// Core types and telemetry
export * from './types';
export * from './telemetry';
export { logDecision, telemetryLogger } from './telemetry';

// Phase 1: Ontology & Schema Engineering
export { OntologyBuilder, ontologyBuilder } from './ontology/ontology-builder';
export type {
  OntologyBuildOptions,
  OntologyBuildResult,
  PolicyInput,
  SOPInput,
  SectionInput,
  StepInput,
  ClauseInput,
} from './ontology/ontology-builder';

export { JSONSchemaGenerator, jsonSchemaGenerator } from './validation/json-schema';
export type {
  SchemaGenerationOptions,
  GeneratedSchema,
  RolePermissions,
  SchemaMetadata,
} from './validation/json-schema';

export { Neo4jMapper, neo4jMapper } from './graph/neo4j-mapper';
export type {
  GraphNode,
  GraphRelationship,
  GraphQuery,
  GraphQueryResult,
  GraphPath,
  ImpactAnalysisResult,
  RelationshipType,
} from './graph/neo4j-mapper';

export const VERSION = '1.0.0';
