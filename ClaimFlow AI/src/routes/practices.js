const express = require('express');
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { 
  requirePermission, 
  requireRole, 
  requirePracticeAccess,
  ROLES 
} = require('../middleware/rbac');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');
const logHelpers = require('../utils/logHelpers');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');
const encryptionService = require('../utils/encryption');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Onboarding workflow statuses
const ONBOARDING_STATUSES = {
  INITIATED: 'initiated',
  DOCUMENTS_PENDING: 'documents_pending',
  DOCUMENTS_REVIEW: 'documents_review',
  SETUP_PENDING: 'setup_pending',
  TRAINING_SCHEDULED: 'training_scheduled',
  TRAINING_COMPLETED: 'training_completed',
  LIVE: 'live',
  PAUSED: 'paused'
};

/**
 * @route GET /api/v1/practices
 * @desc Get all practices (Admin) or own practice (Provider/Staff)
 * @access Private
 */
router.get('/',
  authMiddleware,
  requirePermission('practices:read'),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['active', 'inactive', 'onboarding'])
      .withMessage('Invalid status filter'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1 and 100 characters')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters', errors.array());
    }

    const { 
      page = 1, 
      limit = 20, 
      status,
      search 
    } = req.query;
    const offset = (page - 1) * limit;
    
    try {
      let query = supabase
        .from('practices')
        .select(`
          id,
          name,
          npi,
          tax_id,
          address,
          phone,
          email,
          website,
          specialty,
          is_active,
          onboarding_status,
          onboarding_completed_at,
          created_at,
          updated_at,
          providers!practices_providers_practice_id_fkey(
            id,
            name,
            email,
            role
          )
        `, { count: 'exact' });
      
      // Apply role-based filtering
      if (req.user.role !== ROLES.ADMIN) {
        // Non-admins can only see their own practice
        query = query.eq('id', req.user.practice_id);
      }
      
      // Apply filters
      if (status) {
        if (status === 'onboarding') {
          query = query.neq('onboarding_status', 'live');
        } else {
          query = query.eq('is_active', status === 'active');
        }
      }
      
      if (search) {
        query = query.or(`name.ilike.%${search}%,npi.ilike.%${search}%,email.ilike.%${search}%`);
      }
      
      // Apply pagination
      query = query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });
      
      const { data: practices, error, count } = await query;
      
      if (error) {
        throw new Error('Failed to fetch practices');
      }
      
      // Sanitize sensitive data
      const sanitizedPractices = practices.map(practice => ({
        ...practice,
        tax_id: req.user.role === ROLES.ADMIN ? practice.tax_id : '***-**-****'
      }));
      
      // Log practice list access
      logHelpers.logSecurityEvent('practices_list_accessed', 'info', {
        userId: req.user.id,
        role: req.user.role,
        filters: { status, search },
        resultCount: practices.length,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        data: {
          practices: sanitizedPractices,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Failed to fetch practices', {
        error: error.message,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve practices');
    }
  })
);

/**
 * @route GET /api/v1/practices/:id/onboarding
 * @desc Get practice onboarding status and progress
 * @access Private
 */
router.get('/:id/onboarding',
  authMiddleware,
  requirePracticeAccess,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid practice ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    
    try {
      const { data: practice, error } = await supabase
        .from('practices')
        .select(`
          id,
          name,
          onboarding_status,
          onboarding_steps,
          onboarding_completed_at,
          onboarding_notes,
          created_at
        `)
        .eq('id', id)
        .single();
      
      if (error || !practice) {
        return res.status(404).json({
          success: false,
          error: 'Practice not found'
        });
      }
      
      // Calculate onboarding progress
      const totalSteps = Object.keys(ONBOARDING_STATUSES).length;
      const currentStepIndex = Object.values(ONBOARDING_STATUSES).indexOf(practice.onboarding_status);
      const progress = Math.round((currentStepIndex / (totalSteps - 1)) * 100);
      
      const onboardingData = {
        practiceId: practice.id,
        practiceName: practice.name,
        status: practice.onboarding_status,
        progress,
        steps: practice.onboarding_steps || {},
        completedAt: practice.onboarding_completed_at,
        notes: practice.onboarding_notes || [],
        createdAt: practice.created_at
      };
      
      // Log onboarding status access
      logHelpers.logSecurityEvent('onboarding_status_accessed', 'info', {
        userId: req.user.id,
        practiceId: id,
        status: practice.onboarding_status,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        data: onboardingData
      });
      
    } catch (error) {
      logger.error('Error fetching onboarding status:', {
        error: error.message,
        stack: error.stack,
        practiceId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to fetch onboarding status'
      });
    }
  })
);

