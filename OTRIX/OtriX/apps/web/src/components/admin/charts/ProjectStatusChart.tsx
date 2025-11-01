"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { motion } from "framer-motion";
import { chartFadeIn } from "@/lib/motion";

const COLORS: Record<string, string> = {
  pending: "#F59E0B",
  in_progress: "#00A6FF",
  completed: "#10B981",
  failed: "#EF4444",
  canceled: "#6B7280",
};

const GRADIENTS: Record<string, { start: string; end: string }> = {
  pending: { start: "#F59E0B", end: "#F97316" },
  in_progress: { start: "#00A6FF", end: "#6E2BFF" },
  completed: { start: "#10B981", end: "#059669" },
  failed: { start: "#EF4444", end: "#DC2626" },
  canceled: { start: "#6B7280", end: "#4B5563" },
};

interface ProjectStatusChartProps {
  data: Array<{
    status: string;
    _count: { status: number };
  }>;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0B0F19]/95 p-3 backdrop-blur-md shadow-[0_0_20px_rgba(110,43,255,0.3)]">
        <p className="text-sm font-medium text-white">{payload[0].payload.status}</p>
        <p className="text-sm text-[#6E2BFF]">
          Count: <span className="font-bold">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
};

export function ProjectStatusChart({ data }: ProjectStatusChartProps) {
  const chartData = data.map((item) => ({
    status: item.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    count: item._count.status,
    fill: COLORS[item.status] || "#6b7280",
    gradient: GRADIENTS[item.status] || { start: "#6B7280", end: "#4B5563" },
    originalStatus: item.status,
  }));

  return (
    <motion.div
      variants={chartFadeIn}
      initial="hidden"
      animate="visible"
      style={{ width: "100%", height: 300 }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <defs>
            {chartData.map((entry, index) => (
              <linearGradient
                key={`gradient-${index}`}
                id={`barGradient-${entry.originalStatus}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={entry.gradient.start} stopOpacity={1} />
                <stop offset="95%" stopColor={entry.gradient.end} stopOpacity={0.8} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="status"
            stroke="rgba(255,255,255,0.5)"
            style={{ fontSize: 12 }}
          />
          <YAxis stroke="rgba(255,255,255,0.5)" style={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={`url(#barGradient-${entry.originalStatus})`}
                style={{
                  filter: `drop-shadow(0 0 8px ${entry.fill}40)`,
                }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
