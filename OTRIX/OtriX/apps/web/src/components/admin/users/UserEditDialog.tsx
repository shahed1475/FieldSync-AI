"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { patch } from "@/lib/api";

const UserUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  role: z.enum(["user", "admin", "superadmin"]).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  emailVerified: z.boolean().optional(),
});

type UserUpdateData = z.infer<typeof UserUpdateSchema>;

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: Date | null;
}

interface UserEditDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserEditDialog({ user, open, onOpenChange }: UserEditDialogProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<UserUpdateData>({
    resolver: zodResolver(UserUpdateSchema),
  });

  const roleValue = watch("role");
  const emailVerifiedValue = watch("emailVerified");

  useEffect(() => {
    if (user) {
      setValue("name", user.name || "");
      setValue("role", user.role as "user" | "admin" | "superadmin");
      setValue("emailVerified", !!user.emailVerified);
      setValue("password", ""); // Clear password field
    }
  }, [user, setValue]);

  const updateMutation = useMutation({
    mutationFn: (data: UserUpdateData) => {
      if (!user) throw new Error("No user selected");

      // Remove password if empty
      const updateData = { ...data };
      if (!updateData.password || updateData.password === "") {
        delete updateData.password;
      }

      return patch(`/api/admin/users/${user.id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User updated successfully");
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      const message = error?.details?.message || error?.message || "Failed to update user";
      toast.error(message);
    },
  });

  const onSubmit = (data: UserUpdateData) => {
    updateMutation.mutate(data);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information and permissions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-display">Email</Label>
            <Input
              id="email-display"
              type="email"
              value={user.email}
              disabled
              className="bg-gray-50"
            />
            <p className="text-xs text-gray-500">Email cannot be changed</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">New Password (optional)</Label>
            <Input
              id="password"
              type="password"
              placeholder="Leave blank to keep current password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={roleValue}
              onValueChange={(value) => setValue("role", value as "user" | "admin" | "superadmin")}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="superadmin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-red-600">{errors.role.message}</p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="emailVerified"
              checked={emailVerifiedValue}
              onChange={(e) => setValue("emailVerified", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="emailVerified" className="text-sm font-normal cursor-pointer">
              Email verified
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="user-edit-submit"
            >
              {updateMutation.isPending ? "Updating..." : "Update User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
