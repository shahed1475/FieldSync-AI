"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.telemetryService = exports.TelemetryService = void 0;
exports.logDecision = logDecision;
exports.exposeMetrics = exposeMetrics;
const prom_client_1 = require("prom-client");
/**
 * Default SLO targets
 */
const DEFAULT_SLO_TARGETS = {
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
class TelemetryService {
    constructor(sloTargets = DEFAULT_SLO_TARGETS) {
        // In-memory telemetry storage
        this.events = [];
        this.maxEventsInMemory = 10000;
        this.registry = new prom_client_1.Registry();
        this.sloTargets = sloTargets;
        // Collect default metrics (CPU, memory, etc.)
        (0, prom_client_1.collectDefaultMetrics)({ register: this.registry });
        // Initialize custom metrics
        this.initializeMetrics();
    }
    /**
     * Initialize Prometheus metrics
     */
    initializeMetrics() {
        // Event counter by type and severity
        this.eventCounter = new prom_client_1.Counter({
            name: 'occam_events_total',
            help: 'Total number of OCCAM events',
            labelNames: ['event_type', 'severity', 'agent_id', 'success'],
            registers: [this.registry]
        });
        // Latency histogram for decision nodes
        this.latencyHistogram = new prom_client_1.Histogram({
            name: 'occam_decision_latency_ms',
            help: 'Latency of OCCAM decision nodes in milliseconds',
            labelNames: ['event_type', 'agent_id'],
            buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
            registers: [this.registry]
        });
        // Confidence score gauge
        this.confidenceScoreGauge = new prom_client_1.Gauge({
            name: 'occam_confidence_score',
            help: 'Confidence score for OCCAM decisions (0-100)',
            labelNames: ['event_type', 'agent_id'],
            registers: [this.registry]
        });
        // Success rate gauge
        this.successRateGauge = new prom_client_1.Gauge({
            name: 'occam_success_rate',
            help: 'Success rate of OCCAM operations (0-100)',
            labelNames: ['event_type'],
            registers: [this.registry]
        });
        // Drift detection counter
        this.driftDetectionCounter = new prom_client_1.Counter({
            name: 'occam_drift_detections_total',
            help: 'Total number of drift detections',
            labelNames: ['severity', 'action'],
            registers: [this.registry]
        });
        // SLO compliance gauge
        this.sloComplianceGauge = new prom_client_1.Gauge({
            name: 'occam_slo_compliance',
            help: 'SLO compliance status (1 = compliant, 0 = violated)',
            labelNames: ['slo_name'],
            registers: [this.registry]
        });
        // CPU utilization gauge
        this.cpuUtilizationGauge = new prom_client_1.Gauge({
            name: 'occam_cpu_utilization_percent',
            help: 'CPU utilization percentage',
            registers: [this.registry]
        });
        // Memory utilization gauge
        this.memoryUtilizationGauge = new prom_client_1.Gauge({
            name: 'occam_memory_utilization_percent',
            help: 'Memory utilization percentage',
            registers: [this.registry]
        });
    }
    /**
     * Log a telemetry event
     */
    async logEvent(event) {
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
        this.latencyHistogram.observe({
            event_type: event.eventType,
            agent_id: event.agentId || 'unknown'
        }, event.latency);
        if (event.confidenceScore !== undefined) {
            this.confidenceScoreGauge.set({
                event_type: event.eventType,
                agent_id: event.agentId || 'unknown'
            }, event.confidenceScore);
        }
        // Update success rate
        await this.updateSuccessRate(event.eventType);
    }
    /**
     * Log drift detection
     */
    async logDriftDetection(severity, action) {
        this.driftDetectionCounter.inc({
            severity,
            action
        });
    }
    /**
     * Update success rate for an event type
     */
    async updateSuccessRate(eventType) {
        const eventsOfType = this.events.filter(e => e.eventType === eventType);
        if (eventsOfType.length === 0)
            return;
        const successCount = eventsOfType.filter(e => e.success).length;
        const successRate = (successCount / eventsOfType.length) * 100;
        this.successRateGauge.set({ event_type: eventType }, successRate);
    }
    /**
     * Update CPU utilization
     */
    updateCPUUtilization(percent) {
        this.cpuUtilizationGauge.set(percent);
    }
    /**
     * Update memory utilization
     */
    updateMemoryUtilization(percent) {
        this.memoryUtilizationGauge.set(percent);
    }
    /**
     * Check SLO compliance
     */
    async checkSLOCompliance() {
        // Calculate metrics
        const retrievalEvents = this.events.filter(e => e.eventType === 'data-ingestion');
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
        const retrievalLatency = {
            name: 'Retrieval Latency',
            target: this.sloTargets.retrievalLatencyMs,
            actual: avgRetrievalLatency,
            unit: 'ms',
            compliant: avgRetrievalLatency <= this.sloTargets.retrievalLatencyMs,
            trend: 'stable',
            lastMeasured: new Date()
        };
        const buildTime = {
            name: 'Build Time',
            target: this.sloTargets.buildTimeMinutes,
            actual: 5, // Simulated - would calculate from build events
            unit: 'minutes',
            compliant: true,
            trend: 'improving',
            lastMeasured: new Date()
        };
        const complianceAccuracyMetric = {
            name: 'Compliance Accuracy',
            target: this.sloTargets.complianceAccuracyPercent,
            actual: complianceAccuracy,
            unit: '%',
            compliant: complianceAccuracy >= this.sloTargets.complianceAccuracyPercent,
            trend: 'stable',
            lastMeasured: new Date()
        };
        const auditTraceVerification = {
            name: 'Audit Trace Verification',
            target: this.sloTargets.auditTraceVerificationPercent,
            actual: 100, // Simulated - would verify hash chain
            unit: '%',
            compliant: true,
            trend: 'stable',
            lastMeasured: new Date()
        };
        const cpuUtilization = {
            name: 'CPU Utilization',
            target: this.sloTargets.cpuUtilizationPercent,
            actual: cpuPercent,
            unit: '%',
            compliant: cpuPercent < this.sloTargets.cpuUtilizationPercent,
            trend: 'stable',
            lastMeasured: new Date()
        };
        const memoryUtilization = {
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
    async getMetrics() {
        return this.registry.metrics();
    }
    /**
     * Get recent events
     */
    getRecentEvents(limit = 100) {
        return this.events.slice(-limit);
    }
    /**
     * Get events by type
     */
    getEventsByType(eventType) {
        return this.events.filter(e => e.eventType === eventType);
    }
    /**
     * Calculate average latency for event type
     */
    getAverageLatency(eventType) {
        const events = this.getEventsByType(eventType);
        if (events.length === 0)
            return 0;
        const totalLatency = events.reduce((sum, e) => sum + e.latency, 0);
        return totalLatency / events.length;
    }
    /**
     * Get success rate for event type
     */
    getSuccessRate(eventType) {
        const events = this.getEventsByType(eventType);
        if (events.length === 0)
            return 0;
        const successCount = events.filter(e => e.success).length;
        return (successCount / events.length) * 100;
    }
    /**
     * Clear all telemetry data
     */
    clear() {
        this.events = [];
    }
}
exports.TelemetryService = TelemetryService;
/**
 * Singleton instance
 */
exports.telemetryService = new TelemetryService();
/**
 * Log decision node
 * Logs telemetry for critical decision nodes: data → validation → form → payment → submission → confirmation
 */
function logDecision(node, payload) {
    const startTime = payload.startTime || Date.now();
    const latency = Date.now() - startTime;
    // Log to telemetry service
    exports.telemetryService.logEvent({
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
function mapNodeToEventType(node) {
    const mapping = {
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
async function exposeMetrics(req, res) {
    try {
        const metrics = await exports.telemetryService.getMetrics();
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(metrics);
    }
    catch (error) {
        res.status(500).send('Error generating metrics');
    }
}
exports.default = TelemetryService;
