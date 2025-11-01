# OtriX Admin Dashboard - Complete CRUD Implementation Guide

## ✅ What's Already Built

### 1. Foundation (`apps/web/src/lib/`)
- ✅ **schemas.ts** - Complete Zod validation for all models
- ✅ **api.ts** - Type-safe API client utilities
- ✅ **auth.ts** - Admin authentication helpers
- ✅ **prisma.ts** - Prisma client singleton

### 2. Users API (Complete Template)
- ✅ `GET/POST /api/admin/users` - List & Create
- ✅ `PATCH/DELETE /api/admin/users/[id]` - Update & Delete

---

## 🚀 Quick Start Commands

```bash
# 1. Ensure dependencies
cd apps/web
npm install zod bcryptjs date-fns
npm install --save-dev @types/bcryptjs

# 2. Generate Prisma client
cd ../..
npm run db:generate

# 3. Run development server
npm run dev

# 4. Test Users API
curl http://localhost:3000/api/admin/users
```

---

## 📁 File Structure to Create

```
apps/web/src/
├── app/api/admin/
│   ├── users/                    ✅ DONE
│   │   ├── route.ts              ✅
│   │   └── [id]/route.ts         ✅
│   ├── projects/                 ⏳ TODO
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── subscriptions/            ⏳ TODO
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── business-intakes/         ⏳ TODO
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   └── notifications/            ⏳ TODO
│       ├── route.ts
│       └── [id]/route.ts
├── app/admin/
│   ├── users/page.tsx            ⏳ TODO
│   ├── projects/page.tsx         ⏳ TODO
│   ├── subscriptions/page.tsx    ⏳ TODO
│   ├── business-suite/page.tsx   ⏳ TODO
│   └── notifications/page.tsx    ⏳ TODO
├── components/admin/
│   ├── DataTable.tsx             ⏳ TODO
│   ├── ConfirmDialog.tsx         ⏳ TODO
│   ├── StatusBadge.tsx           ⏳ TODO
│   └── forms/
│       ├── UserForm.tsx          ⏳ TODO
│       ├── ProjectForm.tsx       ⏳ TODO
│       ├── SubscriptionForm.tsx  ⏳ TODO
│       ├── IntakeForm.tsx        ⏳ TODO
│       └── NotificationForm.tsx  ⏳ TODO
└── lib/hooks/
    ├── useUsers.ts               ⏳ TODO
    ├── useProjects.ts            ⏳ TODO
    ├── useSubscriptions.ts       ⏳ TODO
    ├── useIntakes.ts             ⏳ TODO
    └── useNotifications.ts       ⏳ TODO
```

---

## 🔧 API Route Templates

### Projects Route Template

#### `apps/web/src/app/api/admin/projects/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, getSessionUser } from '@/lib/auth';
import { ProjectCreateSchema, ProjectFilterSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const filters = ProjectFilterSchema.parse(Object.fromEntries(searchParams.entries()));

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.userId) where.userId = filters.userId;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const skip = (filters.page - 1) * filters.pageSize;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          status: true,
          progress: true,
          createdAt: true,
          completedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: filters.pageSize,
      }),
      prisma.project.count({ where }),
    ]);

    return NextResponse.json({
      data: projects,
      pagination: {
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages: Math.ceil(total / filters.pageSize),
        hasMore: filters.page < Math.ceil(total / filters.pageSize),
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid query parameters', details: error.errors }, { status: 422 });
    }
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const validated = ProjectCreateSchema.parse(body);

    const project = await prisma.project.create({
      data: validated,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        status: true,
        progress: true,
        createdAt: true,
      },
    });

    // Audit log
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      await prisma.auditLog.create({
        data: {
          userId: (sessionUser as any).id,
          action: 'project.created',
          entity: 'project',
          entityId: project.id,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        },
      }).catch(console.error);
    }

    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 422 });
    }
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
```

#### `apps/web/src/app/api/admin/projects/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, getSessionUser } from '@/lib/auth';
import { ProjectUpdateSchema } from '@/lib/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const validated = ProjectUpdateSchema.parse(body);

    const project = await prisma.project.update({
      where: { id: params.id },
      data: validated,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        status: true,
        progress: true,
        updatedAt: true,
      },
    });

    // Audit log
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      await prisma.auditLog.create({
        data: {
          userId: (sessionUser as any).id,
          action: 'project.updated',
          entity: 'project',
          entityId: project.id,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        },
      }).catch(console.error);
    }

    return NextResponse.json(project);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 422 });
    }
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    await prisma.project.delete({ where: { id: params.id } });

    // Audit log
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      await prisma.auditLog.create({
        data: {
          userId: (sessionUser as any).id,
          action: 'project.deleted',
          entity: 'project',
          entityId: params.id,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        },
      }).catch(console.error);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
