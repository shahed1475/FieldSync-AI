/**
 * OCCAM Status Types
 * Defines status summaries, risk levels, and reporting structures
 */

import { WorkflowStage, WorkflowStatus, PendingAction } from './workflow.types';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SeverityLevel = 'info' | 'warning' | 'critical';

export interface StatusSummary {
  entity_id: string;
  entity_name: string;
  workflow_stage: WorkflowStage;
  workflow_status: WorkflowStatus;
  next_action_due?: string; // ISO date string
  risk_level: RiskLevel;
  alerts_sent: string[];
  last_updated: string; // ISO date string
  details: StatusDetails;
}

export interface StatusDetails {
  total_workflows: number;
  active_workflows: number;
  completed_workflows: number;
  failed_workflows: number;
  pending_renewals: number;
  overdue_actions: number;
  upcoming_deadlines: UpcomingDeadline[];
}

export interface UpcomingDeadline {
  workflow_id: string;
  entity_name: string;
  deadline_type: 'submission' | 'payment' | 'renewal' | 'verification';
  deadline_date: string; // ISO date string
  days_remaining: number;
  severity: SeverityLevel;
}

export interface EntityStatus {
  entityId: string;
  entityName: string;
  entityType: string;
  workflows: WorkflowStatusSummary[];
  licenses: LicenseStatus[];
  complianceScore: number; // 0-100
  lastAudit: string; // ISO date string
  nextRenewal?: string; // ISO date string
}

export interface WorkflowStatusSummary {
  workflowId: string;
  workflowType: string;
  currentStage: WorkflowStage;
  status: WorkflowStatus;
  startDate: string;
  lastUpdate: string;
  pendingActions: PendingAction[];
}

export interface LicenseStatus {
  licenseId: string;
  licenseName: string;
  licenseType: string;
  status: 'active' | 'expired' | 'pending' | 'suspended';
  issueDate: string;
  expiryDate: string;
  daysUntilExpiry: number;
  renewalRequired: boolean;
  renewalWorkflowId?: string;
}

export interface RenewalAlert {
  alertId: string;
  entityId: string;
  entityName: string;
  licenseId: string;
  licenseName: string;
  expiryDate: string;
  daysUntilExpiry: number;
  severity: SeverityLevel;
  alertType: 'renewal_reminder' | 'expiry_warning' | 'expiry_critical';
  createdAt: string;
  sentTo: string[];
}
