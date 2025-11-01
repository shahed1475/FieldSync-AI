"use client";

import { Activity, Cpu, HardDrive, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

export default function SystemPage() {
  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header with gradient divider */}
      <motion.div variants={staggerItem} className="otrix-page-header">
        <h1 className="otrix-page-title">System Health</h1>
        <p className="otrix-page-description">
          Monitor system status and performance metrics
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* System Stats Grid */}
      <motion.div
        variants={staggerItem}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <Cpu className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">CPU Usage</p>
              <p className="text-2xl font-bold text-white">24%</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <HardDrive className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Memory</p>
              <p className="text-2xl font-bold text-white">2.8GB</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
              <Activity className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Uptime</p>
              <p className="text-2xl font-bold text-white">99.9%</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
              <Zap className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">API Status</p>
              <p className="text-2xl font-bold text-white">Healthy</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div variants={staggerItem} className="otrix-page-container">
        <div className="otrix-section-title mb-6">System Monitoring Dashboard</div>

        <div className="otrix-info-card">
          <div className="flex items-start gap-3">
            <Activity className="h-5 w-5 text-[#6E2BFF] mt-0.5" />
            <div>
              <p className="otrix-text font-medium mb-1">
                Real-Time Monitoring Coming Soon
              </p>
              <p className="otrix-text-muted text-sm">
                Comprehensive system health monitoring including CPU, memory, disk usage,
                network activity, and service status will be available here.
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="space-y-4 mt-6">
          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Performance Metrics</h3>
            <p className="otrix-text-muted text-sm">
              Real-time CPU, memory, and disk utilization graphs
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Service Status</h3>
            <p className="otrix-text-muted text-sm">
              Monitor status of all microservices and dependencies
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Alerts & Incidents</h3>
            <p className="otrix-text-muted text-sm">
              Track system alerts, warnings, and incident history
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
