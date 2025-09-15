const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { supabase } = require('../src/database/connection');
const { EncryptionService } = require('../src/utils/encryption');
const app = require('../src/index');

describe('Authentication System', () => {
  let testCorrelationId;
  let testProvider;
  let testToken;
  
  beforeEach(async () => {
    testCorrelationId = global.testUtils.generateCorrelationId();
    
    // Get test provider
    const { data: provider } = await supabase
      .from('providers')
      .select('*')
      .eq('email', 'sarah.johnson@metromedical.com')
      .single();
    
    testProvider = provider;
  });
  
  afterEach(async () => {
    await global.testUtils.cleanupTestData(testCorrelationId);
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sarah.johnson@metromedical.com',
          password: 'SecurePass123!'
        })
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe('sarah.johnson@metromedical.com');
      
      // Verify JWT token
      const decoded = jwt.verify(response.body.data.token, process.env.JWT_SECRET);
      expect(decoded.email).toBe('sarah.johnson@metromedical.com');
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authentication',
        action: 'login_success'
      });
    });
    
    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sarah.johnson@metromedical.com',
          password: 'wrongpassword'
        })
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      
      // Verify security audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'security',
        action: 'login_failed'
      });
    });
    
    test('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
    
    test('should validate input format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: '123'
        })
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
    
    test('should handle rate limiting', async () => {
      const promises = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'sarah.johnson@metromedical.com',
              password: 'wrongpassword'
            })
            .set('X-Correlation-ID', testCorrelationId)
        );
      }
      
      const responses = await Promise.all(promises);
      
      // At least one should be rate limited
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).toBe(true);
    });
  });
  
  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      const tokenData = await global.testUtils.createTestToken();
      testToken = tokenData.token;
    });
    
    test('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authentication',
        action: 'logout'
      });
    });
    
    test('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });
  
  describe('GET /api/auth/me', () => {
    beforeEach(async () => {
      const tokenData = await global.testUtils.createTestToken();
      testToken = tokenData.token;
    });
    
    test('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('sarah.johnson@metromedical.com');
      expect(response.body.data.password).toBeUndefined(); // Password should not be returned
    });
    
    test('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });
  
  describe('POST /api/auth/change-password', () => {
    beforeEach(async () => {
      const tokenData = await global.testUtils.createTestToken();
      testToken = tokenData.token;
    });
    
    test('should change password with valid current password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          currentPassword: 'SecurePass123!',
          newPassword: 'NewSecurePass456!'
        })
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify password was actually changed
      const { data: updatedProvider } = await supabase
        .from('providers')
        .select('password_hash')
        .eq('id', testProvider.id)
        .single();
      
      const isNewPasswordValid = await bcrypt.compare('NewSecurePass456!', updatedProvider.password_hash);
      expect(isNewPasswordValid).toBe(true);
      
      // Verify audit log
      await global.testUtils.verifyAuditLog({
        correlation_id: testCorrelationId,
        event_type: 'authentication',
        action: 'password_changed'
      });
      
      // Reset password for other tests
      const hashedPassword = await bcrypt.hash('SecurePass123!', 12);
      await supabase
        .from('providers')
        .update({ password_hash: hashedPassword })
        .eq('id', testProvider.id);
    });
    
    test('should reject with wrong current password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewSecurePass456!'
        })
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });
    
    test('should validate new password strength', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          currentPassword: 'SecurePass123!',
          newPassword: 'weak'
        })
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
  
  describe('JWT Token Security', () => {
    test('should reject expired tokens', async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        {
          id: testProvider.id,
          email: testProvider.email,
          role: testProvider.role,
          practice_id: testProvider.practice_id
        },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });
    
    test('should reject malformed tokens', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer malformed.token.here')
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
    
    test('should reject tokens with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        {
          id: testProvider.id,
          email: testProvider.email,
          role: testProvider.role,
          practice_id: testProvider.practice_id
        },
        'wrong-secret',
        { expiresIn: '1h' }
      );
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${wrongSecretToken}`)
        .set('X-Correlation-ID', testCorrelationId);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});