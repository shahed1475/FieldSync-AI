/**
 * OCCAM Workflow Types
 * Defines workflow stages, states, and transitions for compliance operations
 */

export type WorkflowStage =
  | 'apply'
  | 'verify'
  | 'pay'
  | 'submit'
  | 'confirm'
  | 'archive'
  | 'renew'
  | 'pending'
  | 'failed'
  | 'completed';

export type WorkflowStatus =
  | 'not_started'
  | 'in_progress'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'renewal_pending';

export interface WorkflowTransition {
  from: WorkflowStage;
  to: WorkflowStage;
  timestamp: Date;
  triggeredBy: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowState {
  workflowId: string;
  entityId: string;
  currentStage: WorkflowStage;
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  history: WorkflowTransition[];
  metadata: Record<string, any>;
}

export interface WorkflowProgress {
  workflowId: string;
  entityId: string;
  entityName: string;
  currentStage: WorkflowStage;
  status: WorkflowStatus;
  percentComplete: number;
  startDate: Date;
  estimatedCompletionDate?: Date;
  actualCompletionDate?: Date;
  delays: WorkflowDelay[];
  pendingActions: PendingAction[];
}

export interface WorkflowDelay {
  stage: WorkflowStage;
  delayDuration: number; // in milliseconds
  reason: string;
  startedAt: Date;
  resolvedAt?: Date;
}

export interface PendingAction {
  actionId: string;
  workflowId: string;
  stage: WorkflowStage;
  actionType: string;
  description: string;
  assignedTo?: string;
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
}
