"use client";

import { Settings, Shield, Plug, Palette, Database, Bell } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

export default function SettingsPage() {
  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header with gradient divider */}
      <motion.div variants={staggerItem} className="otrix-page-header">
        <h1 className="otrix-page-title">Settings</h1>
        <p className="otrix-page-description">
          Configure platform settings and preferences
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* Settings Categories Grid */}
      <motion.div
        variants={staggerItem}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="otrix-section cursor-pointer hover:border-[#6E2BFF]/50 transition-all">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <Settings className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">General</h3>
              <p className="text-sm otrix-text-muted">
                Platform name, timezone, and basic configuration
              </p>
            </div>
          </div>
        </div>

        <div className="otrix-section cursor-pointer hover:border-[#6E2BFF]/50 transition-all">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/20">
              <Shield className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Security</h3>
              <p className="text-sm otrix-text-muted">
                Authentication, authorization, and security policies
              </p>
            </div>
          </div>
        </div>

        <div className="otrix-section cursor-pointer hover:border-[#6E2BFF]/50 transition-all">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Plug className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Integrations</h3>
              <p className="text-sm otrix-text-muted">
                Third-party services, APIs, and webhooks
              </p>
            </div>
          </div>
        </div>

        <div className="otrix-section cursor-pointer hover:border-[#6E2BFF]/50 transition-all">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
              <Palette className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Appearance</h3>
              <p className="text-sm otrix-text-muted">
                Branding, theme customization, and UI preferences
              </p>
            </div>
          </div>
        </div>

        <div className="otrix-section cursor-pointer hover:border-[#6E2BFF]/50 transition-all">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
              <Database className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Data & Storage</h3>
              <p className="text-sm otrix-text-muted">
                Database settings, backups, and data retention
              </p>
            </div>
          </div>
        </div>

        <div className="otrix-section cursor-pointer hover:border-[#6E2BFF]/50 transition-all">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20">
              <Bell className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Notifications</h3>
              <p className="text-sm otrix-text-muted">
                Email templates, alert preferences, and channels
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div variants={staggerItem} className="otrix-page-container">
        <div className="otrix-section-title mb-6">Platform Configuration</div>

        <div className="otrix-info-card">
          <div className="flex items-start gap-3">
            <Settings className="h-5 w-5 text-[#6E2BFF] mt-0.5" />
            <div>
              <p className="otrix-text font-medium mb-1">
                Settings Interface Coming Soon
              </p>
              <p className="otrix-text-muted text-sm">
                Comprehensive settings management interface with category-based navigation,
                form validation, and real-time configuration updates will be available here.
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="space-y-4 mt-6">
          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Quick Actions</h3>
            <p className="otrix-text-muted text-sm">
              Frequently used settings and configuration shortcuts
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Recent Changes</h3>
            <p className="otrix-text-muted text-sm">
              Track recent configuration updates and who made them
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Environment Info</h3>
            <p className="otrix-text-muted text-sm">
              Current environment, version, and deployment details
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
