import { Router } from 'express';
import { adminAuthMiddleware, AuthenticatedRequest } from '../../middleware/admin-auth';
import { prisma } from '../../lib/prisma';
import { startOfMonth, startOfYear, subMonths, eachMonthOfInterval } from 'date-fns';

const router = Router();

// Apply admin auth middleware to all routes
router.use(adminAuthMiddleware);

// GET /api/admin/analytics - Dashboard overview
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    const [
      totalUsers,
      usersThisMonth,
      totalProjects,
      projectsThisMonth,
      completedProjects,
      activeSubscriptions,
      totalRevenue,
      revenueThisMonth,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),

      // Users this month
      prisma.user.count({
        where: { createdAt: { gte: monthStart } },
      }),

      // Total projects
      prisma.project.count(),

      // Projects this month
      prisma.project.count({
        where: { createdAt: { gte: monthStart } },
      }),

      // Completed projects
      prisma.project.count({
        where: { status: 'completed' },
      }),

      // Active subscriptions
      prisma.subscription.count({
        where: { status: 'active' },
      }),

      // Total revenue
      prisma.revenue.aggregate({
        _sum: { amount: true },
      }),

      // Revenue this month
      prisma.revenue.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: monthStart } },
      }),
    ]);

    // Subscription breakdown
    const subscriptionBreakdown = await prisma.subscription.groupBy({
      by: ['plan'],
      where: { status: 'active' },
      _count: { plan: true },
    });

    // Project status breakdown
    const projectStatusBreakdown = await prisma.project.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    res.json({
      users: {
        total: totalUsers,
        thisMonth: usersThisMonth,
        growth: totalUsers > 0 ? ((usersThisMonth / totalUsers) * 100).toFixed(1) : 0,
      },
      projects: {
        total: totalProjects,
        thisMonth: projectsThisMonth,
        completed: completedProjects,
        completionRate: totalProjects > 0 ? ((completedProjects / totalProjects) * 100).toFixed(1) : 0,
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
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Failed to fetch analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/analytics/revenue - Revenue over time
router.get('/revenue', async (req: AuthenticatedRequest, res) => {
  try {
    const months = parseInt(req.query.months as string) || 12;
    const startDate = subMonths(new Date(), months);

    const revenueData = await prisma.revenue.groupBy({
      by: ['createdAt'],
      _sum: { amount: true },
      where: {
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyRevenue = eachMonthOfInterval({
      start: startDate,
      end: new Date(),
    }).map(month => {
      const monthRevenue = revenueData
        .filter(r => {
          const date = new Date(r.createdAt);
          return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
        })
        .reduce((sum, r) => sum + (r._sum.amount || 0), 0);

      return {
        month: month.toISOString(),
        revenue: monthRevenue,
      };
    });

    res.json(monthlyRevenue);
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({
      error: 'Failed to fetch revenue analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/analytics/users - User growth over time
router.get('/users', async (req: AuthenticatedRequest, res) => {
  try {
    const months = parseInt(req.query.months as string) || 12;
    const startDate = subMonths(new Date(), months);

    const userData = await prisma.user.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyUsers = eachMonthOfInterval({
      start: startDate,
      end: new Date(),
    }).map(month => {
      const count = userData.filter(u => {
        const date = new Date(u.createdAt);
        return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
      }).length;

      return {
        month: month.toISOString(),
        count,
      };
    });

    res.json(monthlyUsers);
  } catch (error) {
    console.error('User analytics error:', error);
    res.status(500).json({
      error: 'Failed to fetch user analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/analytics/projects - Project statistics
router.get('/projects', async (req: AuthenticatedRequest, res) => {
  try {
    const months = parseInt(req.query.months as string) || 12;
    const startDate = subMonths(new Date(), months);

    const projectData = await prisma.project.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month and status
    const monthlyProjects = eachMonthOfInterval({
      start: startDate,
      end: new Date(),
    }).map(month => {
      const monthProjects = projectData.filter(p => {
        const date = new Date(p.createdAt);
        return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
      });

      return {
        month: month.toISOString(),
        total: monthProjects.length,
        completed: monthProjects.filter(p => p.status === 'completed').length,
        failed: monthProjects.filter(p => p.status === 'failed').length,
        inProgress: monthProjects.filter(p => p.status === 'in_progress').length,
      };
    });

    res.json(monthlyProjects);
  } catch (error) {
    console.error('Project analytics error:', error);
    res.status(500).json({
      error: 'Failed to fetch project analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const adminAnalyticsRouter = router;
