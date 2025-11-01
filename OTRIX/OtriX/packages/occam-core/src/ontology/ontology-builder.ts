/**
 * OCCAM Ontology Builder
 * Phase 1: Ontology & Schema Engineering
 *
 * Constructs hierarchical compliance ontology from Policy → SOP → Section → Step
 * with auto-numbering, inheritance, and version control
 */

import { Policy, SOP, Section, Step, Clause, RegulatoryCitation } from '../types';
import { logDecision } from '../telemetry';

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
export class OntologyBuilder {
  private policies: Map<string, Policy> = new Map();
  private sops: Map<string, SOP> = new Map();
  private sections: Map<string, Section> = new Map();
  private steps: Map<string, Step> = new Map();
  private clauses: Map<string, Clause> = new Map();

  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Build complete ontology from policy inputs
   */
  async build(
    policyInputs: PolicyInput[],
    options: OntologyBuildOptions = {}
  ): Promise<OntologyBuildResult> {
    const startTime = Date.now();

    logDecision(
      {
        nodeId: 'ontology-builder',
        nodeName: 'Ontology Builder',
        nodeType: 'system',
        timestamp: new Date(),
      },
      {
        action: 'build_ontology_start',
        metadata: { policyCount: policyInputs.length, options },
      }
    );

    // Reset state
    this.reset();

    // Build hierarchy
    for (const policyInput of policyInputs) {
      await this.buildPolicy(policyInput, options);
    }

    // Validate references if requested
    if (options.validateReferences) {
      this.validateReferences();
    }

    const buildDuration = Date.now() - startTime;
    const result: OntologyBuildResult = {
      success: this.errors.length === 0,
      policies: Array.from(this.policies.values()),
      sops: Array.from(this.sops.values()),
      sections: Array.from(this.sections.values()),
      steps: Array.from(this.steps.values()),
      clauses: Array.from(this.clauses.values()),
      errors: this.errors.length > 0 ? this.errors : undefined,
      warnings: this.warnings.length > 0 ? this.warnings : undefined,
      buildTimestamp: new Date(),
      version: '1.0.0',
    };

    logDecision(
      {
        nodeId: 'ontology-builder',
        nodeName: 'Ontology Builder',
        nodeType: 'system',
        timestamp: new Date(),
      },
      {
        action: 'build_ontology_complete',
        metadata: {
          success: result.success,
          policyCount: result.policies.length,
          sopCount: result.sops.length,
          sectionCount: result.sections.length,
          stepCount: result.steps.length,
          clauseCount: result.clauses.length,
          errorCount: this.errors.length,
          warningCount: this.warnings.length,
        },
        result: result.success ? 'success' : 'failure',
        latencyMs: buildDuration,
      }
    );

    return result;
  }

