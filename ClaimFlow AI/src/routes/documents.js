const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { supabase } = require('../database/connection');
const { encryptionService } = require('../utils/encryption');
const { logger, logHelpers } = require('../utils/logger');
const { authenticateToken, requireRole } = require('../middleware/auth');
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

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 5 // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types for healthcare documents
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

/**
 * @route GET /api/v1/documents
 * @desc Get documents for current practice
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
    query('authorization_id')
      .optional()
      .isUUID()
      .withMessage('Invalid authorization ID format'),
    query('document_type')
      .optional()
      .isIn(['medical_record', 'insurance_card', 'referral', 'lab_result', 'imaging', 'consent_form', 'other'])
      .withMessage('Invalid document type'),
    query('patient_id')
      .optional()
      .isUUID()
      .withMessage('Invalid patient ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters', errors.array());
    }

    const { 
      page = 1, 
      limit = 20, 
      authorization_id, 
      document_type, 
      patient_id 
    } = req.query;
    const offset = (page - 1) * limit;
    const userPracticeId = req.user.practice_id;
    const userRole = req.user.role;
    const userId = req.user.id;

    try {
      let query = supabase
        .from('documents')
        .select(`
          id,
          authorization_id,
          document_type,
          file_name,
          file_size,
          mime_type,
          is_encrypted,
          uploaded_at,
          uploaded_by,
          authorizations!inner(
            id,
            authorization_number,
            patient_id,
            provider_id,
            patients!inner(
              id,
              patient_id,
              first_name_encrypted,
              last_name_encrypted
            )
          )
        `, { count: 'exact' })
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only see documents for their authorizations
      if (userRole === 'provider') {
        query = query.eq('authorizations.provider_id', userId);
      }

      // Apply filters
      if (authorization_id) {
        query = query.eq('authorization_id', authorization_id);
      }

      if (document_type) {
        query = query.eq('document_type', document_type);
      }

      if (patient_id) {
        query = query.eq('authorizations.patient_id', patient_id);
      }

      // Apply pagination and ordering
      query = query
        .range(offset, offset + limit - 1)
        .order('uploaded_at', { ascending: false });

      const { data: documents, error, count } = await query;

      if (error) {
        throw new Error('Failed to fetch documents');
      }

      // Process documents and decrypt patient names
      const processedDocuments = documents.map(doc => {
        try {
          const patientFirstName = encryptionService.decryptPHI(
            doc.authorizations.patients.first_name_encrypted
          );
          const patientLastName = encryptionService.decryptPHI(
            doc.authorizations.patients.last_name_encrypted
          );

          return {
            id: doc.id,
            authorization_id: doc.authorization_id,
            authorization_number: doc.authorizations.authorization_number,
            patient: {
              id: doc.authorizations.patients.id,
              patient_id: doc.authorizations.patients.patient_id,
              name: `${patientFirstName} ${patientLastName}`
            },
            document_type: doc.document_type,
            file_name: doc.file_name,
            file_size: doc.file_size,
            mime_type: doc.mime_type,
            is_encrypted: doc.is_encrypted,
            uploaded_at: doc.uploaded_at,
            uploaded_by: doc.uploaded_by
          };
        } catch (decryptError) {
          logger.error('Failed to decrypt patient data in document list', {
            documentId: doc.id,
            error: decryptError.message,
            correlationId: req.correlationId
          });
          return {
            ...doc,
            patient: {
              id: doc.authorizations.patients.id,
              patient_id: doc.authorizations.patients.patient_id,
              name: '*** ***'
            }
          };
        }
      });

      // Log document access
      logHelpers.logPHIAccess(
        'document_list_access',
        userId,
        userPracticeId,
        {
          documentCount: documents.length,
          filters: { authorization_id, document_type, patient_id },
          correlationId: req.correlationId
        }
      );

      res.status(200).json({
        documents: processedDocuments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      logger.error('Failed to fetch documents', {
        error: error.message,
        userId,
        practiceId: userPracticeId,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve documents');
    }
  })
);

/**
 * @route GET /api/v1/documents/:id
 * @desc Get document metadata by ID
 * @access Private
 */
