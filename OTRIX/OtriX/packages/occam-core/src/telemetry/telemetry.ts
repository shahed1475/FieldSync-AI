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

import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type {
  AuditEventType,
  AuditSeverity,
  SLOMetric,
  SLOComplianceStatus
} from '../types/audit.types';

/**
 * Telemetry event data
 */
export interface TelemetryEvent {
  eventType: AuditEventType;
  severity: AuditSeverity;
  agentId?: string;
  agentName?: string;
  documentId?: string;
  latency: number; // ms
  success: boolean;
  confidenceScore?: number;
  metadata?: Record<string, any>;
}

/**
 * Performance SLO targets
 */
export interface SLOTargets {
  retrievalLatencyMs: number; // ≤ 2500ms
  buildTimeMinutes: number; // ≤ 7 minutes for 500 pages
  complianceAccuracyPercent: number; // ≥ 97%
  auditTraceVerificationPercent: number; // 100%
  cpuUtilizationPercent: number; // < 80%
  memoryUtilizationPercent: number; // < 75%
}

/**
 * Default SLO targets
 */
const DEFAULT_SLO_TARGETS: SLOTargets = {
  retrievalLatencyMs: 2500,
  buildTimeMinutes: 7,
  complianceAccuracyPercent: 97,
  auditTraceVerificationPercent: 100,
  cpuUtilizationPercent: 80,
  memoryUtilizationPercent: 75
};

/**
 * Telemetry Service with Prometheus Integration
 */
export class TelemetryService {
  private registry: Registry;
  private sloTargets: SLOTargets;

  // Prometheus metrics
  private eventCounter!: Counter;
  private latencyHistogram!: Histogram;
  private confidenceScoreGauge!: Gauge;
  private successRateGauge!: Gauge;
  private driftDetectionCounter!: Counter;
  private sloComplianceGauge!: Gauge;
  private cpuUtilizationGauge!: Gauge;
  private memoryUtilizationGauge!: Gauge;

  // In-memory telemetry storage
  private events: TelemetryEvent[] = [];
  private readonly maxEventsInMemory = 10000;

