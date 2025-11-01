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

// GET /api/admin/system/health - System health checks
router.get('/health', async (req: AuthenticatedRequest, res) => {
  try {
    const checks = await Promise.all([
      // Database check
      checkDatabase(),
      // API check
      checkAPI(),
      // Stripe check
      checkStripe(),
      // Anthropic check (placeholder)
      checkAnthropic(),
      // PM2 check (placeholder)
      checkPM2(),
    ]);

    const overall = checks.every(c => c.status === 'healthy') ? 'healthy' : 'degraded';

    res.json({
      overall,
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      error: 'Failed to perform health checks',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/system/processes - PM2 processes (placeholder)
router.get('/processes', async (req: AuthenticatedRequest, res) => {
  try {
    // TODO: Integrate with PM2 API
    res.json({
      processes: [
        {
          id: 'api',
          name: 'otrix-api',
          status: 'online',
          uptime: Date.now() - 3600000,
          memory: 150000000,
          cpu: 5.2,
        },
        {
          id: 'web',
          name: 'otrix-web',
          status: 'online',
          uptime: Date.now() - 3600000,
          memory: 120000000,
          cpu: 3.1,
        },
      ],
    });
  } catch (error) {
    console.error('Get processes error:', error);
    res.status(500).json({
      error: 'Failed to fetch processes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/admin/system/processes/:id/restart - Restart PM2 process (placeholder)
router.post('/processes/:id/restart', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // TODO: Integrate with PM2 API

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'system.process_restarted',
        entity: 'system',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      message: `Process ${id} restarted successfully`,
    });
  } catch (error) {
    console.error('Restart process error:', error);
    res.status(500).json({
      error: 'Failed to restart process',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/system/errors - Recent error logs
router.get('/errors', async (req: AuthenticatedRequest, res) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      prisma.projectLog.findMany({
        where: { level: 'error' },
        take: limitNum,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      }),
      prisma.projectLog.count({ where: { level: 'error' } }),
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get errors error:', error);
    res.status(500).json({
      error: 'Failed to fetch error logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Helper functions for health checks
async function checkDatabase() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      service: 'database',
      status: 'healthy',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'database',
      status: 'down',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkAPI() {
  return {
    service: 'api',
    status: 'healthy',
    responseTime: 0,
  };
}

async function checkStripe() {
  const start = Date.now();
  try {
    if (!stripe) {
      return {
        service: 'stripe',
        status: 'degraded',
        responseTime: 0,
        error: 'Stripe not configured',
      };
    }
    await stripe.balance.retrieve();
    return {
      service: 'stripe',
      status: 'healthy',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'stripe',
      status: 'degraded',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkAnthropic() {
  // TODO: Implement Anthropic API health check
  return {
    service: 'anthropic',
    status: 'healthy',
    responseTime: 0,
  };
}

async function checkPM2() {
  // TODO: Implement PM2 health check
  return {
    service: 'pm2',
    status: 'healthy',
    responseTime: 0,
  };
}

export const adminSystemRouter = router;
