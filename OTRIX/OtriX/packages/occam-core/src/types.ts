/**
 * Core OCCAM Types
 */

export interface Policy {
  id: string;
  name: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SOP {
  id: string;
  policyId: string;
  name: string;
  version: string;
  sections: Section[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: string;
  sopId: string;
  name: string;
  order: number;
  steps: Step[];
}

export interface Step {
  id: string;
  sectionId: string;
  name: string;
  order: number;
  clauses: Clause[];
}

export interface Clause {
  id: string;
  stepId: string;
  content: string;
  type: 'requirement' | 'recommendation' | 'prohibition';
  regulatory: RegulatoryCitation[];
}

export interface RegulatoryCitation {
  framework: string;
  section: string;
  requirement: string;
}

export interface AuditTrail {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}