  constructor(sloTargets: SLOTargets = DEFAULT_SLO_TARGETS) {
    this.registry = new Registry();
    this.sloTargets = sloTargets;

    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register: this.registry });

    // Initialize custom metrics
    this.initializeMetrics();
  }

  /**
   * Initialize Prometheus metrics
   */
  private initializeMetrics(): void {
    // Event counter by type and severity
    this.eventCounter = new Counter({
      name: 'occam_events_total',
      help: 'Total number of OCCAM events',
      labelNames: ['event_type', 'severity', 'agent_id', 'success'],
      registers: [this.registry]
    });

    // Latency histogram for decision nodes
    this.latencyHistogram = new Histogram({
      name: 'occam_decision_latency_ms',
      help: 'Latency of OCCAM decision nodes in milliseconds',
      labelNames: ['event_type', 'agent_id'],
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [this.registry]
    });

    // Confidence score gauge
    this.confidenceScoreGauge = new Gauge({
      name: 'occam_confidence_score',
      help: 'Confidence score for OCCAM decisions (0-100)',
      labelNames: ['event_type', 'agent_id'],
      registers: [this.registry]
    });

    // Success rate gauge
    this.successRateGauge = new Gauge({
      name: 'occam_success_rate',
      help: 'Success rate of OCCAM operations (0-100)',
      labelNames: ['event_type'],
      registers: [this.registry]
    });

    // Drift detection counter
    this.driftDetectionCounter = new Counter({
      name: 'occam_drift_detections_total',
      help: 'Total number of drift detections',
      labelNames: ['severity', 'action'],
      registers: [this.registry]
    });

    // SLO compliance gauge
    this.sloComplianceGauge = new Gauge({
      name: 'occam_slo_compliance',
      help: 'SLO compliance status (1 = compliant, 0 = violated)',
      labelNames: ['slo_name'],
      registers: [this.registry]
    });

    // CPU utilization gauge
    this.cpuUtilizationGauge = new Gauge({
      name: 'occam_cpu_utilization_percent',
      help: 'CPU utilization percentage',
      registers: [this.registry]
    });

    // Memory utilization gauge
    this.memoryUtilizationGauge = new Gauge({
      name: 'occam_memory_utilization_percent',
      help: 'Memory utilization percentage',
      registers: [this.registry]
    });
  }

  /**
   * Log a telemetry event
   */
  async logEvent(event: TelemetryEvent): Promise<void> {
    // Store event in memory
    this.events.push(event);
    if (this.events.length > this.maxEventsInMemory) {
      this.events.shift(); // Remove oldest event
    }

    // Update Prometheus metrics
    this.eventCounter.inc({
      event_type: event.eventType,
      severity: event.severity,
      agent_id: event.agentId || 'unknown',
      success: event.success.toString()
    });

    this.latencyHistogram.observe(
      {
        event_type: event.eventType,
        agent_id: event.agentId || 'unknown'
      },
      event.latency
    );

    if (event.confidenceScore !== undefined) {
      this.confidenceScoreGauge.set(
        {
          event_type: event.eventType,
          agent_id: event.agentId || 'unknown'
        },
        event.confidenceScore
      );
    }

    // Update success rate
    await this.updateSuccessRate(event.eventType);
  }

  /**
   * Log drift detection
   */
  async logDriftDetection(severity: AuditSeverity, action: string): Promise<void> {
    this.driftDetectionCounter.inc({
      severity,
      action
    });
  }

  /**
   * Update success rate for an event type
   */
  private async updateSuccessRate(eventType: AuditEventType): Promise<void> {
    const eventsOfType = this.events.filter(e => e.eventType === eventType);
    if (eventsOfType.length === 0) return;

    const successCount = eventsOfType.filter(e => e.success).length;
    const successRate = (successCount / eventsOfType.length) * 100;

    this.successRateGauge.set({ event_type: eventType }, successRate);
  }

  /**
   * Update CPU utilization
   */
  updateCPUUtilization(percent: number): void {
    this.cpuUtilizationGauge.set(percent);
  }

  /**
   * Update memory utilization
   */
  updateMemoryUtilization(percent: number): void {
    this.memoryUtilizationGauge.set(percent);
  }

  /**
   * Check SLO compliance
   */
  async checkSLOCompliance(): Promise<SLOComplianceStatus> {
    // Calculate metrics
    const retrievalEvents = this.events.filter(
      e => e.eventType === 'data-ingestion'
    );
    const avgRetrievalLatency = retrievalEvents.length > 0
      ? retrievalEvents.reduce((sum, e) => sum + e.latency, 0) / retrievalEvents.length
      : 0;

    const allEvents = this.events;
    const successCount = allEvents.filter(e => e.success).length;
    const complianceAccuracy = allEvents.length > 0
      ? (successCount / allEvents.length) * 100
      : 0;

    // Get CPU and memory from process
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Simplified
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Build metrics
    const retrievalLatency: SLOMetric = {
      name: 'Retrieval Latency',
      target: this.sloTargets.retrievalLatencyMs,
      actual: avgRetrievalLatency,
      unit: 'ms',
      compliant: avgRetrievalLatency <= this.sloTargets.retrievalLatencyMs,
      trend: 'stable',
      lastMeasured: new Date()
    };

    const buildTime: SLOMetric = {
      name: 'Build Time',
      target: this.sloTargets.buildTimeMinutes,
      actual: 5, // Simulated - would calculate from build events
      unit: 'minutes',
      compliant: true,
      trend: 'improving',
      lastMeasured: new Date()
    };

    const complianceAccuracyMetric: SLOMetric = {
      name: 'Compliance Accuracy',
      target: this.sloTargets.complianceAccuracyPercent,
      actual: complianceAccuracy,
      unit: '%',
      compliant: complianceAccuracy >= this.sloTargets.complianceAccuracyPercent,
      trend: 'stable',
      lastMeasured: new Date()
    };

    const auditTraceVerification: SLOMetric = {
      name: 'Audit Trace Verification',
      target: this.sloTargets.auditTraceVerificationPercent,
      actual: 100, // Simulated - would verify hash chain
      unit: '%',
      compliant: true,
      trend: 'stable',
      lastMeasured: new Date()
    };

    const cpuUtilization: SLOMetric = {
      name: 'CPU Utilization',
      target: this.sloTargets.cpuUtilizationPercent,
      actual: cpuPercent,
      unit: '%',
      compliant: cpuPercent < this.sloTargets.cpuUtilizationPercent,
      trend: 'stable',
      lastMeasured: new Date()
    };

    const memoryUtilization: SLOMetric = {
      name: 'Memory Utilization',
      target: this.sloTargets.memoryUtilizationPercent,
      actual: memPercent,
      unit: '%',
      compliant: memPercent < this.sloTargets.memoryUtilizationPercent,
      trend: 'stable',
      lastMeasured: new Date()
    };

    // Update SLO compliance gauges
    this.sloComplianceGauge.set({ slo_name: 'retrieval_latency' }, retrievalLatency.compliant ? 1 : 0);
    this.sloComplianceGauge.set({ slo_name: 'build_time' }, buildTime.compliant ? 1 : 0);
    this.sloComplianceGauge.set({ slo_name: 'compliance_accuracy' }, complianceAccuracyMetric.compliant ? 1 : 0);
    this.sloComplianceGauge.set({ slo_name: 'audit_trace' }, auditTraceVerification.compliant ? 1 : 0);
    this.sloComplianceGauge.set({ slo_name: 'cpu' }, cpuUtilization.compliant ? 1 : 0);
    this.sloComplianceGauge.set({ slo_name: 'memory' }, memoryUtilization.compliant ? 1 : 0);

    // Check overall compliance
    const metrics = [
      retrievalLatency,
      buildTime,
      complianceAccuracyMetric,
      auditTraceVerification,
      cpuUtilization,
      memoryUtilization
    ];

    const violatedSLOs = metrics
      .filter(m => !m.compliant)
      .map(m => m.name);

    return {
      retrievalLatency,
      buildTime,
      complianceAccuracy: complianceAccuracyMetric,
      auditTraceVerification,
      cpuUtilization,
      memoryUtilization,
      overallCompliance: violatedSLOs.length === 0,
      violatedSLOs
    };
  }

  /**
   * Get Prometheus metrics
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): TelemetryEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType: AuditEventType): TelemetryEvent[] {
    return this.events.filter(e => e.eventType === eventType);
  }

  /**
   * Calculate average latency for event type
   */
  getAverageLatency(eventType: AuditEventType): number {
    const events = this.getEventsByType(eventType);
    if (events.length === 0) return 0;

    const totalLatency = events.reduce((sum, e) => sum + e.latency, 0);
    return totalLatency / events.length;
  }

  /**
   * Get success rate for event type
   */
  getSuccessRate(eventType: AuditEventType): number {
    const events = this.getEventsByType(eventType);
    if (events.length === 0) return 0;

    const successCount = events.filter(e => e.success).length;
    return (successCount / events.length) * 100;
  }

  /**
   * Clear all telemetry data
   */
  clear(): void {
    this.events = [];
  }
}

