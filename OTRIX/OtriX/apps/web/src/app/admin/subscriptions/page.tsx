"use client";

import { CreditCard, Users, TrendingUp, DollarSign } from "lucide-react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer, staggerItem } from "@/lib/motion";

export default function SubscriptionsPage() {
  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header with gradient divider */}
      <motion.div variants={staggerItem} className="otrix-page-header">
        <h1 className="otrix-page-title">Subscriptions</h1>
        <p className="otrix-page-description">
          Manage user subscriptions and billing
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* Quick Stats Grid */}
      <motion.div
        variants={staggerItem}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
              <Users className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Active</p>
              <p className="text-2xl font-bold text-white">1,234</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <CreditCard className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Trialing</p>
              <p className="text-2xl font-bold text-white">89</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <TrendingUp className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Growth</p>
              <p className="text-2xl font-bold text-white">+12%</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
              <DollarSign className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">MRR</p>
              <p className="text-2xl font-bold text-white">$45.2K</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div variants={staggerItem} className="otrix-page-container">
        <div className="otrix-section-title mb-6">Subscription Management</div>

        <div className="otrix-info-card">
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-[#6E2BFF] mt-0.5" />
            <div>
              <p className="otrix-text font-medium mb-1">
                Subscription Interface Coming Soon
              </p>
              <p className="otrix-text-muted text-sm">
                Full subscription management dashboard with billing history,
                plan upgrades, and payment tracking will be available here.
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="space-y-4 mt-6">
          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Recent Subscriptions</h3>
            <p className="otrix-text-muted text-sm">
              View and manage recent subscription changes
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Billing & Invoices</h3>
            <p className="otrix-text-muted text-sm">
              Access billing history and download invoices
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Plan Analytics</h3>
            <p className="otrix-text-muted text-sm">
              Track subscription performance and conversion rates
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
