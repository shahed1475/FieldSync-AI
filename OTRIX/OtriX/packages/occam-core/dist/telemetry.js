"use strict";
/**
 * OCCAM Telemetry Module
 * Phase 0: Foundation Setup
 *
 * Prometheus-ready telemetry for tracking decisions across the OCCAM system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logDecision = exports.telemetryLogger = void 0;
class TelemetryLogger {
    constructor() {
        this.entries = [];
        this.MAX_ENTRIES = 10000;
    }
    /**
     * Log a decision at a specific node in the OCCAM workflow
     */
    logDecision(node, payload) {
        const entry = {
            node,
            payload,
            timestamp: new Date(),
        };
        this.entries.push(entry);
        // Keep only the most recent entries
        if (this.entries.length > this.MAX_ENTRIES) {
            this.entries.shift();
        }
        // In production, this would export to Prometheus
        this.exportToPrometheus(entry);
    }
    /**
     * Get all telemetry entries
     */
    getEntries() {
        return [...this.entries];
    }
    /**
     * Get entries for a specific node
     */
    getEntriesForNode(nodeId) {
        return this.entries.filter(e => e.node.nodeId === nodeId);
    }
    /**
     * Clear all entries
     */
    clear() {
        this.entries = [];
    }
    /**
     * Export to Prometheus (stub for now)
     */
    exportToPrometheus(entry) {
        // TODO: Integrate with Prometheus client
        // For now, log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OCCAM Telemetry] ${entry.node.nodeName}: ${entry.payload.action}`);
        }
    }
    /**
     * Get metrics summary for Prometheus
     */
    getMetrics() {
        const total = this.entries.length;
        const successes = this.entries.filter(e => e.payload.result === 'success').length;
        const latencies = this.entries
            .filter(e => e.payload.latencyMs !== undefined)
            .map(e => e.payload.latencyMs);
        const avgLatency = latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0;
        const nodeMetrics = {};
        this.entries.forEach(e => {
            nodeMetrics[e.node.nodeName] = (nodeMetrics[e.node.nodeName] || 0) + 1;
        });
        return {
            totalDecisions: total,
            successRate: total > 0 ? successes / total : 0,
            avgLatencyMs: avgLatency,
            nodeMetrics,
        };
    }
}
// Singleton instance
const telemetryLogger = new TelemetryLogger();
exports.telemetryLogger = telemetryLogger;
exports.logDecision = telemetryLogger.logDecision.bind(telemetryLogger);
//# sourceMappingURL=telemetry.js.map