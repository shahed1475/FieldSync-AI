import { Router } from 'express';
import { adminAuthMiddleware, AuthenticatedRequest } from '../../middleware/admin-auth';
import { prisma } from '../../lib/prisma';

const router = Router();

// Apply admin auth middleware to all routes
router.use(adminAuthMiddleware);

// GET /api/admin/projects - List all projects with filtering and pagination
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      status,
      type,
      userId,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (userId) {
      where.userId = userId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // Get projects and total count
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
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
          _count: {
            select: {
              logs: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json({
      projects,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({
      error: 'Failed to fetch projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/projects/:id - Get project details
router.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        logs: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: 'No project found with the provided ID',
      });
    }

    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      error: 'Failed to fetch project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/projects/:id/logs - Get project logs
router.get('/:id/logs', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '50', level } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { projectId: id };
    if (level) {
      where.level = level;
    }

    const [logs, total] = await Promise.all([
      prisma.projectLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.projectLog.count({ where }),
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
    console.error('Get project logs error:', error);
    res.status(500).json({
      error: 'Failed to fetch project logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/admin/projects/:id/retry - Retry failed project
router.post('/:id/retry', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: 'No project found with the provided ID',
      });
    }

    if (project.status !== 'failed') {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Only failed projects can be retried',
      });
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        status: 'pending',
        progress: 0,
        errorMessage: null,
        failedAt: null,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'project.retried',
        entity: 'project',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json(updatedProject);
  } catch (error) {
    console.error('Retry project error:', error);
    res.status(500).json({
      error: 'Failed to retry project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /api/admin/projects/:id - Delete project
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.delete({
      where: { id },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'project.deleted',
        entity: 'project',
        entityId: id,
        metadata: { deletedProject: { name: project.name, type: project.type } },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      error: 'Failed to delete project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/projects/:id/download - Download project files (placeholder)
router.get('/:id/download', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: 'No project found with the provided ID',
      });
    }

    // TODO: Implement actual file download
    res.json({
      success: true,
      message: 'Download link would be generated here',
      projectId: id,
    });
  } catch (error) {
    console.error('Download project error:', error);
    res.status(500).json({
      error: 'Failed to download project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const adminProjectsRouter = router;
