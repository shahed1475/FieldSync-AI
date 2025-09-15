/**
 * User Management Routes
 * HIPAA-compliant user management with role-based access control
 * Supports Admin, Provider, and Staff roles with appropriate permissions
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const { supabase } = require('../database/connection');
const { authMiddleware } = require('../middleware/auth');
const { 
  requirePermission, 
  requireRole, 
  requireSelfAccess,
  requirePracticeAccess,
  ROLES 
} = require('../middleware/rbac');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');
const logHelpers = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');
const encryptionService = require('../utils/encryption');

/**
 * @route GET /api/v1/users
 * @desc Get all users (Admin only) or practice users (Provider)
 * @access Private
 */
router.get('/',
  authMiddleware,
  requirePermission('users:read'),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('role')
      .optional()
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role filter'),
    query('practice_id')
      .optional()
      .isUUID()
      .withMessage('Invalid practice ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters', errors.array());
    }
    
    const { 
      page = 1, 
      limit = 20, 
      role, 
      practice_id,
      search 
    } = req.query;
    const offset = (page - 1) * limit;
    
    try {
      let query = supabase
        .from('providers')
        .select(`
          id,
          practice_id,
          name,
          email,
          role,
          is_active,
          two_factor_enabled,
          created_at,
          updated_at,
          last_login,
          practices!inner(
            id,
            name,
            npi
          )
        `, { count: 'exact' });
      
      // Apply role-based filtering
      if (req.user.role !== ROLES.ADMIN) {
        // Non-admins can only see users from their practice
        query = query.eq('practice_id', req.user.practice_id);
      } else if (practice_id) {
        // Admin filtering by specific practice
        query = query.eq('practice_id', practice_id);
      }
      
      // Apply additional filters
      if (role) {
        query = query.eq('role', role);
      }
      
      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }
      
      // Apply pagination
      query = query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });
      
      const { data: users, error, count } = await query;
      
      if (error) {
        throw new Error('Failed to fetch users');
      }
      
      // Remove sensitive data
      const sanitizedUsers = users.map(user => ({
        ...user,
        password_hash: undefined,
        two_factor_secret: undefined
      }));
      
      // Log user list access
      logHelpers.logSecurityEvent('users_list_accessed', 'info', {
        userId: req.user.id,
        role: req.user.role,
        practiceId: req.user.practice_id,
        filters: { role, practice_id, search },
        resultCount: users.length,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        data: {
          users: sanitizedUsers,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          }
        }
      });
      
    } catch (error) {
      logger.error('Failed to fetch users', {
        error: error.message,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to fetch users');
    }
  })
);

/**
 * @route GET /api/v1/users/:id
 * @desc Get user by ID
 * @access Private
 */
router.get('/:id',
  authMiddleware,
  requirePermission('users:read'),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid user ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid user ID', errors.array());
    }
    
    const { id } = req.params;
    
    try {
      let query = supabase
        .from('providers')
        .select(`
          id,
          practice_id,
          name,
          email,
          role,
          is_active,
          two_factor_enabled,
          created_at,
          updated_at,
          last_login,
          practices!inner(
            id,
            name,
            npi,
            address,
            phone
          )
        `)
        .eq('id', id)
        .single();
      
      const { data: user, error } = await query;
      
      if (error || !user) {
        throw new NotFoundError('User not found');
      }
      
      // Check if user can access this user's data
      if (req.user.role !== ROLES.ADMIN && 
          req.user.practice_id !== user.practice_id &&
          req.user.id !== user.id) {
        throw new AuthorizationError('Access denied to user data');
      }
      
      // Remove sensitive data
      const sanitizedUser = {
        ...user,
        password_hash: undefined,
        two_factor_secret: undefined
      };
      
      // Log user access
      logHelpers.logSecurityEvent('user_accessed', 'info', {
        userId: req.user.id,
        accessedUserId: id,
        role: req.user.role,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        data: { user: sanitizedUser }
      });
      
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      
      logger.error('Failed to fetch user', {
        error: error.message,
        userId: req.user.id,
        requestedUserId: id,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to fetch user');
    }
  })
);

/**
 * @route POST /api/v1/users
 * @desc Create new user (Admin only)
 * @access Private
 */
