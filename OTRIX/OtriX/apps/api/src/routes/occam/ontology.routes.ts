/**
 * OCCAM Ontology API Routes
 * Phase 1: Ontology & Schema Engineering
 *
 * Endpoints:
 * POST /occam/ontology/build - Build ontology from policy inputs
 * GET  /occam/schema - Get latest schema snapshot
 * GET  /occam/graph - Get graph representation
 * POST /occam/impact-analysis - Perform impact analysis
 */

import { Router, Request, Response } from 'express';
import {
  ontologyBuilder,
  jsonSchemaGenerator,
  neo4jMapper,
  type PolicyInput,
  type OntologyBuildOptions,
  type SchemaGenerationOptions,
  type GraphQuery,
} from '@otrix/occam-core';

const router = Router();

/**
 * POST /occam/ontology/build
 * Build complete ontology from policy inputs
 */
router.post('/build', async (req: Request, res: Response) => {
  try {
    const { policies, options }: {
      policies: PolicyInput[];
      options?: OntologyBuildOptions;
    } = req.body;

    if (!policies || !Array.isArray(policies) || policies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: policies array is required',
      });
    }

    // Build ontology
    const result = await ontologyBuilder.build(policies, options);

    // If build successful, map to graph
    if (result.success && options?.generateGraph) {
      const graphResult = neo4jMapper.mapOntologyToGraph(result.policies);
      return res.json({
        success: true,
        ontology: result,
        graph: {
          nodeCount: graphResult.nodes.length,
          relationshipCount: graphResult.relationships.length,
        },
      });
    }

    res.json({
      success: result.success,
      ontology: result,
    });
  } catch (error: any) {
    console.error('Error building ontology:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to build ontology',
    });
  }
});

/**
 * GET /occam/schema
 * Get latest schema snapshot for all entity types
 */
router.get('/schema', (req: Request, res: Response) => {
  try {
    const options: SchemaGenerationOptions = {
      includeOptional: req.query.includeOptional === 'true',
      strictMode: req.query.strictMode === 'true',
      roleBasedVisibility: req.query.roleBasedVisibility === 'true',
      generateZodSchema: req.query.generateZodSchema === 'true',
    };

    const schemas = jsonSchemaGenerator.generateCompleteSchema(options);

    // Convert to serializable format (remove Zod schemas from response)
    const serializableSchemas: Record<string, any> = {};
    for (const [key, schema] of Object.entries(schemas)) {
      serializableSchemas[key] = {
        jsonSchema: schema.jsonSchema,
        rolePermissions: schema.rolePermissions,
        metadata: {
          ...schema.metadata,
          generatedAt: schema.metadata.generatedAt.toISOString(),
        },
        hasZodSchema: !!schema.zodSchema,
      };
    }

    res.json({
      success: true,
      schemas: serializableSchemas,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error generating schema:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate schema',
    });
  }
});

/**
 * GET /occam/schema/:entityType
 * Get schema for specific entity type
 */
router.get('/schema/:entityType', (req: Request, res: Response) => {
  try {
    const { entityType } = req.params;
    const validTypes = ['Policy', 'SOP', 'Section', 'Step', 'Clause'];

    if (!validTypes.includes(entityType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid entity type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const options: SchemaGenerationOptions = {
      includeOptional: req.query.includeOptional === 'true',
      strictMode: req.query.strictMode === 'true',
      roleBasedVisibility: req.query.roleBasedVisibility === 'true',
      generateZodSchema: req.query.generateZodSchema === 'true',
    };

    let schema;
    switch (entityType) {
      case 'Policy':
        schema = jsonSchemaGenerator.generatePolicySchema(options);
        break;
      case 'SOP':
        schema = jsonSchemaGenerator.generateSOPSchema(options);
        break;
      case 'Section':
        schema = jsonSchemaGenerator.generateSectionSchema(options);
        break;
      case 'Step':
        schema = jsonSchemaGenerator.generateStepSchema(options);
        break;
      case 'Clause':
        schema = jsonSchemaGenerator.generateClauseSchema(options);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid entity type',
        });
    }

    res.json({
      success: true,
      entityType,
      schema: {
        jsonSchema: schema.jsonSchema,
        rolePermissions: schema.rolePermissions,
        metadata: {
          ...schema.metadata,
          generatedAt: schema.metadata.generatedAt.toISOString(),
        },
        hasZodSchema: !!schema.zodSchema,
      },
    });
  } catch (error: any) {
    console.error('Error generating schema:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate schema',
    });
  }
});

/**
 * GET /occam/graph
 * Get graph representation of ontology
 */
router.get('/graph', (req: Request, res: Response) => {
  try {
    const nodes = neo4jMapper.getAllNodes();
    const relationships = neo4jMapper.getAllRelationships();

    res.json({
      success: true,
      graph: {
        nodes,
        relationships,
        nodeCount: nodes.length,
        relationshipCount: relationships.length,
      },
    });
  } catch (error: any) {
    console.error('Error retrieving graph:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve graph',
    });
  }
});

/**
 * POST /occam/graph/query
 * Query graph relationships
 */
router.post('/graph/query', (req: Request, res: Response) => {
  try {
    const query: GraphQuery = req.body;

    if (!query.nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required',
      });
    }

    const result = neo4jMapper.queryGraph(query);

    res.json({
      success: true,
      query,
      result: {
        nodes: result.nodes,
        relationships: result.relationships,
        nodeCount: result.nodes.length,
        relationshipCount: result.relationships.length,
      },
    });
  } catch (error: any) {
    console.error('Error querying graph:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to query graph',
    });
  }
});

/**
 * POST /occam/impact-analysis
 * Perform impact analysis for a node
 */
router.post('/impact-analysis', (req: Request, res: Response) => {
  try {
    const { nodeId } = req.body;

    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required',
      });
    }

    const result = neo4jMapper.performImpactAnalysis(nodeId);

    res.json({
      success: true,
      nodeId,
      impact: {
        impactedNodeCount: result.impactedNodes.length,
        impactedNodes: result.impactedNodes,
        dependencyChainCount: result.dependencyChain.length,
        riskScore: result.riskScore,
        summary: result.summary,
      },
    });
  } catch (error: any) {
    console.error('Error performing impact analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to perform impact analysis',
    });
  }
});

/**
 * GET /occam/graph/cypher
 * Export graph to Cypher query format
 */
router.get('/graph/cypher', (req: Request, res: Response) => {
  try {
    const queries = neo4jMapper.exportToCypher();

    res.json({
      success: true,
      queries,
      queryCount: queries.length,
    });
  } catch (error: any) {
    console.error('Error exporting to Cypher:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export to Cypher',
    });
  }
});

/**
 * DELETE /occam/graph
 * Clear the graph
 */
router.delete('/graph', (req: Request, res: Response) => {
  try {
    neo4jMapper.clear();

    res.json({
      success: true,
      message: 'Graph cleared successfully',
    });
  } catch (error: any) {
    console.error('Error clearing graph:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear graph',
    });
  }
});

export default router;
