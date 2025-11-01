"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { fadeInUp, sidebarLink, staggerContainer, staggerItem } from "@/lib/motion";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  CreditCard,
  DollarSign,
  Activity,
  Bell,
  FileText,
  Settings,
  LogOut,
  Sparkles,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Projects", href: "/admin/projects", icon: FolderKanban },
  { name: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard },
  { name: "Financials", href: "/admin/financials", icon: DollarSign },
  { name: "System Health", href: "/admin/system", icon: Activity },
  { name: "Notifications", href: "/admin/notifications", icon: Bell },
  { name: "Audit Log", href: "/admin/audit", icon: FileText },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="otrix-sidebar flex w-64 flex-col">
      {/* Header with gradient glow */}
      <motion.div
        className="flex h-16 items-center border-b border-white/10 px-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Sparkles className="mr-2 h-5 w-5 text-[#6E2BFF]" />
        <h1 className="otrix-text-gradient text-xl font-bold tracking-tight">
          OtriX Admin
        </h1>
      </motion.div>

      {/* Navigation Links */}
      <motion.nav
        className="flex-1 space-y-1 px-3 py-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {navigation.map((item, index) => {
          const isActive = pathname === item.href;
          return (
            <motion.div key={item.name} variants={staggerItem}>
              <Link
                href={item.href}
                className={cn(
                  "otrix-sidebar-link group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                  isActive
                    ? "otrix-sidebar-link-active text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                {/* Active indicator line */}
                {isActive && (
                  <motion.div
                    className="absolute left-0 top-1/2 h-[70%] w-1 rounded-r-full bg-gradient-to-b from-[#6E2BFF] to-[#00A6FF]"
                    layoutId="activeIndicator"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    style={{ transform: "translateY(-50%)" }}
                  />
                )}

                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-colors",
                      isActive ? "text-[#6E2BFF]" : "text-gray-400 group-hover:text-[#6E2BFF]"
                    )}
                  />
                </motion.div>
                <span className="relative z-10">{item.name}</span>

                {/* Hover glow effect */}
                <motion.div
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#6E2BFF]/10 to-[#00A6FF]/10 opacity-0 group-hover:opacity-100"
                  transition={{ duration: 0.3 }}
                />
              </Link>
            </motion.div>
          );
        })}
      </motion.nav>

      {/* Sign Out Button */}
      <motion.div
        className="border-t border-white/10 p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <motion.button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-red-500/10 hover:text-red-400 hover:border hover:border-red-500/30"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.div
            whileHover={{ rotate: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <LogOut className="h-5 w-5" />
          </motion.div>
          Sign Out
        </motion.button>
      </motion.div>

      {/* Bottom gradient glow */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#6E2BFF]/10 to-transparent" />
    </div>
  );
}
