"use client";

import { Bell, Mail, Send, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

export default function NotificationsPage() {
  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header with gradient divider */}
      <motion.div variants={staggerItem} className="otrix-page-header">
        <h1 className="otrix-page-title">Notifications</h1>
        <p className="otrix-page-description">
          Send and manage platform notifications
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* Notification Stats Grid */}
      <motion.div
        variants={staggerItem}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Bell className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Total</p>
              <p className="text-2xl font-bold text-white">3,458</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <Mail className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Unread</p>
              <p className="text-2xl font-bold text-white">147</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
              <Send className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Sent Today</p>
              <p className="text-2xl font-bold text-white">892</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
              <CheckCircle className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Delivery Rate</p>
              <p className="text-2xl font-bold text-white">98.4%</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div variants={staggerItem} className="otrix-page-container">
        <div className="otrix-section-title mb-6">Notification Management</div>

        <div className="otrix-info-card">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-[#6E2BFF] mt-0.5" />
            <div>
              <p className="otrix-text font-medium mb-1">
                Notification Center Coming Soon
              </p>
              <p className="otrix-text-muted text-sm">
                Comprehensive notification management including broadcast messages,
                scheduled notifications, templates, and delivery analytics will be available here.
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="space-y-4 mt-6">
          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Recent Notifications</h3>
            <p className="otrix-text-muted text-sm">
              View and manage recently sent platform notifications
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Templates</h3>
            <p className="otrix-text-muted text-sm">
              Create and manage reusable notification templates
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Scheduled Messages</h3>
            <p className="otrix-text-muted text-sm">
              Schedule notifications for future delivery and campaigns
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
