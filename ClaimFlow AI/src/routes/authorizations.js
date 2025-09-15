const express = require('express');
const { supabase } = require('../database/connection');
const { encryptionService } = require('../utils/encryption');
const { logger, logHelpers } = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { 
  ValidationError, 
  NotFoundError,
  ConflictError,
  asyncHandler 
} = require('../middleware/errorHandler');
const { body, param, query, validationResult } = require('express-validator');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @route GET /api/v1/authorizations
 * @desc Get authorizations for current practice
 * @access Private
 */
router.get('/',
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
      .isIn(['pending', 'approved', 'denied', 'expired', 'cancelled', 'all'])
      .withMessage('Invalid status filter'),
    query('provider_id')
      .optional()
      .isUUID()
      .withMessage('Invalid provider ID format'),
    query('patient_id')
      .optional()
      .isUUID()
      .withMessage('Invalid patient ID format'),
    query('payer')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Payer name too long'),
    query('date_from')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format for date_from'),
    query('date_to')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format for date_to')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters', errors.array());
    }

    const { 
      page = 1, 
      limit = 20, 
      status = 'all', 
      provider_id, 
      patient_id, 
      payer,
      date_from,
      date_to
    } = req.query;
    const offset = (page - 1) * limit;
    const userPracticeId = req.user.practice_id;
    const userRole = req.user.role;
    const userId = req.user.id;

    try {
      let query = supabase
        .from('authorizations')
        .select(`
          id,
          authorization_number,
          patient_id,
          provider_id,
          service_type,
          service_code,
          diagnosis_code,
          status,
          payer,
          requested_date,
          approved_date,
          expiration_date,
          units_requested,
          units_approved,
          priority,
          notes_encrypted,
          created_at,
          updated_at,
          patients!inner(
            id,
            patient_id,
            first_name_encrypted,
            last_name_encrypted
          ),
          providers!inner(
            id,
            name,
            specialty
          )
        `, { count: 'exact' })
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only see their own authorizations
      if (userRole === 'provider') {
        query = query.eq('provider_id', userId);
      }

      // Apply filters
      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (provider_id) {
        query = query.eq('provider_id', provider_id);
      }

      if (patient_id) {
        query = query.eq('patient_id', patient_id);
      }

      if (payer) {
        query = query.ilike('payer', `%${payer}%`);
      }

      if (date_from) {
        query = query.gte('requested_date', date_from);
      }

      if (date_to) {
        query = query.lte('requested_date', date_to);
      }

      // Apply pagination and ordering
      query = query
        .range(offset, offset + limit - 1)
        .order('requested_date', { ascending: false });

      const { data: authorizations, error, count } = await query;

      if (error) {
        throw new Error('Failed to fetch authorizations');
      }

      // Decrypt patient names and notes
      const processedAuthorizations = authorizations.map(auth => {
        try {
          const patientFirstName = encryptionService.decryptPHI(auth.patients.first_name_encrypted);
          const patientLastName = encryptionService.decryptPHI(auth.patients.last_name_encrypted);
          const notes = auth.notes_encrypted ? encryptionService.decryptPHI(auth.notes_encrypted) : null;

          return {
            id: auth.id,
            authorization_number: auth.authorization_number,
            patient: {
              id: auth.patients.id,
              patient_id: auth.patients.patient_id,
              name: `${patientFirstName} ${patientLastName}`
            },
            provider: {
              id: auth.providers.id,
              name: auth.providers.name,
              specialty: auth.providers.specialty
            },
            service_type: auth.service_type,
            service_code: auth.service_code,
            diagnosis_code: auth.diagnosis_code,
            status: auth.status,
            payer: auth.payer,
            requested_date: auth.requested_date,
            approved_date: auth.approved_date,
            expiration_date: auth.expiration_date,
            units_requested: auth.units_requested,
            units_approved: auth.units_approved,
            priority: auth.priority,
            notes,
            created_at: auth.created_at,
            updated_at: auth.updated_at
          };
        } catch (decryptError) {
          logger.error('Failed to decrypt authorization data', {
            authorizationId: auth.id,
            error: decryptError.message,
            correlationId: req.correlationId
          });
          // Return authorization with masked patient data if decryption fails
          return {
            ...auth,
            patient: {
              id: auth.patients.id,
              patient_id: auth.patients.patient_id,
              name: '*** ***'
            },
            notes: '***'
          };
        }
      });

      // Log authorization access
      logHelpers.logPHIAccess(
        'authorization_list_access',
        userId,
        userPracticeId,
        {
          authorizationCount: authorizations.length,
          filters: { status, provider_id, patient_id, payer },
          correlationId: req.correlationId
        }
      );

      res.status(200).json({
        authorizations: processedAuthorizations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      logger.error('Failed to fetch authorizations', {
        error: error.message,
        userId,
        practiceId: userPracticeId,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve authorizations');
    }
  })
);

/**
 * @route GET /api/v1/authorizations/:id
 * @desc Get authorization by ID
 * @access Private
 */
router.get('/:id',
  [
    param('id')
      .isUUID()
      .withMessage('Invalid authorization ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid authorization ID', errors.array());
    }

    const { id } = req.params;
    const userPracticeId = req.user.practice_id;
    const userRole = req.user.role;
    const userId = req.user.id;

    try {
      let query = supabase
        .from('authorizations')
        .select(`
          *,
          patients!inner(
            id,
            patient_id,
            first_name_encrypted,
            last_name_encrypted,
            date_of_birth_encrypted,
            phone_encrypted,
            insurance_provider,
            insurance_member_id_encrypted
          ),
          providers!inner(
            id,
            name,
            specialty,
            npi
          ),
          documents(
            id,
            document_type,
            file_name,
            file_size,
            uploaded_at
          )
        `)
        .eq('id', id)
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only see their own authorizations
      if (userRole === 'provider') {
        query = query.eq('provider_id', userId);
      }

      const { data: authorization, error } = await query.single();

      if (error || !authorization) {
        throw new NotFoundError('Authorization not found');
      }

      // Decrypt PHI data
      try {
        const patientFirstName = encryptionService.decryptPHI(authorization.patients.first_name_encrypted);
        const patientLastName = encryptionService.decryptPHI(authorization.patients.last_name_encrypted);
        const patientDOB = encryptionService.decryptPHI(authorization.patients.date_of_birth_encrypted);
        const patientPhone = encryptionService.decryptPHI(authorization.patients.phone_encrypted);
        const insuranceMemberId = authorization.patients.insurance_member_id_encrypted ? 
          encryptionService.decryptPHI(authorization.patients.insurance_member_id_encrypted) : null;
        const notes = authorization.notes_encrypted ? 
          encryptionService.decryptPHI(authorization.notes_encrypted) : null;
        const denialReason = authorization.denial_reason_encrypted ? 
          encryptionService.decryptPHI(authorization.denial_reason_encrypted) : null;

        const processedAuthorization = {
          id: authorization.id,
          authorization_number: authorization.authorization_number,
          practice_id: authorization.practice_id,
          patient: {
            id: authorization.patients.id,
            patient_id: authorization.patients.patient_id,
            name: `${patientFirstName} ${patientLastName}`,
            date_of_birth: patientDOB,
            phone: patientPhone,
            insurance_provider: authorization.patients.insurance_provider,
            insurance_member_id: insuranceMemberId
          },
          provider: {
            id: authorization.providers.id,
            name: authorization.providers.name,
            specialty: authorization.providers.specialty,
            npi: authorization.providers.npi
          },
          service_type: authorization.service_type,
          service_code: authorization.service_code,
          diagnosis_code: authorization.diagnosis_code,
          diagnosis_description: authorization.diagnosis_description,
          status: authorization.status,
          payer: authorization.payer,
          requested_date: authorization.requested_date,
          approved_date: authorization.approved_date,
          expiration_date: authorization.expiration_date,
          effective_date: authorization.effective_date,
          units_requested: authorization.units_requested,
          units_approved: authorization.units_approved,
          units_used: authorization.units_used,
          priority: authorization.priority,
          urgency_reason: authorization.urgency_reason,
          notes,
          denial_reason: denialReason,
          appeal_deadline: authorization.appeal_deadline,
          documents: authorization.documents,
          created_at: authorization.created_at,
          updated_at: authorization.updated_at,
          created_by: authorization.created_by,
          updated_by: authorization.updated_by
        };

        // Log PHI access
        logHelpers.logPHIAccess(
          'authorization_detail_access',
          userId,
          userPracticeId,
          {
            authorizationId: id,
            patientId: authorization.patient_id,
            correlationId: req.correlationId
          }
        );

        res.status(200).json({
          authorization: processedAuthorization
        });

      } catch (decryptError) {
        logger.error('Failed to decrypt authorization data', {
          authorizationId: id,
          error: decryptError.message,
          correlationId: req.correlationId
        });
        throw new Error('Failed to retrieve authorization data');
      }

    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to fetch authorization', {
        error: error.message,
        authorizationId: id,
        userId,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve authorization');
    }
  })
);

