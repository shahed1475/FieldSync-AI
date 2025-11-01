/**
 * OCCAM Ontology Builder
 * Phase 1: Ontology & Schema Engineering
 *
 * Constructs hierarchical compliance ontology from Policy → SOP → Section → Step
 * with auto-numbering, inheritance, and version control
 */
import { Policy, SOP, Section, Step, Clause, RegulatoryCitation } from '../types';
export interface OntologyBuildOptions {
    autoNumber?: boolean;
    inheritMetadata?: boolean;
    validateReferences?: boolean;
    generateGraph?: boolean;
}
export interface OntologyBuildResult {
    success: boolean;
    policies: Policy[];
    sops: SOP[];
    sections: Section[];
    steps: Step[];
    clauses: Clause[];
    errors?: string[];
    warnings?: string[];
    buildTimestamp: Date;
    version: string;
}
export interface PolicyInput {
    title: string;
    version?: string;
    sops: SOPInput[];
}
export interface SOPInput {
    owner: string;
    name?: string;
    sections: SectionInput[];
}
export interface SectionInput {
    name: string;
    order?: number;
    steps: StepInput[];
}
export interface StepInput {
    description: string;
    responsible: string;
    completed?: boolean;
    clauses?: ClauseInput[];
}
export interface ClauseInput {
    text: string;
    riskLevel: 'low' | 'medium' | 'high';
    jurisdiction: string;
    regulatory?: RegulatoryCitation[];
}
/**
 * OntologyBuilder - Constructs compliance hierarchy
 */
export declare class OntologyBuilder {
    private policies;
    private sops;
    private sections;
    private steps;
    private clauses;
    private errors;
    private warnings;
    /**
     * Build complete ontology from policy inputs
     */
    build(policyInputs: PolicyInput[], options?: OntologyBuildOptions): Promise<OntologyBuildResult>;
    /**
     * Build a single policy with its hierarchy
     */
    private buildPolicy;
    /**
     * Build a single SOP with its sections
     */
    private buildSOP;
    /**
     * Build a single section with its steps
     */
    private buildSection;
    /**
     * Build a single step with its clauses
     */
    private buildStep;
    /**
     * Build a single clause
     */
    private buildClause;
    /**
     * Validate references between entities
     */
    private validateReferences;
    /**
     * Generate unique ID for entity
     */
    private generateId;
    /**
     * Reset builder state
     */
    private reset;
    /**
     * Get policy by ID
     */
    getPolicy(id: string): Policy | undefined;
    /**
     * Get all policies
     */
    getAllPolicies(): Policy[];
    /**
     * Get SOPs for a policy
     */
    getSOPsForPolicy(policyId: string): SOP[];
    /**
     * Get sections for a SOP
     */
    getSectionsForSOP(sopId: string): Section[];
    /**
     * Get steps for a section
     */
    getStepsForSection(sectionId: string): Step[];
    /**
     * Get clauses for a step
     */
    getClausesForStep(stepId: string): Clause[];
}
export declare const ontologyBuilder: OntologyBuilder;
//# sourceMappingURL=ontology-builder.d.ts.map