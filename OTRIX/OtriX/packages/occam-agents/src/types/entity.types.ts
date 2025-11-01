/**
 * Entity and Regulatory Data Types
 * Phase 0: Foundation Setup
 */

export interface EntityData {
  id: string;
  name: string;
  type: 'individual' | 'business' | 'organization';
  kyc_status: 'pending' | 'verified' | 'rejected';
  registrations: Registration[];
  jurisdiction: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Registration {
  id: string;
  type: string;
  status: 'active' | 'expired' | 'pending' | 'revoked';
  jurisdiction: string;
  expirationDate?: Date;
  issueDate: Date;
  renewalRequired: boolean;
  metadata?: Record<string, any>;
}

export interface RegulatoryRule {
  id: string;
  regulation: string;
  jurisdiction: string;
  ruleCode: string;
  title: string;
  description: string;
  effectiveDate: Date;
  expirationDate?: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  requirements: string[];
  penalties?: string[];
  metadata?: Record<string, any>;
}

export interface License {
  id: string;
  type: string;
  status: 'active' | 'expired' | 'suspended';
  issueDate: Date;
  expirationDate: Date;
  renewalRequired: boolean;
  renewalAmount?: number;
  jurisdiction: string;
  metadata?: Record<string, any>;
}

export interface Entity {
  id: string;
  name: string;
  type: 'individual' | 'business' | 'organization';
  licenses: License[];
  metadata?: Record<string, any>;
}