  /**
   * Build a single policy with its hierarchy
   */
  private async buildPolicy(
    input: PolicyInput,
    options: OntologyBuildOptions
  ): Promise<Policy> {
    const policyId = this.generateId('policy');
    const policy: Policy = {
      id: policyId,
      title: input.title,
      version: input.version || '1.0.0',
      sections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Build SOPs
    let sopIndex = 0;
    for (const sopInput of input.sops) {
      const sop = await this.buildSOP(policyId, sopInput, sopIndex, options);
      sopIndex++;
    }

    // Collect all sections from SOPs
    const sopSections: Section[] = [];
    for (const sop of this.sops.values()) {
      if (sop.policyId === policyId) {
        for (const section of sop.sections || []) {
          sopSections.push(section);
        }
      }
    }
    policy.sections = sopSections;

    this.policies.set(policyId, policy);
    return policy;
  }

  /**
   * Build a single SOP with its sections
   */
  private async buildSOP(
    policyId: string,
    input: SOPInput,
    index: number,
    options: OntologyBuildOptions
  ): Promise<SOP> {
    const sopId = this.generateId('sop', policyId, index);
    const sop: SOP = {
      id: sopId,
      policyId,
      owner: input.owner,
      steps: [],
      name: input.name || `SOP ${index + 1}`,
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      sections: [],
    };

    // Build sections
    let sectionIndex = 0;
    for (const sectionInput of input.sections) {
      const section = await this.buildSection(
        sopId,
        sectionInput,
        sectionIndex,
        options
      );
      sop.sections!.push(section);
      sectionIndex++;
    }

    // Collect all steps from sections
    const sectionSteps: Step[] = [];
    for (const section of sop.sections || []) {
      for (const step of section.steps || []) {
        sectionSteps.push(step);
      }
    }
    sop.steps = sectionSteps;

    this.sops.set(sopId, sop);
    return sop;
  }

  /**
   * Build a single section with its steps
   */
  private async buildSection(
    sopId: string,
    input: SectionInput,
    index: number,
    options: OntologyBuildOptions
  ): Promise<Section> {
    const sectionId = this.generateId('section', sopId, index);
    const section: Section = {
      id: sectionId,
      name: input.name,
      order: options.autoNumber !== false ? index : (input.order || index),
      clauses: [],
      sopId,
      steps: [],
    };

    // Build steps
    let stepIndex = 0;
    for (const stepInput of input.steps) {
      const step = await this.buildStep(
        sectionId,
        stepInput,
        stepIndex,
        options
      );
      section.steps!.push(step);
      stepIndex++;
    }

    // Collect all clauses from steps
    const stepClauses: Clause[] = [];
    for (const step of section.steps || []) {
      for (const clause of step.clauses || []) {
        stepClauses.push(clause);
      }
    }
    section.clauses = stepClauses;

    this.sections.set(sectionId, section);
    return section;
  }

  /**
   * Build a single step with its clauses
   */
  private async buildStep(
    sectionId: string,
    input: StepInput,
    index: number,
    options: OntologyBuildOptions
  ): Promise<Step> {
    const stepId = this.generateId('step', sectionId, index);
    const step: Step = {
      id: stepId,
      description: input.description,
      completed: input.completed || false,
      responsible: input.responsible,
      sectionId,
      order: options.autoNumber !== false ? index : index,
      clauses: [],
    };

    // Build clauses if provided
    if (input.clauses) {
      let clauseIndex = 0;
      for (const clauseInput of input.clauses) {
        const clause = this.buildClause(stepId, clauseInput, clauseIndex);
        step.clauses!.push(clause);
        clauseIndex++;
      }
    }

    this.steps.set(stepId, step);
    return step;
  }

  /**
   * Build a single clause
   */
  private buildClause(
    stepId: string,
    input: ClauseInput,
    index: number
  ): Clause {
    const clauseId = this.generateId('clause', stepId, index);
    const clause: Clause = {
      id: clauseId,
      text: input.text,
      riskLevel: input.riskLevel,
      jurisdiction: input.jurisdiction,
      stepId,
      regulatory: input.regulatory,
    };

    this.clauses.set(clauseId, clause);
    return clause;
  }

  /**
   * Validate references between entities
   */
  private validateReferences(): void {
    // Validate SOP → Policy references
    for (const sop of this.sops.values()) {
      if (!this.policies.has(sop.policyId)) {
        this.errors.push(`SOP ${sop.id} references non-existent policy ${sop.policyId}`);
      }
    }

    // Validate Section → SOP references
    for (const section of this.sections.values()) {
      if (section.sopId && !this.sops.has(section.sopId)) {
        this.errors.push(`Section ${section.id} references non-existent SOP ${section.sopId}`);
      }
    }

    // Validate Step → Section references
    for (const step of this.steps.values()) {
      if (step.sectionId && !this.sections.has(step.sectionId)) {
        this.errors.push(`Step ${step.id} references non-existent section ${step.sectionId}`);
      }
    }

    // Validate Clause → Step references
    for (const clause of this.clauses.values()) {
      if (clause.stepId && !this.steps.has(clause.stepId)) {
        this.errors.push(`Clause ${clause.id} references non-existent step ${clause.stepId}`);
      }
    }
  }

  /**
   * Generate unique ID for entity
   */
  private generateId(type: string, parentId?: string, index?: number): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 7);

    if (parentId && index !== undefined) {
      return `${type}-${parentId}-${index}-${random}`;
    }

    return `${type}-${timestamp}-${random}`;
  }

  /**
   * Reset builder state
   */
  private reset(): void {
    this.policies.clear();
    this.sops.clear();
    this.sections.clear();
    this.steps.clear();
    this.clauses.clear();
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Get policy by ID
   */
  getPolicy(id: string): Policy | undefined {
    return this.policies.get(id);
  }

  /**
   * Get all policies
   */
  getAllPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get SOPs for a policy
   */
  getSOPsForPolicy(policyId: string): SOP[] {
    return Array.from(this.sops.values()).filter(sop => sop.policyId === policyId);
  }

  /**
   * Get sections for a SOP
   */
  getSectionsForSOP(sopId: string): Section[] {
    return Array.from(this.sections.values()).filter(section => section.sopId === sopId);
  }

  /**
   * Get steps for a section
   */
  getStepsForSection(sectionId: string): Step[] {
    return Array.from(this.steps.values()).filter(step => step.sectionId === sectionId);
  }

  /**
   * Get clauses for a step
   */
  getClausesForStep(stepId: string): Clause[] {
    return Array.from(this.clauses.values()).filter(clause => clause.stepId === stepId);
  }
}

// Singleton instance
export const ontologyBuilder = new OntologyBuilder();
