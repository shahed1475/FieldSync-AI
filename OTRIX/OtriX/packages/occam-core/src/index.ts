/**
 * OCCAM Core Package
 * Phase 9: Orchestrator Hardening
 *
 * Exports telemetry, audit types, and core services
 */

// Export telemetry
export { TelemetryService, telemetryService } from './telemetry/telemetry';
export type { TelemetryEvent, SLOTargets } from './telemetry/telemetry';

// Export audit types
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
} from './types/audit.types';

export default {
  TelemetryService,
  telemetryService
};
