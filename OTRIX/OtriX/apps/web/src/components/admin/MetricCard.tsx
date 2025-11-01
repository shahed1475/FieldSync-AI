"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useAnimationControls } from "framer-motion";
import { fadeInScale, cardHover } from "@/lib/motion";
import { useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: LucideIcon;
  subtitle?: string;
  className?: string;
}

export function MetricCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  subtitle,
  className,
}: MetricCardProps) {
  const controls = useAnimationControls();

  useEffect(() => {
    controls.start({
      scale: [1, 1.02, 1],
      transition: { duration: 0.5, ease: "easeInOut" },
    });
  }, [value, controls]);

  const getChangeIcon = () => {
    if (changeType === "positive") return TrendingUp;
    if (changeType === "negative") return TrendingDown;
    return Minus;
  };

  const ChangeIcon = getChangeIcon();

  return (
    <motion.div
      className={cn(
        "otrix-card group relative overflow-hidden",
        className
      )}
      variants={fadeInScale}
      initial="hidden"
      animate="visible"
      whileHover="hover"
    >
      {/* Gradient glow background on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-[#6E2BFF]/10 via-transparent to-[#00A6FF]/10 opacity-0 group-hover:opacity-100"
        transition={{ duration: 0.5 }}
      />

      {/* Content */}
      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-400">{title}</p>
          {Icon && (
            <motion.div
              whileHover={{ scale: 1.2, rotate: 10 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Icon className="h-5 w-5 text-[#6E2BFF] opacity-60" />
            </motion.div>
          )}
        </div>

        {/* Value with animation */}
        <div className="mt-3 flex items-baseline gap-3">
          <motion.p
            className="text-3xl font-bold text-white"
            animate={controls}
          >
            {value}
          </motion.p>

          {/* Change indicator */}
          {change && (
            <motion.div
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                changeType === "positive" && "bg-green-500/20 text-green-400 border border-green-500/30",
                changeType === "negative" && "bg-red-500/20 text-red-400 border border-red-500/30",
                changeType === "neutral" && "bg-gray-500/20 text-gray-400 border border-gray-500/30"
              )}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <ChangeIcon className="h-3 w-3" />
              <span>{change}</span>
            </motion.div>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <motion.p
            className="mt-2 text-sm text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            {subtitle}
          </motion.p>
        )}
      </div>

      {/* Bottom gradient accent line */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#6E2BFF] via-[#00A6FF] to-[#E93AFF] opacity-0 group-hover:opacity-100"
        transition={{ duration: 0.3 }}
      />

      {/* Corner sparkle effect */}
      <motion.div
        className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#6E2BFF]/20 blur-2xl opacity-0 group-hover:opacity-100"
        transition={{ duration: 0.5 }}
      />
    </motion.div>
  );
}
