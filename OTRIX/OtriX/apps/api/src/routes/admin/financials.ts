import { Router } from 'express';
import { adminAuthMiddleware, AuthenticatedRequest } from '../../middleware/admin-auth';
import { prisma } from '../../lib/prisma';
import { startOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';

const router = Router();

// Apply admin auth middleware to all routes
router.use(adminAuthMiddleware);

// GET /api/admin/financials - Overall financial overview
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);

    const [
      totalRevenue,
      revenueThisMonth,
      totalCost,
      costThisMonth,
    ] = await Promise.all([
      prisma.revenue.aggregate({ _sum: { amount: true } }),
      prisma.revenue.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: monthStart } },
      }),
      prisma.cost.aggregate({ _sum: { amount: true } }),
      prisma.cost.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: monthStart } },
      }),
    ]);

    const revenue = totalRevenue._sum.amount || 0;
    const cost = totalCost._sum.amount || 0;
    const profit = revenue - cost;
    const profitMargin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0;

    const revenueMonth = revenueThisMonth._sum.amount || 0;
    const costMonth = costThisMonth._sum.amount || 0;
    const profitMonth = revenueMonth - costMonth;

    res.json({
      totalRevenue: revenue,
      totalCost: cost,
      totalProfit: profit,
      profitMargin,
      thisMonth: {
        revenue: revenueMonth,
        cost: costMonth,
        profit: profitMonth,
      },
      currency: 'USD',
    });
  } catch (error) {
    console.error('Financials error:', error);
    res.status(500).json({
      error: 'Failed to fetch financials',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/financials/cost-breakdown - Cost breakdown by category
router.get('/cost-breakdown', async (req: AuthenticatedRequest, res) => {
  try {
    const { months = '12' } = req.query;
    const startDate = subMonths(new Date(), parseInt(months as string));

    const costBreakdown = await prisma.cost.groupBy({
      by: ['category'],
      _sum: { amount: true },
      _count: { category: true },
      where: {
        createdAt: { gte: startDate },
      },
    });

    res.json(costBreakdown.map(item => ({
      category: item.category,
      amount: item._sum.amount || 0,
      count: item._count.category,
    })));
  } catch (error) {
    console.error('Cost breakdown error:', error);
    res.status(500).json({
      error: 'Failed to fetch cost breakdown',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/financials/revenue-breakdown - Revenue breakdown by source
router.get('/revenue-breakdown', async (req: AuthenticatedRequest, res) => {
  try {
    const { months = '12' } = req.query;
    const startDate = subMonths(new Date(), parseInt(months as string));

    const revenueBreakdown = await prisma.revenue.groupBy({
      by: ['source', 'type'],
      _sum: { amount: true },
      _count: { source: true },
      where: {
        createdAt: { gte: startDate },
      },
    });

    res.json(revenueBreakdown.map(item => ({
      source: item.source,
      type: item.type,
      amount: item._sum.amount || 0,
      count: item._count.source,
    })));
  } catch (error) {
    console.error('Revenue breakdown error:', error);
    res.status(500).json({
      error: 'Failed to fetch revenue breakdown',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const adminFinancialsRouter = router;
