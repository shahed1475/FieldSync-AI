import { Router } from 'express';
import {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  bulkCreatePosts,
  getPostsByStatus,
  reschedulePost
} from '../controllers/postController';
import { authenticate } from '../middleware/auth';
import { validateRequest, validateQuery } from '../middleware/validation';
import { postSchedulingRateLimit } from '../middleware/rateLimiter';
import { 
  createPostSchema, 
  updatePostSchema,
  bulkCreatePostsSchema,
  reschedulePostSchema,
  paginationSchema 
} from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/posts
 * @desc    Get all posts for authenticated user
 * @access  Private
 */
router.get('/', validateQuery(paginationSchema), getPosts);

/**
 * @route   GET /api/posts/status/:status
 * @desc    Get posts by status (scheduled, published, cancelled)
 * @access  Private
 */
router.get('/status/:status', validateQuery(paginationSchema), getPostsByStatus);

/**
 * @route   GET /api/posts/:id
 * @desc    Get post by ID
 * @access  Private
 */
router.get('/:id', getPostById);

/**
 * @route   POST /api/posts
 * @desc    Create new post
 * @access  Private
 */
router.post('/', postSchedulingRateLimit, validateRequest(createPostSchema), createPost);

/**
 * @route   POST /api/posts/bulk
 * @desc    Create multiple posts
 * @access  Private
 */
router.post('/bulk', postSchedulingRateLimit, validateRequest(bulkCreatePostsSchema), bulkCreatePosts);

/**
 * @route   PUT /api/posts/:id
 * @desc    Update post
 * @access  Private
 */
router.put('/:id', validateRequest(updatePostSchema), updatePost);

/**
 * @route   PUT /api/posts/:id/reschedule
 * @desc    Reschedule post
 * @access  Private
 */
router.put('/:id/reschedule', validateRequest(reschedulePostSchema), reschedulePost);

/**
 * @route   DELETE /api/posts/:id
 * @desc    Delete post
 * @access  Private
 */
router.delete('/:id', deletePost);

export default router;