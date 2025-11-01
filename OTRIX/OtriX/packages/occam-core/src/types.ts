/**
 * Core OCCAM Types - Foundation Layer
 * Phase 0: Foundation Setup
 */

export interface Policy {
  id: string;
  title: string;
  sections: Section[];
  version: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SOP {
  id: string;
  policyId: string;
  steps: Step[];
  owner: string;
  name?: string;
  version?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Section {
  id: string;
  name: string;
  clauses: Clause[];
  order: number;
  sopId?: string;
  steps?: Step[];
}

export interface Step {
  id: string;
  description: string;
  completed: boolean;
  responsible: string;
  sectionId?: string;
  order?: number;
  clauses?: Clause[];
}

export interface Clause {
  id: string;
  text: string;
  riskLevel: 'low' | 'medium' | 'high';
  jurisdiction: string;
  stepId?: string;
  content?: string;
  type?: 'requirement' | 'recommendation' | 'prohibition';
  regulatory?: RegulatoryCitation[];
}

export interface RegulatoryCitation {
  framework: string;
  section: string;
  requirement: string;
}

export interface AuditTrail {
  id: string;
  action: string;
  timestamp: Date;
  actor: string;
  metadata?: Record<string, any>;
  entityType?: string;
  entityId?: string;
  userId?: string;
}
