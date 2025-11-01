import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminGuard, getAdminUser } from '@/lib/adminGuard';

// User update schema
const UserUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['user', 'admin', 'superadmin']).optional(),
  emailVerified: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

/**
 * PATCH /api/admin/users/[id]
 * Update a user
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Admin guard
  const guardResult = await adminGuard();
  if (guardResult instanceof NextResponse) return guardResult;

  try {
    const { id } = params;
    const body = await request.json();

    // Validate input
    const validated = UserUpdateSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};

    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.role !== undefined) updateData.role = validated.role;
    if (validated.emailVerified !== undefined) {
      updateData.emailVerified = validated.emailVerified ? new Date() : null;
    }
    if (validated.password) {
      updateData.password = await hash(validated.password, 10);
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        updatedAt: true,
      },
    });

    // Create audit log
    const adminUser = await getAdminUser();
    if (adminUser) {
      await prisma.auditLog.create({
        data: {
          userId: adminUser.id,
          action: 'user.updated',
          entity: 'user',
          entityId: user.id,
          metadata: JSON.stringify({
            changes: validated,
            email: user.email,
          }),
          ipAddress: request.headers.get('x-forwarded-for') || request.ip || 'unknown',
          userAgent: request.headers.get('user-agent') || undefined,
        },
      }).catch(err => console.error('[Audit Log Error]:', err));
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error('[Users API PATCH Error]:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 422 }
      );
    }

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update user', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Delete a user
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Admin guard
  const guardResult = await adminGuard();
  if (guardResult instanceof NextResponse) return guardResult;

  try {
    const { id } = params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent deleting yourself
    const adminUser = await getAdminUser();
    if (adminUser && adminUser.id === id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id },
    });

    // Create audit log
    if (adminUser) {
      await prisma.auditLog.create({
        data: {
          userId: adminUser.id,
          action: 'user.deleted',
          entity: 'user',
          entityId: id,
          metadata: JSON.stringify({
            email: existingUser.email,
            role: existingUser.role,
          }),
          ipAddress: request.headers.get('x-forwarded-for') || request.ip || 'unknown',
          userAgent: request.headers.get('user-agent') || undefined,
        },
      }).catch(err => console.error('[Audit Log Error]:', err));
    }

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('[Users API DELETE Error]:', error);

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete user', details: error.message },
      { status: 500 }
    );
  }
}
