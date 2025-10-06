import { Router } from 'express';
import { getDatabaseHealth } from '../utils/database';
import authRoutes from './auth';
import accountRoutes from './accounts';
import channelRoutes from './channels';
import contentRoutes from './content';
import postRoutes from './posts';
import analyticsRoutes from './analytics';
import dashboardRoutes from './dashboard';
import oauthRoutes from './oauth';
import publishRoutes from './publish';
import aiRoutes from './ai';
import eventRoutes from './events';

const router = Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  const db = await getDatabaseHealth();
  res.json({
    status: 'OK',
    uptime: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
    service: 'ContentOps AI Backend',
    version: '1.0.0',
    database: db
  });
});

// API Routes
router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
router.use('/channels', channelRoutes);
router.use('/content', contentRoutes);
router.use('/posts', postRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/oauth', oauthRoutes);
router.use('/publish', publishRoutes);
router.use('/ai', aiRoutes);
router.use('/events', eventRoutes);

// Basic API docs endpoint
router.get('/docs', (req, res) => {
  res.json({
    title: 'ContentOps AI API Documentation',
    version: '1.0.0',
    basePath: '/api',
    routes: {
      health: 'GET /api/health',
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/refresh',
        'GET /api/auth/profile',
        'PUT /api/auth/profile',
        'PUT /api/auth/change-password',
        'POST /api/auth/logout',
        'DELETE /api/auth/delete'
      ],
      accounts: [
        'GET /api/accounts',
        'GET /api/accounts/:id',
        'POST /api/accounts',
        'PUT /api/accounts/:id',
        'DELETE /api/accounts/:id',
        'PATCH /api/accounts/:id/credits',
        'GET /api/accounts/:id/stats'
      ],
      channels: [
        'GET /api/channels',
        'GET /api/channels/platform/:platform',
        'GET /api/channels/:id',
        'POST /api/channels',
        'PUT /api/channels/:id',
        'DELETE /api/channels/:id',
        'POST /api/channels/:id/test',
        'GET /api/channels/:id/credentials'
      ],
      content: [
        'GET /api/content',
        'GET /api/content/:id',
        'POST /api/content',
        'PUT /api/content/:id',
        'DELETE /api/content/:id',
        'POST /api/content/:id/variations',
        'PUT /api/content/variations/:variationId',
        'DELETE /api/content/variations/:variationId',
        'GET /api/content/:id/variations',
        'POST /api/content/:id/duplicate'
      ],
      posts: [
        'GET /api/posts',
        'GET /api/posts/status/:status',
        'GET /api/posts/:id',
        'POST /api/posts',
        'POST /api/posts/bulk',
        'PUT /api/posts/:id',
        'DELETE /api/posts/:id',
        'PATCH /api/posts/:id/reschedule'
      ],
      oauth: [
        'GET /api/oauth/:platform/init',
        'GET /api/oauth/:platform/callback'
      ],
      publish: [
        'POST /api/publish'
      ],
      ai: [
        'POST /api/ai/adapt',
        'POST /api/ai/variation',
        'POST /api/ai/hashtags',
        'POST /api/ai/forecast',
        'GET /api/ai/roi/campaign/:campaignId',
        'GET /api/ai/roi/platforms'
      ],
      events: [
        'GET /api/events/subscribe'
      ],
      analytics: [
        'GET /api/analytics',
        'GET /api/analytics/summary',
        'GET /api/analytics/trends',
        'GET /api/analytics/:id',
        'POST /api/analytics',
        'DELETE /api/analytics/:id',
        'POST /api/analytics/bulk'
      ],
      dashboard: [
        'GET /api/dashboard/stats',
        'GET /api/dashboard/engagement',
        'GET /api/dashboard/performance',
        'GET /api/dashboard/quick-stats'
      ]
    }
  });
});

// Basic API docs route
router.get('/docs', (req, res) => {
  res.json({
    name: 'ContentOps AI API',
    version: '1.0.0',
    baseUrl: '/api',
    endpoints: {
      health: 'GET /api/health',
      docs: 'GET /api/docs',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        profile: 'GET /api/auth/profile',
      },
      accounts: 'CRUD /api/accounts',
      channels: 'CRUD /api/channels',
      content: 'CRUD /api/content',
      posts: 'CRUD /api/posts',
      analytics: 'CRUD /api/analytics',
      dashboard: 'GET /api/dashboard/*',
      ai: 'AI endpoints for content, hashtags, forecasting, ROI'
    },
    auth: {
      scheme: 'Bearer token',
      header: 'Authorization: Bearer <JWT>'
    }
  });
});

export default router;