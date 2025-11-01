"use client";

import { Shield, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

export default function AuditPage() {
  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header with gradient divider */}
      <motion.div variants={staggerItem} className="otrix-page-header">
        <h1 className="otrix-page-title">Audit Log</h1>
        <p className="otrix-page-description">
          Track all administrative actions and security events
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* Audit Stats Grid */}
      <motion.div
        variants={staggerItem}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <FileText className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Total Events</p>
              <p className="text-2xl font-bold text-white">12,458</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Shield className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Today's Actions</p>
              <p className="text-2xl font-bold text-white">347</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
              <AlertTriangle className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Security Alerts</p>
              <p className="text-2xl font-bold text-white">12</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Success Rate</p>
              <p className="text-2xl font-bold text-white">99.2%</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div variants={staggerItem} className="otrix-page-container">
        <div className="otrix-section-title mb-6">Audit Trail Viewer</div>

        <div className="otrix-info-card">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-[#6E2BFF] mt-0.5" />
            <div>
              <p className="otrix-text font-medium mb-1">
                Audit Log Interface Coming Soon
              </p>
              <p className="otrix-text-muted text-sm">
                Comprehensive audit trail viewer with filtering, search, and export capabilities
                for tracking all administrative actions and security events.
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="space-y-4 mt-6">
          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Recent Activity</h3>
            <p className="otrix-text-muted text-sm">
              View chronological log of all administrative actions
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Security Events</h3>
            <p className="otrix-text-muted text-sm">
              Monitor login attempts, permission changes, and security alerts
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Data Changes</h3>
            <p className="otrix-text-muted text-sm">
              Track all create, update, and delete operations
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
