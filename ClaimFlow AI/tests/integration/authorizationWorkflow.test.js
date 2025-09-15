const request = require('supertest');
const { Pool } = require('pg');
const app = require('../../src/app');
const { WorkflowEngine } = require('../../src/services/workflowEngine');
const { LookupService } = require('../../src/services/lookupService');
const { PayerRulesEngine } = require('../../src/services/payerRulesEngine');
const NotificationService = require('../../src/services/notificationService');

// Test database configuration
const testPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/claimflow_test'
});

describe('Authorization Workflow Integration Tests', () => {
  let authToken;
  let testUserId;
  let testPatientId;
  let testProviderId;
  let testPayerId;

  beforeAll(async () => {
    // Setup test database
    await setupTestDatabase();
    
    // Create test user and get auth token
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'provider'
      });
    
    testUserId = userResponse.body.user.id;
    authToken = userResponse.body.token;
    
    // Create test data
    await createTestData();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await testPool.end();
  });

  beforeEach(async () => {
    // Clean up any test-specific data
    await testPool.query('DELETE FROM authorizations WHERE created_by = $1', [testUserId]);
  });

  describe('Complete Authorization Workflow', () => {
    it('should create, process, and approve an authorization request', async () => {
      // Step 1: Create authorization request
      const createResponse = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          payerId: testPayerId,
          procedureCode: '70553',
          diagnosisCode: 'M25.511',
          serviceType: 'MRI',
          urgency: 'routine',
          clinicalNotes: 'Patient experiencing knee pain, MRI needed for diagnosis'
        })
        .expect(201);
      
      const authorizationId = createResponse.body.authorizationId;
      expect(authorizationId).toBeDefined();
      expect(createResponse.body.detectedFields).toBeDefined();
      expect(createResponse.body.detectedFields.serviceType).toBe('imaging');
      
      // Step 2: Verify initial state
      const statusResponse = await request(app)
        .get(`/api/authorization/${authorizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(statusResponse.body.authorization.current_state).toBe('submitted');
      expect(statusResponse.body.history).toHaveLength(1);
      
      // Step 3: Advance to review state
      const reviewResponse = await request(app)
        .post(`/api/authorization/${authorizationId}/advance`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'review' })
        .expect(200);
      
      expect(reviewResponse.body.newState).toBe('pending_review');
      
      // Step 4: Submit to payer
      const submitResponse = await request(app)
        .post(`/api/authorization/${authorizationId}/submit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          payerPortal: 'test_portal',
          additionalDocuments: []
        })
        .expect(200);
      
      expect(submitResponse.body.success).toBe(true);
      expect(submitResponse.body.submissionId).toBeDefined();
      
      // Step 5: Simulate payer approval
      await testPool.query(
        'UPDATE authorizations SET current_state = $1, payer_response = $2 WHERE id = $3',
        ['approved', JSON.stringify({ decision: 'approved', reason: 'Meets criteria' }), authorizationId]
      );
      
      // Step 6: Verify final state
      const finalStatusResponse = await request(app)
        .get(`/api/authorization/${authorizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(finalStatusResponse.body.authorization.current_state).toBe('approved');
      expect(finalStatusResponse.body.authorization.payer_response).toBeDefined();
    }, 30000);

    it('should handle auto-approval for low-cost routine procedures', async () => {
      // Create low-cost routine procedure
      const createResponse = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          payerId: testPayerId,
          procedureCode: '99213', // Office visit - low cost
          diagnosisCode: 'Z00.00',
          serviceType: 'office_visit',
          urgency: 'routine'
        })
        .expect(201);
      
      const authorizationId = createResponse.body.authorizationId;
      
      // Should be auto-approved
      const statusResponse = await request(app)
        .get(`/api/authorization/${authorizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(statusResponse.body.authorization.current_state).toBe('approved');
      expect(statusResponse.body.authorization.auto_approved).toBe(true);
    });

    it('should handle urgent procedures with expedited workflow', async () => {
      const createResponse = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          payerId: testPayerId,
          procedureCode: '70553',
          diagnosisCode: 'S72.001A', // Urgent fracture
          serviceType: 'MRI',
          urgency: 'urgent',
          clinicalNotes: 'Emergency case - suspected fracture'
        })
        .expect(201);
      
      const authorizationId = createResponse.body.authorizationId;
      
      // Verify urgent priority
      const statusResponse = await request(app)
        .get(`/api/authorization/${authorizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(statusResponse.body.authorization.urgency_level).toBe('urgent');
      expect(statusResponse.body.authorization.priority_score).toBeGreaterThan(80);
    });
  });

  describe('Smart Field Detection', () => {
    it('should detect service type from procedure code', async () => {
      const response = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          procedureCode: '29881', // Arthroscopy
          diagnosisCode: 'M23.200'
        })
        .expect(201);
      
      expect(response.body.detectedFields.serviceType).toBe('surgery');
      expect(response.body.detectedFields.subcategory).toBe('arthroscopy');
    });

    it('should detect payer information from patient insurance', async () => {
      const response = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          procedureCode: '70553',
          diagnosisCode: 'M25.511'
        })
        .expect(201);
      
      expect(response.body.detectedFields.payerInfo).toBeDefined();
      expect(response.body.detectedFields.payerInfo.id).toBe(testPayerId);
    });

    it('should estimate procedure cost', async () => {
      const response = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          procedureCode: '70553',
          diagnosisCode: 'M25.511'
        })
        .expect(201);
      
      expect(response.body.detectedFields.estimatedCost).toBeDefined();
      expect(response.body.detectedFields.estimatedCost.estimated).toBeGreaterThan(0);
      expect(response.body.detectedFields.estimatedCost.range).toBeDefined();
    });
  });

  describe('Payer Rules Engine', () => {
    it('should validate authorization against payer requirements', async () => {
      const createResponse = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          payerId: testPayerId,
          procedureCode: '70553',
          diagnosisCode: 'M25.511',
          serviceType: 'MRI'
        })
        .expect(201);
      
      const authorizationId = createResponse.body.authorizationId;
      
      // Get validation results
      const validationResponse = await request(app)
        .get(`/api/authorization/${authorizationId}/validation`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(validationResponse.body.validation).toBeDefined();
      expect(validationResponse.body.validation.overall_score).toBeDefined();
      expect(validationResponse.body.validation.requirements_met).toBeDefined();
    });

    it('should suggest missing documentation', async () => {
      // Create authorization with minimal information
      const createResponse = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          payerId: testPayerId,
          procedureCode: '70553',
          diagnosisCode: 'M25.511'
          // Missing clinical notes and other documentation
        })
        .expect(201);
      
      const authorizationId = createResponse.body.authorizationId;
      
      const validationResponse = await request(app)
        .get(`/api/authorization/${authorizationId}/validation`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(validationResponse.body.validation.missing_requirements).toBeDefined();
      expect(validationResponse.body.validation.suggestions).toBeDefined();
    });
  });

  describe('Real-time Dashboard', () => {
    it('should provide dashboard overview with statistics', async () => {
      // Create multiple authorizations
      const authIds = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/authorization')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            patientId: testPatientId,
            providerId: testProviderId,
            procedureCode: '70553',
            diagnosisCode: 'M25.511'
          });
        authIds.push(response.body.authorizationId);
      }
      
      const dashboardResponse = await request(app)
        .get('/api/authorization/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(dashboardResponse.body.stats).toBeDefined();
      expect(dashboardResponse.body.stats.total).toBeGreaterThanOrEqual(3);
      expect(dashboardResponse.body.recentAuthorizations).toBeDefined();
      expect(dashboardResponse.body.recentAuthorizations.length).toBeGreaterThan(0);
    });

    it('should support filtering and searching', async () => {
      const response = await request(app)
        .get('/api/authorization/dashboard')
        .query({
          status: 'submitted',
          search: 'MRI',
          page: 1,
          limit: 10
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.authorizations).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe('Notification System', () => {
    it('should send notifications on status changes', async () => {
      const createResponse = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          patientId: testPatientId,
          providerId: testProviderId,
          procedureCode: '70553',
          diagnosisCode: 'M25.511'
        })
        .expect(201);
      
      const authorizationId = createResponse.body.authorizationId;
      
      // Advance state to trigger notification
      await request(app)
        .post(`/api/authorization/${authorizationId}/advance`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'approve' })
        .expect(200);
      
      // Check for in-app notifications
      const notificationsResponse = await request(app)
        .get('/api/notifications/in-app')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(notificationsResponse.body.notifications).toBeDefined();
      expect(notificationsResponse.body.notifications.length).toBeGreaterThan(0);
    });

    it('should manage notification preferences', async () => {
      const updateResponse = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: true,
          sms: false,
          inApp: true,
          types: ['authorization_approved', 'authorization_denied']
        })
        .expect(200);
      
      expect(updateResponse.body.preferences).toBeDefined();
      expect(updateResponse.body.preferences.email).toBe(true);
      expect(updateResponse.body.preferences.sms).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid authorization data', async () => {
      const response = await request(app)
        .post('/api/authorization')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          procedureCode: '70553'
        })
        .expect(400);
      
      expect(response.body.error).toBeDefined();
      expect(response.body.validationErrors).toBeDefined();
    });

    it('should handle non-existent authorization', async () => {
      const response = await request(app)
        .get('/api/authorization/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
      
      expect(response.body.error).toBe('Authorization not found');
    });

    it('should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/authorization/dashboard')
        .expect(401);
      
      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('Performance', () => {
    it('should handle concurrent authorization requests', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/authorization')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              patientId: testPatientId,
              providerId: testProviderId,
              procedureCode: '70553',
              diagnosisCode: 'M25.511'
            })
        );
      }
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.authorizationId).toBeDefined();
      });
    }, 15000);

    it('should respond to dashboard requests quickly', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/authorization/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Should respond within 2 seconds
    });
  });

  // Helper functions
  async function setupTestDatabase() {
    // Create test tables if they don't exist
    const schema = `
      -- Add any additional test-specific schema here
      CREATE TABLE IF NOT EXISTS test_cleanup (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(255),
        record_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    
    await testPool.query(schema);
  }

  async function createTestData() {
    // Create test patient
    const patientResult = await testPool.query(`
      INSERT INTO patients (first_name, last_name, date_of_birth, insurance_id, payer_id)
      VALUES ('John', 'Doe', '1980-01-01', 'INS123456', $1)
      RETURNING id
    `, [testPayerId || 'test-payer']);
    testPatientId = patientResult.rows[0].id;

    // Create test provider
    const providerResult = await testPool.query(`
      INSERT INTO providers (first_name, last_name, npi, specialty)
      VALUES ('Dr. Jane', 'Smith', '1234567890', 'Orthopedics')
      RETURNING id
    `);
    testProviderId = providerResult.rows[0].id;

    // Create test payer
    const payerResult = await testPool.query(`
      INSERT INTO payers (name, type, portal_url)
      VALUES ('Test Insurance', 'commercial', 'https://test.example.com')
      RETURNING id
    `);
    testPayerId = payerResult.rows[0].id;

    // Update patient with correct payer_id
    await testPool.query(
      'UPDATE patients SET payer_id = $1 WHERE id = $2',
      [testPayerId, testPatientId]
    );
  }

  async function cleanupTestDatabase() {
    // Clean up test data
    await testPool.query('DELETE FROM authorizations WHERE created_by = $1', [testUserId]);
    await testPool.query('DELETE FROM patients WHERE id = $1', [testPatientId]);
    await testPool.query('DELETE FROM providers WHERE id = $1', [testProviderId]);
    await testPool.query('DELETE FROM payers WHERE id = $1', [testPayerId]);
    await testPool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  }
});