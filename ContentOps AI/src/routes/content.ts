import { Router } from 'express';
import {
  getContentItems,
  getContentItemById,
  createContentItem,
  updateContentItem,
  deleteContentItem,
  createVariation,
  updateVariation,
  deleteVariation,
  getVariations,
  duplicateContentItem
} from '../controllers/contentController';
import { authenticate } from '../middleware/auth';
import { validateRequest, validateQuery } from '../middleware/validation';
import { contentCreationRateLimit } from '../middleware/rateLimiter';
import { 
  createContentSchema, 
  updateContentSchema,
  createVariationSchema,
  updateVariationSchema,
  paginationSchema 
} from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/content
 * @desc    Get all content items for authenticated user
 * @access  Private
 */
router.get('/', validateQuery(paginationSchema), getContentItems);

/**
 * @route   GET /api/content/:id
 * @desc    Get content item by ID
 * @access  Private
 */
router.get('/:id', getContentItemById);

/**
 * @route   POST /api/content
 * @desc    Create new content item
 * @access  Private
 */
router.post('/', contentCreationRateLimit, validateRequest(createContentSchema), createContentItem);

/**
 * @route   PUT /api/content/:id
 * @desc    Update content item
 * @access  Private
 */
router.put('/:id', validateRequest(updateContentSchema), updateContentItem);

/**
 * @route   DELETE /api/content/:id
 * @desc    Delete content item
 * @access  Private
 */
router.delete('/:id', deleteContentItem);

/**
 * @route   POST /api/content/:id/duplicate
 * @desc    Duplicate content item
 * @access  Private
 */
router.post('/:id/duplicate', duplicateContentItem);

// Variation routes
/**
 * @route   GET /api/content/:id/variations
 * @desc    Get all variations for a content item
 * @access  Private
 */
router.get('/:id/variations', getVariations);

/**
 * @route   POST /api/content/:id/variations
 * @desc    Create new variation for content item
 * @access  Private
 */
router.post('/:id/variations', validateRequest(createVariationSchema), createVariation);

/**
 * @route   PUT /api/content/:id/variations/:variationId
 * @desc    Update variation
 * @access  Private
 */
router.put('/:id/variations/:variationId', validateRequest(updateVariationSchema), updateVariation);

/**
 * @route   DELETE /api/content/:id/variations/:variationId
 * @desc    Delete variation
 * @access  Private
 */
router.delete('/:id/variations/:variationId', deleteVariation);

export default router;