router.post('/',
  authMiddleware,
  requirePermission('users:create'),
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('role')
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role'),
    body('practice_id')
      .isUUID()
      .withMessage('Valid practice ID is required'),
    body('password')
      .isLength({ min: 12 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be at least 12 characters with uppercase, lowercase, number, and special character'),
    body('send_invitation')
      .optional()
      .isBoolean()
      .withMessage('Send invitation must be boolean')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid user data', errors.array());
    }
    
    const { 
      name, 
      email, 
      role, 
      practice_id, 
      password,
      send_invitation = false 
    } = req.body;
    
    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('providers')
        .select('id')
        .eq('email', email)
        .single();
        
      if (existingUser) {
        throw new ValidationError('Email already exists');
      }
      
      // Verify practice exists
      const { data: practice, error: practiceError } = await supabase
        .from('practices')
        .select('id, name')
        .eq('id', practice_id)
        .single();
        
      if (practiceError || !practice) {
        throw new ValidationError('Invalid practice ID');
      }
      
      // Hash password
      const saltRounds = 12;
      const password_hash = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const userId = uuidv4();
      const { data: newUser, error: createError } = await supabase
        .from('providers')
        .insert({
          id: userId,
          practice_id,
          name,
          email,
          role,
          password_hash,
          is_active: true,
          two_factor_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select(`
          id,
          practice_id,
          name,
          email,
          role,
          is_active,
          created_at
        `)
        .single();
        
      if (createError) {
        throw new Error('Failed to create user');
      }
      
      // Log user creation
      logHelpers.logSecurityEvent('user_created', 'info', {
        userId: req.user.id,
        createdUserId: userId,
        createdUserRole: role,
        practiceId: practice_id,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      // TODO: Send invitation email if requested
      if (send_invitation) {
        // Implementation for sending invitation email
        logger.info('User invitation email requested', {
          userId,
          email,
          correlationId: req.correlationId
        });
      }
      
      res.status(201).json({
        success: true,
        data: { user: newUser },
        message: 'User created successfully'
      });
      
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      logger.error('Failed to create user', {
        error: error.message,
        userId: req.user.id,
        email,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to create user');
    }
  })
);

/**
 * @route PUT /api/v1/users/:id
 * @desc Update user
 * @access Private
 */
router.put('/:id',
  authMiddleware,
  requirePermission('users:update'),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid user ID'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('role')
      .optional()
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('Active status must be boolean')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid update data', errors.array());
    }
    
    const { id } = req.params;
    const updates = req.body;
    
    try {
      // Get existing user
      const { data: existingUser, error: fetchError } = await supabase
        .from('providers')
        .select('id, practice_id, role, email')
        .eq('id', id)
        .single();
        
      if (fetchError || !existingUser) {
        throw new NotFoundError('User not found');
      }
      
      // Check authorization for updates
      if (req.user.role !== ROLES.ADMIN) {
        // Non-admins can only update users in their practice
        if (existingUser.practice_id !== req.user.practice_id) {
          throw new AuthorizationError('Access denied to user');
        }
        
        // Non-admins cannot change roles
        if (updates.role && updates.role !== existingUser.role) {
          throw new AuthorizationError('Cannot modify user role');
        }
      }
      
      // Check for email conflicts
      if (updates.email && updates.email !== existingUser.email) {
        const { data: emailConflict } = await supabase
          .from('providers')
          .select('id')
          .eq('email', updates.email)
          .neq('id', id)
          .single();
          
        if (emailConflict) {
          throw new ValidationError('Email already exists');
        }
      }
      
      // Update user
      const { data: updatedUser, error: updateError } = await supabase
        .from('providers')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          id,
          practice_id,
          name,
          email,
          role,
          is_active,
          updated_at
        `)
        .single();
        
      if (updateError) {
        throw new Error('Failed to update user');
      }
      
      // Log user update
      logHelpers.logSecurityEvent('user_updated', 'info', {
        userId: req.user.id,
        updatedUserId: id,
        changes: Object.keys(updates),
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        data: { user: updatedUser },
        message: 'User updated successfully'
      });
      
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof AuthorizationError || 
          error instanceof ValidationError) {
        throw error;
      }
      
      logger.error('Failed to update user', {
        error: error.message,
        userId: req.user.id,
        targetUserId: id,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to update user');
    }
  })
);

/**
 * @route DELETE /api/v1/users/:id
 * @desc Deactivate user (soft delete)
 * @access Private
 */
router.delete('/:id',
  authMiddleware,
  requirePermission('users:delete'),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid user ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid user ID', errors.array());
    }
    
    const { id } = req.params;
    
    try {
      // Get existing user
      const { data: existingUser, error: fetchError } = await supabase
        .from('providers')
        .select('id, practice_id, role, name, email')
        .eq('id', id)
        .single();
        
      if (fetchError || !existingUser) {
        throw new NotFoundError('User not found');
      }
      
      // Check authorization
      if (req.user.role !== ROLES.ADMIN && 
          existingUser.practice_id !== req.user.practice_id) {
        throw new AuthorizationError('Access denied to user');
      }
      
      // Prevent self-deletion
      if (id === req.user.id) {
        throw new ValidationError('Cannot delete your own account');
      }
      
      // Soft delete (deactivate) user
      const { error: updateError } = await supabase
        .from('providers')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
        
      if (updateError) {
        throw new Error('Failed to deactivate user');
      }
      
      // Log user deactivation
      logHelpers.logSecurityEvent('user_deactivated', 'warning', {
        userId: req.user.id,
        deactivatedUserId: id,
        deactivatedUserEmail: existingUser.email,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        message: 'User deactivated successfully'
      });
      
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof AuthorizationError || 
          error instanceof ValidationError) {
        throw error;
      }
      
      logger.error('Failed to deactivate user', {
        error: error.message,
        userId: req.user.id,
        targetUserId: id,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to deactivate user');
    }
  })
);

module.exports = router;