import { Router } from 'express';
import {
  getAllAccounts as getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  updateCredits as updateAccountCredits,
  getAccountStats
} from '../controllers/accountController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest, validateQuery } from '../middleware/validation';
import { adminRateLimit } from '../middleware/rateLimiter';
import { 
  createAccountSchema, 
  updateAccountSchema, 
  updateCreditsSchema,
  paginationSchema 
} from '../middleware/validation';

const router = Router();

// Apply admin rate limiting and authentication to all routes
router.use(adminRateLimit);
router.use(authenticate);
router.use(requireAdmin);

/**
 * @route   GET /api/accounts
 * @desc    Get all accounts (Admin only)
 * @access  Private/Admin
 */
router.get('/', validateQuery(paginationSchema), getAccounts);

/**
 * @route   GET /api/accounts/:id
 * @desc    Get account by ID (Admin only)
 * @access  Private/Admin
 */
router.get('/:id', getAccountById);

/**
 * @route   POST /api/accounts
 * @desc    Create new account (Admin only)
 * @access  Private/Admin
 */
router.post('/', validateRequest(createAccountSchema), createAccount);

/**
 * @route   PUT /api/accounts/:id
 * @desc    Update account (Admin only)
 * @access  Private/Admin
 */
router.put('/:id', validateRequest(updateAccountSchema), updateAccount);

/**
 * @route   DELETE /api/accounts/:id
 * @desc    Delete account (Admin only)
 * @access  Private/Admin
 */
router.delete('/:id', deleteAccount);

/**
 * @route   PUT /api/accounts/:id/credits
 * @desc    Update account credits (Admin only)
 * @access  Private/Admin
 */
router.patch('/:id/credits', validateRequest(updateCreditsSchema), updateAccountCredits);

/**
 * @route   GET /api/accounts/:id/stats
 * @desc    Get detailed account statistics (Admin only)
 * @access  Private/Admin
 */
router.get('/:id/stats', getAccountStats);

export default router;