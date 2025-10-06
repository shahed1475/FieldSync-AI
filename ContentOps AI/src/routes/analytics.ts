import { Router } from 'express';
import {
  getAnalytics,
  getAnalyticsByPostId,
  createOrUpdateAnalytics,
  getAnalyticsSummary,
  getAnalyticsTrends,
  deleteAnalytics,
  bulkUpdateAnalytics
} from '../controllers/analyticsController';
import { authenticate } from '../middleware/auth';
import { validateRequest, validateQuery } from '../middleware/validation';
import { analyticsRateLimit } from '../middleware/rateLimiter';
import { 
  createAnalyticsSchema, 
  bulkAnalyticsSchema,
  analyticsQuerySchema
} from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/analytics
 * @desc    Get all analytics for authenticated user
 * @access  Private
 */
router.get('/', validateQuery(analyticsQuerySchema), getAnalytics);

/**
 * @route   GET /api/analytics/summary
 * @desc    Get analytics summary for dashboard
 * @access  Private
 */
router.get('/summary', getAnalyticsSummary);

/**
 * @route   GET /api/analytics/trends
 * @desc    Get analytics trends over time
 * @access  Private
 */
router.get('/trends', validateQuery(analyticsQuerySchema), getAnalyticsTrends);

/**
 * @route   GET /api/analytics/:id
 * @desc    Get analytics by ID
 * @access  Private
 */
router.get('/:id', getAnalyticsByPostId);

/**
 * @route   POST /api/analytics
 * @desc    Create or update analytics for a post
 * @access  Private
 */
router.post('/', analyticsRateLimit, validateRequest(createAnalyticsSchema), createOrUpdateAnalytics);

/**
 * @route   POST /api/analytics/bulk
 * @desc    Bulk update analytics for multiple posts
 * @access  Private
 */
router.post('/bulk', analyticsRateLimit, validateRequest(bulkAnalyticsSchema), bulkUpdateAnalytics);

/**
 * @route   DELETE /api/analytics/:id
 * @desc    Delete analytics
 * @access  Private
 */
router.delete('/:id', deleteAnalytics);

export default router;