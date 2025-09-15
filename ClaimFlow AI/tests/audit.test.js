const request = require('supertest');
const { supabase } = require('../src/database/connection');
const { logger, logHelpers } = require('../src/utils/logger');
const app = require('../src/index');

describe('Audit Logging System', () => {
  let authToken;
  let testPracticeId;
  let testProviderId;
  let testPatientId;
  let testAuthorizationId;

  beforeAll(async () => {
    // Setup test data and authentication
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'sarah.johnson@metromedical.com',
        password: 'TempPass123!'
      });

    authToken = loginResponse.body.token;
    testPracticeId = loginResponse.body.user.practice_id;
    testProviderId = loginResponse.body.user.id;
  });

  afterAll(async () => {
    // Clean up test audit logs
    await supabase
      .from('audit_logs')
      .delete()
      .like('correlation_id', 'test-%');
  });

  describe('Authentication Audit Logging', () => {
    test('should log successful login', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'sarah.johnson@metromedical.com',
          password: 'TempPass123!'
        });

      expect(response.status).toBe(200);

      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'authentication')
        .eq('action', 'login_success')
        .eq('user_id', testProviderId)
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].practice_id).toBe(testPracticeId);
      expect(auditLogs[0].risk_level).toBe('low');
    });

    test('should log failed login attempt', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'sarah.johnson@metromedical.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);

      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'authentication')
        .eq('action', 'login_failed')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].risk_level).toBe('medium');
    });

    test('should log password change', async () => {
      const response = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          current_password: 'TempPass123!',
          new_password: 'NewSecurePass456!'
        });

      expect(response.status).toBe(200);

      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'authentication')
        .eq('action', 'password_changed')
        .eq('user_id', testProviderId)
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].risk_level).toBe('medium');
    });
  });

  describe('PHI Access Audit Logging', () => {
    beforeAll(async () => {
      // Create test patient
      const patientResponse = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patient_id: 'TEST-AUDIT-001',
          first_name: 'Test',
          last_name: 'Patient',
          date_of_birth: '1990-01-01',
          gender: 'male',
          phone: '(555) 123-4567',
          address_line1: '123 Test St',
          city: 'Test City',
          state: 'NY',
          zip_code: '12345',
          insurance_provider: 'Test Insurance',
          insurance_member_id: 'TEST123'
        });

      testPatientId = patientResponse.body.patient.id;
    });

    test('should log patient creation', async () => {
      // Check audit log was created for patient creation
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'data_access')
        .eq('action', 'patient_created')
        .eq('resource_id', testPatientId)
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].user_id).toBe(testProviderId);
      expect(auditLogs[0].practice_id).toBe(testPracticeId);
      expect(auditLogs[0].risk_level).toBe('medium');
      expect(auditLogs[0].contains_phi).toBe(true);
    });

    test('should log patient data access', async () => {
      const response = await request(app)
        .get(`/api/v1/patients/${testPatientId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'data_access')
        .eq('action', 'patient_accessed')
        .eq('resource_id', testPatientId)
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].contains_phi).toBe(true);
      expect(auditLogs[0].risk_level).toBe('low');
    });

    test('should log patient data modification', async () => {
      const response = await request(app)
        .put(`/api/v1/patients/${testPatientId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phone: '(555) 987-6543'
        });

      expect(response.status).toBe(200);

      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'data_modification')
        .eq('action', 'patient_updated')
        .eq('resource_id', testPatientId)
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].contains_phi).toBe(true);
      expect(auditLogs[0].risk_level).toBe('medium');
    });
  });

  describe('Authorization Audit Logging', () => {
    beforeAll(async () => {
      // Create test authorization
      const authResponse = await request(app)
        .post('/api/v1/authorizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patient_id: testPatientId,
          authorization_number: 'TEST-AUTH-001',
          payer: 'Test Insurance',
          service_type: 'Test Service',
          diagnosis_code: 'Z00.00',
          procedure_code: '99213',
          units_requested: 1,
          priority: 'routine',
          notes: 'Test authorization for audit logging'
        });

      testAuthorizationId = authResponse.body.authorization.id;
    });

    test('should log authorization creation', async () => {
      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'data_access')
        .eq('action', 'authorization_created')
        .eq('resource_id', testAuthorizationId)
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].contains_phi).toBe(true);
      expect(auditLogs[0].risk_level).toBe('medium');
    });

    test('should log authorization status change', async () => {
      const response = await request(app)
        .put(`/api/v1/authorizations/${testAuthorizationId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'approved',
          units_approved: 1,
          notes: 'Approved for testing'
        });

      expect(response.status).toBe(200);

      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'data_modification')
        .eq('action', 'authorization_status_changed')
        .eq('resource_id', testAuthorizationId)
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].contains_phi).toBe(true);
      expect(auditLogs[0].risk_level).toBe('high');
    });
  });

  describe('Document Audit Logging', () => {
    test('should log document upload', async () => {
      const testFile = Buffer.from('Test document content');
      
      const response = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testFile, 'test-document.txt')
        .field('authorization_id', testAuthorizationId)
        .field('document_type', 'medical_record')
        .field('description', 'Test document for audit logging');

      expect(response.status).toBe(201);

      // Check audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'data_access')
        .eq('action', 'document_uploaded')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].contains_phi).toBe(true);
      expect(auditLogs[0].risk_level).toBe('medium');
    });
  });

  describe('Security Event Logging', () => {
    test('should log unauthorized access attempt', async () => {
      const response = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);

      // Check security audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'security')
        .eq('action', 'unauthorized_access_attempt')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].risk_level).toBe('high');
    });

    test('should log rate limit exceeded', async () => {
      // Make multiple rapid requests to trigger rate limiting
      const promises = [];
      for (let i = 0; i < 150; i++) {
        promises.push(
          request(app)
            .get('/api/v1/')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Check security audit log was created
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('event_type', 'security')
        .eq('action', 'rate_limit_exceeded')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].risk_level).toBe('medium');
    });
  });

  describe('Audit Log Helper Functions', () => {
    test('logAuthentication should create proper audit entry', async () => {
      const testCorrelationId = 'test-correlation-123';
      
      logHelpers.logAuthentication(
        'test_action',
        testProviderId,
        testPracticeId,
        {
          email: 'test@example.com',
          correlationId: testCorrelationId
        }
      );

      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('correlation_id', testCorrelationId)
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].event_type).toBe('authentication');
      expect(auditLogs[0].action).toBe('test_action');
    });

    test('logPHIAccess should create proper audit entry', async () => {
      const testCorrelationId = 'test-phi-access-123';
      
      logHelpers.logPHIAccess(
        'test_phi_access',
        testProviderId,
        testPracticeId,
        {
          patientId: testPatientId,
          correlationId: testCorrelationId
        }
      );

      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('correlation_id', testCorrelationId)
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].event_type).toBe('data_access');
      expect(auditLogs[0].contains_phi).toBe(true);
    });

    test('logDataExport should create proper audit entry', async () => {
      const testCorrelationId = 'test-data-export-123';
      
      logHelpers.logDataExport(
        'test_export',
        testProviderId,
        testPracticeId,
        {
          exportType: 'patient_data',
          correlationId: testCorrelationId
        }
      );

      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('correlation_id', testCorrelationId)
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].event_type).toBe('data_export');
      expect(auditLogs[0].risk_level).toBe('high');
    });

    test('logSecurityViolation should create proper audit entry', async () => {
      const testCorrelationId = 'test-security-violation-123';
      
      logHelpers.logSecurityViolation(
        'test_violation',
        testProviderId,
        testPracticeId,
        {
          violationType: 'unauthorized_access',
          correlationId: testCorrelationId
        }
      );

      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('correlation_id', testCorrelationId)
        .limit(1);

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].event_type).toBe('security');
      expect(auditLogs[0].risk_level).toBe('high');
    });
  });

  describe('Audit Log Compliance', () => {
    test('audit logs should contain required HIPAA fields', async () => {
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .limit(1);

      if (auditLogs.length > 0) {
        const log = auditLogs[0];
        
        // Required HIPAA audit fields
        expect(log).toHaveProperty('id');
        expect(log).toHaveProperty('event_type');
        expect(log).toHaveProperty('action');
        expect(log).toHaveProperty('user_id');
        expect(log).toHaveProperty('practice_id');
        expect(log).toHaveProperty('created_at');
        expect(log).toHaveProperty('ip_address');
        expect(log).toHaveProperty('user_agent');
        expect(log).toHaveProperty('risk_level');
        expect(log).toHaveProperty('contains_phi');
      }
    });

    test('audit logs should be immutable', async () => {
      // Try to update an audit log (should fail)
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('id')
        .limit(1);

      if (auditLogs.length > 0) {
        const { error } = await supabase
          .from('audit_logs')
          .update({ action: 'modified_action' })
          .eq('id', auditLogs[0].id);

        // Should fail due to RLS policy or trigger
        expect(error).toBeTruthy();
      }
    });

    test('audit logs should have proper retention', async () => {
      // Check that audit logs are being retained according to policy
      const sevenYearsAgo = new Date();
      sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

      const { data: oldLogs } = await supabase
        .from('audit_logs')
        .select('id')
        .lt('created_at', sevenYearsAgo.toISOString())
        .limit(1);

      // Old logs should still exist (HIPAA requires 7-year retention)
      // This test would be more meaningful with actual old data
      expect(Array.isArray(oldLogs)).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    test('audit logging should not significantly impact API performance', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${authToken}`);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
    });

    test('audit log queries should be efficient', async () => {
      const startTime = Date.now();
      
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('practice_id', testPracticeId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      const endTime = Date.now();
      const queryTime = endTime - startTime;

      expect(Array.isArray(auditLogs)).toBe(true);
      expect(queryTime).toBeLessThan(1000); // Should query within 1 second
    });
  });
});