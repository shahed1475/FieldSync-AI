/**
 * OCCAM Core Package
 * Phase 9: Orchestrator Hardening
 *
 * Exports telemetry, audit types, and core services
 */
export { TelemetryService, telemetryService, logDecision, exposeMetrics } from './telemetry/telemetry';
export type { TelemetryEvent, SLOTargets } from './telemetry/telemetry';
export type { AuthorityRef, DriftCheck, AuditEventType, AuditSeverity, VerificationStatus, AuditTrailRecord, ComplianceIntegrityReport, ValidationResult, ValidationIssue, DriftAnalysis, DriftCase, RiskLevelSummary, SLOComplianceStatus, SLOMetric, ReVerificationJob, WeeklyAuditConfig, AuditTrailQuery, IAuditService } from './types/audit.types';
import { TelemetryService as TelemetryServiceClass } from './telemetry/telemetry';
declare const _default: {
    TelemetryService: typeof TelemetryServiceClass;
    telemetryService: TelemetryServiceClass;
};
export default _default;
//# sourceMappingURL=index.d.ts.map