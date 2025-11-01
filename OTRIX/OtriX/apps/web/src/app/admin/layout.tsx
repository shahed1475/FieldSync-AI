"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { motion } from "framer-motion";
import "@/styles/otrix-theme.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (
      status === "authenticated" &&
      session?.user &&
      (session.user as any).role !== "admin" &&
      (session.user as any).role !== "superadmin"
    ) {
      router.push("/");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0F19]">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="h-16 w-16 rounded-full border-4 border-[#6E2BFF]/30 border-t-[#6E2BFF]"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-lg text-gray-400">Loading admin dashboard...</p>
        </motion.div>
      </div>
    );
  }

  if (
    !session?.user ||
    ((session.user as any).role !== "admin" &&
      (session.user as any).role !== "superadmin")
  ) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-[#0B0F19] text-white">
      {/* Animated Background with Particles */}
      <AnimatedBackground />

      {/* Neon Blur Overlays */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="otrix-neon-blur -top-40 left-1/2 -translate-x-1/2" />
        <div className="otrix-neon-blur top-1/3 -left-40" />
        <div className="otrix-neon-blur bottom-0 right-1/4" />
      </div>

      {/* Main Layout */}
      <div className="relative z-10 flex h-screen overflow-hidden">
        {/* Sidebar */}
        <AdminSidebar />

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <motion.main
            className="p-8 min-h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {children}
          </motion.main>
        </div>
      </div>
    </div>
  );
}