router.get('/:id',
  [
    param('id')
      .isUUID()
      .withMessage('Invalid document ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid document ID', errors.array());
    }

    const { id } = req.params;
    const userPracticeId = req.user.practice_id;
    const userRole = req.user.role;
    const userId = req.user.id;

    try {
      let query = supabase
        .from('documents')
        .select(`
          *,
          authorizations!inner(
            id,
            authorization_number,
            patient_id,
            provider_id,
            patients!inner(
              id,
              patient_id,
              first_name_encrypted,
              last_name_encrypted
            ),
            providers!inner(
              id,
              name
            )
          )
        `)
        .eq('id', id)
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only see documents for their authorizations
      if (userRole === 'provider') {
        query = query.eq('authorizations.provider_id', userId);
      }

      const { data: document, error } = await query.single();

      if (error || !document) {
        throw new NotFoundError('Document not found');
      }

      // Decrypt patient name
      try {
        const patientFirstName = encryptionService.decryptPHI(
          document.authorizations.patients.first_name_encrypted
        );
        const patientLastName = encryptionService.decryptPHI(
          document.authorizations.patients.last_name_encrypted
        );

        const processedDocument = {
          id: document.id,
          authorization: {
            id: document.authorizations.id,
            authorization_number: document.authorizations.authorization_number,
            patient: {
              id: document.authorizations.patients.id,
              patient_id: document.authorizations.patients.patient_id,
              name: `${patientFirstName} ${patientLastName}`
            },
            provider: {
              id: document.authorizations.providers.id,
              name: document.authorizations.providers.name
            }
          },
          document_type: document.document_type,
          file_name: document.file_name,
          file_size: document.file_size,
          mime_type: document.mime_type,
          is_encrypted: document.is_encrypted,
          checksum: document.checksum,
          uploaded_at: document.uploaded_at,
          uploaded_by: document.uploaded_by,
          created_at: document.created_at
        };

        // Log document access
        logHelpers.logPHIAccess(
          'document_detail_access',
          userId,
          userPracticeId,
          {
            documentId: id,
            authorizationId: document.authorization_id,
            patientId: document.authorizations.patient_id,
            correlationId: req.correlationId
          }
        );

        res.status(200).json({
          document: processedDocument
        });

      } catch (decryptError) {
        logger.error('Failed to decrypt patient data in document detail', {
          documentId: id,
          error: decryptError.message,
          correlationId: req.correlationId
        });
        throw new Error('Failed to retrieve document data');
      }

    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to fetch document', {
        error: error.message,
        documentId: id,
        userId,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve document');
    }
  })
);

/**
 * @route POST /api/v1/documents/upload
 * @desc Upload documents for an authorization
 * @access Private
 */
