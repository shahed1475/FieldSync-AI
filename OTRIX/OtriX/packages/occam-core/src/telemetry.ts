/**
 * OCCAM Telemetry Module
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

class TelemetryLogger {
  private entries: TelemetryEntry[] = [];
  private readonly MAX_ENTRIES = 10000;

  /**
   * Log a decision at a specific node in the OCCAM workflow
   */
  logDecision(node: DecisionNode, payload: DecisionPayload): void {
    const entry: TelemetryEntry = {
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
  getEntries(): TelemetryEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries for a specific node
   */
  getEntriesForNode(nodeId: string): TelemetryEntry[] {
    return this.entries.filter(e => e.node.nodeId === nodeId);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Export to Prometheus (stub for now)
   */
  private exportToPrometheus(entry: TelemetryEntry): void {
    // TODO: Integrate with Prometheus client
    // For now, log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[OCCAM Telemetry] ${entry.node.nodeName}: ${entry.payload.action}`);
    }
  }

  /**
   * Get metrics summary for Prometheus
   */
  getMetrics(): {
    totalDecisions: number;
    successRate: number;
    avgLatencyMs: number;
    nodeMetrics: Record<string, number>;
  } {
    const total = this.entries.length;
    const successes = this.entries.filter(e => e.payload.result === 'success').length;
    const latencies = this.entries
      .filter(e => e.payload.latencyMs !== undefined)
      .map(e => e.payload.latencyMs!);
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const nodeMetrics: Record<string, number> = {};
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

export { telemetryLogger };
export const logDecision = telemetryLogger.logDecision.bind(telemetryLogger);
