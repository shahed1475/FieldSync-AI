/**
 * Provider Management Routes
 * HIPAA-compliant provider management with role-based access control
 * Supports provider profile management, role assignments, and practice associations
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const { supabase } = require('../database/connection');
const { authMiddleware, validatePasswordStrength } = require('../middleware/auth');
const { 
  requirePermission, 
  requireRole, 
  requirePracticeAccess,
  ROLES 
} = require('../middleware/rbac');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');
const logHelpers = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const encryptionService = require('../utils/encryption');

/**
 * @route GET /api/v1/providers
 * @desc Get all providers (Admin) or practice providers (Provider/Staff)
 * @access Private
 */
router.get('/',
  authMiddleware,
  requirePermission('providers:read'),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('practice_id')
      .optional()
      .isUUID()
      .withMessage('Invalid practice ID format'),
    query('role')
      .optional()
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role filter'),
    query('specialty')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Specialty filter too long'),
    query('status')
      .optional()
      .isIn(['active', 'inactive', 'all'])
      .withMessage('Invalid status filter'),
    query('search')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Search term too long')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const {
        page = 1,
        limit = 20,
        practice_id,
        role,
        specialty,
        status = 'active',
        search
      } = req.query;

      const offset = (page - 1) * limit;
      const userRole = req.user.role;
      const userPracticeId = req.user.practice_id;

      // Build query based on user role and permissions
      let query = supabase
        .from('providers')
        .select(`
          id, name, email, npi, specialty, role, phone, is_active,
          license_number, license_state, license_expiry,
          created_at, updated_at, last_login_at,
          practices!inner(
            id, name, is_active
          )
        `, { count: 'exact' });

      // Apply role-based filtering
      if (userRole !== ROLES.ADMIN) {
        // Non-admin users can only see providers from their practice
        query = query.eq('practice_id', userPracticeId);
      } else if (practice_id) {
        // Admin can filter by specific practice
        query = query.eq('practice_id', practice_id);
      }

      // Apply filters
      if (status !== 'all') {
        query = query.eq('is_active', status === 'active');
      }

      if (role) {
        query = query.eq('role', role);
      }

      if (specialty) {
        query = query.ilike('specialty', `%${specialty}%`);
      }

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,npi.ilike.%${search}%`);
      }

      // Apply pagination and ordering
      const { data: providers, error, count } = await query
        .order('name', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error('Failed to fetch providers');
      }

      // Sanitize sensitive data based on user role
      const sanitizedProviders = providers.map(provider => {
        const sanitized = { ...provider };
        
        // Remove sensitive fields for non-admin users
        if (userRole !== ROLES.ADMIN) {
          delete sanitized.license_number;
          delete sanitized.license_state;
          delete sanitized.license_expiry;
        }
        
        return sanitized;
      });

      // Log provider access
      logHelpers.logSecurityEvent('providers_accessed', 'info', {
        userId: req.user.id,
        userRole,
        practiceId: userPracticeId,
        filters: { practice_id, role, specialty, status, search },
        resultCount: providers.length,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          providers: sanitizedProviders,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logHelpers.logSecurityEvent('providers_access_error', 'error', {
        userId: req.user?.id,
        error: error.message,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/providers/:id
 * @desc Get provider by ID
 * @access Private
 */
router.get('/:id',
  authMiddleware,
  requirePracticeAccess,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid provider ID format')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const userRole = req.user.role;
      const userPracticeId = req.user.practice_id;

      // Fetch provider with practice details
      const { data: provider, error } = await supabase
        .from('providers')
        .select(`
          id, name, email, npi, specialty, role, phone, is_active,
          license_number, license_state, license_expiry,
          bio, credentials, years_experience,
          settings, preferences,
          created_at, updated_at, last_login_at,
          practices!inner(
            id, name, address, phone, email, website, specialty as practice_specialty
          )
        `)
        .eq('id', id)
        .single();

      if (error || !provider) {
        return res.status(404).json({
          success: false,
          error: 'Provider not found'
        });
      }

      // Check access permissions
      if (userRole !== ROLES.ADMIN && provider.practices.id !== userPracticeId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this provider'
        });
      }

      // Sanitize sensitive data based on user role
      const sanitizedProvider = { ...provider };
      if (userRole !== ROLES.ADMIN && req.user.id !== id) {
        delete sanitizedProvider.license_number;
        delete sanitizedProvider.license_state;
        delete sanitizedProvider.license_expiry;
        delete sanitizedProvider.settings;
      }

      // Log provider access
      logHelpers.logSecurityEvent('provider_accessed', 'info', {
        userId: req.user.id,
        providerId: id,
        providerName: provider.name,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          provider: sanitizedProvider
        }
      });

    } catch (error) {
      logHelpers.logSecurityEvent('provider_access_error', 'error', {
        userId: req.user?.id,
        providerId: req.params.id,
        error: error.message,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/providers
 * @desc Create new provider
 * @access Private (Admin or Practice Admin)
 */
router.post('/',
  authMiddleware,
  requireRole(ROLES.ADMIN, ROLES.PROVIDER),
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage('Provider name must be between 2 and 255 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('npi')
      .matches(/^\d{10}$/)
      .withMessage('NPI must be exactly 10 digits'),
    body('specialty')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Specialty must be between 2 and 100 characters'),
    body('role')
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role'),
    body('phone')
      .optional()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Invalid phone number format'),
    body('license_number')
      .trim()
      .isLength({ min: 5, max: 50 })
      .withMessage('License number must be between 5 and 50 characters'),
    body('license_state')
      .isLength({ min: 2, max: 2 })
      .withMessage('License state must be 2 characters'),
    body('license_expiry')
      .isISO8601()
      .withMessage('License expiry must be a valid date'),
    body('practice_id')
      .isUUID()
      .withMessage('Valid practice ID is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('bio')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Bio must not exceed 1000 characters'),
    body('credentials')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Credentials must not exceed 200 characters'),
    body('years_experience')
      .optional()
      .isInt({ min: 0, max: 60 })
      .withMessage('Years of experience must be between 0 and 60')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const {
        name,
        email,
        npi,
        specialty,
        role,
        phone,
        license_number,
        license_state,
        license_expiry,
        practice_id,
        password,
        bio,
        credentials,
        years_experience
      } = req.body;

      const userRole = req.user.role;
      const userPracticeId = req.user.practice_id;

      // Validate practice access
      if (userRole !== ROLES.ADMIN && practice_id !== userPracticeId) {
        return res.status(403).json({
          success: false,
          error: 'Cannot create provider for different practice'
        });
      }

      // Validate role assignment permissions
      if (userRole === ROLES.PROVIDER && role === ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to assign admin role'
        });
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Password does not meet security requirements',
          details: passwordValidation.errors
        });
      }

      // Check if provider with same email already exists
      const { data: existingEmail } = await supabase
        .from('providers')
        .select('id')
        .eq('email', email)
        .single();

      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Provider with this email already exists'
        });
      }

      // Check if provider with same NPI already exists
      const { data: existingNPI } = await supabase
        .from('providers')
        .select('id')
        .eq('npi', npi)
        .single();

      if (existingNPI) {
        return res.status(409).json({
          success: false,
          error: 'Provider with this NPI already exists'
        });
      }

      // Verify practice exists and is active
      const { data: practice, error: practiceError } = await supabase
        .from('practices')
        .select('id, name, is_active')
        .eq('id', practice_id)
        .single();

      if (practiceError || !practice) {
        return res.status(404).json({
          success: false,
          error: 'Practice not found'
        });
      }

      if (!practice.is_active) {
        return res.status(400).json({
          success: false,
          error: 'Cannot create provider for inactive practice'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create provider with comprehensive profile data
      const providerData = {
        id: uuidv4(),
        name,
        email,
        npi,
        specialty,
        role,
        phone,
        license_number,
        license_state,
        license_expiry,
        practice_id,
        password_hash: hashedPassword,
        bio,
        credentials,
        years_experience,
        is_active: true,
        must_change_password: true,
        password_changed_at: new Date().toISOString(),
        settings: {
          notifications: {
            email: true,
            sms: false,
            push: true
          },
          security: {
            require_2fa: false,
            session_timeout: 15
          },
          preferences: {
            theme: 'light',
            language: 'en',
            timezone: 'America/New_York'
          }
        },
        created_by: req.user.id,
        created_at: new Date().toISOString()
      };

      const { data: newProvider, error: createError } = await supabase
        .from('providers')
        .insert(providerData)
        .select(`
          id, name, email, npi, specialty, role, phone, is_active,
          bio, credentials, years_experience, created_at
        `)
        .single();

      if (createError) {
        throw new Error('Failed to create provider');
      }

      // Log provider creation
      logHelpers.logSecurityEvent('provider_created', 'info', {
        userId: req.user.id,
        providerId: newProvider.id,
        providerName: name,
        providerEmail: email,
        providerRole: role,
        practiceId: practice_id,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      res.status(201).json({
        success: true,
        message: 'Provider created successfully',
        data: {
          provider: newProvider
        }
      });

    } catch (error) {
      logHelpers.logSecurityEvent('provider_creation_error', 'error', {
        userId: req.user?.id,
        error: error.message,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/providers/:id
 * @desc Update provider profile
 * @access Private (Admin, Practice Admin, or Self)
 */
router.put('/:id',
  authMiddleware,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid provider ID format'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage('Provider name must be between 2 and 255 characters'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('specialty')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Specialty must be between 2 and 100 characters'),
    body('phone')
      .optional()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Invalid phone number format'),
    body('license_number')
      .optional()
      .trim()
      .isLength({ min: 5, max: 50 })
      .withMessage('License number must be between 5 and 50 characters'),
    body('license_state')
      .optional()
      .isLength({ min: 2, max: 2 })
      .withMessage('License state must be 2 characters'),
    body('license_expiry')
      .optional()
      .isISO8601()
      .withMessage('License expiry must be a valid date'),
    body('bio')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Bio must not exceed 1000 characters'),
    body('credentials')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Credentials must not exceed 200 characters'),
    body('years_experience')
      .optional()
      .isInt({ min: 0, max: 60 })
      .withMessage('Years of experience must be between 0 and 60'),
    body('role')
      .optional()
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role'),
    body('settings')
      .optional()
      .isObject()
      .withMessage('Settings must be an object'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const updateData = { ...req.body };
      const userRole = req.user.role;
      const userId = req.user.id;
      const userPracticeId = req.user.practice_id;

      // Check if provider exists
      const { data: existingProvider, error: fetchError } = await supabase
        .from('providers')
        .select('id, name, email, role, practice_id, settings')
        .eq('id', id)
        .single();

      if (fetchError || !existingProvider) {
        return res.status(404).json({
          success: false,
          error: 'Provider not found'
        });
      }

      // Check access permissions
      const isSelf = userId === id;
      const isSamePractice = existingProvider.practice_id === userPracticeId;
      const canUpdate = userRole === ROLES.ADMIN || 
                       (userRole === ROLES.PROVIDER && isSamePractice) || 
                       isSelf;

      if (!canUpdate) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to update this provider'
        });
      }

      // Validate role change permissions
      if (updateData.role && updateData.role !== existingProvider.role) {
        if (userRole !== ROLES.ADMIN) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions to change provider role'
          });
        }
        
        // Prevent self-demotion from admin
        if (isSelf && existingProvider.role === ROLES.ADMIN && updateData.role !== ROLES.ADMIN) {
          return res.status(400).json({
            success: false,
            error: 'Cannot demote yourself from admin role'
          });
        }
      }

      // Validate status change permissions
      if (updateData.hasOwnProperty('is_active') && !isSelf) {
        if (userRole !== ROLES.ADMIN && !(userRole === ROLES.PROVIDER && isSamePractice)) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions to change provider status'
          });
        }
      }

      // Check for email conflicts if email is being updated
      if (updateData.email && updateData.email !== existingProvider.email) {
        const { data: emailConflict } = await supabase
          .from('providers')
          .select('id')
          .eq('email', updateData.email)
          .neq('id', id)
          .single();

        if (emailConflict) {
          return res.status(409).json({
            success: false,
            error: 'Email address already in use by another provider'
          });
        }
      }

      // Merge settings if provided
      if (updateData.settings) {
        updateData.settings = {
          ...existingProvider.settings,
          ...updateData.settings
        };
      }

      // Update provider with timestamp
      updateData.updated_at = new Date().toISOString();
      updateData.updated_by = userId;

      const { data: updatedProvider, error: updateError } = await supabase
        .from('providers')
        .update(updateData)
        .eq('id', id)
        .select(`
          id, name, email, npi, specialty, role, phone, is_active,
          license_number, license_state, license_expiry,
          bio, credentials, years_experience, settings,
          created_at, updated_at
        `)
        .single();

      if (updateError) {
        throw new Error('Failed to update provider');
      }

      // Log provider update
      logHelpers.logSecurityEvent('provider_updated', 'info', {
        userId,
        providerId: id,
        updatedFields: Object.keys(req.body),
        roleChanged: updateData.role && updateData.role !== existingProvider.role,
        statusChanged: updateData.hasOwnProperty('is_active'),
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      // Sanitize response data based on user permissions
      const responseData = { ...updatedProvider };
      if (userRole !== ROLES.ADMIN && !isSelf) {
        delete responseData.license_number;
        delete responseData.license_state;
        delete responseData.license_expiry;
        delete responseData.settings;
      }

      res.json({
        success: true,
        message: 'Provider profile updated successfully',
        data: {
          provider: responseData
        }
      });

    } catch (error) {
      logHelpers.logSecurityEvent('provider_update_error', 'error', {
        userId: req.user?.id,
        providerId: req.params.id,
        error: error.message,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/providers/:id
 * @desc Deactivate provider (soft delete)
 * @access Private (Admin or Practice Admin)
 */
router.delete('/:id',
  authMiddleware,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid provider ID format')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const userRole = req.user.role;
      const userId = req.user.id;
      const userPracticeId = req.user.practice_id;

      // Check if provider exists
      const { data: existingProvider, error: fetchError } = await supabase
        .from('providers')
        .select('id, name, role, practice_id, is_active')
        .eq('id', id)
        .single();

      if (fetchError || !existingProvider) {
        return res.status(404).json({
          success: false,
          error: 'Provider not found'
        });
      }

      // Check permissions
      const isSamePractice = existingProvider.practice_id === userPracticeId;
      const canDeactivate = userRole === ROLES.ADMIN || 
                           (userRole === ROLES.PROVIDER && isSamePractice);

      if (!canDeactivate) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to deactivate this provider'
        });
      }

      // Prevent self-deactivation
      if (userId === id) {
        return res.status(400).json({
          success: false,
          error: 'Cannot deactivate your own account'
        });
      }

      if (!existingProvider.is_active) {
        return res.status(409).json({
          success: false,
          error: 'Provider is already deactivated'
        });
      }

      // Check for active authorizations or patients assigned to this provider
      const { data: activeAuthorizations } = await supabase
        .from('authorizations')
        .select('id')
        .eq('provider_id', id)
        .in('status', ['pending', 'approved'])
        .limit(1);

      if (activeAuthorizations && activeAuthorizations.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot deactivate provider with active authorizations. Please reassign or complete them first.'
        });
      }

      // Soft delete (deactivate) provider
      const { data: deactivatedProvider, error: updateError } = await supabase
        .from('providers')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, name, is_active, deactivated_at')
        .single();

      if (updateError) {
        throw new Error('Failed to deactivate provider');
      }

      // Log provider deactivation
      logHelpers.logSecurityEvent('provider_deactivated', 'warn', {
        userId,
        providerId: id,
        providerName: existingProvider.name,
        providerRole: existingProvider.role,
        practiceId: existingProvider.practice_id,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        message: 'Provider deactivated successfully',
        data: {
          provider: deactivatedProvider
        }
      });

    } catch (error) {
      logHelpers.logSecurityEvent('provider_deactivation_error', 'error', {
        userId: req.user?.id,
        providerId: req.params.id,
        error: error.message,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/providers/:id/role
 * @desc Update provider role assignment
 * @access Private (Admin only)
 */
router.put('/:id/role',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid provider ID format'),
    body('role')
      .isIn(Object.values(ROLES))
      .withMessage('Invalid role'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must not exceed 500 characters')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { role, reason } = req.body;
      const userId = req.user.id;

      // Check if provider exists
      const { data: existingProvider, error: fetchError } = await supabase
        .from('providers')
        .select('id, name, role, practice_id, is_active')
        .eq('id', id)
        .single();

      if (fetchError || !existingProvider) {
        return res.status(404).json({
          success: false,
          error: 'Provider not found'
        });
      }

      if (!existingProvider.is_active) {
        return res.status(400).json({
          success: false,
          error: 'Cannot change role of inactive provider'
        });
      }

      if (existingProvider.role === role) {
        return res.status(400).json({
          success: false,
          error: 'Provider already has this role'
        });
      }

      // Prevent self-demotion from admin
      if (userId === id && existingProvider.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
        return res.status(400).json({
          success: false,
          error: 'Cannot demote yourself from admin role'
        });
      }

      // Update provider role
      const { data: updatedProvider, error: updateError } = await supabase
        .from('providers')
        .update({
          role,
          role_changed_at: new Date().toISOString(),
          role_changed_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, name, role, role_changed_at')
        .single();

      if (updateError) {
        throw new Error('Failed to update provider role');
      }

      // Log role change
      logHelpers.logSecurityEvent('provider_role_changed', 'warn', {
        userId,
        providerId: id,
        providerName: existingProvider.name,
        oldRole: existingProvider.role,
        newRole: role,
        reason,
        practiceId: existingProvider.practice_id,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        message: 'Provider role updated successfully',
        data: {
          provider: updatedProvider,
          roleChange: {
            from: existingProvider.role,
            to: role,
            reason,
            changedAt: updatedProvider.role_changed_at
          }
        }
      });

    } catch (error) {
      logHelpers.logSecurityEvent('provider_role_change_error', 'error', {
        userId: req.user?.id,
        providerId: req.params.id,
        error: error.message,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      next(error);
    }
  }
);

module.exports = router;