router.post('/upload',
  requireRole(['admin', 'provider', 'staff']),
  upload.array('files', 5),
  [
    body('authorization_id')
      .isUUID()
      .withMessage('Valid authorization ID is required'),
    body('document_type')
      .isIn(['medical_record', 'insurance_card', 'referral', 'lab_result', 'imaging', 'consent_form', 'other'])
      .withMessage('Invalid document type'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description too long')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Document upload validation failed', errors.array());
    }

    if (!req.files || req.files.length === 0) {
      throw new ValidationError('No files uploaded');
    }

    const { authorization_id, document_type, description } = req.body;
    const userPracticeId = req.user.practice_id;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
      // Verify authorization exists and belongs to practice
      let authQuery = supabase
        .from('authorizations')
        .select('id, practice_id, provider_id, patient_id')
        .eq('id', authorization_id)
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only upload to their own authorizations
      if (userRole === 'provider') {
        authQuery = authQuery.eq('provider_id', userId);
      }

      const { data: authorization, error: authError } = await authQuery.single();

      if (authError || !authorization) {
        throw new ValidationError('Authorization not found or access denied');
      }

      const uploadedDocuments = [];
      const uploadErrors = [];

      // Process each uploaded file
      for (const file of req.files) {
        try {
          // Generate unique filename
          const fileExtension = path.extname(file.originalname);
          const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
          
          // Calculate file checksum
          const checksum = encryptionService.calculateChecksum(file.buffer);
          
          // Encrypt file content
          const encryptedBuffer = encryptionService.encryptFile(file.buffer);
          
          // Create secure storage path
          const storagePath = path.join(
            process.env.DOCUMENT_STORAGE_PATH || './storage/documents',
            userPracticeId,
            authorization_id
          );
          
          // Ensure directory exists
          await fs.mkdir(storagePath, { recursive: true });
          
          // Save encrypted file
          const filePath = path.join(storagePath, uniqueFilename);
          await fs.writeFile(filePath, encryptedBuffer);
          
          // Save document metadata to database
          const { data: newDocument, error: createError } = await supabase
            .from('documents')
            .insert({
              practice_id: userPracticeId,
              authorization_id,
              document_type,
              file_name: file.originalname,
              stored_filename: uniqueFilename,
              file_path: filePath,
              file_size: file.size,
              mime_type: file.mimetype,
              is_encrypted: true,
              checksum,
              description,
              uploaded_by: userId,
              uploaded_at: new Date().toISOString()
            })
            .select()
            .single();

          if (createError) {
            // Clean up file if database insert fails
            await fs.unlink(filePath).catch(() => {});
            throw new Error(`Failed to save document metadata: ${createError.message}`);
          }

          uploadedDocuments.push({
            id: newDocument.id,
            file_name: newDocument.file_name,
            file_size: newDocument.file_size,
            document_type: newDocument.document_type,
            uploaded_at: newDocument.uploaded_at
          });

          // Log document upload
          logger.info('Document uploaded successfully', {
            documentId: newDocument.id,
            fileName: file.originalname,
            fileSize: file.size,
            authorizationId: authorization_id,
            uploadedBy: userId,
            correlationId: req.correlationId
          });

        } catch (fileError) {
          logger.error('Failed to upload document', {
            fileName: file.originalname,
            error: fileError.message,
            authorizationId: authorization_id,
            correlationId: req.correlationId
          });
          
          uploadErrors.push({
            file_name: file.originalname,
            error: fileError.message
          });
        }
      }

      // Return results
      const response = {
        message: `${uploadedDocuments.length} document(s) uploaded successfully`,
        uploaded_documents: uploadedDocuments
      };

      if (uploadErrors.length > 0) {
        response.errors = uploadErrors;
        response.message += `, ${uploadErrors.length} failed`;
      }

      const statusCode = uploadedDocuments.length > 0 ? 201 : 400;
      res.status(statusCode).json(response);

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      logger.error('Document upload process failed', {
        error: error.message,
        authorizationId: authorization_id,
        fileCount: req.files.length,
        correlationId: req.correlationId
      });
      
      throw new Error('Document upload failed');
    }
  })
);

/**
 * @route GET /api/v1/documents/:id/download
 * @desc Download document file
 * @access Private
 */
router.get('/:id/download',
  [
    param('id')
      .isUUID()
      .withMessage('Invalid document ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid document ID', errors.array());
    }

    const { id } = req.params;
    const userPracticeId = req.user.practice_id;
    const userRole = req.user.role;
    const userId = req.user.id;

    try {
      // Get document metadata with authorization check
      let query = supabase
        .from('documents')
        .select(`
          *,
          authorizations!inner(
            id,
            provider_id,
            patient_id
          )
        `)
        .eq('id', id)
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only download documents for their authorizations
      if (userRole === 'provider') {
        query = query.eq('authorizations.provider_id', userId);
      }

      const { data: document, error } = await query.single();

      if (error || !document) {
        throw new NotFoundError('Document not found');
      }

      // Read and decrypt file
      const encryptedBuffer = await fs.readFile(document.file_path);
      const decryptedBuffer = encryptionService.decryptFile(encryptedBuffer);
      
      // Verify file integrity
      const currentChecksum = encryptionService.calculateChecksum(decryptedBuffer);
      if (currentChecksum !== document.checksum) {
        logger.error('Document integrity check failed', {
          documentId: id,
          expectedChecksum: document.checksum,
          actualChecksum: currentChecksum,
          correlationId: req.correlationId
        });
        throw new Error('Document integrity verification failed');
      }

      // Log document download
      logHelpers.logDataExport(
        'document_download',
        userId,
        userPracticeId,
        {
          documentId: id,
          fileName: document.file_name,
          authorizationId: document.authorization_id,
          patientId: document.authorizations.patient_id,
          correlationId: req.correlationId
        }
      );

      // Set response headers
      res.setHeader('Content-Type', document.mime_type);
      res.setHeader('Content-Length', decryptedBuffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      
      // Send file
      res.send(decryptedBuffer);

    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Document download failed', {
        error: error.message,
        documentId: id,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Document download failed');
    }
  })
);

