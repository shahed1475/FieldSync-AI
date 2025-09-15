const { supabase } = require('../src/database/connection');
const { logger } = require('../src/utils/logger');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test utilities
global.testUtils = {
  // Generate test correlation ID
  generateCorrelationId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Clean up test data
  cleanupTestData: async (correlationId) => {
    try {
      // Clean up audit logs with test correlation ID
      await supabase
        .from('audit_logs')
        .delete()
        .eq('correlation_id', correlationId);
      
      // Clean up test patients
      await supabase
        .from('patients')
        .delete()
        .like('patient_id', 'TEST-%');
      
      // Clean up test authorizations
      await supabase
        .from('authorizations')
        .delete()
        .like('authorization_number', 'TEST-%');
      
      // Clean up test documents
      await supabase
        .from('documents')
        .delete()
        .like('file_name', 'test-%');
        
    } catch (error) {
      console.error('Failed to clean up test data:', error);
    }
  },
  
  // Create test user token
  createTestToken: async (email = 'sarah.johnson@metromedical.com') => {
    const jwt = require('jsonwebtoken');
    
    // Get user data
    const { data: provider } = await supabase
      .from('providers')
      .select('*')
      .eq('email', email)
      .single();
    
    if (!provider) {
      throw new Error(`Test user ${email} not found`);
    }
    
    // Generate token
    const token = jwt.sign(
      {
        id: provider.id,
        email: provider.email,
        role: provider.role,
        practice_id: provider.practice_id
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    return { token, user: provider };
  },
  
  // Verify audit log creation
  verifyAuditLog: async (criteria, timeout = 5000) => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('*')
        .match(criteria)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (logs && logs.length > 0) {
        return logs[0];
      }
      
      await global.testUtils.wait(100);
    }
    
    throw new Error(`Audit log not found for criteria: ${JSON.stringify(criteria)}`);
  }
};

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Suppress specific warnings
process.env.NODE_NO_WARNINGS = '1';

// Mock external services if needed
jest.mock('../src/utils/logger', () => {
  const originalLogger = jest.requireActual('../src/utils/logger');
  return {
    ...originalLogger,
    logger: {
      ...originalLogger.logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }
  };
});

console.log('Test setup completed');