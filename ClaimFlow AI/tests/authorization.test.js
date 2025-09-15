const request = require('supertest');
const { supabase } = require('../src/database/connection');
const app = require('../src/index');

describe('Authorization API - HIPAA Compliance', () => {
  let testCorrelationId;
  let testToken;
  let testUser;
  let testPatientId;
  let testAuthorizationId;
  
  beforeEach(async () => {
    testCorrelationId = global.testUtils.generateCorrelationId();
    
    // Get test token and user
    const tokenData = await global.testUtils.createTestToken();
    testToken = tokenData.token;
    testUser = tokenData.user;
    
    // Create test patient
    const patientData = {
      firstName: 'Auth',
      lastName: 'TestPatient',
      dateOfBirth: '1985-06-15',
      ssn: '123-45-6789',
      phone: '555-123-4567',
      email: 'auth.test@email.com'
    };
    
    const patientResponse = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${testToken}`)
      .set('X-Correlation-ID', testCorrelationId)
      .send(patientData);
    
    testPatientId = patientResponse.body.data.patient_id;
  });
  
  afterEach(async () => {
    // Clean up test data
    if (testAuthorizationId) {
      await supabase
        .from('authorizations')
        .delete()
        .eq('authorization_id', testAuthorizationId);
    }
    
    if (testPatientId) {
      await supabase
        .from('patients')
        .delete()
        .eq('patient_id', testPatientId);
    }
    
    await global.testUtils.cleanupTestData(testCorrelationId);
  });

  describe('POST /api/authorizations', () => {
    test('should create prior authorization request', async () => {
      const authData = {
        patient_id: testPatientId,
        service_type: 'MRI',
        procedure_code: '70553',
        diagnosis_code: 'M54.5',
        provider_npi: '1234567890',
        requested_date: '2024-02-15',
        clinical_notes: 'Patient experiencing chronic lower back pain',
        urgency_level: 'routine',
        insurance_info: {
          member_id: 'INS123456',
          group_number: 'GRP789',
          plan_name: 'Health Plan Plus'
        }
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.authorization_id).toBeDefined();
      expect(response.body.data.status).toBe('pending');
      
      testAuthorizationId = response.body.data.authorization_id;
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authorization_created',
        action: 'create',
        resource_id: testAuthorizationId
      });
    });
    
    test('should validate required fields', async () => {
      const incompleteData = {
        patient_id: testPatientId,
        service_type: 'MRI'
        // Missing required fields
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(incompleteData);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
    
    test('should validate patient exists and belongs to practice', async () => {
      const authData = {
        patient_id: 'NON_EXISTENT_PATIENT',
        service_type: 'MRI',
        procedure_code: '70553',
        diagnosis_code: 'M54.5',
        provider_npi: '1234567890',
        requested_date: '2024-02-15'
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
    
    test('should require authentication', async () => {
      const authData = {
        patient_id: testPatientId,
        service_type: 'MRI',
        procedure_code: '70553'
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });
  
  describe('GET /api/authorizations', () => {
    beforeEach(async () => {
      // Create test authorization
      const authData = {
        patient_id: testPatientId,
        service_type: 'CT Scan',
        procedure_code: '74150',
        diagnosis_code: 'R10.9',
        provider_npi: '9876543210',
        requested_date: '2024-02-20',
        clinical_notes: 'Abdominal pain evaluation',
        urgency_level: 'urgent'
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      testAuthorizationId = response.body.data.authorization_id;
    });
    
    test('should list authorizations for practice', async () => {
      const response = await request(app)
        .get('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      const authorization = response.body.data.find(a => a.authorization_id === testAuthorizationId);
      expect(authorization).toBeDefined();
      expect(authorization.service_type).toBe('CT Scan');
      expect(authorization.procedure_code).toBe('74150');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authorization_accessed',
        action: 'list'
      });
    });
    
    test('should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/authorizations?status=pending')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // All returned authorizations should have pending status
      response.body.data.forEach(auth => {
        expect(auth.status).toBe('pending');
      });
    });
    
    test('should support filtering by patient', async () => {
      const response = await request(app)
        .get(`/api/authorizations?patient_id=${testPatientId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // All returned authorizations should be for the specified patient
      response.body.data.forEach(auth => {
        expect(auth.patient_id).toBe(testPatientId);
      });
    });
    
    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/authorizations?page=1&limit=10')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });
  });
  
  describe('GET /api/authorizations/:id', () => {
    beforeEach(async () => {
      // Create test authorization
      const authData = {
        patient_id: testPatientId,
        service_type: 'X-Ray',
        procedure_code: '73060',
        diagnosis_code: 'S72.001A',
        provider_npi: '5555555555',
        requested_date: '2024-02-25',
        clinical_notes: 'Suspected fracture evaluation',
        urgency_level: 'stat'
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      testAuthorizationId = response.body.data.authorization_id;
    });
    
    test('should retrieve authorization details', async () => {
      const response = await request(app)
        .get(`/api/authorizations/${testAuthorizationId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.authorization_id).toBe(testAuthorizationId);
      expect(response.body.data.service_type).toBe('X-Ray');
      expect(response.body.data.procedure_code).toBe('73060');
      expect(response.body.data.urgency_level).toBe('stat');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authorization_accessed',
        action: 'view',
        resource_id: testAuthorizationId
      });
    });
    
    test('should return 404 for non-existent authorization', async () => {
      const response = await request(app)
        .get('/api/authorizations/NON_EXISTENT_ID')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHORIZATION_NOT_FOUND');
    });
    
    test('should enforce practice-based access control', async () => {
      const response = await request(app)
        .get(`/api/authorizations/${testAuthorizationId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.data.practice_id).toBe(testUser.practice_id);
    });
  });
  
  describe('PUT /api/authorizations/:id', () => {
    beforeEach(async () => {
      // Create test authorization
      const authData = {
        patient_id: testPatientId,
        service_type: 'Ultrasound',
        procedure_code: '76700',
        diagnosis_code: 'R10.30',
        provider_npi: '7777777777',
        requested_date: '2024-03-01',
        clinical_notes: 'Abdominal ultrasound',
        urgency_level: 'routine'
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      testAuthorizationId = response.body.data.authorization_id;
    });
    
    test('should update authorization details', async () => {
      const updateData = {
        clinical_notes: 'Updated clinical notes with additional information',
        urgency_level: 'urgent',
        requested_date: '2024-03-02'
      };
      
      const response = await request(app)
        .put(`/api/authorizations/${testAuthorizationId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.clinical_notes).toBe('Updated clinical notes with additional information');
      expect(response.body.data.urgency_level).toBe('urgent');
      expect(response.body.data.requested_date).toBe('2024-03-02');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authorization_updated',
        action: 'update',
        resource_id: testAuthorizationId
      });
    });
    
    test('should validate update data', async () => {
      const invalidData = {
        urgency_level: 'invalid_urgency'
      };
      
      const response = await request(app)
        .put(`/api/authorizations/${testAuthorizationId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(invalidData);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
    
    test('should prevent updating immutable fields', async () => {
      const updateData = {
        authorization_id: 'NEW_ID',
        created_at: '2024-01-01T00:00:00Z'
      };
      
      const response = await request(app)
        .put(`/api/authorizations/${testAuthorizationId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(updateData);
      
      expect(response.status).toBe(200);
      // Verify immutable fields weren't changed
      expect(response.body.data.authorization_id).toBe(testAuthorizationId);
      expect(response.body.data.created_at).not.toBe('2024-01-01T00:00:00Z');
    });
  });
  
  describe('PUT /api/authorizations/:id/status', () => {
    beforeEach(async () => {
      // Create test authorization
      const authData = {
        patient_id: testPatientId,
        service_type: 'MRI',
        procedure_code: '70551',
        diagnosis_code: 'G43.909',
        provider_npi: '8888888888',
        requested_date: '2024-03-05',
        clinical_notes: 'Migraine evaluation',
        urgency_level: 'routine'
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      testAuthorizationId = response.body.data.authorization_id;
    });
    
    test('should update authorization status to approved', async () => {
      const statusData = {
        status: 'approved',
        approval_code: 'AUTH123456',
        approved_by: 'Insurance Reviewer',
        approval_notes: 'Medical necessity confirmed'
      };
      
      const response = await request(app)
        .put(`/api/authorizations/${testAuthorizationId}/status`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(statusData);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('approved');
      expect(response.body.data.approval_code).toBe('AUTH123456');
      expect(response.body.data.approved_at).toBeDefined();
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authorization_status_changed',
        action: 'approve',
        resource_id: testAuthorizationId
      });
    });
    
    test('should update authorization status to denied', async () => {
      const statusData = {
        status: 'denied',
        denial_reason: 'Medical necessity not established',
        denied_by: 'Insurance Reviewer'
      };
      
      const response = await request(app)
        .put(`/api/authorizations/${testAuthorizationId}/status`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(statusData);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('denied');
      expect(response.body.data.denial_reason).toBe('Medical necessity not established');
      expect(response.body.data.denied_at).toBeDefined();
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authorization_status_changed',
        action: 'deny',
        resource_id: testAuthorizationId
      });
    });
    
    test('should validate status transitions', async () => {
      const invalidStatusData = {
        status: 'invalid_status'
      };
      
      const response = await request(app)
        .put(`/api/authorizations/${testAuthorizationId}/status`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(invalidStatusData);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_STATUS');
    });
  });
  
  describe('Data Security and Compliance', () => {
    test('should encrypt sensitive authorization data', async () => {
      const authData = {
        patient_id: testPatientId,
        service_type: 'Sensitive Procedure',
        procedure_code: '99999',
        diagnosis_code: 'Z99.99',
        provider_npi: '1111111111',
        requested_date: '2024-03-10',
        clinical_notes: 'Highly sensitive clinical information',
        urgency_level: 'routine'
      };
      
      const response = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      testAuthorizationId = response.body.data.authorization_id;
      
      // Check raw database data
      const { data: dbAuth } = await supabase
        .from('authorizations')
        .select('encrypted_data')
        .eq('authorization_id', testAuthorizationId)
        .single();
      
      // Verify sensitive data is encrypted
      const encryptedData = dbAuth.encrypted_data;
      expect(encryptedData).not.toContain('Highly sensitive clinical information');
      expect(encryptedData).not.toContain('Sensitive Procedure');
    });
    
    test('should maintain audit trail for all operations', async () => {
      // Create authorization
      const authData = {
        patient_id: testPatientId,
        service_type: 'Audit Test',
        procedure_code: '00000',
        diagnosis_code: 'Z00.00',
        provider_npi: '0000000000',
        requested_date: '2024-03-15'
      };
      
      const createResponse = await request(app)
        .post('/api/authorizations')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(authData);
      
      testAuthorizationId = createResponse.body.data.authorization_id;
      
      // View authorization
      await request(app)
        .get(`/api/authorizations/${testAuthorizationId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      // Update authorization
      await request(app)
        .put(`/api/authorizations/${testAuthorizationId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send({ clinical_notes: 'Updated notes' });
      
      // Verify all operations are audited
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('correlation_id', testCorrelationId)
        .eq('resource_id', testAuthorizationId);
      
      expect(auditLogs.length).toBeGreaterThanOrEqual(3);
      
      const eventTypes = auditLogs.map(log => log.event_type);
      expect(eventTypes).toContain('authorization_created');
      expect(eventTypes).toContain('authorization_accessed');
      expect(eventTypes).toContain('authorization_updated');
    });
  });
});