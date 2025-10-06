import { Router } from 'express';
import {
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
  testChannelConnection,
  getChannelCredentials,
  getChannelsByPlatform
} from '../controllers/channelController';
import { authenticate } from '../middleware/auth';
import { validateRequest, validateQuery } from '../middleware/validation';
import { contentCreationRateLimit } from '../middleware/rateLimiter';
import { 
  createChannelSchema, 
  updateChannelSchema,
  paginationSchema 
} from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/channels
 * @desc    Get all channels for authenticated user
 * @access  Private
 */
router.get('/', getChannels);

/**
 * @route   GET /api/channels/platform/:platform
 * @desc    Get channels by platform
 * @access  Private
 */
router.get('/platform/:platform', getChannelsByPlatform);

/**
 * @route   GET /api/channels/:id
 * @desc    Get channel by ID
 * @access  Private
 */
router.get('/:id', getChannelById);

/**
 * @route   POST /api/channels
 * @desc    Create new channel
 * @access  Private
 */
router.post('/', contentCreationRateLimit, validateRequest(createChannelSchema), createChannel);

/**
 * @route   PUT /api/channels/:id
 * @desc    Update channel
 * @access  Private
 */
router.put('/:id', validateRequest(updateChannelSchema), updateChannel);

/**
 * @route   DELETE /api/channels/:id
 * @desc    Delete channel
 * @access  Private
 */
router.delete('/:id', deleteChannel);

/**
 * @route   POST /api/channels/:id/test
 * @desc    Test channel connection
 * @access  Private
 */
router.post('/:id/test', testChannelConnection);

/**
 * @route   GET /api/channels/:id/credentials
 * @desc    Get channel credentials structure (for editing)
 * @access  Private
 */
router.get('/:id/credentials', getChannelCredentials);

export default router;