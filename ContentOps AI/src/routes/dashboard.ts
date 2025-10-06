import { Router } from 'express';
import {
  getDashboardStats,
  getEngagementSummary,
  getContentPerformance,
  getQuickStats
} from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';
import { validateQuery } from '../middleware/validation';
import { generalRateLimit } from '../middleware/rateLimiter';
import { analyticsQuerySchema } from '../middleware/validation';

const router = Router();

// Apply authentication and rate limiting to all routes
router.use(generalRateLimit);
router.use(authenticate);

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get general dashboard statistics
 * @access  Private
 */
router.get('/stats', getDashboardStats);

/**
 * @route   GET /api/dashboard/engagement
 * @desc    Get engagement summary
 * @access  Private
 */
router.get('/engagement', validateQuery(analyticsQuerySchema), getEngagementSummary);

/**
 * @route   GET /api/dashboard/performance
 * @desc    Get content performance insights
 * @access  Private
 */
router.get('/performance', validateQuery(analyticsQuerySchema), getContentPerformance);

/**
 * @route   GET /api/dashboard/quick-stats
 * @desc    Get quick statistics for dashboard widgets
 * @access  Private
 */
router.get('/quick-stats', getQuickStats);

export default router;