/**
 * Singleton instance
 */
export const telemetryService = new TelemetryService();

/**
 * Log decision node
 * Logs telemetry for critical decision nodes: data → validation → form → payment → submission → confirmation
 */
export function logDecision(node: string, payload: any): void {
  const startTime = payload.startTime || Date.now();
  const latency = Date.now() - startTime;

  // Log to telemetry service
  telemetryService.logEvent({
    eventType: mapNodeToEventType(node),
    severity: payload.success ? 'info' : 'error',
    agentId: payload.agentId,
    agentName: payload.agentName || node,
    documentId: payload.documentId,
    latency,
    success: payload.success !== false,
    confidenceScore: payload.confidence,
    metadata: {
      node,
      checksum: payload.checksum,
      drift_score: payload.drift_score,
      ...payload.metadata
    }
  });

  // Console log for development
  console.log(`[OCCAM Decision] ${node}:`, {
    latency: `${latency}ms`,
    success: payload.success !== false,
    confidence: payload.confidence,
    drift_score: payload.drift_score
  });
}

/**
 * Map node name to event type
 */
function mapNodeToEventType(node: string): AuditEventType {
  const mapping: Record<string, AuditEventType> = {
    'data': 'data-ingestion',
    'validation': 'validation-check',
    'form': 'form-generation',
    'payment': 'payment-processing',
    'submission': 'submission-attempt',
    'confirmation': 'confirmation-received'
  };

  return mapping[node.toLowerCase()] || 'compliance-check';
}

/**
 * Expose Prometheus metrics endpoint
 * Usage: app.get('/metrics/occam', async (req, res) => exposeMetrics(req, res))
 */
export async function exposeMetrics(req: any, res: any): Promise<void> {
  try {
    const metrics = await telemetryService.getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    res.status(500).send('Error generating metrics');
  }
}

export default TelemetryService;
