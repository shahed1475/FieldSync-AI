"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { chartFadeIn } from "@/lib/motion";

async function fetchUserGrowthData() {
  const res = await fetch("/api/admin/analytics/users?months=12", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch user growth data");
  return res.json();
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0B0F19]/95 p-3 backdrop-blur-md shadow-[0_0_20px_rgba(110,43,255,0.3)]">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-sm text-[#6E2BFF]">
          Users: <span className="font-bold">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
};

export function UserGrowthChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["user-growth-chart"],
    queryFn: fetchUserGrowthData,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <motion.div
          className="h-12 w-12 rounded-full border-4 border-[#6E2BFF]/30 border-t-[#6E2BFF]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  const chartData = data?.map((item: any) => ({
    month: format(new Date(item.month), "MMM yyyy"),
    users: item.count,
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
            <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6E2BFF" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#00A6FF" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="month"
            stroke="rgba(255,255,255,0.5)"
            style={{ fontSize: 12 }}
          />
          <YAxis stroke="rgba(255,255,255,0.5)" style={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="users"
            stroke="#6E2BFF"
            strokeWidth={3}
            fill="url(#userGradient)"
            fillOpacity={1}
            style={{
              filter: "drop-shadow(0 0 8px rgba(110, 43, 255, 0.5))",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
