"use strict";
/**
 * OCCAM Core - Policy, SOP, and Compliance Framework
 * Phase 1: Ontology & Schema Engineering
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.neo4jMapper = exports.Neo4jMapper = exports.jsonSchemaGenerator = exports.JSONSchemaGenerator = exports.ontologyBuilder = exports.OntologyBuilder = exports.telemetryLogger = exports.logDecision = void 0;
// Core types and telemetry
__exportStar(require("./types"), exports);
__exportStar(require("./telemetry"), exports);
var telemetry_1 = require("./telemetry");
Object.defineProperty(exports, "logDecision", { enumerable: true, get: function () { return telemetry_1.logDecision; } });
Object.defineProperty(exports, "telemetryLogger", { enumerable: true, get: function () { return telemetry_1.telemetryLogger; } });
// Phase 1: Ontology & Schema Engineering
var ontology_builder_1 = require("./ontology/ontology-builder");
Object.defineProperty(exports, "OntologyBuilder", { enumerable: true, get: function () { return ontology_builder_1.OntologyBuilder; } });
Object.defineProperty(exports, "ontologyBuilder", { enumerable: true, get: function () { return ontology_builder_1.ontologyBuilder; } });
var json_schema_1 = require("./validation/json-schema");
Object.defineProperty(exports, "JSONSchemaGenerator", { enumerable: true, get: function () { return json_schema_1.JSONSchemaGenerator; } });
Object.defineProperty(exports, "jsonSchemaGenerator", { enumerable: true, get: function () { return json_schema_1.jsonSchemaGenerator; } });
var neo4j_mapper_1 = require("./graph/neo4j-mapper");
Object.defineProperty(exports, "Neo4jMapper", { enumerable: true, get: function () { return neo4j_mapper_1.Neo4jMapper; } });
Object.defineProperty(exports, "neo4jMapper", { enumerable: true, get: function () { return neo4j_mapper_1.neo4jMapper; } });
exports.VERSION = '1.0.0';
//# sourceMappingURL=index.js.map