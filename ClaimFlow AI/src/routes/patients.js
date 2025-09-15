const express = require('express');
const { supabase } = require('../database/connection');
const { encryptionService } = require('../utils/encryption');
const { logger, logHelpers } = require('../utils/logger');
const { authenticateToken, requireRole, requirePracticeAccess } = require('../middleware/auth');
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
 * @route GET /api/v1/patients
 * @desc Get patients for current practice
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
    query('search')
      .optional()
      .isLength({ max: 255 })
      .withMessage('Search term too long'),
    query('status')
      .optional()
      .isIn(['active', 'inactive', 'all'])
      .withMessage('Invalid status filter')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters', errors.array());
    }

    const { page = 1, limit = 20, search, status = 'active' } = req.query;
    const offset = (page - 1) * limit;
    const userPracticeId = req.user.practice_id;

    try {
      let query = supabase
        .from('patients')
        .select(`
          id,
          patient_id,
          first_name_encrypted,
          last_name_encrypted,
          date_of_birth_encrypted,
          phone_encrypted,
          email_encrypted,
          insurance_provider,
          insurance_member_id_encrypted,
          is_active,
          created_at,
          updated_at
        `, { count: 'exact' })
        .eq('practice_id', userPracticeId);

      // Apply status filter
      if (status !== 'all') {
        query = query.eq('is_active', status === 'active');
      }

      // Apply search filter (search on encrypted fields requires special handling)
      if (search) {
        // For now, we'll search on non-encrypted fields like patient_id and insurance_provider
        // In a production system, you might implement searchable encryption or maintain search indexes
        query = query.or(`patient_id.ilike.%${search}%,insurance_provider.ilike.%${search}%`);
      }

      // Apply pagination and ordering
      query = query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      const { data: patients, error, count } = await query;

      if (error) {
        throw new Error('Failed to fetch patients');
      }

      // Decrypt PHI data for authorized users
      const decryptedPatients = patients.map(patient => {
        try {
          return {
            id: patient.id,
            patient_id: patient.patient_id,
            first_name: encryptionService.decryptPHI(patient.first_name_encrypted),
            last_name: encryptionService.decryptPHI(patient.last_name_encrypted),
            date_of_birth: encryptionService.decryptPHI(patient.date_of_birth_encrypted),
            phone: encryptionService.decryptPHI(patient.phone_encrypted),
            email: encryptionService.decryptPHI(patient.email_encrypted),
            insurance_provider: patient.insurance_provider,
            insurance_member_id: patient.insurance_member_id_encrypted ? 
              encryptionService.decryptPHI(patient.insurance_member_id_encrypted) : null,
            is_active: patient.is_active,
            created_at: patient.created_at,
            updated_at: patient.updated_at
          };
        } catch (decryptError) {
          logger.error('Failed to decrypt patient data', {
            patientId: patient.id,
            error: decryptError.message,
            correlationId: req.correlationId
          });
          // Return patient with masked data if decryption fails
          return {
            id: patient.id,
            patient_id: patient.patient_id,
            first_name: '***',
            last_name: '***',
            date_of_birth: '***',
            phone: '***',
            email: '***',
            insurance_provider: patient.insurance_provider,
            insurance_member_id: '***',
            is_active: patient.is_active,
            created_at: patient.created_at,
            updated_at: patient.updated_at
          };
        }
      });

      // Log PHI access
      logHelpers.logPHIAccess(
        'patient_list_access',
        req.user.id,
        userPracticeId,
        {
          patientCount: patients.length,
          searchTerm: search,
          correlationId: req.correlationId
        }
      );

      res.status(200).json({
        patients: decryptedPatients,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      logger.error('Failed to fetch patients', {
        error: error.message,
        userId: req.user.id,
        practiceId: userPracticeId,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve patients');
    }
  })
);

/**
 * @route GET /api/v1/patients/:id
 * @desc Get patient by ID
 * @access Private
 */
router.get('/:id',
  [
    param('id')
      .isUUID()
      .withMessage('Invalid patient ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid patient ID', errors.array());
    }

    const { id } = req.params;
    const userPracticeId = req.user.practice_id;

    try {
      const { data: patient, error } = await supabase
        .from('patients')
        .select(`
          id,
          practice_id,
          patient_id,
          first_name_encrypted,
          last_name_encrypted,
          date_of_birth_encrypted,
          gender,
          phone_encrypted,
          email_encrypted,
          address_encrypted,
          emergency_contact_encrypted,
          insurance_provider,
          insurance_member_id_encrypted,
          insurance_group_number_encrypted,
          secondary_insurance_encrypted,
          medical_record_number_encrypted,
          is_active,
          created_at,
          updated_at,
          authorizations(
            id,
            status,
            service_type,
            requested_date,
            authorization_number
          )
        `)
        .eq('id', id)
        .eq('practice_id', userPracticeId)
        .single();

      if (error || !patient) {
        throw new NotFoundError('Patient not found');
      }

      // Decrypt PHI data
      try {
        const decryptedPatient = {
          id: patient.id,
          practice_id: patient.practice_id,
          patient_id: patient.patient_id,
          first_name: encryptionService.decryptPHI(patient.first_name_encrypted),
          last_name: encryptionService.decryptPHI(patient.last_name_encrypted),
          date_of_birth: encryptionService.decryptPHI(patient.date_of_birth_encrypted),
          gender: patient.gender,
          phone: encryptionService.decryptPHI(patient.phone_encrypted),
          email: encryptionService.decryptPHI(patient.email_encrypted),
          address: patient.address_encrypted ? 
            encryptionService.decryptPHI(patient.address_encrypted) : null,
          emergency_contact: patient.emergency_contact_encrypted ? 
            encryptionService.decryptPHI(patient.emergency_contact_encrypted) : null,
          insurance_provider: patient.insurance_provider,
          insurance_member_id: patient.insurance_member_id_encrypted ? 
            encryptionService.decryptPHI(patient.insurance_member_id_encrypted) : null,
          insurance_group_number: patient.insurance_group_number_encrypted ? 
            encryptionService.decryptPHI(patient.insurance_group_number_encrypted) : null,
          secondary_insurance: patient.secondary_insurance_encrypted ? 
            encryptionService.decryptPHI(patient.secondary_insurance_encrypted) : null,
          medical_record_number: patient.medical_record_number_encrypted ? 
            encryptionService.decryptPHI(patient.medical_record_number_encrypted) : null,
          is_active: patient.is_active,
          created_at: patient.created_at,
          updated_at: patient.updated_at,
          authorizations: patient.authorizations
        };

        // Log PHI access
        logHelpers.logPHIAccess(
          'patient_detail_access',
          req.user.id,
          userPracticeId,
          {
            patientId: id,
            correlationId: req.correlationId
          }
        );

        res.status(200).json({
          patient: decryptedPatient
        });

      } catch (decryptError) {
        logger.error('Failed to decrypt patient data', {
          patientId: id,
          error: decryptError.message,
          correlationId: req.correlationId
        });
        throw new Error('Failed to retrieve patient data');
      }

    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to fetch patient', {
        error: error.message,
        patientId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve patient');
    }
  })
);

