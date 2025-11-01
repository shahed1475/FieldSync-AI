"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { chartFadeIn } from "@/lib/motion";

async function fetchRevenueData() {
  const res = await fetch("/api/admin/analytics/revenue?months=12", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch revenue data");
  return res.json();
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0B0F19]/95 p-3 backdrop-blur-md shadow-[0_0_20px_rgba(0,166,255,0.3)]">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-sm text-[#00A6FF]">
          Revenue: <span className="font-bold">${payload[0].value.toFixed(2)}</span>
        </p>
      </div>
    );
  }
  return null;
};

export function RevenueChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["revenue-chart"],
    queryFn: fetchRevenueData,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <motion.div
          className="h-12 w-12 rounded-full border-4 border-[#00A6FF]/30 border-t-[#00A6FF]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  const chartData = data?.map((item: any) => ({
    month: format(new Date(item.month), "MMM yyyy"),
    revenue: item.revenue,
  })) || [];

  return (
    <motion.div
      variants={chartFadeIn}
      initial="hidden"
      animate="visible"
      style={{ width: "100%", height: 300 }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00A6FF" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#E93AFF" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="month"
            stroke="rgba(255,255,255,0.5)"
            style={{ fontSize: 12 }}
          />
          <YAxis
            stroke="rgba(255,255,255,0.5)"
            style={{ fontSize: 12 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#00A6FF"
            strokeWidth={3}
            fill="url(#revenueGradient)"
            fillOpacity={1}
            style={{
              filter: "drop-shadow(0 0 8px rgba(0, 166, 255, 0.5))",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
