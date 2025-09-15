const express = require('express');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { validateInput } = require('../middleware/validation');
const WorkflowEngine = require('../services/workflowEngine');
const LookupService = require('../services/lookupService');
const PayerRulesEngine = require('../services/payerRulesEngine');
const FHIRService = require('../services/fhirService');
const APIGateway = require('../services/apiGateway');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Rate limiting
const dashboardLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many dashboard requests'
});

const createLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 authorization requests per minute
  message: 'Too many authorization creation requests'
});

// Initialize services
let workflowEngine, lookupService, payerRulesEngine, fhirService, apiGateway;

// Initialize services on startup
const initializeServices = async () => {
  try {
    workflowEngine = new WorkflowEngine(pool);
    lookupService = new LookupService(pool);
    payerRulesEngine = new PayerRulesEngine(pool);
    fhirService = new FHIRService();
    apiGateway = new APIGateway(pool);
    
    await workflowEngine.initialize();
    await lookupService.initialize();
    await payerRulesEngine.initialize();
    await fhirService.initialize();
    await apiGateway.initialize();
    
    console.log('Authorization services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize authorization services:', error);
  }
};

initializeServices();

// Dashboard overview
router.get('/dashboard', 
  dashboardLimiter,
  authenticateToken,
  requireRole(['admin', 'staff', 'provider']),
  auditLog('authorization_dashboard_view'),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status, priority, search } = req.query;
      const offset = (page - 1) * limit;
      
      // Build query conditions
      let whereConditions = ['1=1'];
      let queryParams = [];
      let paramIndex = 1;
      
      if (status && status !== 'all') {
        whereConditions.push(`ar.status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }
      
      if (priority && priority !== 'all') {
        whereConditions.push(`ar.priority = $${paramIndex}`);
        queryParams.push(priority);
        paramIndex++;
      }
      
      if (search) {
        whereConditions.push(`(
          ar.patient_name ILIKE $${paramIndex} OR 
          ar.provider_name ILIKE $${paramIndex} OR 
          ar.service_type ILIKE $${paramIndex} OR 
          ar.id::text ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }
      
      const whereClause = whereConditions.join(' AND ');
      
      // Get authorizations with pagination
      const authQuery = `
        SELECT 
          ar.*,
          p.name as payer_name,
          pr.name as practice_name,
          COUNT(*) OVER() as total_count
        FROM authorization_requests ar
        LEFT JOIN payer_requirements p ON ar.payer_id = p.id
        LEFT JOIN providers pr ON ar.provider_npi = pr.npi
        WHERE ${whereClause}
        ORDER BY ar.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      queryParams.push(limit, offset);
      
      const authResult = await pool.query(authQuery, queryParams);
      
      // Get statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'approved') as approved,
          COUNT(*) FILTER (WHERE status = 'denied') as denied,
          COUNT(*) FILTER (WHERE status = 'expired') as expired
        FROM authorization_requests
        WHERE ${whereConditions.slice(0, -2).join(' AND ') || '1=1'}
      `;
      
      const statsResult = await pool.query(statsQuery, queryParams.slice(0, -2));
      
      res.json({
        success: true,
        authorizations: authResult.rows,
        stats: statsResult.rows[0],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: authResult.rows[0]?.total_count || 0,
          totalPages: Math.ceil((authResult.rows[0]?.total_count || 0) / limit)
        }
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ success: false, error: 'Failed to load dashboard' });
    }
  }
);

// Get authorization details
router.get('/:id', 
  authenticateToken,
  requireRole(['admin', 'staff', 'provider']),
  auditLog('authorization_view'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get authorization details
      const authQuery = `
        SELECT 
          ar.*,
          p.name as payer_name,
          p.requirements as payer_requirements,
          pr.name as practice_name,
          pr.address as practice_address
        FROM authorization_requests ar
        LEFT JOIN payer_requirements p ON ar.payer_id = p.id
        LEFT JOIN providers pr ON ar.provider_npi = pr.npi
        WHERE ar.id = $1
      `;
      
      const authResult = await pool.query(authQuery, [id]);
      
      if (authResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Authorization not found' });
      }
      
      // Get workflow history
      const workflowQuery = `
        SELECT * FROM workflow_states 
        WHERE authorization_id = $1 
        ORDER BY created_at ASC
      `;
      
      const workflowResult = await pool.query(workflowQuery, [id]);
      
      // Get FHIR resources
      const fhirQuery = `
        SELECT * FROM fhir_resources 
        WHERE authorization_id = $1 
        ORDER BY created_at DESC
      `;
      
      const fhirResult = await pool.query(fhirQuery, [id]);
      
      res.json({
        success: true,
        authorization: authResult.rows[0],
        workflow: workflowResult.rows,
        fhirResources: fhirResult.rows
      });
    } catch (error) {
      console.error('Authorization details error:', error);
      res.status(500).json({ success: false, error: 'Failed to load authorization details' });
    }
  }
);

