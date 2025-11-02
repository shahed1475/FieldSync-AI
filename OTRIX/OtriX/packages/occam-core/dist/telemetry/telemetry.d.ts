/**
 * OCCAM Telemetry Service
 * Phase 9: Orchestrator Hardening
 *
 * Responsible for:
 * - Logging critical decision nodes
 * - Tracking latency, success/failure, confidence scores
 * - Exposing Prometheus metrics endpoint
 * - Performance monitoring and SLO tracking
 */
import type { AuditEventType, AuditSeverity, SLOComplianceStatus } from '../types/audit.types';
/**
 * Telemetry event data
 */
export interface TelemetryEvent {
    eventType: AuditEventType;
    severity: AuditSeverity;
    agentId?: string;
    agentName?: string;
    documentId?: string;
    latency: number;
    success: boolean;
    confidenceScore?: number;
    metadata?: Record<string, any>;
}
/**
 * Performance SLO targets
 */
export interface SLOTargets {
    retrievalLatencyMs: number;
    buildTimeMinutes: number;
    complianceAccuracyPercent: number;
    auditTraceVerificationPercent: number;
    cpuUtilizationPercent: number;
    memoryUtilizationPercent: number;
}
/**
 * Telemetry Service with Prometheus Integration
 */
export declare class TelemetryService {
    private registry;
    private sloTargets;
    private eventCounter;
    private latencyHistogram;
    private confidenceScoreGauge;
    private successRateGauge;
    private driftDetectionCounter;
    private sloComplianceGauge;
    private cpuUtilizationGauge;
    private memoryUtilizationGauge;
    private events;
    private readonly maxEventsInMemory;
    constructor(sloTargets?: SLOTargets);
    /**
     * Initialize Prometheus metrics
     */
    private initializeMetrics;
    /**
     * Log a telemetry event
     */
    logEvent(event: TelemetryEvent): Promise<void>;
    /**
     * Log drift detection
     */
    logDriftDetection(severity: AuditSeverity, action: string): Promise<void>;
    /**
     * Update success rate for an event type
     */
    private updateSuccessRate;
    /**
     * Update CPU utilization
     */
    updateCPUUtilization(percent: number): void;
    /**
     * Update memory utilization
     */
    updateMemoryUtilization(percent: number): void;
    /**
     * Check SLO compliance
     */
    checkSLOCompliance(): Promise<SLOComplianceStatus>;
    /**
     * Get Prometheus metrics
     */
    getMetrics(): Promise<string>;
    /**
     * Get recent events
     */
    getRecentEvents(limit?: number): TelemetryEvent[];
    /**
     * Get events by type
     */
    getEventsByType(eventType: AuditEventType): TelemetryEvent[];
    /**
     * Calculate average latency for event type
     */
    getAverageLatency(eventType: AuditEventType): number;
    /**
     * Get success rate for event type
     */
    getSuccessRate(eventType: AuditEventType): number;
    /**
     * Clear all telemetry data
     */
    clear(): void;
}
/**
 * Singleton instance
 */
export declare const telemetryService: TelemetryService;
/**
 * Log decision node
 * Logs telemetry for critical decision nodes: data → validation → form → payment → submission → confirmation
 */
export declare function logDecision(node: string, payload: any): void;
/**
 * Expose Prometheus metrics endpoint
 * Usage: app.get('/metrics/occam', async (req, res) => exposeMetrics(req, res))
 */
export declare function exposeMetrics(req: any, res: any): Promise<void>;
export default TelemetryService;
//# sourceMappingURL=telemetry.d.ts.map