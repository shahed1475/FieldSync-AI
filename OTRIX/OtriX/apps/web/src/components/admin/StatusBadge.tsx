"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { fadeInScale } from "@/lib/motion";

interface StatusBadgeProps {
  status: string;
  className?: string;
  animated?: boolean;
}

const statusColors: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  // Project statuses
  pending: {
    bg: "bg-gradient-to-r from-yellow-500/20 to-orange-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.2)]",
  },
  in_progress: {
    bg: "bg-gradient-to-r from-blue-500/20 to-cyan-500/20",
    text: "text-blue-400",
    border: "border-blue-500/30",
    glow: "shadow-[0_0_10px_rgba(59,130,246,0.2)]",
  },
  completed: {
    bg: "bg-gradient-to-r from-green-500/20 to-emerald-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    glow: "shadow-[0_0_10px_rgba(16,185,129,0.2)]",
  },
  failed: {
    bg: "bg-gradient-to-r from-red-500/20 to-rose-500/20",
    text: "text-red-400",
    border: "border-red-500/30",
    glow: "shadow-[0_0_10px_rgba(239,68,68,0.2)]",
  },
  canceled: {
    bg: "bg-gradient-to-r from-gray-500/20 to-slate-500/20",
    text: "text-gray-400",
    border: "border-gray-500/30",
    glow: "shadow-[0_0_10px_rgba(107,114,128,0.2)]",
  },

  // Subscription statuses
  active: {
    bg: "bg-gradient-to-r from-green-500/20 to-emerald-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    glow: "shadow-[0_0_10px_rgba(16,185,129,0.2)]",
  },
  past_due: {
    bg: "bg-gradient-to-r from-red-500/20 to-rose-500/20",
    text: "text-red-400",
    border: "border-red-500/30",
    glow: "shadow-[0_0_10px_rgba(239,68,68,0.2)]",
  },
  trialing: {
    bg: "bg-gradient-to-r from-purple-500/20 to-violet-500/20",
    text: "text-purple-400",
    border: "border-purple-500/30",
    glow: "shadow-[0_0_10px_rgba(168,85,247,0.2)]",
  },
  paused: {
    bg: "bg-gradient-to-r from-yellow-500/20 to-orange-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.2)]",
  },

  // System health statuses
  healthy: {
    bg: "bg-gradient-to-r from-green-500/20 to-emerald-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    glow: "shadow-[0_0_10px_rgba(16,185,129,0.2)]",
  },
  degraded: {
    bg: "bg-gradient-to-r from-yellow-500/20 to-orange-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.2)]",
  },
  down: {
    bg: "bg-gradient-to-r from-red-500/20 to-rose-500/20",
    text: "text-red-400",
    border: "border-red-500/30",
    glow: "shadow-[0_0_10px_rgba(239,68,68,0.2)]",
  },
  online: {
    bg: "bg-gradient-to-r from-green-500/20 to-emerald-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    glow: "shadow-[0_0_10px_rgba(16,185,129,0.2)]",
  },
  offline: {
    bg: "bg-gradient-to-r from-red-500/20 to-rose-500/20",
    text: "text-red-400",
    border: "border-red-500/30",
    glow: "shadow-[0_0_10px_rgba(239,68,68,0.2)]",
  },
};

export function StatusBadge({ status, className, animated = true }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/ /g, "_");
  const colors = statusColors[normalizedStatus] || {
    bg: "bg-gradient-to-r from-gray-500/20 to-slate-500/20",
    text: "text-gray-400",
    border: "border-gray-500/30",
    glow: "shadow-[0_0_10px_rgba(107,114,128,0.2)]",
  };

  const displayText = status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const Component = animated ? motion.span : "span";
  const motionProps = animated ? {
    variants: fadeInScale,
    initial: "hidden",
    animate: "visible",
    whileHover: { scale: 1.05 },
    transition: { type: "spring", stiffness: 400, damping: 17 },
  } : {};

  return (
    <Component
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm border",
        colors.bg,
        colors.text,
        colors.border,
        colors.glow,
        "transition-all duration-200",
        className
      )}
      {...motionProps}
    >
      {/* Status indicator dot */}
      <motion.span
        className={cn("h-1.5 w-1.5 rounded-full", colors.text.replace("text-", "bg-"))}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {displayText}
    </Component>
  );
}
