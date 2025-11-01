/**
 * OCCAM JSON Schema Generator
 * Phase 1: Ontology & Schema Engineering
 *
 * Auto-generates JSON schemas and Zod validators for OCCAM compliance objects
 * with RBAC support and structural integrity validation
 */

import { z } from 'zod';
import { Policy, SOP, Section, Step, Clause, RegulatoryCitation } from '../types';
import { logDecision } from '../telemetry';

export interface SchemaGenerationOptions {
  includeOptional?: boolean;
  strictMode?: boolean;
  roleBasedVisibility?: boolean;
  generateZodSchema?: boolean;
}

export interface GeneratedSchema {
  jsonSchema: Record<string, any>;
  zodSchema?: z.ZodObject<any>;
  rolePermissions?: RolePermissions;
  metadata: SchemaMetadata;
}

export interface RolePermissions {
  [role: string]: {
    readableFields: string[];
    writableFields: string[];
  };
}

export interface SchemaMetadata {
  version: string;
  generatedAt: Date;
  entityType: string;
  fieldCount: number;
  requiredFields: string[];
}

/**
 * JSON Schema Generator
 */
export class JSONSchemaGenerator {
  /**
   * Generate schema for Policy
   */
  generatePolicySchema(options: SchemaGenerationOptions = {}): GeneratedSchema {
    const startTime = Date.now();

    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: 'Policy',
      description: 'Compliance policy containing SOPs and sections',
      properties: {
        id: {
          type: 'string',
          description: 'Unique policy identifier',
        },
        title: {
          type: 'string',
          description: 'Policy title',
          minLength: 1,
        },
        version: {
          type: 'string',
          description: 'Policy version',
          pattern: '^\\d+\\.\\d+\\.\\d+$',
        },
        sections: {
          type: 'array',
          description: 'Policy sections',
          items: { $ref: '#/definitions/Section' },
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          description: 'Creation timestamp',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
          description: 'Last update timestamp',
        },
      },
      required: ['id', 'title', 'version', 'sections'],
      additionalProperties: options.strictMode ? false : true,
    };

    const zodSchema = options.generateZodSchema
      ? z.object({
          id: z.string(),
          title: z.string().min(1),
          version: z.string().regex(/^\d+\.\d+\.\d+$/),
          sections: z.array(z.any()),
          createdAt: z.date().optional(),
          updatedAt: z.date().optional(),
        })
      : undefined;

    const rolePermissions = options.roleBasedVisibility
      ? this.generatePolicyRolePermissions()
      : undefined;

    const metadata: SchemaMetadata = {
      version: '1.0.0',
      generatedAt: new Date(),
      entityType: 'Policy',
      fieldCount: Object.keys(jsonSchema.properties).length,
      requiredFields: jsonSchema.required,
    };

    logDecision(
      {
        nodeId: 'schema-generator',
        nodeName: 'Schema Generator',
        nodeType: 'system',
        timestamp: new Date(),
      },
      {
        action: 'generate_policy_schema',
        metadata: { entityType: 'Policy', fieldCount: metadata.fieldCount },
        result: 'success',
        latencyMs: Date.now() - startTime,
      }
    );

