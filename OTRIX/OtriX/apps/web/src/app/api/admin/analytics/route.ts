import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { startOfMonth, startOfYear } from 'date-fns';

export async function GET() {
  // Check admin authentication
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    // Fetch all analytics data with safe fallbacks
    const [
      totalUsers,
      usersThisMonth,
      totalProjects,
      projectsThisMonth,
      completedProjects,
      activeSubscriptions,
      totalRevenue,
      revenueThisMonth,
      subscriptionBreakdown,
      projectStatusBreakdown,
    ] = await Promise.all([
      // Total users
      prisma.user.count().catch(() => 0),

      // Users this month
      prisma.user
        .count({
          where: { createdAt: { gte: monthStart } },
        })
        .catch(() => 0),

      // Total projects
      prisma.project.count().catch(() => 0),

      // Projects this month
      prisma.project
        .count({
          where: { createdAt: { gte: monthStart } },
        })
        .catch(() => 0),

      // Completed projects
      prisma.project
        .count({
          where: { status: 'completed' },
        })
        .catch(() => 0),

      // Active subscriptions
      prisma.subscription
        .count({
          where: { status: 'active' },
        })
        .catch(() => 0),

      // Total revenue
      prisma.revenue
        .aggregate({
          _sum: { amount: true },
        })
        .catch(() => ({ _sum: { amount: 0 } })),

      // Revenue this month
      prisma.revenue
        .aggregate({
          _sum: { amount: true },
          where: { createdAt: { gte: monthStart } },
        })
        .catch(() => ({ _sum: { amount: 0 } })),

      // Subscription breakdown
      prisma.subscription
        .groupBy({
          by: ['plan'],
          where: { status: 'active' },
          _count: { plan: true },
        })
        .catch(() => []),

      // Project status breakdown
      prisma.project
        .groupBy({
          by: ['status'],
          _count: { status: true },
        })
        .catch(() => []),
    ]);

    // Calculate growth rate
    const previousMonthUsers = totalUsers - usersThisMonth;
    const growthRate =
      previousMonthUsers > 0
        ? ((usersThisMonth / previousMonthUsers) * 100).toFixed(1)
        : '0';

    // Calculate completion rate
    const completionRate =
      totalProjects > 0
        ? ((completedProjects / totalProjects) * 100).toFixed(1)
        : '0';

    const response = {
      users: {
        total: totalUsers,
        thisMonth: usersThisMonth,
        growth: growthRate,
      },
      projects: {
        total: totalProjects,
        thisMonth: projectsThisMonth,
        completed: completedProjects,
        completionRate: completionRate,
        statusBreakdown: projectStatusBreakdown,
      },
      subscriptions: {
        active: activeSubscriptions,
        breakdown: subscriptionBreakdown,
      },
      revenue: {
        total: totalRevenue._sum.amount || 0,
        thisMonth: revenueThisMonth._sum.amount || 0,
        currency: 'USD',
      },
      system: {
        status: 'ok',
        timestamp: now.toISOString(),
      },
      timestamp: now.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Analytics API Error]:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
