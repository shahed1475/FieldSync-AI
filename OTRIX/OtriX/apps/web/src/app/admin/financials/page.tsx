"use client";

import { DollarSign, TrendingUp, TrendingDown, PieChart } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

export default function FinancialsPage() {
  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header with gradient divider */}
      <motion.div variants={staggerItem} className="otrix-page-header">
        <h1 className="otrix-page-title">Financials</h1>
        <p className="otrix-page-description">
          Revenue, costs, and profit analysis
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* Financial Stats Grid */}
      <motion.div
        variants={staggerItem}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
              <TrendingUp className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Total Revenue</p>
              <p className="text-2xl font-bold text-white">$145.2K</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/20">
              <TrendingDown className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Total Costs</p>
              <p className="text-2xl font-bold text-white">$32.8K</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <DollarSign className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Net Profit</p>
              <p className="text-2xl font-bold text-white">$112.4K</p>
            </div>
          </div>
        </div>

        <div className="otrix-section">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <PieChart className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Profit Margin</p>
              <p className="text-2xl font-bold text-white">77.4%</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div variants={staggerItem} className="otrix-page-container">
        <div className="otrix-section-title mb-6">Financial Analytics & Reports</div>

        <div className="otrix-info-card">
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-[#6E2BFF] mt-0.5" />
            <div>
              <p className="otrix-text font-medium mb-1">
                Financial Dashboard Coming Soon
              </p>
              <p className="otrix-text-muted text-sm">
                Comprehensive financial analytics including revenue breakdowns,
                cost analysis, and profitability trends will be available here.
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="space-y-4 mt-6">
          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Revenue Analysis</h3>
            <p className="otrix-text-muted text-sm">
              Track revenue streams by product, plan, and time period
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Cost Breakdown</h3>
            <p className="otrix-text-muted text-sm">
              Monitor operational costs and identify optimization opportunities
            </p>
          </div>

          <div className="otrix-section">
            <h3 className="font-semibold text-white mb-2">Financial Forecasting</h3>
            <p className="otrix-text-muted text-sm">
              Predictive analytics and growth projections
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