/**
 * @route PUT /api/v1/practices/:id/onboarding
 * @desc Update practice onboarding status and steps
 * @access Private - Admin only
 */
router.put('/:id/onboarding',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid practice ID'),
    body('status')
      .isIn(Object.values(ONBOARDING_STATUSES))
      .withMessage('Invalid onboarding status'),
    body('notes')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes must be a string with max 1000 characters'),
    body('steps')
      .optional()
      .isObject()
      .withMessage('Steps must be an object')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    const { status, notes, steps } = req.body;
    
    try {
      // Get current practice data
      const { data: currentPractice, error: fetchError } = await supabase
        .from('practices')
        .select('onboarding_status, onboarding_steps, onboarding_notes')
        .eq('id', id)
        .single();
      
      if (fetchError || !currentPractice) {
        return res.status(404).json({
          success: false,
          error: 'Practice not found'
        });
      }
      
      // Prepare update data
      const updateData = {
        onboarding_status: status,
        updated_at: new Date().toISOString()
      };
      
      // Update steps if provided
      if (steps) {
        updateData.onboarding_steps = {
          ...currentPractice.onboarding_steps,
          ...steps
        };
      }
      
      // Add note if provided
      if (notes) {
        const currentNotes = currentPractice.onboarding_notes || [];
        updateData.onboarding_notes = [
          ...currentNotes,
          {
            id: uuidv4(),
            note: notes,
            addedBy: req.user.id,
            addedAt: new Date().toISOString()
          }
        ];
      }
      
      // Mark as completed if status is 'live'
      if (status === ONBOARDING_STATUSES.LIVE) {
        updateData.onboarding_completed_at = new Date().toISOString();
      }
      
      // Update practice
      const { data: updatedPractice, error: updateError } = await supabase
        .from('practices')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        throw new Error('Failed to update onboarding status');
      }
      
      // Log onboarding update
      logHelpers.logSecurityEvent('onboarding_updated', 'info', {
        userId: req.user.id,
        practiceId: id,
        previousStatus: currentPractice.onboarding_status,
        newStatus: status,
        hasNotes: !!notes,
        hasSteps: !!steps,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        message: 'Onboarding status updated successfully',
        data: {
          practiceId: id,
          status: updatedPractice.onboarding_status,
          completedAt: updatedPractice.onboarding_completed_at
        }
      });
      
    } catch (error) {
      logger.error('Error updating onboarding status:', {
        error: error.message,
        stack: error.stack,
        practiceId: id,
        userId: req.user.id,
        requestBody: req.body,
        correlationId: req.correlationId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to update onboarding status'
      });
    }
  })
);

/**
 * @route GET /api/v1/practices/:id
 * @desc Get practice by ID with comprehensive profile data
 * @access Private
 */