```

---

## 🎨 Frontend Component Templates

### DataTable Component

```typescript
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildQueryString } from "@/lib/api";

interface DataTableProps<T> {
  endpoint: string;
  columns: Array<{
    key: string;
    label: string;
    render?: (item: T) => React.ReactNode;
  }>;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  actions?: Array<{
    label: string;
    onClick: (item: T) => void;
    testId: string;
  }>;
}

export function DataTable<T extends { id: string }>({
  endpoint,
  columns,
  onEdit,
  onDelete,
  actions = [],
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: [endpoint, { page, search }],
    queryFn: () => api.get(`${endpoint}${buildQueryString({ page, search })}`),
  });

  return (
    <div>
      {/* Search bar */}
      <input
        type="search"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 px-4 py-2 border rounded"
      />

      {/* Table */}
      <table className="w-full">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((item: T) => (
            <tr key={item.id}>
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(item) : (item as any)[col.key]}
                </td>
              ))}
              <td>
                {onEdit && (
                  <button
                    data-testid={`${endpoint}-edit-btn`}
                    onClick={() => onEdit(item)}
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    data-testid={`${endpoint}-delete-btn`}
                    onClick={() => onDelete(item)}
                  >
                    Delete
                  </button>
                )}
                {actions.map((action) => (
                  <button
                    key={action.label}
                    data-testid={action.testId}
                    onClick={() => action.onClick(item)}
                  >
                    {action.label}
                  </button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="mt-4 flex gap-2">
        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={!data?.pagination.hasMore}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

---

## 🧪 Test Examples

### Unit Test Example

```typescript
// apps/web/__tests__/api/admin/users.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/admin/users/route';

describe('Users API', () => {
  it('GET /api/admin/users returns paginated list', async () => {
    const request = new Request('http://localhost:3000/api/admin/users?page=1');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('pagination');
  });

  it('POST /api/admin/users creates user', async () => {
    const payload = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      role: 'user',
    };

    const request = new Request('http://localhost:3000/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });
});
```

### E2E Test Example

```typescript
// apps/web/e2e/users.crud.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Users CRUD', () => {
  test('should create, edit, and delete user', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/users');

    // Click "Add New" button
    await page.click('[data-testid="user-create-btn"]');

    // Fill form
    await page.fill('[name="email"]', 'newuser@example.com');
    await page.fill('[name="name"]', 'New User');
    await page.fill('[name="password"]', 'password123');

    // Submit
    await page.click('[data-testid="user-submit-btn"]');

    // Verify toast
    await expect(page.locator('text=User created')).toBeVisible();

    // Verify row appears
    await expect(page.locator('text=newuser@example.com')).toBeVisible();

    // Edit user
    await page.click('[data-testid="user-edit-btn"]');
    await page.fill('[name="name"]', 'Updated Name');
    await page.click('[data-testid="user-submit-btn"]');
    await expect(page.locator('text=User updated')).toBeVisible();

    // Delete user
    await page.click('[data-testid="user-delete-btn"]');
    await page.click('[data-testid="confirm-delete-btn"]');
    await expect(page.locator('text=User deleted')).toBeVisible();
  });
});
```

---

## 📋 CRUD & Button Map

| Model         | Action     | Endpoint                                  | Method | Button `data-testid`         | Test File                  |
|---------------|------------|-------------------------------------------|--------|------------------------------|----------------------------|
| **Users**     | List       | `/api/admin/users`                        | GET    | -                            | `users.crud.spec.ts`       |
|               | Create     | `/api/admin/users`                        | POST   | `user-create-btn`            | `users.crud.spec.ts`       |
|               | Update     | `/api/admin/users/[id]`                   | PATCH  | `user-edit-btn`              | `users.crud.spec.ts`       |
|               | Delete     | `/api/admin/users/[id]`                   | DELETE | `user-delete-btn`            | `users.crud.spec.ts`       |
|               | Verify     | `/api/admin/users/[id]` (emailVerified)   | PATCH  | `user-verify-btn`            | `users.crud.spec.ts`       |
|               | Make Admin | `/api/admin/users/[id]` (role)            | PATCH  | `user-make-admin-btn`        | `users.crud.spec.ts`       |
| **Projects**  | List       | `/api/admin/projects`                     | GET    | -                            | `projects.crud.spec.ts`    |
|               | Create     | `/api/admin/projects`                     | POST   | `project-create-btn`         | `projects.crud.spec.ts`    |
|               | Update     | `/api/admin/projects/[id]`                | PATCH  | `project-edit-btn`           | `projects.crud.spec.ts`    |
|               | Delete     | `/api/admin/projects/[id]`                | DELETE | `project-delete-btn`         | `projects.crud.spec.ts`    |
|               | Retry      | `/api/admin/projects/[id]/retry`          | POST   | `project-retry-btn`          | `projects.crud.spec.ts`    |
| **Subscriptions** | List   | `/api/admin/subscriptions`                | GET    | -                            | `subscriptions.crud.spec.ts` |
|               | Create     | `/api/admin/subscriptions`                | POST   | `subscription-create-btn`    | `subscriptions.crud.spec.ts` |
|               | Update     | `/api/admin/subscriptions/[id]`           | PATCH  | `subscription-edit-btn`      | `subscriptions.crud.spec.ts` |
|               | Delete     | `/api/admin/subscriptions/[id]`           | DELETE | `subscription-delete-btn`    | `subscriptions.crud.spec.ts` |
| **Intakes**   | List       | `/api/admin/business-intakes`             | GET    | -                            | `intakes.crud.spec.ts`     |
|               | Create     | `/api/admin/business-intakes`             | POST   | `intake-create-btn`          | `intakes.crud.spec.ts`     |
|               | Update     | `/api/admin/business-intakes/[id]`        | PATCH  | `intake-edit-btn`            | `intakes.crud.spec.ts`     |
|               | Delete     | `/api/admin/business-intakes/[id]`        | DELETE | `intake-delete-btn`          | `intakes.crud.spec.ts`     |
| **Notifications** | List   | `/api/admin/notifications`                | GET    | -                            | `notifications.crud.spec.ts` |
|               | Create     | `/api/admin/notifications`                | POST   | `notification-create-btn`    | `notifications.crud.spec.ts` |
|               | Update     | `/api/admin/notifications/[id]`           | PATCH  | `notification-edit-btn`      | `notifications.crud.spec.ts` |
|               | Delete     | `/api/admin/notifications/[id]`           | DELETE | `notification-delete-btn`    | `notifications.crud.spec.ts` |
|               | Mark Read  | `/api/admin/notifications/[id]` (read)    | PATCH  | `notification-mark-read-btn` | `notifications.crud.spec.ts` |

---

## 🔄 Next Steps

1. **Copy the templates above** to create remaining API routes
2. **Build frontend pages** using the DataTable component
3. **Add React Query hooks** for each model
4. **Write tests** using the examples provided
5. **Test manually** with the seeded data

---

## 📚 Resources

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Prisma Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [Zod Documentation](https://zod.dev/)
- [React Query Guide](https://tanstack.com/query/latest)
