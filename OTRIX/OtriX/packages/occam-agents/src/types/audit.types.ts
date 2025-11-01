/**
 * Audit Type Definitions for OCCAM Payment Agent
 * Defines audit logging and compliance tracking interfaces
 */

export type AuditEventType =
  | 'payment.initiated'
  | 'payment.processed'
  | 'payment.processing'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.verified'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'anomaly.detected'
  | 'limit.exceeded'
  | 'renewal.scheduled'
  | 'renewal.processed'
  | 'credential.accessed'
  | 'configuration.changed';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Audit event record
 */
export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  timestamp: Date;
  actor?: string;
  resource?: string;
  action: string;
  details: Record<string, any>;
  traceId?: string;
  sessionId?: string;
  ipAddress?: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
  traceId?: string;
}

/**
 * Audit trail for transactions
 */
export interface AuditTrail {
  transactionId: string;
  events: AuditEvent[];
  startTime: Date;
  endTime?: Date;
  finalStatus?: string;
}

/**
 * Compliance audit report
 */
export interface ComplianceAuditReport {
  reportId: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalAmount: number;
  currency: string;
  anomaliesDetected: number;
  approvalsRequired: number;
  complianceIssues: ComplianceIssue[];
}

/**
 * Compliance issue
 */
export interface ComplianceIssue {
  issueId: string;
  severity: AuditSeverity;
  description: string;
  transactionId?: string;
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
}

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditEventType[];
  severity?: AuditSeverity;
  actor?: string;
  transactionId?: string;
  limit?: number;
  offset?: number;
}
