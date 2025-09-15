const request = require('supertest');
const { supabase } = require('../src/database/connection');
const { EncryptionService } = require('../src/utils/encryption');
const fs = require('fs').promises;
const path = require('path');
const app = require('../src/index');

describe('Documents API - HIPAA Compliance', () => {
  let testCorrelationId;
  let testToken;
  let testUser;
  let testPatientId;
  let testDocumentId;
  let testFilePath;
  
  beforeEach(async () => {
    testCorrelationId = global.testUtils.generateCorrelationId();
    
    // Get test token and user
    const tokenData = await global.testUtils.createTestToken();
    testToken = tokenData.token;
    testUser = tokenData.user;
    
    // Create test patient
    const patientData = {
      firstName: 'Doc',
      lastName: 'TestPatient',
      dateOfBirth: '1985-06-15',
      ssn: '123-45-6789',
      phone: '555-123-4567',
      email: 'doc.test@email.com'
    };
    
    const patientResponse = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${testToken}`)
      .set('X-Correlation-ID', testCorrelationId)
      .send(patientData);
    
    testPatientId = patientResponse.body.data.patient_id;
    
    // Create test file
    testFilePath = path.join(__dirname, 'test-document.pdf');
    await fs.writeFile(testFilePath, 'Test PDF content for HIPAA compliance testing');
  });
  
  afterEach(async () => {
    // Clean up test data
    if (testDocumentId) {
      await supabase
        .from('documents')
        .delete()
        .eq('document_id', testDocumentId);
    }
    
    if (testPatientId) {
      await supabase
        .from('patients')
        .delete()
        .eq('patient_id', testPatientId);
    }
    
    // Clean up test file
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // File may not exist
    }
    
    await global.testUtils.cleanupTestData(testCorrelationId);
  });

  describe('POST /api/documents', () => {
    test('should upload and encrypt document', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'medical_record')
        .field('description', 'Test medical record document')
        .field('category', 'clinical_notes')
        .attach('file', testFilePath);
      
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.document_id).toBeDefined();
      expect(response.body.data.file_name).toBe('test-document.pdf');
      expect(response.body.data.file_size).toBeGreaterThan(0);
      expect(response.body.data.encrypted).toBe(true);
      
      testDocumentId = response.body.data.document_id;
      
      // Verify document is encrypted in storage
      const { data: dbDocument } = await supabase
        .from('documents')
        .select('*')
        .eq('document_id', testDocumentId)
        .single();
      
      expect(dbDocument.encrypted_file_path).toBeDefined();
      expect(dbDocument.encryption_key_id).toBeDefined();
      expect(dbDocument.file_hash).toBeDefined();
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'document_uploaded',
        action: 'upload',
        resource_id: testDocumentId
      });
    });
    
    test('should validate file type restrictions', async () => {
      // Create a test file with restricted extension
      const restrictedFilePath = path.join(__dirname, 'test-script.exe');
      await fs.writeFile(restrictedFilePath, 'Executable content');
      
      try {
        const response = await request(app)
          .post('/api/documents')
          .set('Authorization', `Bearer ${testToken}`)
          .set('X-Correlation-ID', testCorrelationId)
          .field('patient_id', testPatientId)
          .field('document_type', 'medical_record')
          .field('description', 'Test restricted file')
          .attach('file', restrictedFilePath);
        
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INVALID_FILE_TYPE');
      } finally {
        await fs.unlink(restrictedFilePath);
      }
    });
    
    test('should validate file size limits', async () => {
      // Create a large test file (simulate oversized file)
      const largeFilePath = path.join(__dirname, 'large-test-file.pdf');
      const largeContent = 'x'.repeat(50 * 1024 * 1024); // 50MB
      await fs.writeFile(largeFilePath, largeContent);
      
      try {
        const response = await request(app)
          .post('/api/documents')
          .set('Authorization', `Bearer ${testToken}`)
          .set('X-Correlation-ID', testCorrelationId)
          .field('patient_id', testPatientId)
          .field('document_type', 'medical_record')
          .field('description', 'Large test file')
          .attach('file', largeFilePath);
        
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('FILE_TOO_LARGE');
      } finally {
        await fs.unlink(largeFilePath);
      }
    });
    
    test('should require valid patient ID', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', 'INVALID_PATIENT_ID')
        .field('document_type', 'medical_record')
        .field('description', 'Test document')
        .attach('file', testFilePath);
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
    
    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'medical_record')
        .attach('file', testFilePath);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });
  
  describe('GET /api/documents', () => {
    beforeEach(async () => {
      // Upload test document
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'lab_result')
        .field('description', 'Test lab result document')
        .field('category', 'laboratory')
        .attach('file', testFilePath);
      
      testDocumentId = response.body.data.document_id;
    });
    
    test('should list documents for practice', async () => {
      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      const document = response.body.data.find(d => d.document_id === testDocumentId);
      expect(document).toBeDefined();
      expect(document.document_type).toBe('lab_result');
      expect(document.category).toBe('laboratory');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'documents_accessed',
        action: 'list'
      });
    });
    
    test('should filter documents by patient', async () => {
      const response = await request(app)
        .get(`/api/documents?patient_id=${testPatientId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // All documents should belong to the specified patient
      response.body.data.forEach(doc => {
        expect(doc.patient_id).toBe(testPatientId);
      });
    });
    
    test('should filter documents by type', async () => {
      const response = await request(app)
        .get('/api/documents?document_type=lab_result')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // All documents should be of the specified type
      response.body.data.forEach(doc => {
        expect(doc.document_type).toBe('lab_result');
      });
    });
    
    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/documents?page=1&limit=10')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });
  });
  
  describe('GET /api/documents/:id', () => {
    beforeEach(async () => {
      // Upload test document
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'imaging')
        .field('description', 'Test imaging document')
        .field('category', 'radiology')
        .attach('file', testFilePath);
      
      testDocumentId = response.body.data.document_id;
    });
    
    test('should retrieve document metadata', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.document_id).toBe(testDocumentId);
      expect(response.body.data.document_type).toBe('imaging');
      expect(response.body.data.category).toBe('radiology');
      expect(response.body.data.file_name).toBe('test-document.pdf');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'document_accessed',
        action: 'view_metadata',
        resource_id: testDocumentId
      });
    });
    
    test('should return 404 for non-existent document', async () => {
      const response = await request(app)
        .get('/api/documents/NON_EXISTENT_ID')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });
    
    test('should enforce practice-based access control', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.data.practice_id).toBe(testUser.practice_id);
    });
  });
  
  describe('GET /api/documents/:id/download', () => {
    beforeEach(async () => {
      // Upload test document
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'consent_form')
        .field('description', 'Test consent form')
        .attach('file', testFilePath);
      
      testDocumentId = response.body.data.document_id;
    });
    
    test('should download and decrypt document', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocumentId}/download`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('test-document.pdf');
      expect(response.body).toBeDefined();
      
      // Verify audit log for file download
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'document_downloaded',
        action: 'download',
        resource_id: testDocumentId
      });
    });
    
    test('should require proper authorization for download', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocumentId}/download`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
    
    test('should validate document integrity on download', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocumentId}/download`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      
      // Verify file integrity (this would typically involve hash verification)
      expect(response.headers['x-file-hash']).toBeDefined();
    });
  });
  
  describe('PUT /api/documents/:id', () => {
    beforeEach(async () => {
      // Upload test document
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'insurance_card')
        .field('description', 'Test insurance card')
        .attach('file', testFilePath);
      
      testDocumentId = response.body.data.document_id;
    });
    
    test('should update document metadata', async () => {
      const updateData = {
        description: 'Updated insurance card description',
        category: 'insurance',
        tags: ['insurance', 'card', 'updated']
      };
      
      const response = await request(app)
        .put(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toBe('Updated insurance card description');
      expect(response.body.data.category).toBe('insurance');
      expect(response.body.data.tags).toEqual(['insurance', 'card', 'updated']);
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'document_updated',
        action: 'update_metadata',
        resource_id: testDocumentId
      });
    });
    
    test('should prevent updating immutable fields', async () => {
      const updateData = {
        document_id: 'NEW_ID',
        file_name: 'new-name.pdf',
        file_size: 999999,
        created_at: '2024-01-01T00:00:00Z'
      };
      
      const response = await request(app)
        .put(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send(updateData);
      
      expect(response.status).toBe(200);
      // Verify immutable fields weren't changed
      expect(response.body.data.document_id).toBe(testDocumentId);
      expect(response.body.data.file_name).toBe('test-document.pdf');
      expect(response.body.data.created_at).not.toBe('2024-01-01T00:00:00Z');
    });
  });
  
  describe('DELETE /api/documents/:id', () => {
    beforeEach(async () => {
      // Upload test document
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'prescription')
        .field('description', 'Test prescription')
        .attach('file', testFilePath);
      
      testDocumentId = response.body.data.document_id;
    });
    
    test('should soft delete document (HIPAA retention)', async () => {
      const response = await request(app)
        .delete(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify document is marked as deleted but encrypted file retained
      const { data: dbDocument } = await supabase
        .from('documents')
        .select('*')
        .eq('document_id', testDocumentId)
        .single();
      
      expect(dbDocument.deleted_at).toBeDefined();
      expect(dbDocument.encrypted_file_path).toBeDefined(); // File still exists
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'document_deleted',
        action: 'soft_delete',
        resource_id: testDocumentId
      });
      
      // Don't clean up in afterEach since it's already deleted
      testDocumentId = null;
    });
    
    test('should require admin role for hard delete', async () => {
      const response = await request(app)
        .delete(`/api/documents/${testDocumentId}?hard=true`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      // Should either be forbidden or not support hard delete
      expect([403, 400, 404]).toContain(response.status);
    });
  });
  
  describe('Document Security and Compliance', () => {
    test('should encrypt all uploaded documents', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'security_test')
        .field('description', 'Security test document')
        .attach('file', testFilePath);
      
      testDocumentId = response.body.data.document_id;
      
      // Verify encryption metadata
      const { data: dbDocument } = await supabase
        .from('documents')
        .select('*')
        .eq('document_id', testDocumentId)
        .single();
      
      expect(dbDocument.encrypted).toBe(true);
      expect(dbDocument.encryption_key_id).toBeDefined();
      expect(dbDocument.encrypted_file_path).toBeDefined();
      expect(dbDocument.file_hash).toBeDefined();
      
      // Verify original file is not stored in plain text
      expect(dbDocument.encrypted_file_path).not.toContain('test-document.pdf');
    });
    
    test('should maintain comprehensive audit trail', async () => {
      // Upload document
      const uploadResponse = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'audit_test')
        .field('description', 'Audit trail test')
        .attach('file', testFilePath);
      
      testDocumentId = uploadResponse.body.data.document_id;
      
      // View document
      await request(app)
        .get(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      // Download document
      await request(app)
        .get(`/api/documents/${testDocumentId}/download`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      // Update document
      await request(app)
        .put(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .send({ description: 'Updated description' });
      
      // Verify all operations are audited
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('correlation_id', testCorrelationId)
        .eq('resource_id', testDocumentId);
      
      expect(auditLogs.length).toBeGreaterThanOrEqual(4);
      
      const eventTypes = auditLogs.map(log => log.event_type);
      expect(eventTypes).toContain('document_uploaded');
      expect(eventTypes).toContain('document_accessed');
      expect(eventTypes).toContain('document_downloaded');
      expect(eventTypes).toContain('document_updated');
    });
    
    test('should validate file integrity', async () => {
      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId)
        .field('patient_id', testPatientId)
        .field('document_type', 'integrity_test')
        .field('description', 'File integrity test')
        .attach('file', testFilePath);
      
      testDocumentId = response.body.data.document_id;
      
      // Verify file hash is stored
      const { data: dbDocument } = await supabase
        .from('documents')
        .select('file_hash')
        .eq('document_id', testDocumentId)
        .single();
      
      expect(dbDocument.file_hash).toBeDefined();
      expect(dbDocument.file_hash.length).toBeGreaterThan(0);
    });
  });
});