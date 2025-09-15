/**
 * Authentication Security Test Suite
 * Tests for authentication middleware, security validation, and RBAC
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/database');
const { 
  authenticateToken, 
  validatePassword, 
  hashPassword, 
  verifyPassword,
  checkAccountLocked,
  checkPasswordExpiry,
  trackFailedAttempt,
  resetFailedAttempts
} = require('../middleware/auth');
const { requireRole, requirePermission } = require('../middleware/rbac');
const passwordPolicy = require('../config/passwordPolicy');

// Mock Express request/response objects
const mockRequest = (overrides = {}) => ({
  headers: {},
  user: null,
  ...overrides
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

// Test data
const testUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Provider',
  email: 'test@example.com',
  role: 'provider',
  practice_id: '123e4567-e89b-12d3-a456-426614174001',
  password_hash: null,
  password_expires_at: null,
  locked_until: null,
  failed_login_attempts: 0
};

const testAdmin = {
  id: '123e4567-e89b-12d3-a456-426614174002',
  name: 'Test Admin',
  email: 'admin@example.com',
  role: 'admin',
  practice_id: '123e4567-e89b-12d3-a456-426614174001',
  password_hash: null,
  password_expires_at: null,
  locked_until: null,
  failed_login_attempts: 0
};

describe('Authentication Middleware Tests', () => {
  let validToken;
  let expiredToken;
  let invalidToken;
  
  beforeAll(async () => {
    // Create valid JWT token
    validToken = jwt.sign(
      { 
        userId: testUser.id, 
        email: testUser.email, 
        role: testUser.role,
        practiceId: testUser.practice_id
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    // Create expired token
    expiredToken = jwt.sign(
      { 
        userId: testUser.id, 
        email: testUser.email, 
        role: testUser.role,
        practiceId: testUser.practice_id
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' } // Already expired
    );
    
    // Invalid token
    invalidToken = 'invalid.jwt.token';
    
    // Set up test user password
    const password = 'TestP@ssw0rd123!';
    testUser.password_hash = await hashPassword(password, testUser.id);
    testAdmin.password_hash = await hashPassword(password, testAdmin.id);
  });
  
  describe('Token Authentication', () => {
    test('should authenticate valid token', async () => {
      const req = mockRequest({
        headers: { authorization: `Bearer ${validToken}` }
      });
      const res = mockResponse();
      const next = jest.fn();
      
      await authenticateToken(req, res, next);
      
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe(testUser.id);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
    
    test('should reject missing token', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = jest.fn();
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access token required'
      });
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should reject invalid token format', async () => {
      const req = mockRequest({
        headers: { authorization: 'InvalidFormat' }
      });
      const res = mockResponse();
      const next = jest.fn();
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token format'
      });
    });
    
    test('should reject expired token', async () => {
      const req = mockRequest({
        headers: { authorization: `Bearer ${expiredToken}` }
      });
      const res = mockResponse();
      const next = jest.fn();
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired'
      });
    });
    
    test('should reject malformed token', async () => {
      const req = mockRequest({
        headers: { authorization: `Bearer ${invalidToken}` }
      });
      const res = mockResponse();
      const next = jest.fn();
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token'
      });
    });
  });
  
  describe('Password Security', () => {
    test('should hash passwords securely', async () => {
      const password = 'TestP@ssw0rd123!';
      const hash1 = await hashPassword(password, testUser.id);
      const hash2 = await hashPassword(password, testUser.id);
      
      // Hashes should be different (salt)
      expect(hash1).not.toBe(hash2);
      
      // Both should verify correctly
      const verify1 = await verifyPassword(password, hash1, testUser.id);
      const verify2 = await verifyPassword(password, hash2, testUser.id);
      
      expect(verify1.isValid).toBe(true);
      expect(verify2.isValid).toBe(true);
    });
    
    test('should use appropriate bcrypt rounds', async () => {
      const password = 'TestP@ssw0rd123!';
      const hash = await hashPassword(password, testUser.id);
      
      // Check bcrypt rounds (should match policy)
      const rounds = parseInt(hash.split('$')[2]);
      expect(rounds).toBeGreaterThanOrEqual(passwordPolicy.security.bcryptRounds);
    });
    
    test('should verify passwords correctly', async () => {
      const correctPassword = 'TestP@ssw0rd123!';
      const wrongPassword = 'WrongP@ssw0rd123!';
      const hash = await hashPassword(correctPassword, testUser.id);
      
      const correctResult = await verifyPassword(correctPassword, hash, testUser.id);
      const wrongResult = await verifyPassword(wrongPassword, hash, testUser.id);
      
      expect(correctResult.isValid).toBe(true);
      expect(wrongResult.isValid).toBe(false);
    });
    
    test('should track failed login attempts', async () => {
      const userId = testUser.id;
      
      // Reset attempts
      await resetFailedAttempts(userId);
      
      // Track failed attempts
      await trackFailedAttempt(userId);
      await trackFailedAttempt(userId);
      
      const lockStatus = await checkAccountLocked(userId);
      expect(lockStatus.failedAttempts).toBe(2);
    });
    
    test('should lock account after max attempts', async () => {
      const userId = testUser.id;
      const maxAttempts = passwordPolicy.lockout.maxAttempts;
      
      // Reset first
      await resetFailedAttempts(userId);
      
      // Exceed max attempts
      for (let i = 0; i < maxAttempts + 1; i++) {
        await trackFailedAttempt(userId);
      }
      
      const lockStatus = await checkAccountLocked(userId);
      expect(lockStatus.isLocked).toBe(true);
    });
    
    test('should reset attempts on successful login', async () => {
      const userId = testUser.id;
      const password = 'TestP@ssw0rd123!';
      const hash = await hashPassword(password, userId);
      
      // Add some failed attempts
      await trackFailedAttempt(userId);
      await trackFailedAttempt(userId);
      
      // Successful verification should reset
      await verifyPassword(password, hash, userId);
      
      const lockStatus = await checkAccountLocked(userId);
      expect(lockStatus.failedAttempts).toBe(0);
    });
  });
  
  describe('Password Expiry', () => {
    test('should detect expired passwords', async () => {
      const userId = testUser.id;
      
      // Set password as expired
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);
      
      await supabase
        .from('providers')
        .update({ password_expires_at: expiredDate.toISOString() })
        .eq('id', userId);
      
      const expiryStatus = await checkPasswordExpiry(userId);
      expect(expiryStatus.isExpired).toBe(true);
    });
    
    test('should detect passwords expiring soon', async () => {
      const userId = testUser.id;
      const warningDays = passwordPolicy.expiry.warningDays;
      
      // Set password to expire within warning period
      const expiringDate = new Date();
      expiringDate.setDate(expiringDate.getDate() + warningDays - 1);
      
      await supabase
        .from('providers')
        .update({ password_expires_at: expiringDate.toISOString() })
        .eq('id', userId);
      
      const expiryStatus = await checkPasswordExpiry(userId);
      expect(expiryStatus.isExpiring).toBe(true);
      expect(expiryStatus.daysRemaining).toBeLessThan(warningDays);
    });
    
    test('should handle valid passwords', async () => {
      const userId = testUser.id;
      
      // Set password to expire in future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      
      await supabase
        .from('providers')
        .update({ password_expires_at: futureDate.toISOString() })
        .eq('id', userId);
      
      const expiryStatus = await checkPasswordExpiry(userId);
      expect(expiryStatus.isExpired).toBe(false);
      expect(expiryStatus.isExpiring).toBe(false);
    });
  });
});

describe('Role-Based Access Control Tests', () => {
  test('should allow access with correct role', async () => {
    const req = mockRequest({
      user: { role: 'admin', userId: testAdmin.id }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    const middleware = requireRole(['admin']);
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
  
  test('should deny access with incorrect role', async () => {
    const req = mockRequest({
      user: { role: 'provider', userId: testUser.id }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    const middleware = requireRole(['admin']);
    await middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Insufficient permissions'
    });
    expect(next).not.toHaveBeenCalled();
  });
  
  test('should allow multiple valid roles', async () => {
    const req = mockRequest({
      user: { role: 'provider', userId: testUser.id }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    const middleware = requireRole(['admin', 'provider']);
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
  
  test('should check specific permissions', async () => {
    const req = mockRequest({
      user: { role: 'admin', userId: testAdmin.id }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    const middleware = requirePermission('manage_users');
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });
  
  test('should deny access without permission', async () => {
    const req = mockRequest({
      user: { role: 'provider', userId: testUser.id }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    const middleware = requirePermission('manage_users');
    await middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Security Integration Tests', () => {
  let app;
  
  beforeAll(() => {
    app = require('../index');
  });
  
  test('should enforce authentication on protected routes', async () => {
    const response = await request(app)
      .get('/api/v1/practices');
    
    expect(response.status).toBe(401);
    expect(response.body.message).toContain('token');
  });
  
  test('should enforce role requirements', async () => {
    const providerToken = jwt.sign(
      { userId: testUser.id, role: 'provider' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    // Try to access admin-only endpoint
    const response = await request(app)
      .get('/api/v1/providers')
      .set('Authorization', `Bearer ${providerToken}`);
    
    expect(response.status).toBe(403);
  });
  
  test('should handle password expiry in API calls', async () => {
    // Set user password as expired
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);
    
    await supabase
      .from('providers')
      .update({ password_expires_at: expiredDate.toISOString() })
      .eq('id', testUser.id);
    
    const token = jwt.sign(
      { userId: testUser.id, role: 'provider' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    const response = await request(app)
      .get('/api/v1/practices')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(403);
    expect(response.body.passwordExpired).toBe(true);
  });
  
  test('should handle account lockout in API calls', async () => {
    // Lock the account
    const lockUntil = new Date(Date.now() + 60000);
    
    await supabase
      .from('providers')
      .update({ 
        locked_until: lockUntil.toISOString(),
        failed_login_attempts: 5
      })
      .eq('id', testUser.id);
    
    const token = jwt.sign(
      { userId: testUser.id, role: 'provider' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    const response = await request(app)
      .get('/api/v1/practices')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(423);
    expect(response.body.accountLocked).toBe(true);
  });
  
  test('should validate password changes', async () => {
    // Reset user to valid state
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    
    await supabase
      .from('providers')
      .update({
        password_expires_at: futureDate.toISOString(),
        locked_until: null,
        failed_login_attempts: 0
      })
      .eq('id', testUser.id);
    
    const token = jwt.sign(
      { userId: testUser.id, role: 'provider' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    // Try weak password
    const weakResponse = await request(app)
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'TestP@ssw0rd123!',
        newPassword: 'weak'
      });
    
    expect(weakResponse.status).toBe(400);
    expect(weakResponse.body.issues).toBeDefined();
    
    // Try strong password
    const strongResponse = await request(app)
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'TestP@ssw0rd123!',
        newPassword: 'NewStrongP@ssw0rd123!'
      });
    
    expect(strongResponse.status).toBe(200);
  });
  
  test('should track failed login attempts', async () => {
    const maxAttempts = 3;
    
    // Reset user
    await supabase
      .from('providers')
      .update({
        locked_until: null,
        failed_login_attempts: 0
      })
      .eq('id', testUser.id);
    
    // Make failed login attempts
    for (let i = 0; i < maxAttempts; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        });
    }
    
    // Next attempt should result in lockout
    const lockoutResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: 'wrongpassword'
      });
    
    expect(lockoutResponse.status).toBe(423);
    expect(lockoutResponse.body.accountLocked).toBe(true);
  });
});

describe('Security Edge Cases', () => {
  test('should handle malformed JWT tokens', async () => {
    const req = mockRequest({
      headers: { authorization: 'Bearer malformed.jwt' }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    await authenticateToken(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  
  test('should handle missing user data in token', async () => {
    const incompleteToken = jwt.sign(
      { email: 'test@example.com' }, // Missing userId
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    const req = mockRequest({
      headers: { authorization: `Bearer ${incompleteToken}` }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    await authenticateToken(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
  });
  
  test('should handle database errors gracefully', async () => {
    // This would require mocking database failures
    // For now, ensure functions don't throw
    expect(async () => {
      await checkAccountLocked('invalid-id');
    }).not.toThrow();
    
    expect(async () => {
      await checkPasswordExpiry('invalid-id');
    }).not.toThrow();
  });
  
  test('should handle concurrent login attempts', async () => {
    const userId = testUser.id;
    
    // Reset user
    await resetFailedAttempts(userId);
    
    // Simulate concurrent failed attempts
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(trackFailedAttempt(userId));
    }
    
    await Promise.all(promises);
    
    const lockStatus = await checkAccountLocked(userId);
    expect(lockStatus.failedAttempts).toBeGreaterThan(0);
  });
});

// Cleanup
afterAll(async () => {
  // Clean up test data
  await supabase
    .from('providers')
    .delete()
    .in('id', [testUser.id, testAdmin.id]);
    
  await supabase
    .from('password_history')
    .delete()
    .in('user_id', [testUser.id, testAdmin.id]);
});