'use client';

/**
 * OCCAM Dashboard - System Health & Telemetry Monitor
 * Phase 9: Orchestrator Hardening
 *
 * Displays:
 * - Last audit run status
 * - Latency trends
 * - Compliance health score
 * - Manual re-validation trigger
 * - SLO compliance status
 */

import React, { useState, useEffect } from 'react';

// Types
interface SystemHealth {
  totalAgents: number;
  activeAgents: number;
  overallSuccessRate: number;
  averageLatencyMs: number;
}

interface SLOStatus {
  name: string;
  target: number;
  actual: number;
  unit: string;
  compliant: boolean;
  trend: 'improving' | 'stable' | 'degrading';
}

interface AuditStatus {
  lastRunTime?: string;
  nextScheduledRun?: string;
  isRunning: boolean;
}

export default function OccamDashboard() {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [sloStatus, setSloStatus] = useState<SLOStatus[]>([]);
  const [auditStatus, setAuditStatus] = useState<AuditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningManualAudit, setRunningManualAudit] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Simulate API calls - replace with actual endpoints
      setSystemHealth({
        totalAgents: 8,
        activeAgents: 8,
        overallSuccessRate: 98.5,
        averageLatencyMs: 1850
      });

      setSloStatus([
        { name: 'Retrieval Latency', target: 2500, actual: 1850, unit: 'ms', compliant: true, trend: 'stable' },
        { name: 'Build Time', target: 7, actual: 5.2, unit: 'min', compliant: true, trend: 'improving' },
        { name: 'Compliance Accuracy', target: 97, actual: 98.5, unit: '%', compliant: true, trend: 'stable' },
        { name: 'Audit Trace Verification', target: 100, actual: 100, unit: '%', compliant: true, trend: 'stable' },
        { name: 'CPU Utilization', target: 80, actual: 45, unit: '%', compliant: true, trend: 'stable' },
        { name: 'Memory Utilization', target: 75, actual: 60, unit: '%', compliant: true, trend: 'stable' }
      ]);

      setAuditStatus({
        lastRunTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        nextScheduledRun: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        isRunning: false
      });

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setLoading(false);
    }
  };

  const handleManualReValidation = async () => {
    setRunningManualAudit(true);
    try {
      // Simulate manual audit trigger - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 3000));
      alert('Manual audit completed successfully');
      fetchDashboardData();
    } catch (error) {
      alert('Failed to run manual audit');
    } finally {
      setRunningManualAudit(false);
    }
  };

  const getStatusColor = (compliant: boolean) => {
    return compliant ? 'text-green-600' : 'text-red-600';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return '↗️';
      case 'degrading': return '↘️';
      default: return '→';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading OCCAM Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">
          OCCAM Compliance Dashboard
        </h1>
        <button
          onClick={handleManualReValidation}
          disabled={runningManualAudit || auditStatus?.isRunning}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {runningManualAudit ? 'Running Audit...' : 'Trigger Manual Audit'}
        </button>
      </div>

      {/* System Health Overview */}
      {systemHealth && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Agents</div>
            <div className="text-3xl font-bold text-gray-900">{systemHealth.totalAgents}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Active Agents</div>
            <div className="text-3xl font-bold text-green-600">{systemHealth.activeAgents}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Success Rate</div>
            <div className="text-3xl font-bold text-blue-600">{systemHealth.overallSuccessRate.toFixed(1)}%</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Avg Latency</div>
            <div className="text-3xl font-bold text-purple-600">{systemHealth.averageLatencyMs}ms</div>
          </div>
        </div>
      )}

      {/* Audit Status */}
      {auditStatus && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Audit Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600">Last Audit Run</div>
              <div className="text-lg font-semibold text-gray-900">
                {auditStatus.lastRunTime
                  ? new Date(auditStatus.lastRunTime).toLocaleDateString()
                  : 'Never'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Next Scheduled Run</div>
              <div className="text-lg font-semibold text-gray-900">
                {auditStatus.nextScheduledRun
                  ? new Date(auditStatus.nextScheduledRun).toLocaleDateString()
                  : 'Not scheduled'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div className={`text-lg font-semibold ${auditStatus.isRunning ? 'text-blue-600' : 'text-green-600'}`}>
                {auditStatus.isRunning ? 'Running...' : 'Idle'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SLO Compliance */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Performance SLOs</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4 text-gray-600">Metric</th>
                <th className="text-left py-2 px-4 text-gray-600">Target</th>
                <th className="text-left py-2 px-4 text-gray-600">Actual</th>
                <th className="text-left py-2 px-4 text-gray-600">Status</th>
                <th className="text-left py-2 px-4 text-gray-600">Trend</th>
              </tr>
            </thead>
            <tbody>
              {sloStatus.map((slo, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{slo.name}</td>
                  <td className="py-3 px-4">
                    {slo.target} {slo.unit}
                  </td>
                  <td className="py-3 px-4">
                    {slo.actual} {slo.unit}
                  </td>
                  <td className={`py-3 px-4 font-semibold ${getStatusColor(slo.compliant)}`}>
                    {slo.compliant ? '✓ Compliant' : '✗ Violated'}
                  </td>
                  <td className="py-3 px-4">
                    {getTrendIcon(slo.trend)} {slo.trend}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance Health Score */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Compliance Health Score</h2>
        <div className="flex items-center justify-center">
          <div className="relative w-48 h-48">
            <svg className="transform -rotate-90 w-48 h-48">
              <circle
                cx="96"
                cy="96"
                r="80"
                stroke="#e5e7eb"
                strokeWidth="16"
                fill="none"
              />
              <circle
                cx="96"
                cy="96"
                r="80"
                stroke="#10b981"
                strokeWidth="16"
                fill="none"
                strokeDasharray={`${systemHealth ? (systemHealth.overallSuccessRate / 100) * 502.4 : 0} 502.4`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900">
                  {systemHealth?.overallSuccessRate.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Overall Health</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
