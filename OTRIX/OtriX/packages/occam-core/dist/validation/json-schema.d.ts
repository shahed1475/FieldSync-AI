/**
 * OCCAM JSON Schema Generator
 * Phase 1: Ontology & Schema Engineering
 *
 * Auto-generates JSON schemas and Zod validators for OCCAM compliance objects
 * with RBAC support and structural integrity validation
 */
import { z } from 'zod';
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
export declare class JSONSchemaGenerator {
    /**
     * Generate schema for Policy
     */
    generatePolicySchema(options?: SchemaGenerationOptions): GeneratedSchema;
    /**
     * Generate schema for SOP
     */
    generateSOPSchema(options?: SchemaGenerationOptions): GeneratedSchema;
    /**
     * Generate schema for Section
     */
    generateSectionSchema(options?: SchemaGenerationOptions): GeneratedSchema;
    /**
     * Generate schema for Step
     */
    generateStepSchema(options?: SchemaGenerationOptions): GeneratedSchema;
    /**
     * Generate schema for Clause
     */
    generateClauseSchema(options?: SchemaGenerationOptions): GeneratedSchema;
    /**
     * Generate complete schema snapshot with all entity types
     */
    generateCompleteSchema(options?: SchemaGenerationOptions): Record<string, GeneratedSchema>;
    /**
     * Generate role-based permissions for Policy
     */
    private generatePolicyRolePermissions;
    /**
     * Validate entity against generated schema
     */
    validateEntity<T>(entity: T, entityType: 'Policy' | 'SOP' | 'Section' | 'Step' | 'Clause', options?: SchemaGenerationOptions): Promise<{
        valid: boolean;
        errors?: string[];
    }>;
    /**
     * Get schema for specific entity type
     */
    private getSchemaForType;
}
export declare const jsonSchemaGenerator: JSONSchemaGenerator;
//# sourceMappingURL=json-schema.d.ts.map