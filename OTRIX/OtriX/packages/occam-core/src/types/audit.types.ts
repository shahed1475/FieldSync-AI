/**
 * OCCAM Audit Type Definitions
 * Phase 9: Orchestrator Hardening
 *
 * Type system for:
 * - Audit trail records
 * - Verification reports
 * - Compliance integrity tracking
 * - Performance SLO monitoring
 */

/**
 * Audit event types
 */
export type AuditEventType =
  | 'data-ingestion'
  | 'validation-check'
  | 'form-generation'
  | 'payment-processing'
  | 'submission-attempt'
  | 'confirmation-received'
  | 'drift-detected'
  | 'context-chained'
  | 'verification-completed'
  | 'compliance-check';

/**
 * Audit severity levels
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Verification status
 */
export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';

/**
 * Audit trail record
 */
export interface AuditTrailRecord {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  agentId?: string;
  agentName?: string;
  documentId?: string;
  clauseId?: string;
  userId?: string;
  action: string;
  details: string;
  metadata: Record<string, any>;
  previousHash?: string;
  currentHash: string;
  signedBy?: string;
  latency?: number; // ms
  success: boolean;
  confidenceScore?: number; // 0-100
  errorMessage?: string;
  stackTrace?: string;
}

/**
 * Compliance integrity report
 */
export interface ComplianceIntegrityReport {
  id: string;
  generatedAt: Date;
  reportPeriod: {
    startDate: Date;
    endDate: Date;
  };
  summary: {
    totalDocuments: number;
    verifiedDocuments: number;
    failedVerifications: number;
    driftDetections: number;
    complianceAccuracy: number; // percentage
    auditTraceVerification: number; // percentage
  };
  validationResults: ValidationResult[];
  driftAnalysis: DriftAnalysis;
  riskLevels: RiskLevelSummary;
  recommendations: string[];
  nextScheduledAudit: Date;
  sloCompliance: SLOComplianceStatus;
  outputPath: string;
  checksum: string;
}

/**
 * Validation result for a single document/clause
 */
export interface ValidationResult {
  documentId: string;
  clauseId?: string;
  validatedAt: Date;
  status: VerificationStatus;
  validationChecks: {
    hasAuthoritativeSource: boolean;
    timestampVerified: boolean;
    driftWithinThreshold: boolean;
    citationsValid: boolean;
    checksumMatches: boolean;
  };
  issues: ValidationIssue[];
  confidenceScore: number;
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  severity: AuditSeverity;
  category: 'source' | 'drift' | 'citation' | 'integrity' | 'timestamp';
  description: string;
  affectedEntity: string;
  remediation: string;
  detectedAt: Date;
}

/**
 * Drift analysis summary
 */
export interface DriftAnalysis {
  totalClauses: number;
  clausesWithDrift: number;
  driftRate: number; // percentage
  averageDriftScore: number; // cosine similarity
  criticalDriftCases: DriftCase[];
  driftTrend: 'improving' | 'stable' | 'degrading';
}

/**
 * Individual drift case
 */
export interface DriftCase {
  clauseId: string;
  documentId: string;
  driftScore: number; // cosine similarity
  threshold: number;
  detectedAt: Date;
  sourceUrl: string;
  currentContent: string;
  sourceContent: string;
  action: 'blocked' | 're-verification-triggered' | 'flagged';
  reVerificationJobId?: string;
}

/**
 * Risk level summary
 */
export interface RiskLevelSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
  distribution: {
    byFramework: Record<string, number>;
    byDocumentType: Record<string, number>;
  };
}

/**
 * SLO (Service Level Objective) compliance status
 */
export interface SLOComplianceStatus {
  retrievalLatency: SLOMetric;
  buildTime: SLOMetric;
  complianceAccuracy: SLOMetric;
  auditTraceVerification: SLOMetric;
  cpuUtilization: SLOMetric;
  memoryUtilization: SLOMetric;
  overallCompliance: boolean;
  violatedSLOs: string[];
}

/**
 * Individual SLO metric
 */
export interface SLOMetric {
  name: string;
  target: number;
  actual: number;
  unit: string;
  compliant: boolean;
  trend: 'improving' | 'stable' | 'degrading';
  lastMeasured: Date;
}

/**
 * Re-verification job
 */
export interface ReVerificationJob {
  id: string;
  createdAt: Date;
  triggeredBy: 'drift-detection' | 'scheduled-audit' | 'manual';
  status: 'pending' | 'running' | 'completed' | 'failed';
  documentIds: string[];
  clauseIds: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  results?: ValidationResult[];
}

/**
 * Weekly audit configuration
 */
export interface WeeklyAuditConfig {
  enabled: boolean;
  schedule: string; // cron expression
  retentionDays: number;
  notifyOnCompletion: boolean;
  notificationChannels: ('email' | 'slack' | 'dashboard')[];
  includeFullReport: boolean;
  generatePDF: boolean;
}

/**
 * Audit trail query options
 */
export interface AuditTrailQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditEventType[];
  severity?: AuditSeverity[];
  agentId?: string;
  documentId?: string;
  userId?: string;
  successOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Audit service interface
 */
export interface IAuditService {
  recordEvent(event: Omit<AuditTrailRecord, 'id' | 'timestamp' | 'currentHash'>): Promise<void>;
  getAuditTrail(query: AuditTrailQuery): Promise<AuditTrailRecord[]>;
  generateIntegrityReport(period?: { start: Date; end: Date }): Promise<ComplianceIntegrityReport>;
  triggerReVerification(clauseIds: string[]): Promise<ReVerificationJob>;
  getReVerificationJob(jobId: string): Promise<ReVerificationJob | null>;
  verifyAuditChain(startHash?: string, endHash?: string): Promise<boolean>;
}

/**
 * Export all types
 */
export type {
  AuditEventType,
  AuditSeverity,
  VerificationStatus,
  AuditTrailRecord,
  ComplianceIntegrityReport,
  ValidationResult,
  ValidationIssue,
  DriftAnalysis,
  DriftCase,
  RiskLevelSummary,
  SLOComplianceStatus,
  SLOMetric,
  ReVerificationJob,
  WeeklyAuditConfig,
  AuditTrailQuery,
  IAuditService
};
