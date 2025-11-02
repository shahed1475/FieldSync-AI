/**
 * OCCAM Core Package
 * Phase 9: Orchestrator Hardening
 *
 * Exports telemetry, audit types, and core services
 */

// Export telemetry
export { TelemetryService, telemetryService, logDecision, exposeMetrics } from './telemetry/telemetry';
export type { TelemetryEvent, SLOTargets } from './telemetry/telemetry';

// Export audit types
export type {
  AuthorityRef,
  DriftCheck,
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

import { TelemetryService as TelemetryServiceClass, telemetryService as telemetryServiceInstance } from './telemetry/telemetry';

export default {
  TelemetryService: TelemetryServiceClass,
  telemetryService: telemetryServiceInstance
};