/**
 * @route POST /api/v1/authorizations
 * @desc Create new authorization request
 * @access Private
 */
router.post('/',
  authorizeRole(['admin', 'provider', 'staff']),
  [
    body('patient_id')
      .isUUID()
      .withMessage('Valid patient ID is required'),
    body('provider_id')
      .isUUID()
      .withMessage('Valid provider ID is required'),
    body('service_type')
      .isLength({ min: 1, max: 100 })
      .withMessage('Service type is required'),
    body('service_code')
      .matches(/^[A-Z0-9]{5}$/)
      .withMessage('Service code must be 5 alphanumeric characters'),
    body('diagnosis_code')
      .matches(/^[A-Z][0-9]{2}(\.[0-9X]{1,4})?$/)
      .withMessage('Invalid ICD-10 diagnosis code format'),
    body('payer')
      .isLength({ min: 1, max: 100 })
      .withMessage('Payer is required'),
    body('requested_date')
      .isISO8601()
      .withMessage('Valid requested date is required'),
    body('units_requested')
      .isInt({ min: 1, max: 9999 })
      .withMessage('Units requested must be between 1 and 9999'),
    body('priority')
      .isIn(['routine', 'urgent', 'stat'])
      .withMessage('Invalid priority level'),
    body('diagnosis_description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Diagnosis description too long'),
    body('notes')
      .optional()
      .isLength({ max: 2000 })
      .withMessage('Notes too long')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Authorization validation failed', errors.array());
    }

    const {
      patient_id,
      provider_id,
      service_type,
      service_code,
      diagnosis_code,
      diagnosis_description,
      payer,
      requested_date,
      units_requested,
      priority,
      urgency_reason,
      notes
    } = req.body;

    const userPracticeId = req.user.practice_id;
    const userId = req.user.id;

    try {
      // Verify patient belongs to practice
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id, practice_id, is_active')
        .eq('id', patient_id)
        .eq('practice_id', userPracticeId)
        .single();

      if (patientError || !patient) {
        throw new ValidationError('Patient not found in your practice');
      }

      if (!patient.is_active) {
        throw new ValidationError('Cannot create authorization for inactive patient');
      }

      // Verify provider belongs to practice
      const { data: provider, error: providerError } = await supabase
        .from('providers')
        .select('id, practice_id, is_active')
        .eq('id', provider_id)
        .eq('practice_id', userPracticeId)
        .single();

      if (providerError || !provider) {
        throw new ValidationError('Provider not found in your practice');
      }

      if (!provider.is_active) {
        throw new ValidationError('Cannot create authorization for inactive provider');
      }

      // Generate authorization number
      const authNumber = `AUTH${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Encrypt sensitive data
      const encryptedNotes = notes ? encryptionService.encryptPHI(notes) : null;

      // Create authorization
      const { data: newAuthorization, error: createError } = await supabase
        .from('authorizations')
        .insert({
          authorization_number: authNumber,
          practice_id: userPracticeId,
          patient_id,
          provider_id,
          service_type,
          service_code,
          diagnosis_code,
          diagnosis_description,
          status: 'pending',
          payer,
          requested_date,
          units_requested,
          priority,
          urgency_reason,
          notes_encrypted: encryptedNotes,
          created_by: userId,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        logger.error('Authorization creation failed', {
          error: createError.message,
          authNumber,
          patientId: patient_id,
          providerId: provider_id,
          correlationId: req.correlationId
        });
        throw new Error('Failed to create authorization');
      }

      // Prepare response
      const authorizationResponse = {
        id: newAuthorization.id,
        authorization_number: newAuthorization.authorization_number,
        patient_id: newAuthorization.patient_id,
        provider_id: newAuthorization.provider_id,
        service_type: newAuthorization.service_type,
        service_code: newAuthorization.service_code,
        diagnosis_code: newAuthorization.diagnosis_code,
        diagnosis_description: newAuthorization.diagnosis_description,
        status: newAuthorization.status,
        payer: newAuthorization.payer,
        requested_date: newAuthorization.requested_date,
        units_requested: newAuthorization.units_requested,
        priority: newAuthorization.priority,
        urgency_reason: newAuthorization.urgency_reason,
        notes,
        created_at: newAuthorization.created_at
      };

      // Log authorization creation
      logger.info('Authorization created successfully', {
        authorizationId: newAuthorization.id,
        authorizationNumber: authNumber,
        patientId: patient_id,
        providerId: provider_id,
        createdBy: userId,
        correlationId: req.correlationId
      });

      res.status(201).json({
        message: 'Authorization created successfully',
        authorization: authorizationResponse
      });

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      logger.error('Authorization creation process failed', {
        error: error.message,
        patientId: patient_id,
        providerId: provider_id,
        correlationId: req.correlationId
      });
      
      throw new Error('Authorization creation failed');
    }
  })
);

/**
 * @route PUT /api/v1/authorizations/:id/status
 * @desc Update authorization status
 * @access Private
 */
router.put('/:id/status',
  authorizeRole(['admin', 'provider', 'staff']),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid authorization ID format'),
    body('status')
      .isIn(['pending', 'approved', 'denied', 'expired', 'cancelled'])
      .withMessage('Invalid status'),
    body('approved_date')
      .optional()
      .isISO8601()
      .withMessage('Invalid approved date format'),
    body('expiration_date')
      .optional()
      .isISO8601()
      .withMessage('Invalid expiration date format'),
    body('units_approved')
      .optional()
      .isInt({ min: 0, max: 9999 })
      .withMessage('Units approved must be between 0 and 9999'),
    body('denial_reason')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Denial reason too long'),
    body('notes')
      .optional()
      .isLength({ max: 2000 })
      .withMessage('Notes too long')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Status update validation failed', errors.array());
    }

    const { id } = req.params;
    const {
      status,
      approved_date,
      expiration_date,
      units_approved,
      denial_reason,
      notes
    } = req.body;

    const userPracticeId = req.user.practice_id;
    const userId = req.user.id;

    try {
      // Check if authorization exists and belongs to practice
      const { data: existingAuth, error: fetchError } = await supabase
        .from('authorizations')
        .select('id, practice_id, status, provider_id')
        .eq('id', id)
        .eq('practice_id', userPracticeId)
        .single();

      if (fetchError || !existingAuth) {
        throw new NotFoundError('Authorization not found');
      }

      // Check if user can update this authorization
      if (req.user.role === 'provider' && existingAuth.provider_id !== userId) {
        throw new ValidationError('You can only update your own authorizations');
      }

      // Validate status transitions
      const validTransitions = {
        'pending': ['approved', 'denied', 'cancelled'],
        'approved': ['expired', 'cancelled'],
        'denied': ['pending'], // Allow resubmission
        'expired': [],
        'cancelled': []
      };

      if (!validTransitions[existingAuth.status].includes(status)) {
        throw new ValidationError(`Cannot change status from ${existingAuth.status} to ${status}`);
      }

      // Prepare update data
      const updateData = {
        status,
        updated_at: new Date().toISOString(),
        updated_by: userId
      };

      // Add status-specific fields
      if (status === 'approved') {
        if (!approved_date || !expiration_date || units_approved === undefined) {
          throw new ValidationError('Approved date, expiration date, and units approved are required for approval');
        }
        updateData.approved_date = approved_date;
        updateData.expiration_date = expiration_date;
        updateData.units_approved = units_approved;
        updateData.effective_date = approved_date;
      }

      if (status === 'denied' && denial_reason) {
        updateData.denial_reason_encrypted = encryptionService.encryptPHI(denial_reason);
        // Set appeal deadline (typically 60 days from denial)
        const appealDeadline = new Date();
        appealDeadline.setDate(appealDeadline.getDate() + 60);
        updateData.appeal_deadline = appealDeadline.toISOString();
      }

      if (notes) {
        updateData.notes_encrypted = encryptionService.encryptPHI(notes);
      }

      // Update authorization
      const { data: updatedAuth, error: updateError } = await supabase
        .from('authorizations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        throw new Error('Failed to update authorization status');
      }

      // Log status change
      logger.info('Authorization status updated', {
        authorizationId: id,
        oldStatus: existingAuth.status,
        newStatus: status,
        updatedBy: userId,
        correlationId: req.correlationId
      });

      res.status(200).json({
        message: 'Authorization status updated successfully',
        authorization: {
          id: updatedAuth.id,
          status: updatedAuth.status,
          approved_date: updatedAuth.approved_date,
          expiration_date: updatedAuth.expiration_date,
          units_approved: updatedAuth.units_approved,
          updated_at: updatedAuth.updated_at
        }
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Authorization status update failed', {
        error: error.message,
        authorizationId: id,
        newStatus: status,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Authorization status update failed');
    }
  })
);

/**
 * @route GET /api/v1/authorizations/stats
 * @desc Get authorization statistics for practice
 * @access Private
 */
router.get('/stats',
  asyncHandler(async (req, res) => {
    const userPracticeId = req.user.practice_id;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
      let query = supabase
        .from('authorizations')
        .select('id, status, priority, requested_date, approved_date')
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only see their own stats
      if (userRole === 'provider') {
        query = query.eq('provider_id', userId);
      }

      const { data: authorizations, error } = await query;

      if (error) {
        throw new Error('Failed to fetch authorization statistics');
      }

      // Calculate statistics
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      const stats = {
        total: authorizations.length,
        by_status: {
          pending: authorizations.filter(a => a.status === 'pending').length,
          approved: authorizations.filter(a => a.status === 'approved').length,
          denied: authorizations.filter(a => a.status === 'denied').length,
          expired: authorizations.filter(a => a.status === 'expired').length,
          cancelled: authorizations.filter(a => a.status === 'cancelled').length
        },
        by_priority: {
          routine: authorizations.filter(a => a.priority === 'routine').length,
          urgent: authorizations.filter(a => a.priority === 'urgent').length,
          stat: authorizations.filter(a => a.priority === 'stat').length
        },
        recent: {
          last_30_days: authorizations.filter(a => 
            new Date(a.requested_date) >= thirtyDaysAgo
          ).length,
          approved_last_30_days: authorizations.filter(a => 
            a.status === 'approved' && 
            a.approved_date && 
            new Date(a.approved_date) >= thirtyDaysAgo
          ).length
        },
        approval_rate: authorizations.length > 0 ? 
          Math.round((authorizations.filter(a => a.status === 'approved').length / authorizations.length) * 100) : 0
      };

      res.status(200).json({
        practice_id: userPracticeId,
        statistics: stats,
        generated_at: now.toISOString()
      });

    } catch (error) {
      logger.error('Failed to fetch authorization statistics', {
        error: error.message,
        userId,
        practiceId: userPracticeId,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve authorization statistics');
    }
  })
);

module.exports = router;