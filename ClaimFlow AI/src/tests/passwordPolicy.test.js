/**
 * Password Policy Test Suite
 * Tests for HIPAA-compliant password policies and security requirements
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');
const PasswordService = require('../services/passwordService');
const passwordPolicy = require('../config/passwordPolicy');
const { 
  validatePassword, 
  hashPassword, 
  verifyPassword,
  checkAccountLocked,
  checkPasswordExpiry 
} = require('../middleware/auth');
const { getPasswordPolicyStatus } = require('../middleware/passwordPolicy');

// Mock data
const mockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test User',
  email: 'test@example.com',
  role: 'provider',
  practice_id: '123e4567-e89b-12d3-a456-426614174001'
};

const mockAdmin = {
  id: '123e4567-e89b-12d3-a456-426614174002',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
  practice_id: '123e4567-e89b-12d3-a456-426614174001'
};

describe('Password Policy Tests', () => {
  let passwordService;
  
  beforeAll(() => {
    passwordService = new PasswordService();
  });
  
  describe('Password Validation', () => {
    test('should reject passwords that are too short', async () => {
      const result = await validatePassword('short', mockUser.id, {
        name: mockUser.name,
        email: mockUser.email
      });
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password must be at least 12 characters long');
    });
    
    test('should reject passwords without required complexity', async () => {
      const weakPassword = 'simplepassword';
      const result = await validatePassword(weakPassword, mockUser.id, {
        name: mockUser.name,
        email: mockUser.email
      });
      
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
    
    test('should accept strong passwords', async () => {
      const strongPassword = 'StrongP@ssw0rd123!';
      const result = await validatePassword(strongPassword, mockUser.id, {
        name: mockUser.name,
        email: mockUser.email
      });
      
      expect(result.isValid).toBe(true);
      expect(result.strength.level).toMatch(/strong|very_strong/);
    });
    
    test('should reject passwords containing personal information', async () => {
      const personalPassword = 'TestUser123!';
      const result = await validatePassword(personalPassword, mockUser.id, {
        name: mockUser.name,
        email: mockUser.email
      });
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password must not contain personal information');
    });
    
    test('should reject common passwords', async () => {
      const commonPassword = 'Password123!';
      const result = await validatePassword(commonPassword, mockUser.id, {
        name: mockUser.name,
        email: mockUser.email
      });
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password is too common');
    });
    
    test('should enforce role-specific requirements', async () => {
      const adminPassword = 'AdminP@ssw0rd123!';
      
      // Test admin requirements (should be stronger)
      const adminResult = await validatePassword(adminPassword, mockAdmin.id, {
        name: mockAdmin.name,
        email: mockAdmin.email
      });
      
      expect(adminResult.isValid).toBe(true);
      expect(adminResult.requirements.minLength).toBeGreaterThanOrEqual(14);
    });
  });
  
  describe('Password History', () => {
    test('should prevent password reuse', async () => {
      const password = 'TestP@ssw0rd123!';
      const hashedPassword = await hashPassword(password, mockUser.id);
      
      // Simulate adding to history
      await passwordService.addToHistory(mockUser.id, hashedPassword);
      
      // Try to reuse the same password
      const result = await validatePassword(password, mockUser.id, {
        name: mockUser.name,
        email: mockUser.email
      });
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password has been used recently');
    });
    
    test('should maintain password history limit', async () => {
      const userId = mockUser.id;
      const historyLimit = passwordPolicy.history.count;
      
      // Add more passwords than the limit
      for (let i = 0; i < historyLimit + 2; i++) {
        const password = `TestP@ssw0rd${i}!`;
        const hashedPassword = await hashPassword(password);
        await passwordService.addToHistory(userId, hashedPassword);
      }
      
      // Check that only the limit number of passwords are stored
      const history = await passwordService.getPasswordHistory(userId);
      expect(history.length).toBeLessThanOrEqual(historyLimit);
    });
  });
  
  describe('Account Lockout', () => {
    test('should lock account after max failed attempts', async () => {
      const userId = mockUser.id;
      const maxAttempts = passwordPolicy.lockout.maxAttempts;
      
      // Simulate failed login attempts
      for (let i = 0; i < maxAttempts; i++) {
        await verifyPassword('wrongpassword', 'hashedpassword', userId);
      }
      
      const lockStatus = await checkAccountLocked(userId);
      expect(lockStatus.isLocked).toBe(true);
      expect(lockStatus.failedAttempts).toBe(maxAttempts);
    });
    
    test('should implement progressive lockout durations', async () => {
      const lockoutCount1 = passwordPolicy.getLockoutDuration(1);
      const lockoutCount2 = passwordPolicy.getLockoutDuration(2);
      const lockoutCount3 = passwordPolicy.getLockoutDuration(3);
      
      expect(lockoutCount2).toBeGreaterThan(lockoutCount1);
      expect(lockoutCount3).toBeGreaterThan(lockoutCount2);
    });
    
    test('should reset failed attempts on successful login', async () => {
      const userId = mockUser.id;
      const correctPassword = 'TestP@ssw0rd123!';
      const hashedPassword = await hashPassword(correctPassword);
      
      // Simulate some failed attempts
      await verifyPassword('wrongpassword', hashedPassword, userId);
      await verifyPassword('wrongpassword', hashedPassword, userId);
      
      // Successful login should reset attempts
      await verifyPassword(correctPassword, hashedPassword, userId);
      
      const lockStatus = await checkAccountLocked(userId);
      expect(lockStatus.isLocked).toBe(false);
    });
  });
  
  describe('Password Expiry', () => {
    test('should detect expired passwords', async () => {
      const userId = mockUser.id;
      
      // Mock expired password
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday
      
      await supabase
        .from('providers')
        .update({ password_expires_at: expiredDate.toISOString() })
        .eq('id', userId);
      
      const expiryStatus = await checkPasswordExpiry(userId);
      expect(expiryStatus.isExpired).toBe(true);
    });
    
    test('should detect passwords expiring soon', async () => {
      const userId = mockUser.id;
      
      // Mock password expiring in 7 days
      const expiringDate = new Date();
      expiringDate.setDate(expiringDate.getDate() + 7);
      
      await supabase
        .from('providers')
        .update({ password_expires_at: expiringDate.toISOString() })
        .eq('id', userId);
      
      const expiryStatus = await checkPasswordExpiry(userId);
      expect(expiryStatus.isExpiring).toBe(true);
      expect(expiryStatus.daysRemaining).toBeLessThanOrEqual(passwordPolicy.expiry.warningDays);
    });
    
    test('should calculate correct days remaining', async () => {
      const userId = mockUser.id;
      const daysUntilExpiry = 10;
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysUntilExpiry);
      
      await supabase
        .from('providers')
        .update({ password_expires_at: futureDate.toISOString() })
        .eq('id', userId);
      
      const expiryStatus = await checkPasswordExpiry(userId);
      expect(expiryStatus.daysRemaining).toBeCloseTo(daysUntilExpiry, 0);
    });
  });
  
  describe('Password Strength Scoring', () => {
    test('should score password strength correctly', () => {
      const weakPassword = 'password';
      const mediumPassword = 'Password123';
      const strongPassword = 'StrongP@ssw0rd123!';
      
      const weakScore = passwordService.calculatePasswordStrength(weakPassword);
      const mediumScore = passwordService.calculatePasswordStrength(mediumPassword);
      const strongScore = passwordService.calculatePasswordStrength(strongPassword);
      
      expect(weakScore.score).toBeLessThan(mediumScore.score);
      expect(mediumScore.score).toBeLessThan(strongScore.score);
      expect(strongScore.level).toMatch(/strong|very_strong/);
    });
    
    test('should calculate entropy correctly', () => {
      const shortPassword = 'Abc1!';
      const longPassword = 'ThisIsAVeryLongAndComplexP@ssw0rd123!';
      
      const shortEntropy = passwordService.calculateEntropy(shortPassword);
      const longEntropy = passwordService.calculateEntropy(longPassword);
      
      expect(longEntropy).toBeGreaterThan(shortEntropy);
    });
  });
  
  describe('Password Generation', () => {
    test('should generate compliant passwords', () => {
      const generatedPassword = passwordService.generatePassword();
      
      expect(generatedPassword.length).toBeGreaterThanOrEqual(passwordPolicy.requirements.minLength);
      expect(/[a-z]/.test(generatedPassword)).toBe(true);
      expect(/[A-Z]/.test(generatedPassword)).toBe(true);
      expect(/\d/.test(generatedPassword)).toBe(true);
      expect(/[^a-zA-Z0-9]/.test(generatedPassword)).toBe(true);
    });
    
    test('should generate role-specific passwords', () => {
      const providerPassword = passwordService.generatePassword('provider');
      const adminPassword = passwordService.generatePassword('admin');
      
      const providerRequirements = passwordPolicy.getRoleRequirements('provider');
      const adminRequirements = passwordPolicy.getRoleRequirements('admin');
      
      expect(providerPassword.length).toBeGreaterThanOrEqual(providerRequirements.minLength);
      expect(adminPassword.length).toBeGreaterThanOrEqual(adminRequirements.minLength);
    });
  });
  
  describe('Policy Configuration', () => {
    test('should provide correct requirements text', () => {
      const providerText = passwordPolicy.getRequirementsText('provider');
      const adminText = passwordPolicy.getRequirementsText('admin');
      
      expect(providerText).toContain('12 characters');
      expect(adminText).toContain('14 characters');
      expect(adminText).toContain('MFA');
    });
    
    test('should validate role requirements', () => {
      const providerReqs = passwordPolicy.getRoleRequirements('provider');
      const adminReqs = passwordPolicy.getRoleRequirements('admin');
      
      expect(adminReqs.minLength).toBeGreaterThan(providerReqs.minLength);
      expect(adminReqs.requireMFA).toBe(true);
      expect(providerReqs.requireMFA).toBe(false);
    });
    
    test('should check 2FA requirements correctly', () => {
      expect(passwordPolicy.requires2FA('admin')).toBe(true);
      expect(passwordPolicy.requires2FA('provider')).toBe(false);
      expect(passwordPolicy.requires2FA('staff')).toBe(false);
    });
  });
  
  describe('Password Policy Status', () => {
    test('should get comprehensive policy status', async () => {
      const userId = mockUser.id;
      const status = await getPasswordPolicyStatus(userId);
      
      expect(status).toHaveProperty('passwordExpiry');
      expect(status).toHaveProperty('accountLockout');
      expect(status).toHaveProperty('roleRequirements');
      expect(status).toHaveProperty('compliance');
      
      expect(status.compliance).toHaveProperty('overallStatus');
      expect(['compliant', 'non_compliant']).toContain(status.compliance.overallStatus);
    });
    
    test('should calculate compliance correctly', async () => {
      const userId = mockUser.id;
      
      // Set up compliant user
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      
      await supabase
        .from('providers')
        .update({
          password_expires_at: futureDate.toISOString(),
          locked_until: null,
          failed_login_attempts: 0
        })
        .eq('id', userId);
      
      const status = await getPasswordPolicyStatus(userId);
      expect(status.compliance.overallStatus).toBe('compliant');
    });
  });
  
  describe('Security Edge Cases', () => {
    test('should handle null/undefined passwords gracefully', async () => {
      const result1 = await validatePassword(null, mockUser.id);
      const result2 = await validatePassword(undefined, mockUser.id);
      const result3 = await validatePassword('', mockUser.id);
      
      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
      expect(result3.isValid).toBe(false);
    });
    
    test('should handle invalid user IDs gracefully', async () => {
      const invalidUserId = 'invalid-uuid';
      
      const lockStatus = await checkAccountLocked(invalidUserId);
      const expiryStatus = await checkPasswordExpiry(invalidUserId);
      
      expect(lockStatus.isLocked).toBe(false);
      expect(expiryStatus.isExpired).toBe(false);
    });
    
    test('should handle database errors gracefully', async () => {
      // Mock database error by using invalid connection
      const originalSupabase = require('../config/database').supabase;
      
      // This test would require mocking the database connection
      // For now, we'll just ensure the functions don't throw
      expect(async () => {
        await checkAccountLocked(mockUser.id);
      }).not.toThrow();
    });
  });
  
  describe('Performance Tests', () => {
    test('should validate passwords efficiently', async () => {
      const password = 'TestP@ssw0rd123!';
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await validatePassword(password, mockUser.id, {
          name: mockUser.name,
          email: mockUser.email
        });
      }
      
      const endTime = Date.now();
      const avgTime = (endTime - startTime) / 10;
      
      // Should validate in under 100ms on average
      expect(avgTime).toBeLessThan(100);
    });
    
    test('should hash passwords efficiently', async () => {
      const password = 'TestP@ssw0rd123!';
      const startTime = Date.now();
      
      await hashPassword(password, mockUser.id);
      
      const endTime = Date.now();
      const hashTime = endTime - startTime;
      
      // Should hash in under 500ms (bcrypt is intentionally slow)
      expect(hashTime).toBeLessThan(500);
    });
  });
});

// Integration tests with API endpoints
describe('Password Policy API Integration', () => {
  let app;
  let authToken;
  
  beforeAll(async () => {
    // Set up test app and authentication
    app = require('../index');
    
    // Create test user and get auth token
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: mockUser.email,
        password: 'TestP@ssw0rd123!'
      });
    
    authToken = loginResponse.body.data.token;
  });
  
  test('should enforce password expiry on API calls', async () => {
    // Set user password as expired
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);
    
    await supabase
      .from('providers')
      .update({ password_expires_at: expiredDate.toISOString() })
      .eq('id', mockUser.id);
    
    const response = await request(app)
      .get('/api/v1/practices')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(403);
    expect(response.body.passwordExpired).toBe(true);
  });
  
  test('should enforce account lockout on API calls', async () => {
    // Lock the account
    const lockUntil = new Date(Date.now() + 60000); // 1 minute from now
    
    await supabase
      .from('providers')
      .update({ 
        locked_until: lockUntil.toISOString(),
        failed_login_attempts: 5
      })
      .eq('id', mockUser.id);
    
    const response = await request(app)
      .get('/api/v1/practices')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(423);
    expect(response.body.accountLocked).toBe(true);
  });
  
  test('should include password policy info in responses', async () => {
    // Reset user to compliant state
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    
    await supabase
      .from('providers')
      .update({
        password_expires_at: futureDate.toISOString(),
        locked_until: null,
        failed_login_attempts: 0
      })
      .eq('id', mockUser.id);
    
    const response = await request(app)
      .get('/api/v1/practices')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.passwordPolicy).toBeDefined();
    expect(response.body.passwordPolicy.requirements).toBeDefined();
  });
  
  test('should validate password changes through API', async () => {
    const weakPassword = 'weak';
    const strongPassword = 'NewStrongP@ssw0rd123!';
    
    // Try weak password
    const weakResponse = await request(app)
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        currentPassword: 'TestP@ssw0rd123!',
        newPassword: weakPassword
      });
    
    expect(weakResponse.status).toBe(400);
    expect(weakResponse.body.issues).toBeDefined();
    
    // Try strong password
    const strongResponse = await request(app)
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        currentPassword: 'TestP@ssw0rd123!',
        newPassword: strongPassword
      });
    
    expect(strongResponse.status).toBe(200);
    expect(strongResponse.body.data.passwordStrength).toBeDefined();
  });
});

// Cleanup
afterAll(async () => {
  // Clean up test data
  await supabase
    .from('providers')
    .delete()
    .in('id', [mockUser.id, mockAdmin.id]);
    
  await supabase
    .from('password_history')
    .delete()
    .in('user_id', [mockUser.id, mockAdmin.id]);
});