/**
 * @route DELETE /api/v1/documents/:id
 * @desc Delete document
 * @access Private
 */
router.delete('/:id',
  requireRole(['admin', 'provider']),
  [
    param('id')
      .isUUID()
      .withMessage('Invalid document ID format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid document ID', errors.array());
    }

    const { id } = req.params;
    const userPracticeId = req.user.practice_id;
    const userRole = req.user.role;
    const userId = req.user.id;

    try {
      // Get document with authorization check
      let query = supabase
        .from('documents')
        .select(`
          *,
          authorizations!inner(
            id,
            provider_id
          )
        `)
        .eq('id', id)
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only delete documents for their authorizations
      if (userRole === 'provider') {
        query = query.eq('authorizations.provider_id', userId);
      }

      const { data: document, error: fetchError } = await query.single();

      if (fetchError || !document) {
        throw new NotFoundError('Document not found');
      }

      // Delete file from storage
      try {
        await fs.unlink(document.file_path);
      } catch (fileError) {
        logger.warn('Failed to delete physical file', {
          documentId: id,
          filePath: document.file_path,
          error: fileError.message,
          correlationId: req.correlationId
        });
      }

      // Delete document record from database
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (deleteError) {
        throw new Error('Failed to delete document record');
      }

      // Log document deletion
      logger.info('Document deleted successfully', {
        documentId: id,
        fileName: document.file_name,
        authorizationId: document.authorization_id,
        deletedBy: userId,
        correlationId: req.correlationId
      });

      res.status(200).json({
        message: 'Document deleted successfully'
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Document deletion failed', {
        error: error.message,
        documentId: id,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Document deletion failed');
    }
  })
);

/**
 * @route GET /api/v1/documents/stats
 * @desc Get document statistics for practice
 * @access Private
 */
router.get('/stats',
  asyncHandler(async (req, res) => {
    const userPracticeId = req.user.practice_id;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
      let query = supabase
        .from('documents')
        .select('id, document_type, file_size, uploaded_at, authorizations!inner(provider_id)')
        .eq('practice_id', userPracticeId);

      // Non-admin providers can only see their own stats
      if (userRole === 'provider') {
        query = query.eq('authorizations.provider_id', userId);
      }

      const { data: documents, error } = await query;

      if (error) {
        throw new Error('Failed to fetch document statistics');
      }

      // Calculate statistics
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      const stats = {
        total_documents: documents.length,
        total_storage_bytes: documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0),
        by_type: {
          medical_record: documents.filter(d => d.document_type === 'medical_record').length,
          insurance_card: documents.filter(d => d.document_type === 'insurance_card').length,
          referral: documents.filter(d => d.document_type === 'referral').length,
          lab_result: documents.filter(d => d.document_type === 'lab_result').length,
          imaging: documents.filter(d => d.document_type === 'imaging').length,
          consent_form: documents.filter(d => d.document_type === 'consent_form').length,
          other: documents.filter(d => d.document_type === 'other').length
        },
        recent: {
          uploaded_last_30_days: documents.filter(d => 
            new Date(d.uploaded_at) >= thirtyDaysAgo
          ).length
        }
      };

      // Convert storage size to human readable format
      const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      stats.total_storage_formatted = formatBytes(stats.total_storage_bytes);

      res.status(200).json({
        practice_id: userPracticeId,
        statistics: stats,
        generated_at: now.toISOString()
      });

    } catch (error) {
      logger.error('Failed to fetch document statistics', {
        error: error.message,
        userId,
        practiceId: userPracticeId,
        correlationId: req.correlationId
      });
      throw new Error('Failed to retrieve document statistics');
    }
  })
);

module.exports = router;