router.get('/:id',
  authMiddleware,
  requirePracticeAccess,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid practice ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { id } = req.params;

    try {
      const { data: practice, error } = await supabase
        .from('practices')
        .select(`
          id,
          name,
          npi,
          tax_id,
          address,
          phone,
          email,
          website,
          specialty,
          license_number,
          license_state,
          license_expiry,
          is_active,
          onboarding_status,
          onboarding_completed_at,
          settings,
          billing_info,
          created_at,
          updated_at,
          providers!practices_providers_practice_id_fkey(
            id,
            name,
            email,
            role,
            specialty,
            license_number,
            is_active,
            created_at
          )
        `)
        .eq('id', id)
        .single();

      if (error || !practice) {
        return res.status(404).json({
          success: false,
          error: 'Practice not found'
        });
      }

      // Sanitize sensitive data based on user role
      const sanitizedPractice = {
        ...practice,
        tax_id: req.user.role === ROLES.ADMIN ? practice.tax_id : '***-**-****',
        billing_info: req.user.role === ROLES.ADMIN ? practice.billing_info : null
      };

      // Log practice profile access
      logHelpers.logSecurityEvent('practice_profile_accessed', 'info', {
        userId: req.user.id,
        practiceId: id,
        role: req.user.role,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          practice: sanitizedPractice
        }
      });

    } catch (error) {
      logger.error('Failed to fetch practice profile:', {
        error: error.message,
        stack: error.stack,
        practiceId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve practice profile'
      });
    }
  })
);

/**
 * @route POST /api/v1/practices
 * @desc Create new practice with comprehensive profile setup
 * @access Private (Admin)
 */
router.post('/',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage('Practice name must be between 2 and 255 characters'),
    body('npi')
      .matches(/^[0-9]{10}$/)
      .withMessage('NPI must be exactly 10 digits'),
    body('address')
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Address must be between 5 and 500 characters'),
    body('phone')
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Invalid phone number format'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('website')
      .optional()
      .isURL()
      .withMessage('Invalid website URL'),
    body('tax_id')
      .optional()
      .matches(/^[0-9]{2}-[0-9]{7}$/)
      .withMessage('Tax ID must be in format XX-XXXXXXX'),
    body('specialty')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Specialty must be between 2 and 100 characters'),
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
      .withMessage('License expiry must be a valid date')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      name,
      npi,
      address,
      phone,
      email,
      website,
      tax_id,
      specialty,
      license_number,
      license_state,
      license_expiry
    } = req.body;

    try {
      // Check if NPI already exists
      const { data: existingNPI } = await supabase
        .from('practices')
        .select('id')
        .eq('npi', npi)
        .single();

      if (existingNPI) {
        return res.status(409).json({
          success: false,
          error: 'NPI already registered'
        });
      }

      // Check if email already exists
      const { data: existingEmail } = await supabase
        .from('practices')
        .select('id')
        .eq('email', email)
        .single();

      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email address already registered'
        });
      }

      // Encrypt sensitive data
      const encryptedTaxId = tax_id ? encryptionService.encryptPHI(tax_id) : null;

      // Create practice with comprehensive profile data
      const practiceData = {
        id: uuidv4(),
        name,
        npi,
        address,
        phone,
        email,
        website,
        specialty,
        license_number,
        license_state,
        license_expiry,
        tax_id: encryptedTaxId,
        is_active: true,
        onboarding_status: ONBOARDING_STATUSES.INITIATED,
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
          billing: {
            auto_pay: false,
            invoice_email: email
          }
        },
        created_by: req.user.id,
        created_at: new Date().toISOString()
      };

      const { data: newPractice, error: createError } = await supabase
        .from('practices')
        .insert(practiceData)
        .select()
        .single();

      if (createError) {
        logger.error('Practice creation failed', {
          error: createError.message,
          name,
          npi,
          correlationId: req.correlationId
        });
        throw new Error('Failed to create practice');
      }

      // Log practice creation
      logHelpers.logSecurityEvent('practice_created', 'info', {
        userId: req.user.id,
        practiceId: newPractice.id,
        practiceName: name,
        npi,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      // Return response without encrypted data
      const { tax_id: _, ...practiceResponse } = newPractice;
      practiceResponse.tax_id = tax_id ? '***-*******' : null;

      logger.info('Practice created successfully', {
        practiceId: newPractice.id,
        name,
        createdBy: req.user.id,
        correlationId: req.correlationId
      });

      res.status(201).json({
        success: true,
        message: 'Practice created successfully',
        data: {
          practice: practiceResponse
        }
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ConflictError) {
        throw error;
      }
      
      logger.error('Practice creation process failed', {
        error: error.message,
        name,
        correlationId: req.correlationId
      });
      
      throw new Error('Practice creation failed');
    }
  })
);

