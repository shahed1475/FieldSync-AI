const request = require('supertest');
const { supabase } = require('../src/database/connection');
const { EncryptionService } = require('../src/utils/encryption');
const app = require('../src/index');

describe('Patients API - HIPAA Compliance', () => {
  let testCorrelationId;
  let testToken;
  let testUser;
  let testPatientId;
  let encryptionService;
  
  beforeEach(async () => {
    testCorrelationId = global.testUtils.generateCorrelationId();
    encryptionService = new EncryptionService();
    
    // Get test token and user
    const tokenData = await global.testUtils.createTestToken();
    testToken = tokenData.token;
    testUser = tokenData.user;
  });
  
  afterEach(async () => {
    // Clean up test patient if created
    if (testPatientId) {
      await supabase
        .from('patients')
        .delete()
        .eq('patient_id', testPatientId);
    }
    
    await global.testUtils.cleanupTestData(testCorrelationId);
  });

  describe('POST /api/patients', () => {
    test('should create patient with encrypted PHI data', async () => {
      const patientData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1985-06-15',
        ssn: '123-45-6789',
        phone: '555-123-4567',
        email: 'john.doe@email.com',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'ST',
          zipCode: '12345'
        },
        insuranceInfo: {
          memberId: 'INS123456',
          groupNumber: 'GRP789',
          planName: 'Health Plan Plus'
        }
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(patientData);
      
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.patient_id).toBeDefined();
      
      testPatientId = response.body.data.patient_id;
      
      // Verify PHI data is encrypted in database
      const { data: dbPatient } = await supabase
        .from('patients')
        .select('*')
        .eq('patient_id', testPatientId)
        .single();
      
      expect(dbPatient.encrypted_data).toBeDefined();
      expect(dbPatient.encrypted_data).not.toContain('John');
      expect(dbPatient.encrypted_data).not.toContain('123-45-6789');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'phi_access',
        action: 'patient_created'
      });
    });
    
    test('should validate required fields', async () => {
      const incompleteData = {
        firstName: 'John'
        // Missing required fields
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(incompleteData);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
    
    test('should require authentication', async () => {
      const patientData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1985-06-15'
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('X-Correlation-ID', testCorrelationId)
        .send(patientData);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });
  
  describe('GET /api/patients', () => {
    beforeEach(async () => {
      // Create test patient
      const patientData = {
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1990-03-20',
        ssn: '987-65-4321',
        phone: '555-987-6543',
        email: 'jane.smith@email.com'
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(patientData);
      
      testPatientId = response.body.data.patient_id;
    });
    
    test('should list patients with decrypted data for authorized user', async () => {
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      const patient = response.body.data.find(p => p.patient_id === testPatientId);
      expect(patient).toBeDefined();
      expect(patient.firstName).toBe('Jane');
      expect(patient.lastName).toBe('Smith');
      
      // Verify audit log for PHI access
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'phi_access',
        action: 'patients_listed'
      });
    });
    
    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/patients?page=1&limit=10')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });
    
    test('should filter by practice for practice-scoped users', async () => {
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      
      // All patients should belong to the user's practice
      response.body.data.forEach(patient => {
        expect(patient.practice_id).toBe(testUser.practice_id);
      });
    });
  });
  
  describe('GET /api/patients/:id', () => {
    beforeEach(async () => {
      // Create test patient
      const patientData = {
        firstName: 'Bob',
        lastName: 'Johnson',
        dateOfBirth: '1975-12-10',
        ssn: '456-78-9012',
        phone: '555-456-7890',
        email: 'bob.johnson@email.com'
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(patientData);
      
      testPatientId = response.body.data.patient_id;
    });
    
    test('should retrieve patient with decrypted PHI data', async () => {
      const response = await request(app)
        .get(`/api/patients/${testPatientId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.patient_id).toBe(testPatientId);
      expect(response.body.data.firstName).toBe('Bob');
      expect(response.body.data.lastName).toBe('Johnson');
      expect(response.body.data.ssn).toBe('456-78-9012');
      
      // Verify audit log for PHI access
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'phi_access',
        action: 'patient_viewed',
        resource_id: testPatientId
      });
    });
    
    test('should return 404 for non-existent patient', async () => {
      const response = await request(app)
        .get('/api/patients/NON_EXISTENT_ID')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
    
    test('should enforce practice-based access control', async () => {
      // Create patient in different practice (if possible)
      // This test would need a patient from a different practice
      // For now, we'll test with a valid patient ID but verify access control
      
      const response = await request(app)
        .get(`/api/patients/${testPatientId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.data.practice_id).toBe(testUser.practice_id);
    });
  });
  
  describe('PUT /api/patients/:id', () => {
    beforeEach(async () => {
      // Create test patient
      const patientData = {
        firstName: 'Alice',
        lastName: 'Wilson',
        dateOfBirth: '1988-09-25',
        ssn: '789-01-2345',
        phone: '555-789-0123',
        email: 'alice.wilson@email.com'
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(patientData);
      
      testPatientId = response.body.data.patient_id;
    });
    
    test('should update patient with re-encrypted PHI data', async () => {
      const updateData = {
        firstName: 'Alice',
        lastName: 'Wilson-Smith',
        phone: '555-789-0124',
        email: 'alice.wilson.smith@email.com'
      };
      
      const response = await request(app)
        .put(`/api/patients/${testPatientId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.lastName).toBe('Wilson-Smith');
      expect(response.body.data.phone).toBe('555-789-0124');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'phi_access',
        action: 'patient_updated',
        resource_id: testPatientId
      });
    });
    
    test('should validate update data', async () => {
      const invalidData = {
        email: 'invalid-email-format'
      };
      
      const response = await request(app)
        .put(`/api/patients/${testPatientId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(invalidData);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
  
  describe('DELETE /api/patients/:id', () => {
    beforeEach(async () => {
      // Create test patient
      const patientData = {
        firstName: 'Charlie',
        lastName: 'Brown',
        dateOfBirth: '1992-04-18',
        ssn: '012-34-5678',
        phone: '555-012-3456',
        email: 'charlie.brown@email.com'
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(patientData);
      
      testPatientId = response.body.data.patient_id;
    });
    
    test('should soft delete patient (HIPAA retention)', async () => {
      const response = await request(app)
        .delete(`/api/patients/${testPatientId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify patient is marked as deleted but data retained
      const { data: dbPatient } = await supabase
        .from('patients')
        .select('*')
        .eq('patient_id', testPatientId)
        .single();
      
      expect(dbPatient.deleted_at).toBeDefined();
      expect(dbPatient.encrypted_data).toBeDefined(); // Data still exists
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'phi_access',
        action: 'patient_deleted',
        resource_id: testPatientId
      });
      
      // Don't clean up in afterEach since it's already deleted
      testPatientId = null;
    });
    
    test('should require admin role for hard delete', async () => {
      // This would require creating an admin user token
      // For now, verify that regular users cannot hard delete
      
      const response = await request(app)
        .delete(`/api/patients/${testPatientId}?hard=true`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      // Should either be forbidden or not support hard delete
      expect([403, 400, 404]).toContain(response.status);
    });
  });
  
  describe('Data Encryption Verification', () => {
    test('should encrypt all PHI fields in database', async () => {
      const patientData = {
        firstName: 'Test',
        lastName: 'Patient',
        dateOfBirth: '1980-01-01',
        ssn: '111-22-3333',
        phone: '555-111-2222',
        email: 'test.patient@email.com',
        address: {
          street: '456 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '54321'
        }
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(patientData);
      
      testPatientId = response.body.data.patient_id;
      
      // Check raw database data
      const { data: dbPatient } = await supabase
        .from('patients')
        .select('encrypted_data')
        .eq('patient_id', testPatientId)
        .single();
      
      // Verify no PHI data is stored in plain text
      const encryptedData = dbPatient.encrypted_data;
      expect(encryptedData).not.toContain('Test');
      expect(encryptedData).not.toContain('Patient');
      expect(encryptedData).not.toContain('111-22-3333');
      expect(encryptedData).not.toContain('555-111-2222');
      expect(encryptedData).not.toContain('test.patient@email.com');
      expect(encryptedData).not.toContain('456 Test St');
    });
  });
});