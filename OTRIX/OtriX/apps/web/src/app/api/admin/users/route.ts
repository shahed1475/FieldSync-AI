import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminGuard, getAdminUser } from '@/lib/adminGuard';

// Query params schema
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['user', 'admin', 'superadmin']).optional(),
  verified: z.coerce.boolean().optional(),
});

// User create schema
const UserCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['user', 'admin', 'superadmin']).default('user'),
});

/**
 * GET /api/admin/users
 * List users with pagination, search, and filters
 */
export async function GET(request: NextRequest) {
  // Admin guard
  const guardResult = await adminGuard();
  if (guardResult instanceof NextResponse) return guardResult;

  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    // Validate query params
    const filters = QuerySchema.parse(params);

    // Build where clause
    const where: any = {};

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.verified !== undefined) {
      where.emailVerified = filters.verified ? { not: null } : null;
    }

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Calculate pagination
    const skip = (filters.page - 1) * filters.pageSize;

    // Fetch users and total count
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              projects: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: filters.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / filters.pageSize);

    return NextResponse.json({
      data: users,
      pagination: {
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages,
        hasMore: filters.page < totalPages,
      },
    });
  } catch (error: any) {
    console.error('[Users API GET Error]:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch users', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Create a new user
 */
export async function POST(request: NextRequest) {
  // Admin guard
  const guardResult = await adminGuard();
  if (guardResult instanceof NextResponse) return guardResult;

  try {
    const body = await request.json();

    // Validate input
    const validated = UserCreateSchema.parse(body);

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Email already exists', message: 'A user with this email address already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hash(validated.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: validated.email,
        name: validated.name,
        password: hashedPassword,
        role: validated.role,
        emailVerified: null, // New users are unverified
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Create audit log
    const adminUser = await getAdminUser();
    if (adminUser) {
      await prisma.auditLog.create({
        data: {
          userId: adminUser.id,
          action: 'user.created',
          entity: 'user',
          entityId: user.id,
          metadata: JSON.stringify({
            email: user.email,
            role: user.role,
          }),
          ipAddress: request.headers.get('x-forwarded-for') || request.ip || 'unknown',
          userAgent: request.headers.get('user-agent') || undefined,
        },
      }).catch(err => console.error('[Audit Log Error]:', err));
    }

    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    console.error('[Users API POST Error]:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 422 }
      );
    }

    // Prisma unique constraint error
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Email already exists', message: 'A user with this email address already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create user', details: error.message },
      { status: 500 }
    );
  }
}