/**
 * @route PUT /api/v1/practices/:id
 * @desc Update practice profile information
 * @access Private (Admin or Practice Access)
 */
router.put('/:id',
  authMiddleware,
  requirePracticeAccess,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid practice ID format'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 })
      .withMessage('Practice name must be between 2 and 255 characters'),
    body('address')
      .optional()
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Address must be between 5 and 500 characters'),
    body('phone')
      .optional()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Invalid phone number format'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('website')
      .optional()
      .isURL()
      .withMessage('Invalid website URL'),
    body('specialty')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Specialty must be between 2 and 100 characters'),
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
    body('settings')
      .optional()
      .isObject()
      .withMessage('Settings must be an object'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean')
  ],
  asyncHandler(async (req, res) => {
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

    // Check authorization
    if (userRole !== 'admin' && id !== userPracticeId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to update this practice'
      });
    }

    // Non-admin users cannot change certain fields
    if (userRole !== 'admin') {
      const restrictedFields = ['subscription_tier', 'is_active'];
      const hasRestrictedFields = restrictedFields.some(field => req.body.hasOwnProperty(field));
      
      if (hasRestrictedFields) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to update restricted fields'
        });
      }
    }

    try {
      // Check if practice exists
      const { data: existingPractice, error: fetchError } = await supabase
        .from('practices')
        .select('id, name, email, settings')
        .eq('id', id)
        .single();

      if (fetchError || !existingPractice) {
        return res.status(404).json({
          success: false,
          error: 'Practice not found'
        });
      }

      // Check for email conflicts if email is being updated
      if (req.body.email && req.body.email !== existingPractice.email) {
        const { data: emailConflict } = await supabase
          .from('practices')
          .select('id')
          .eq('email', req.body.email)
          .neq('id', id)
          .single();

        if (emailConflict) {
          return res.status(409).json({
            success: false,
            error: 'Email address already in use by another practice'
          });
        }
      }

      // Prepare update data
      const updateData = {
        ...req.body,
        updated_at: new Date().toISOString(),
        updated_by: req.user.id
      };

      // Encrypt tax_id if provided
      if (updateData.tax_id) {
        updateData.tax_id = encryptionService.encryptPHI(updateData.tax_id);
      }

      // Merge settings if provided
      if (updateData.settings) {
        updateData.settings = {
          ...existingPractice.settings,
          ...updateData.settings
        };
      }

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.npi; // NPI should not be changeable
      delete updateData.created_at;
      delete updateData.created_by;

      // Update practice
      const { data: updatedPractice, error: updateError } = await supabase
        .from('practices')
        .update(updateData)
        .eq('id', id)
        .select(`
          id, name, npi, address, phone, email, website, specialty,
          license_number, license_state, license_expiry, is_active,
          onboarding_status, settings, created_at, updated_at
        `)
        .single();

      if (updateError) {
        throw new Error('Failed to update practice');
      }

      // Log practice update
      logHelpers.logSecurityEvent('practice_updated', 'info', {
        userId: req.user.id,
        practiceId: id,
        updatedFields: Object.keys(req.body),
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      logger.info('Practice updated successfully', {
        practiceId: id,
        updatedBy: req.user.id,
        updatedFields: Object.keys(updateData),
        correlationId: req.correlationId
      });

      // Sanitize response data
      const responseData = { ...updatedPractice };
      if (responseData.tax_id) {
        delete responseData.tax_id;
      }

      res.status(200).json({
        success: true,
        message: 'Practice profile updated successfully',
        data: {
          practice: responseData
        }
      });

    } catch (error) {
      logger.error('Practice update failed', {
        error: error.message,
        practiceId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      
      res.status(500).json({
        success: false,
        error: 'Practice update failed'
      });
    }
  })
);

/**
 * @route DELETE /api/v1/practices/:id
 * @desc Deactivate practice (soft delete)
 * @access Private (Admin only)
 */
router.delete('/:id',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid practice ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { id } = req.params;

    try {
      // Check if practice exists
      const { data: existingPractice, error: fetchError } = await supabase
        .from('practices')
        .select('id, name, is_active')
        .eq('id', id)
        .single();

      if (fetchError || !existingPractice) {
        return res.status(404).json({
          success: false,
          error: 'Practice not found'
        });
      }

      if (!existingPractice.is_active) {
        return res.status(409).json({
          success: false,
          error: 'Practice is already deactivated'
        });
      }

      // Check for active providers
      const { data: activeProviders, error: providersError } = await supabase
        .from('providers')
        .select('id')
        .eq('practice_id', id)
        .eq('is_active', true);

      if (providersError) {
        throw new Error('Failed to check practice providers');
      }

      if (activeProviders && activeProviders.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot deactivate practice with ${activeProviders.length} active providers. Please deactivate all providers first.`
        });
      }

      // Soft delete (deactivate) practice
      const { data: deactivatedPractice, error: updateError } = await supabase
        .from('practices')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: req.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, name, is_active, deactivated_at')
        .single();

      if (updateError) {
        throw new Error('Failed to deactivate practice');
      }

      // Log practice deactivation
      logHelpers.logSecurityEvent('practice_deactivated', 'warn', {
        userId: req.user.id,
        practiceId: id,
        practiceName: existingPractice.name,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      logger.info('Practice deactivated successfully', {
        practiceId: id,
        practiceName: existingPractice.name,
        deactivatedBy: req.user.id,
        correlationId: req.correlationId
      });

      res.status(200).json({
        success: true,
        message: 'Practice deactivated successfully',
        data: {
          practice: deactivatedPractice
        }
      });

    } catch (error) {
      logger.error('Practice deactivation failed', {
        error: error.message,
        practiceId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      
      res.status(500).json({
        success: false,
        error: 'Practice deactivation failed'
      });
    }
  })
);

/**
 * @route GET /api/v1/practices/:id/stats
 * @desc Get practice statistics
 * @access Private
 */
router.get('/:id/stats',
  authMiddleware,
  requirePracticeAccess,
  [
    param('id')
      .isUUID()
      .withMessage('Invalid practice ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid practice ID', errors.array());
    }

    const { id } = req.params;
    const userRole = req.user.role;
    const userPracticeId = req.user.practice_id;

    // Non-admin users can only access their own practice stats
    if (userRole !== 'admin' && id !== userPracticeId) {
      throw new ValidationError('Access denied to this practice statistics');
    }

    try {
      // Get practice statistics
      const [providersResult, patientsResult, authorizationsResult] = await Promise.all([
        supabase
          .from('providers')
          .select('id, is_active')
          .eq('practice_id', id),
        supabase
          .from('patients')
          .select('id, is_active')
          .eq('practice_id', id),
        supabase
          .from('authorizations')
          .select('id, status')
          .eq('practice_id', id)
      ]);

      if (providersResult.error || patientsResult.error || authorizationsResult.error) {
        throw new Error('Failed to fetch practice statistics');
      }

      const providers = providersResult.data || [];
      const patients = patientsResult.data || [];
      const authorizations = authorizationsResult.data || [];

      const stats = {
        providers: {
          total: providers.length,
          active: providers.filter(p => p.is_active).length,
          inactive: providers.filter(p => !p.is_active).length
        },
        patients: {
          total: patients.length,
          active: patients.filter(p => p.is_active).length,
          inactive: patients.filter(p => !p.is_active).length
        },
        authorizations: {
          total: authorizations.length,
          pending: authorizations.filter(a => a.status === 'pending').length,
          approved: authorizations.filter(a => a.status === 'approved').length,
          denied: authorizations.filter(a => a.status === 'denied').length,
          expired: authorizations.filter(a => a.status === 'expired').length
        }
      };

      res.status(200).json({
        practice_id: id,
        statistics: stats,
        generated_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to fetch practice statistics', {
        error: error.message,
        practiceId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve practice statistics');
    }
  })
);

module.exports = router;