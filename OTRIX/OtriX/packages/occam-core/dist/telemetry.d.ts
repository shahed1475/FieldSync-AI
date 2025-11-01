/**
 * OCCAM Telemetry Module
 * Phase 0: Foundation Setup
 *
 * Prometheus-ready telemetry for tracking decisions across the OCCAM system
 */
export interface DecisionNode {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    timestamp: Date;
}
export interface DecisionPayload {
    action: string;
    metadata: Record<string, unknown>;
    result?: 'success' | 'failure' | 'pending';
    latencyMs?: number;
}
export interface TelemetryEntry {
    node: DecisionNode;
    payload: DecisionPayload;
    timestamp: Date;
}
declare class TelemetryLogger {
    private entries;
    private readonly MAX_ENTRIES;
    /**
     * Log a decision at a specific node in the OCCAM workflow
     */
    logDecision(node: DecisionNode, payload: DecisionPayload): void;
    /**
     * Get all telemetry entries
     */
    getEntries(): TelemetryEntry[];
    /**
     * Get entries for a specific node
     */
    getEntriesForNode(nodeId: string): TelemetryEntry[];
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Export to Prometheus (stub for now)
     */
    private exportToPrometheus;
    /**
     * Get metrics summary for Prometheus
     */
    getMetrics(): {
        totalDecisions: number;
        successRate: number;
        avgLatencyMs: number;
        nodeMetrics: Record<string, number>;
    };
}
declare const telemetryLogger: TelemetryLogger;
export { telemetryLogger };
export declare const logDecision: (node: DecisionNode, payload: DecisionPayload) => void;
//# sourceMappingURL=telemetry.d.ts.map