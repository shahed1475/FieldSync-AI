"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ColumnDef } from "@tanstack/react-table";
import { staggerContainer, staggerItem } from "@/lib/motion";

interface Project {
  id: string;
  name: string;
  type: string;
  status: string;
  progress: number;
  createdAt: Date;
  user: {
    email: string;
  };
}

const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: "Project Name",
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <StatusBadge status={row.original.type} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "progress",
    header: "Progress",
    cell: ({ row }) => `${row.original.progress}%`,
  },
  {
    accessorKey: "user.email",
    header: "Owner",
  },
];

async function fetchProjects() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/admin/projects`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    }
  );
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export default function ProjectsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: fetchProjects,
  });

  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Enhanced Header */}
      <motion.div variants={staggerItem} className="mb-6">
        <h1 className="otrix-title-gradient">
          Projects
        </h1>
        <p className="otrix-subtitle">
          Manage all projects across the platform
        </p>
        <div className="otrix-gradient h-[2px] w-24 rounded-full mt-4" />
      </motion.div>

      {/* Table Content */}
      <motion.div variants={staggerItem}>
        {isLoading ? (
          <div className="otrix-empty-state">
            <span>✨ Loading projects...</span>
          </div>
        ) : (
          <DataTable columns={columns} data={data?.projects || []} />
        )}
      </motion.div>
    </motion.div>
  );
}
