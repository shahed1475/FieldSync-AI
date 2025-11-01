"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MetricCard } from "@/components/admin/MetricCard";
import { RevenueChart } from "@/components/admin/charts/RevenueChart";
import { UserGrowthChart } from "@/components/admin/charts/UserGrowthChart";
import { ProjectStatusChart } from "@/components/admin/charts/ProjectStatusChart";
import {
  Users,
  FolderKanban,
  DollarSign,
  CreditCard,
  TrendingUp,
  CheckCircle,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/motion";

async function fetchAnalytics() {
  const res = await fetch("/api/admin/analytics", {
    credentials: "include", // Include session cookie
  });
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: fetchAnalytics,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-800">Failed to load analytics data</p>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header with enhanced gradient title */}
      <motion.div variants={staggerItem} className="mb-6">
        <h1 className="otrix-title-gradient">
          Dashboard
        </h1>
        <p className="otrix-subtitle">
          Overview of your OtriX platform performance
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* Metrics Grid */}
      <motion.div
        variants={staggerItem}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          title="Total Users"
          value={formatNumber(data?.users?.total || 0)}
          change={`+${data?.users?.thisMonth || 0} this month`}
          changeType="positive"
          icon={Users}
        />
        <MetricCard
          title="Total Projects"
          value={formatNumber(data?.projects?.total || 0)}
          change={`${data?.projects?.completionRate || 0}% completed`}
          changeType="neutral"
          icon={FolderKanban}
        />
        <MetricCard
          title="Active Subscriptions"
          value={formatNumber(data?.subscriptions?.active || 0)}
          icon={CreditCard}
        />
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(data?.revenue?.total || 0)}
          change={`${formatCurrency(data?.revenue?.thisMonth || 0)} this month`}
          changeType="positive"
          icon={DollarSign}
        />
      </motion.div>

      {/* Charts Grid */}
      <motion.div variants={staggerItem} className="grid gap-6 lg:grid-cols-2">
        <div className="otrix-card-enhanced">
          <h2 className="mb-6 text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-[#00A6FF] otrix-icon-pulse" />
            Revenue Overview
          </h2>
          <RevenueChart />
        </div>
        <div className="otrix-card-enhanced">
          <h2 className="mb-6 text-lg font-semibold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-[#6E2BFF] otrix-icon-pulse" />
            User Growth
          </h2>
          <UserGrowthChart />
        </div>
      </motion.div>

      {/* Project Status Chart */}
      <motion.div variants={staggerItem} className="otrix-card-enhanced">
        <h2 className="mb-6 text-lg font-semibold text-white flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-[#6E2BFF] otrix-icon-pulse" />
          Project Status Distribution
        </h2>
        <ProjectStatusChart data={data?.projects?.statusBreakdown || []} />
      </motion.div>

      {/* Quick Stats */}
      <motion.div variants={staggerItem} className="grid gap-6 lg:grid-cols-3">
        <div className="otrix-card-enhanced group">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-shadow otrix-scale-hover">
              <TrendingUp className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Growth Rate</p>
              <p className="text-2xl font-bold text-white">{data?.users?.growth || 0}%</p>
            </div>
          </div>
        </div>
        <div className="otrix-card-enhanced group">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 group-hover:shadow-[0_0_20px_rgba(0,166,255,0.3)] transition-shadow otrix-scale-hover">
              <CheckCircle className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Completed Projects</p>
              <p className="text-2xl font-bold text-white">
                {formatNumber(data?.projects?.completed || 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="otrix-card-enhanced group">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 group-hover:shadow-[0_0_20px_rgba(110,43,255,0.3)] transition-shadow otrix-scale-hover">
              <DollarSign className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm otrix-text-muted">Revenue This Month</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(data?.revenue?.thisMonth || 0)}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
