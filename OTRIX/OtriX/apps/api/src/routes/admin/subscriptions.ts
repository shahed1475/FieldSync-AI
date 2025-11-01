import { Router } from 'express';
import { adminAuthMiddleware, AuthenticatedRequest } from '../../middleware/admin-auth';
import { prisma } from '../../lib/prisma';
import Stripe from 'stripe';

const router = Router();
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })
  : null;

// Apply admin auth middleware to all routes
router.use(adminAuthMiddleware);

// GET /api/admin/subscriptions - List all subscriptions
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      status,
      plan,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({
      subscriptions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List subscriptions error:', error);
    res.status(500).json({
      error: 'Failed to fetch subscriptions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/subscriptions/metrics - Subscription metrics
router.get('/metrics', async (req: AuthenticatedRequest, res) => {
  try {
    const [
      activeCount,
      canceledCount,
      planBreakdown,
      totalMRR,
    ] = await Promise.all([
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscription.count({ where: { status: 'canceled' } }),
      prisma.subscription.groupBy({
        by: ['plan'],
        where: { status: 'active' },
        _count: { plan: true },
        _sum: { amount: true },
      }),
      prisma.subscription.aggregate({
        _sum: { amount: true },
        where: {
          status: 'active',
          interval: 'month',
        },
      }),
    ]);

    const churnRate = activeCount + canceledCount > 0
      ? ((canceledCount / (activeCount + canceledCount)) * 100).toFixed(2)
      : 0;

    res.json({
      active: activeCount,
      canceled: canceledCount,
      churnRate,
      mrr: totalMRR._sum.amount || 0,
      planBreakdown,
    });
  } catch (error) {
    console.error('Subscription metrics error:', error);
    res.status(500).json({
      error: 'Failed to fetch subscription metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/admin/subscriptions/:id/cancel - Cancel subscription
router.post('/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found',
        message: 'No subscription found with the provided ID',
      });
    }

    // Cancel in Stripe if exists
    if (stripe && subscription.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    }

    // Update in database
    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        status: 'canceled',
        canceledAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'subscription.canceled',
        entity: 'subscription',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PATCH /api/admin/subscriptions/:id - Update subscription
router.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { plan, status } = req.body;

    const updateData: any = {};
    if (plan) updateData.plan = plan;
    if (status) updateData.status = status;

    const subscription = await prisma.subscription.update({
      where: { id },
      data: updateData,
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'subscription.updated',
        entity: 'subscription',
        entityId: id,
        changes: updateData,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json(subscription);
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({
      error: 'Failed to update subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const adminSubscriptionsRouter = router;