// Create new authorization request
router.post('/', 
  createLimiter,
  authenticateToken,
  requireRole(['admin', 'staff', 'provider']),
  validateInput({
    patient_name: { required: true, type: 'string', minLength: 2 },
    patient_dob: { required: true, type: 'date' },
    patient_insurance_id: { required: true, type: 'string' },
    provider_npi: { required: true, type: 'string', pattern: /^\d{10}$/ },
    service_type: { required: true, type: 'string' },
    cpt_codes: { required: true, type: 'array' },
    diagnosis_codes: { required: true, type: 'array' },
    service_date: { required: true, type: 'date' },
    estimated_cost: { required: false, type: 'number', min: 0 }
  }),
  auditLog('authorization_create'),
  async (req, res) => {
    try {
      const authData = req.body;
      authData.created_by = req.user.id;
      
      // Create authorization request using workflow engine
      const authorization = await workflowEngine.createAuthorizationRequest(authData);
      
      res.status(201).json({
        success: true,
        authorization,
        message: 'Authorization request created successfully'
      });
    } catch (error) {
      console.error('Authorization creation error:', error);
      res.status(500).json({ success: false, error: 'Failed to create authorization request' });
    }
  }
);

// Update authorization status
router.patch('/:id/status', 
  authenticateToken,
  requireRole(['admin', 'staff']),
  validateInput({
    status: { required: true, type: 'string', enum: ['pending', 'approved', 'denied', 'expired'] },
    notes: { required: false, type: 'string' }
  }),
  auditLog('authorization_status_update'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      
      // Update authorization status
      const updateQuery = `
        UPDATE authorization_requests 
        SET status = $1, notes = $2, updated_at = NOW(), updated_by = $3
        WHERE id = $4
        RETURNING *
      `;
      
      const result = await pool.query(updateQuery, [status, notes, req.user.id, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Authorization not found' });
      }
      
      // Advance workflow state
      await workflowEngine.advanceWorkflowState(id, status, {
        updated_by: req.user.id,
        notes
      });
      
      res.json({
        success: true,
        authorization: result.rows[0],
        message: 'Authorization status updated successfully'
      });
    } catch (error) {
      console.error('Status update error:', error);
      res.status(500).json({ success: false, error: 'Failed to update authorization status' });
    }
  }
);

// Submit to payer
router.post('/:id/submit', 
  authenticateToken,
  requireRole(['admin', 'staff']),
  auditLog('authorization_submit'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get authorization details
      const authQuery = `
        SELECT ar.*, p.api_endpoint, p.api_key_encrypted 
        FROM authorization_requests ar
        JOIN payer_requirements p ON ar.payer_id = p.id
        WHERE ar.id = $1
      `;
      
      const authResult = await pool.query(authQuery, [id]);
      
      if (authResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Authorization not found' });
      }
      
      const authorization = authResult.rows[0];
      
      // Submit to payer via API gateway
      const submissionResult = await apiGateway.submitAuthorization(authorization);
      
      // Update authorization with submission details
      const updateQuery = `
        UPDATE authorization_requests 
        SET 
          status = 'submitted',
          payer_reference_id = $1,
          submitted_at = NOW(),
          updated_at = NOW(),
          updated_by = $2
        WHERE id = $3
        RETURNING *
      `;
      
      const result = await pool.query(updateQuery, [
        submissionResult.referenceId,
        req.user.id,
        id
      ]);
      
      res.json({
        success: true,
        authorization: result.rows[0],
        submission: submissionResult,
        message: 'Authorization submitted to payer successfully'
      });
    } catch (error) {
      console.error('Submission error:', error);
      res.status(500).json({ success: false, error: 'Failed to submit authorization to payer' });
    }
  }
);

