"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDate } from "@/lib/utils";
import { Search, UserPlus, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserCreateDialog } from "@/components/admin/users/UserCreateDialog";
import { UserEditDialog } from "@/components/admin/users/UserEditDialog";
import { DeleteConfirmDialog } from "@/components/admin/users/DeleteConfirmDialog";
import { fetcher, buildQueryString } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  _count: {
    projects: number;
  };
}

interface UsersResponse {
  data: User[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  };
}

async function fetchUsers(page: number, search: string): Promise<UsersResponse> {
  const queryString = buildQueryString({
    page,
    pageSize: 20,
    ...(search && { search }),
  });

  const res = await fetch(`/api/admin/users?${queryString}`, {
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch users");
  }

  return res.json();
}

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => fetchUsers(page, search),
  });

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.email}</div>
          {row.original.name && (
            <div className="text-sm text-gray-500">{row.original.name}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <StatusBadge status={row.original.role} />,
    },
    {
      accessorKey: "emailVerified",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.emailVerified ? "verified" : "unverified"}
        />
      ),
    },
    {
      accessorKey: "_count.projects",
      header: "Projects",
      cell: ({ row }) => (
        <span className="font-medium">{row.original._count.projects}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedUser(row.original);
              setEditDialogOpen(true);
            }}
            data-testid={`user-edit-btn-${row.original.id}`}
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedUser(row.original);
              setDeleteDialogOpen(true);
            }}
            data-testid={`user-delete-btn-${row.original.id}`}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="mt-2 text-gray-600">Manage user accounts and permissions</p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          data-testid="user-create-btn"
        >
          <UserPlus className="h-5 w-5 mr-2" />
          Add User
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search users by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border pl-10 pr-4 py-2 focus:border-primary focus:outline-none"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-lg text-gray-600">Loading users...</div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">Failed to load users</p>
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={data?.data || []} />

          {/* Pagination */}
          {data?.pagination && (
            <div className="flex items-center justify-between rounded-lg border bg-white px-6 py-4">
              <div className="text-sm text-gray-600">
                Showing {((data.pagination.page - 1) * data.pagination.pageSize) + 1} to{" "}
                {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of{" "}
                {data.pagination.total} users
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={!data.pagination.hasMore}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <UserCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      <UserEditDialog
        user={selectedUser}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      <DeleteConfirmDialog
        user={selectedUser}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