    return {
      jsonSchema,
      zodSchema,
      rolePermissions,
      metadata,
    };
  }

  /**
   * Generate schema for SOP
   */
  generateSOPSchema(options: SchemaGenerationOptions = {}): GeneratedSchema {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: 'SOP',
      description: 'Standard Operating Procedure',
      properties: {
        id: { type: 'string', description: 'Unique SOP identifier' },
        policyId: { type: 'string', description: 'Parent policy ID' },
        owner: { type: 'string', description: 'SOP owner', minLength: 1 },
        steps: {
          type: 'array',
          description: 'SOP steps',
          items: { $ref: '#/definitions/Step' },
        },
        name: { type: 'string', description: 'SOP name' },
        version: { type: 'string', description: 'SOP version' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        sections: {
          type: 'array',
          description: 'SOP sections',
          items: { $ref: '#/definitions/Section' },
        },
      },
      required: ['id', 'policyId', 'owner', 'steps'],
      additionalProperties: options.strictMode ? false : true,
    };

    const zodSchema = options.generateZodSchema
      ? z.object({
          id: z.string(),
          policyId: z.string(),
          owner: z.string().min(1),
          steps: z.array(z.any()),
          name: z.string().optional(),
          version: z.string().optional(),
          createdAt: z.date().optional(),
          updatedAt: z.date().optional(),
          sections: z.array(z.any()).optional(),
        })
      : undefined;

    const metadata: SchemaMetadata = {
      version: '1.0.0',
      generatedAt: new Date(),
      entityType: 'SOP',
      fieldCount: Object.keys(jsonSchema.properties).length,
      requiredFields: jsonSchema.required,
    };

    return { jsonSchema, zodSchema, metadata };
  }

  /**
   * Generate schema for Section
   */
  generateSectionSchema(options: SchemaGenerationOptions = {}): GeneratedSchema {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: 'Section',
      description: 'Policy or SOP section',
      properties: {
        id: { type: 'string', description: 'Unique section identifier' },
        name: { type: 'string', description: 'Section name', minLength: 1 },
        order: { type: 'number', description: 'Section order', minimum: 0 },
        clauses: {
          type: 'array',
          description: 'Section clauses',
          items: { $ref: '#/definitions/Clause' },
        },
        sopId: { type: 'string', description: 'Parent SOP ID' },
        steps: {
          type: 'array',
          description: 'Section steps',
          items: { $ref: '#/definitions/Step' },
        },
      },
      required: ['id', 'name', 'order', 'clauses'],
      additionalProperties: options.strictMode ? false : true,
    };

    const zodSchema = options.generateZodSchema
      ? z.object({
          id: z.string(),
          name: z.string().min(1),
          order: z.number().min(0),
          clauses: z.array(z.any()),
          sopId: z.string().optional(),
          steps: z.array(z.any()).optional(),
        })
      : undefined;

    const metadata: SchemaMetadata = {
      version: '1.0.0',
      generatedAt: new Date(),
      entityType: 'Section',
      fieldCount: Object.keys(jsonSchema.properties).length,
      requiredFields: jsonSchema.required,
    };

    return { jsonSchema, zodSchema, metadata };
  }

  /**
   * Generate schema for Step
   */
  generateStepSchema(options: SchemaGenerationOptions = {}): GeneratedSchema {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: 'Step',
      description: 'Compliance workflow step',
      properties: {
        id: { type: 'string', description: 'Unique step identifier' },
        description: { type: 'string', description: 'Step description', minLength: 1 },
        completed: { type: 'boolean', description: 'Completion status' },
        responsible: { type: 'string', description: 'Responsible party', minLength: 1 },
        sectionId: { type: 'string', description: 'Parent section ID' },
        order: { type: 'number', description: 'Step order', minimum: 0 },
        clauses: {
          type: 'array',
          description: 'Step clauses',
          items: { $ref: '#/definitions/Clause' },
        },
      },
      required: ['id', 'description', 'completed', 'responsible'],
      additionalProperties: options.strictMode ? false : true,
    };

    const zodSchema = options.generateZodSchema
      ? z.object({
          id: z.string(),
          description: z.string().min(1),
          completed: z.boolean(),
          responsible: z.string().min(1),
          sectionId: z.string().optional(),
          order: z.number().min(0).optional(),
          clauses: z.array(z.any()).optional(),
        })
      : undefined;

    const metadata: SchemaMetadata = {
      version: '1.0.0',
      generatedAt: new Date(),
      entityType: 'Step',
      fieldCount: Object.keys(jsonSchema.properties).length,
      requiredFields: jsonSchema.required,
    };

    return { jsonSchema, zodSchema, metadata };
  }

  /**
   * Generate schema for Clause
   */
  generateClauseSchema(options: SchemaGenerationOptions = {}): GeneratedSchema {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: 'Clause',
      description: 'Compliance clause',
      properties: {
        id: { type: 'string', description: 'Unique clause identifier' },
        text: { type: 'string', description: 'Clause text', minLength: 1 },
        riskLevel: {
          type: 'string',
          description: 'Risk level',
          enum: ['low', 'medium', 'high'],
        },
        jurisdiction: { type: 'string', description: 'Jurisdiction', minLength: 1 },
        stepId: { type: 'string', description: 'Parent step ID' },
        content: { type: 'string', description: 'Additional content' },
        type: {
          type: 'string',
          description: 'Clause type',
          enum: ['requirement', 'recommendation', 'prohibition'],
        },
        regulatory: {
          type: 'array',
          description: 'Regulatory citations',
          items: { $ref: '#/definitions/RegulatoryCitation' },
        },
      },
      required: ['id', 'text', 'riskLevel', 'jurisdiction'],
      additionalProperties: options.strictMode ? false : true,
    };

    const zodSchema = options.generateZodSchema
      ? z.object({
          id: z.string(),
          text: z.string().min(1),
          riskLevel: z.enum(['low', 'medium', 'high']),
          jurisdiction: z.string().min(1),
          stepId: z.string().optional(),
          content: z.string().optional(),
          type: z.enum(['requirement', 'recommendation', 'prohibition']).optional(),
          regulatory: z.array(z.any()).optional(),
        })
      : undefined;

    const metadata: SchemaMetadata = {
      version: '1.0.0',
      generatedAt: new Date(),
      entityType: 'Clause',
      fieldCount: Object.keys(jsonSchema.properties).length,
      requiredFields: jsonSchema.required,
    };

    return { jsonSchema, zodSchema, metadata };
  }

  /**
   * Generate complete schema snapshot with all entity types
   */
  generateCompleteSchema(options: SchemaGenerationOptions = {}): Record<string, GeneratedSchema> {
    const startTime = Date.now();

    logDecision(
      {
        nodeId: 'schema-generator',
        nodeName: 'Schema Generator',
        nodeType: 'system',
        timestamp: new Date(),
      },
      {
        action: 'generate_complete_schema',
        metadata: { options },
      }
    );

    const schemas = {
      Policy: this.generatePolicySchema(options),
      SOP: this.generateSOPSchema(options),
      Section: this.generateSectionSchema(options),
      Step: this.generateStepSchema(options),
      Clause: this.generateClauseSchema(options),
    };

    logDecision(
      {
        nodeId: 'schema-generator',
        nodeName: 'Schema Generator',
        nodeType: 'system',
        timestamp: new Date(),
      },
      {
        action: 'generate_complete_schema_complete',
        metadata: { schemaCount: Object.keys(schemas).length },
        result: 'success',
        latencyMs: Date.now() - startTime,
      }
    );

    return schemas;
  }

  /**
   * Generate role-based permissions for Policy
   */
  private generatePolicyRolePermissions(): RolePermissions {
    return {
      admin: {
        readableFields: ['id', 'title', 'version', 'sections', 'createdAt', 'updatedAt'],
        writableFields: ['title', 'version', 'sections'],
      },
      editor: {
        readableFields: ['id', 'title', 'version', 'sections', 'createdAt', 'updatedAt'],
        writableFields: ['sections'],
      },
      viewer: {
        readableFields: ['id', 'title', 'version', 'sections'],
        writableFields: [],
      },
    };
  }

  /**
   * Validate entity against generated schema
   */
  async validateEntity<T>(
    entity: T,
    entityType: 'Policy' | 'SOP' | 'Section' | 'Step' | 'Clause',
    options: SchemaGenerationOptions = {}
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const schema = this.getSchemaForType(entityType, options);

    if (!schema.zodSchema) {
      return { valid: false, errors: ['Zod schema not generated'] };
    }

    try {
      schema.zodSchema.parse(entity);
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        errors: error.errors?.map((e: any) => e.message) || ['Validation failed'],
      };
    }
  }

  /**
   * Get schema for specific entity type
   */
  private getSchemaForType(
    entityType: string,
    options: SchemaGenerationOptions
  ): GeneratedSchema {
    switch (entityType) {
      case 'Policy':
        return this.generatePolicySchema(options);
      case 'SOP':
        return this.generateSOPSchema(options);
      case 'Section':
        return this.generateSectionSchema(options);
      case 'Step':
        return this.generateStepSchema(options);
      case 'Clause':
        return this.generateClauseSchema(options);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }
}

// Singleton instance
export const jsonSchemaGenerator = new JSONSchemaGenerator();