// Export authorizations
router.post('/export', 
  authenticateToken,
  requireRole(['admin', 'staff']),
  auditLog('authorization_export'),
  async (req, res) => {
    try {
      const { filters = {} } = req.body;
      
      // Build query based on filters
      let whereConditions = ['1=1'];
      let queryParams = [];
      let paramIndex = 1;
      
      if (filters.status && filters.status !== 'all') {
        whereConditions.push(`ar.status = $${paramIndex}`);
        queryParams.push(filters.status);
        paramIndex++;
      }
      
      if (filters.priority && filters.priority !== 'all') {
        whereConditions.push(`ar.priority = $${paramIndex}`);
        queryParams.push(filters.priority);
        paramIndex++;
      }
      
      if (filters.search) {
        whereConditions.push(`(
          ar.patient_name ILIKE $${paramIndex} OR 
          ar.provider_name ILIKE $${paramIndex} OR 
          ar.service_type ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${filters.search}%`);
        paramIndex++;
      }
      
      const whereClause = whereConditions.join(' AND ');
      
      const exportQuery = `
        SELECT 
          ar.id,
          ar.patient_name,
          ar.patient_dob,
          ar.provider_name,
          ar.provider_npi,
          ar.service_type,
          ar.cpt_codes,
          ar.diagnosis_codes,
          ar.status,
          ar.priority,
          ar.estimated_cost,
          ar.created_at,
          ar.due_date,
          p.name as payer_name
        FROM authorization_requests ar
        LEFT JOIN payer_requirements p ON ar.payer_id = p.id
        WHERE ${whereClause}
        ORDER BY ar.created_at DESC
      `;
      
      const result = await pool.query(exportQuery, queryParams);
      
      // Convert to CSV
      const headers = [
        'ID', 'Patient Name', 'Patient DOB', 'Provider Name', 'Provider NPI',
        'Service Type', 'CPT Codes', 'Diagnosis Codes', 'Status', 'Priority',
        'Estimated Cost', 'Created At', 'Due Date', 'Payer Name'
      ];
      
      const csvRows = [headers.join(',')];
      
      result.rows.forEach(row => {
        const values = [
          row.id,
          `"${row.patient_name}"`,
          row.patient_dob,
          `"${row.provider_name}"`,
          row.provider_npi,
          `"${row.service_type}"`,
          `"${Array.isArray(row.cpt_codes) ? row.cpt_codes.join(';') : row.cpt_codes}"`,
          `"${Array.isArray(row.diagnosis_codes) ? row.diagnosis_codes.join(';') : row.diagnosis_codes}"`,
          row.status,
          row.priority,
          row.estimated_cost || '',
          row.created_at,
          row.due_date,
          `"${row.payer_name || ''}"`
        ];
        csvRows.push(values.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="authorizations-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ success: false, error: 'Failed to export authorizations' });
    }
  }
);

// Patient/Provider lookup endpoints
router.get('/lookup/patients', 
  authenticateToken,
  requireRole(['admin', 'staff', 'provider']),
  async (req, res) => {
    try {
      const { query } = req.query;
      const patients = await lookupService.searchPatients(query);
      res.json({ success: true, patients });
    } catch (error) {
      console.error('Patient lookup error:', error);
      res.status(500).json({ success: false, error: 'Failed to search patients' });
    }
  }
);

router.get('/lookup/providers', 
  authenticateToken,
  requireRole(['admin', 'staff']),
  async (req, res) => {
    try {
      const { query } = req.query;
      const providers = await lookupService.searchProviders(query);
      res.json({ success: true, providers });
    } catch (error) {
      console.error('Provider lookup error:', error);
      res.status(500).json({ success: false, error: 'Failed to search providers' });
    }
  }
);

router.get('/lookup/payers', 
  authenticateToken,
  requireRole(['admin', 'staff', 'provider']),
  async (req, res) => {
    try {
      const { query } = req.query;
      const payers = await lookupService.searchPayers(query);
      res.json({ success: true, payers });
    } catch (error) {
      console.error('Payer lookup error:', error);
      res.status(500).json({ success: false, error: 'Failed to search payers' });
    }
  }
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Authorization route error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;