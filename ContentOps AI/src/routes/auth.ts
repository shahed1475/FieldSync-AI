import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  logout,
  deleteAccount
} from '../controllers/authController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validateRequest, validateQuery } from '../middleware/validation';
import { authRateLimit } from '../middleware/rateLimiter';
import { 
  loginSchema, 
  registerSchema, 
  updateProfileSchema, 
  changePasswordSchema 
} from '../middleware/validation';

const router = Router();

// Apply auth rate limiting to all routes
router.use(authRateLimit);

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validateRequest(registerSchema), register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validateRequest(loginSchema), login);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public (requires refresh token)
 */
router.post('/refresh', refreshToken);

/**
 * @route   GET /api/auth/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', authenticate, getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticate, validateRequest(updateProfileSchema), updateProfile);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password', authenticate, validateRequest(changePasswordSchema), changePassword);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/account', authenticate, deleteAccount);

export default router;