/**
 * @route POST /api/v1/patients
 * @desc Create new patient
 * @access Private
 */
router.post('/',
  requireRole(['admin', 'provider', 'staff']),
  [
    body('first_name')
      .isLength({ min: 1, max: 100 })
      .withMessage('First name is required and must be less than 100 characters'),
    body('last_name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Last name is required and must be less than 100 characters'),
    body('date_of_birth')
      .isISO8601()
      .withMessage('Valid date of birth is required (YYYY-MM-DD)'),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
      .withMessage('Invalid gender value'),
    body('phone')
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Invalid phone number format'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('address')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Address must be less than 500 characters'),
    body('insurance_provider')
      .isLength({ min: 1, max: 100 })
      .withMessage('Insurance provider is required'),
    body('insurance_member_id')
      .isLength({ min: 1, max: 50 })
      .withMessage('Insurance member ID is required')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Patient validation failed', errors.array());
    }

    const {
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      emergency_contact,
      insurance_provider,
      insurance_member_id,
      insurance_group_number,
      secondary_insurance,
      medical_record_number
    } = req.body;

    const userPracticeId = req.user.practice_id;

    try {
      // Check for duplicate patients (same name + DOB + practice)
      const { data: existingPatients } = await supabase
        .from('patients')
        .select('id, first_name_encrypted, last_name_encrypted, date_of_birth_encrypted')
        .eq('practice_id', userPracticeId);

      // Check for duplicates by decrypting and comparing
      const isDuplicate = existingPatients?.some(existing => {
        try {
          const existingFirstName = encryptionService.decryptPHI(existing.first_name_encrypted);
          const existingLastName = encryptionService.decryptPHI(existing.last_name_encrypted);
          const existingDOB = encryptionService.decryptPHI(existing.date_of_birth_encrypted);
          
          return existingFirstName.toLowerCase() === first_name.toLowerCase() &&
                 existingLastName.toLowerCase() === last_name.toLowerCase() &&
                 existingDOB === date_of_birth;
        } catch {
          return false; // Skip if decryption fails
        }
      });

      if (isDuplicate) {
        throw new ConflictError('Patient with same name and date of birth already exists');
      }

      // Generate unique patient ID
      const patientId = `P${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Encrypt PHI data
      const encryptedData = {
        first_name_encrypted: encryptionService.encryptPHI(first_name),
        last_name_encrypted: encryptionService.encryptPHI(last_name),
        date_of_birth_encrypted: encryptionService.encryptPHI(date_of_birth),
        phone_encrypted: encryptionService.encryptPHI(phone),
        email_encrypted: encryptionService.encryptPHI(email),
        address_encrypted: address ? encryptionService.encryptPHI(address) : null,
        emergency_contact_encrypted: emergency_contact ? encryptionService.encryptPHI(emergency_contact) : null,
        insurance_member_id_encrypted: encryptionService.encryptPHI(insurance_member_id),
        insurance_group_number_encrypted: insurance_group_number ? 
          encryptionService.encryptPHI(insurance_group_number) : null,
        secondary_insurance_encrypted: secondary_insurance ? 
          encryptionService.encryptPHI(secondary_insurance) : null,
        medical_record_number_encrypted: medical_record_number ? 
          encryptionService.encryptPHI(medical_record_number) : null
      };

      // Create new patient
      const { data: newPatient, error: createError } = await supabase
        .from('patients')
        .insert({
          practice_id: userPracticeId,
          patient_id: patientId,
          gender,
          insurance_provider,
          is_active: true,
          created_by: req.user.id,
          created_at: new Date().toISOString(),
          ...encryptedData
        })
        .select()
        .single();

      if (createError) {
        logger.error('Patient creation failed', {
          error: createError.message,
          patientId,
          correlationId: req.correlationId
        });
        throw new Error('Failed to create patient');
      }

      // Prepare response with decrypted data
      const patientResponse = {
        id: newPatient.id,
        practice_id: newPatient.practice_id,
        patient_id: newPatient.patient_id,
        first_name,
        last_name,
        date_of_birth,
        gender: newPatient.gender,
        phone,
        email,
        address,
        emergency_contact,
        insurance_provider: newPatient.insurance_provider,
        insurance_member_id,
        insurance_group_number,
        secondary_insurance,
        medical_record_number,
        is_active: newPatient.is_active,
        created_at: newPatient.created_at
      };

      // Log patient creation
      logger.info('Patient created successfully', {
        patientId: newPatient.id,
        patientIdentifier: patientId,
        createdBy: req.user.id,
        practiceId: userPracticeId,
        correlationId: req.correlationId
      });

      res.status(201).json({
        message: 'Patient created successfully',
        patient: patientResponse
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ConflictError) {
        throw error;
      }
      
      logger.error('Patient creation process failed', {
        error: error.message,
        firstName: first_name,
        lastName: last_name,
        correlationId: req.correlationId
      });
      
      throw new Error('Patient creation failed');
    }
  })
);

/**
 * @route PUT /api/v1/patients/:id
 * @desc Update patient
 * @access Private
 */
router.put('/:id',
  requireRole(['admin', 'provider', 'staff']),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid patient ID format'),
    body('first_name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('First name must be less than 100 characters'),
    body('last_name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Last name must be less than 100 characters'),
    body('phone')
      .optional()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Invalid phone number format'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('address')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Address must be less than 500 characters'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Patient update validation failed', errors.array());
    }

    const { id } = req.params;
    const userPracticeId = req.user.practice_id;

    try {
      // Check if patient exists and belongs to user's practice
      const { data: existingPatient, error: fetchError } = await supabase
        .from('patients')
        .select('id, practice_id')
        .eq('id', id)
        .eq('practice_id', userPracticeId)
        .single();

      if (fetchError || !existingPatient) {
        throw new NotFoundError('Patient not found');
      }

      // Prepare update data with encryption for PHI fields
      const updateData = {
        updated_at: new Date().toISOString(),
        updated_by: req.user.id
      };

      // Encrypt PHI fields if they are being updated
      const phiFields = {
        first_name: 'first_name_encrypted',
        last_name: 'last_name_encrypted',
        phone: 'phone_encrypted',
        email: 'email_encrypted',
        address: 'address_encrypted',
        emergency_contact: 'emergency_contact_encrypted',
        insurance_member_id: 'insurance_member_id_encrypted',
        insurance_group_number: 'insurance_group_number_encrypted',
        secondary_insurance: 'secondary_insurance_encrypted',
        medical_record_number: 'medical_record_number_encrypted'
      };

      Object.keys(phiFields).forEach(field => {
        if (req.body.hasOwnProperty(field) && req.body[field] !== null) {
          updateData[phiFields[field]] = encryptionService.encryptPHI(req.body[field]);
        }
      });

      // Add non-PHI fields
      const nonPhiFields = ['gender', 'insurance_provider', 'is_active'];
      nonPhiFields.forEach(field => {
        if (req.body.hasOwnProperty(field)) {
          updateData[field] = req.body[field];
        }
      });

      // Update patient
      const { data: updatedPatient, error: updateError } = await supabase
        .from('patients')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        throw new Error('Failed to update patient');
      }

      // Log patient update
      logger.info('Patient updated successfully', {
        patientId: id,
        updatedBy: req.user.id,
        updatedFields: Object.keys(req.body),
        correlationId: req.correlationId
      });

      res.status(200).json({
        message: 'Patient updated successfully',
        patient: {
          id: updatedPatient.id,
          updated_at: updatedPatient.updated_at
        }
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Patient update failed', {
        error: error.message,
        patientId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      
      throw new Error('Patient update failed');
    }
  })
);

/**
 * @route DELETE /api/v1/patients/:id
 * @desc Deactivate patient (soft delete)
 * @access Private
 */
router.delete('/:id',
  requireRole(['admin', 'provider']),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid patient ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid patient ID', errors.array());
    }

    const { id } = req.params;
    const userPracticeId = req.user.practice_id;

    try {
      // Check if patient exists and belongs to user's practice
      const { data: patient, error: fetchError } = await supabase
        .from('patients')
        .select('id, practice_id, is_active, first_name_encrypted, last_name_encrypted')
        .eq('id', id)
        .eq('practice_id', userPracticeId)
        .single();

      if (fetchError || !patient) {
        throw new NotFoundError('Patient not found');
      }

      if (!patient.is_active) {
        throw new ValidationError('Patient is already deactivated');
      }

      // Check for active authorizations
      const { data: activeAuthorizations, error: authError } = await supabase
        .from('authorizations')
        .select('id')
        .eq('patient_id', id)
        .in('status', ['pending', 'approved']);

      if (authError) {
        throw new Error('Failed to check patient authorizations');
      }

      if (activeAuthorizations && activeAuthorizations.length > 0) {
        throw new ValidationError(
          `Cannot deactivate patient with ${activeAuthorizations.length} active authorizations. Please resolve all authorizations first.`
        );
      }

      // Soft delete (deactivate) the patient
      const { error: updateError } = await supabase
        .from('patients')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id
        })
        .eq('id', id);

      if (updateError) {
        throw new Error('Failed to deactivate patient');
      }

      // Get patient name for logging (decrypt for audit purposes)
      let patientName = 'Unknown';
      try {
        const firstName = encryptionService.decryptPHI(patient.first_name_encrypted);
        const lastName = encryptionService.decryptPHI(patient.last_name_encrypted);
        patientName = `${firstName} ${lastName}`;
      } catch (decryptError) {
        // Use patient ID if decryption fails
        patientName = `Patient ID: ${id}`;
      }

      logger.info('Patient deactivated successfully', {
        patientId: id,
        patientName,
        deactivatedBy: req.user.id,
        correlationId: req.correlationId
      });

      res.status(200).json({
        message: 'Patient deactivated successfully'
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Patient deactivation failed', {
        error: error.message,
        patientId: id,
        userId: req.user.id,
        correlationId: req.correlationId
      });
      
      throw new Error('Patient deactivation failed');
    }
  })
);

module.exports = router;