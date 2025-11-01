import { Router } from 'express';
import { adminAuthMiddleware, AuthenticatedRequest } from '../../middleware/admin-auth';
import { prisma } from '../../lib/prisma';

const router = Router();

// Apply admin auth middleware to all routes
router.use(adminAuthMiddleware);

// POST /api/admin/notifications/broadcast - Send broadcast notification
router.post('/broadcast', async (req: AuthenticatedRequest, res) => {
  try {
    const { title, message, type = 'info', userIds } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Title and message are required',
      });
    }

    let targetUserIds: string[] = [];

    if (userIds && Array.isArray(userIds)) {
      targetUserIds = userIds;
    } else {
      // Get all user IDs
      const users = await prisma.user.findMany({
        select: { id: true },
      });
      targetUserIds = users.map(u => u.id);
    }

    // Create notifications for all users
    const notifications = await prisma.notification.createMany({
      data: targetUserIds.map(userId => ({
        userId,
        title,
        message,
        type,
      })),
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'notification.broadcast',
        entity: 'notification',
        entityId: 'broadcast',
        metadata: {
          title,
          recipientCount: targetUserIds.length,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      count: notifications.count,
      message: `Notification sent to ${notifications.count} users`,
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({
      error: 'Failed to send notification',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/notifications/history - Get notification history
router.get('/history', async (req: AuthenticatedRequest, res) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
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
      prisma.notification.count(),
    ]);

    res.json({
      notifications,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get notification history error:', error);
    res.status(500).json({
      error: 'Failed to fetch notification history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const adminNotificationsRouter = router;
