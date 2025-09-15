/**
 * Compliance Service Tests
 * Comprehensive testing for HIPAA compliance monitoring and reporting
 */

const request = require('supertest');
const { supabase } = require('../config/database');
const ComplianceService = require('../services/complianceService');
const { auditLogger } = require('../utils/logger');
const app = require('../index');

// Mock external dependencies
jest.mock('../utils/logger');
jest.mock('nodemailer');
jest.mock('node-cron');

describe('Compliance Service', () => {
  let complianceService;
  let testPracticeId;
  let testUserId;
  let authToken;
  
  beforeAll(async () => {
    // Setup test data
    testPracticeId = 'test-practice-compliance-' + Date.now();
    testUserId = 'test-user-compliance-' + Date.now();
    
    // Create test practice
    await supabase.from('practices').insert({
      id: testPracticeId,
      name: 'Test Compliance Practice',
      email: 'compliance@test.com'
    });
    
    // Create test user
    await supabase.from('providers').insert({
      id: testUserId,
      email: 'compliance.admin@test.com',
      password_hash: 'test-hash',
      first_name: 'Compliance',
      last_name: 'Admin',
      role: 'admin',
      practice_id: testPracticeId
    });
    
    // Get auth token
    const authResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'compliance.admin@test.com',
        password: 'TestPassword123!'
      });
    
    authToken = authResponse.body.token;
    
    complianceService = new ComplianceService();
  });
  
  afterAll(async () => {
    // Cleanup test data
    await supabase.from('compliance_alerts').delete().eq('practice_id', testPracticeId);
    await supabase.from('compliance_reports').delete().eq('practice_id', testPracticeId);
    await supabase.from('compliance_metrics').delete().eq('practice_id', testPracticeId);
    await supabase.from('compliance_violations').delete().eq('practice_id', testPracticeId);
    await supabase.from('providers').delete().eq('id', testUserId);
    await supabase.from('practices').delete().eq('id', testPracticeId);
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('ComplianceService Class', () => {
    test('should initialize with default alert thresholds', () => {
      expect(complianceService.alertThresholds).toBeDefined();
      expect(complianceService.alertThresholds.failedLogins.count).toBe(10);
      expect(complianceService.alertThresholds.phiAccess.count).toBe(100);
      expect(complianceService.alertThresholds.dataExports.count).toBe(5);
    });
    
    test('should have compliance reports structure', () => {
      expect(complianceService.complianceReports).toBeDefined();
      expect(complianceService.complianceReports.daily).toEqual([]);
      expect(complianceService.complianceReports.weekly).toEqual([]);
      expect(complianceService.complianceReports.monthly).toEqual([]);
      expect(complianceService.complianceReports.quarterly).toEqual([]);
    });
  });
  
  describe('Alert Management', () => {
    test('should trigger alert for critical severity', async () => {
      const alertDetails = {
        count: 5,
        timeWindow: '1 minute',
        activities: [{
          action: 'UNAUTHORIZED_ACCESS',
          user_id: testUserId,
          ip_address: '192.168.1.100',
          timestamp: new Date().toISOString()
        }]
      };
      
      await complianceService.triggerAlert('critical', 'Test Critical Alert', alertDetails);
      
      // Verify alert was logged
      expect(auditLogger.warn).toHaveBeenCalledWith(
        'Compliance Alert: Test Critical Alert',
        expect.objectContaining({
          severity: 'critical',
          details: alertDetails,
          complianceFlags: ['COMPLIANCE_ALERT']
        })
      );
    });
    
    test('should store alert in database', async () => {
      const alertDetails = { test: 'data' };
      
      await complianceService.triggerAlert('high', 'Test Database Alert', alertDetails);
      
      // Check if alert was stored
      const { data: alerts } = await supabase
        .from('compliance_alerts')
        .select('*')
        .eq('title', 'Test Database Alert')
        .eq('severity', 'high');
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].details).toEqual(alertDetails);
      expect(alerts[0].resolved).toBe(false);
    });
    
    test('should generate alert email content', () => {
      const alert = {
        id: 'test-alert-id',
        severity: 'critical',
        title: 'Test Alert',
        details: { count: 5 },
        timestamp: new Date().toISOString()
      };
      
      const emailContent = complianceService.generateAlertEmail(alert);
      
      expect(emailContent).toContain('[CRITICAL] Test Alert');
      expect(emailContent).toContain('test-alert-id');
      expect(emailContent).toContain('"count": 5');
      expect(emailContent).toContain('#dc3545'); // Critical color
    });
  });
  
  describe('Compliance Monitoring', () => {
    test('should check failed logins', async () => {
      // Create test audit logs for failed logins
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const now = new Date();
      
      // Insert multiple failed login attempts
      for (let i = 0; i < 12; i++) {
        await supabase.from('audit_logs').insert({
          action: 'LOGIN',
          description: 'Login failed',
          user_id: testUserId,
          practice_id: testPracticeId,
          ip_address: '192.168.1.100',
          timestamp: new Date(oneHourAgo.getTime() + i * 1000).toISOString()
        });
      }
      
      await complianceService.checkFailedLogins(oneHourAgo, now);
      
      // Should trigger alert for excessive failed logins
      expect(auditLogger.warn).toHaveBeenCalledWith(
        'Compliance Alert: Excessive Failed Login Attempts',
        expect.objectContaining({
          severity: 'high'
        })
      );
    });
    
    test('should check PHI access patterns', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const now = new Date();
      
      // Insert multiple PHI access events
      for (let i = 0; i < 105; i++) {
        await supabase.from('audit_logs').insert({
          action: 'READ',
          table_name: 'patients',
          user_id: testUserId,
          practice_id: testPracticeId,
          timestamp: new Date(oneHourAgo.getTime() + i * 1000).toISOString()
        });
      }
      
      await complianceService.checkPHIAccessPatterns(oneHourAgo, now);
      
      // Should trigger alert for high volume PHI access
      expect(auditLogger.warn).toHaveBeenCalledWith(
        'Compliance Alert: High Volume PHI Access',
        expect.objectContaining({
          severity: 'medium'
        })
      );
    });
    
    test('should check off-hours access', async () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const now = new Date();
      
      // Mock current hour to be off-hours (e.g., 2 AM)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(2);
      
      // Insert off-hours access
      await supabase.from('audit_logs').insert({
        action: 'READ',
        user_id: testUserId,
        practice_id: testPracticeId,
        timestamp: oneMinuteAgo.toISOString()
      });
      
      await complianceService.checkOffHoursAccess(oneMinuteAgo, now);
      
      // Should trigger warning for off-hours access
      expect(auditLogger.warn).toHaveBeenCalledWith(
        'Compliance Alert: Off-Hours System Access',
        expect.objectContaining({
          severity: 'warning'
        })
      );
      
      // Restore original getHours method
      Date.prototype.getHours.mockRestore();
    });
    
    test('should check data exports', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const now = new Date();
      
      // Insert multiple data export events
      for (let i = 0; i < 6; i++) {
        await supabase.from('audit_logs').insert({
          action: 'EXPORT',
          description: `Data export ${i}`,
          user_id: testUserId,
          practice_id: testPracticeId,
          timestamp: new Date(oneHourAgo.getTime() + i * 1000).toISOString()
        });
      }
      
      await complianceService.checkDataExports(oneHourAgo, now);
      
      // Should trigger alert for excessive data exports
      expect(auditLogger.warn).toHaveBeenCalledWith(
        'Compliance Alert: Excessive Data Export Activity',
        expect.objectContaining({
          severity: 'high'
        })
      );
    });
  });
  
  describe('Compliance Reporting', () => {
    test('should generate compliance report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const report = await complianceService.generateComplianceReport(startDate, endDate, 'monthly');
      
      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('type', 'monthly');
      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('compliance_score');
      expect(report).toHaveProperty('audit_statistics');
      expect(report).toHaveProperty('security_metrics');
      expect(report).toHaveProperty('compliance_violations');
      expect(report).toHaveProperty('user_activity');
      expect(report).toHaveProperty('recommendations');
      
      expect(report.period.start).toBe(startDate.toISOString());
      expect(report.period.end).toBe(endDate.toISOString());
    });
    
    test('should calculate compliance score', () => {
      const auditStats = { total_events: 1000 };
      const securityMetrics = {
        login_success_rate: 0.98,
        locked_accounts: 2
      };
      const violations = [
        { severity: 'critical' },
        { severity: 'high' },
        { severity: 'medium' }
      ];
      
      const score = complianceService.calculateComplianceScore(auditStats, securityMetrics, violations);
      
      // Base score 100 - (1*5 + 1*5 + 1*5) - (2*2) = 100 - 15 - 4 = 81
      expect(score).toBe(81);
    });
    
    test('should generate recommendations', () => {
      const auditStats = { total_events: 100 };
      const securityMetrics = {
        login_success_rate: 0.90, // Below 0.95 threshold
        locked_accounts: 8 // Above 5 threshold
      };
      const violations = [
        { severity: 'critical' },
        { severity: 'high' }
      ];
      
      const recommendations = complianceService.generateRecommendations(auditStats, securityMetrics, violations);
      
      expect(recommendations).toHaveLength(3);
      expect(recommendations[0]).toMatchObject({
        priority: 'high',
        category: 'security',
        title: 'Address Compliance Violations'
      });
      expect(recommendations[1]).toMatchObject({
        priority: 'medium',
        category: 'authentication',
        title: 'Improve Login Success Rate'
      });
      expect(recommendations[2]).toMatchObject({
        priority: 'medium',
        category: 'access_control',
        title: 'Review Account Lockout Policies'
      });
    });
    
    test('should get practice compliance status', async () => {
      const status = await complianceService.getPracticeComplianceStatus(testPracticeId);
      
      expect(status).toHaveProperty('practice_id', testPracticeId);
      expect(status).toHaveProperty('period');
      expect(status).toHaveProperty('total_audit_events');
      expect(status).toHaveProperty('phi_access_events');
      expect(status).toHaveProperty('compliance_violations');
      expect(status).toHaveProperty('compliance_score');
      expect(status).toHaveProperty('status');
      
      expect(['compliant', 'non_compliant']).toContain(status.status);
    });
  });
  
  describe('Helper Functions', () => {
    test('should count PHI access events', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      // Insert test PHI access events
      await supabase.from('audit_logs').insert([
        {
          table_name: 'patients',
          action: 'read',
          practice_id: testPracticeId,
          timestamp: '2024-01-15T10:00:00Z'
        },
        {
          table_name: 'documents',
          action: 'read',
          practice_id: testPracticeId,
          timestamp: '2024-01-20T14:00:00Z'
        }
      ]);
      
      const count = await complianceService.countPHIAccessEvents(startDate, endDate);
      
      expect(count).toBeGreaterThanOrEqual(2);
    });
    
    test('should calculate login success rate', () => {
      expect(complianceService.calculateLoginSuccessRate(95, 5)).toBe(0.95);
      expect(complianceService.calculateLoginSuccessRate(0, 0)).toBe(1);
      expect(complianceService.calculateLoginSuccessRate(100, 0)).toBe(1);
      expect(complianceService.calculateLoginSuccessRate(80, 20)).toBe(0.8);
    });
  });
});

describe('Compliance API Routes', () => {
  let testPracticeId;
  let testUserId;
  let authToken;
  
  beforeAll(async () => {
    // Setup test data
    testPracticeId = 'test-practice-api-' + Date.now();
    testUserId = 'test-user-api-' + Date.now();
    
    // Create test practice
    await supabase.from('practices').insert({
      id: testPracticeId,
      name: 'Test API Practice',
      email: 'api@test.com'
    });
    
    // Create test user with compliance officer role
    await supabase.from('providers').insert({
      id: testUserId,
      email: 'compliance.officer@test.com',
      password_hash: 'test-hash',
      first_name: 'Compliance',
      last_name: 'Officer',
      role: 'compliance_officer',
      practice_id: testPracticeId
    });
    
    // Get auth token
    const authResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'compliance.officer@test.com',
        password: 'TestPassword123!'
      });
    
    authToken = authResponse.body.token;
  });
  
  afterAll(async () => {
    // Cleanup test data
    await supabase.from('compliance_alerts').delete().eq('practice_id', testPracticeId);
    await supabase.from('compliance_reports').delete().eq('practice_id', testPracticeId);
    await supabase.from('compliance_metrics').delete().eq('practice_id', testPracticeId);
    await supabase.from('compliance_violations').delete().eq('practice_id', testPracticeId);
    await supabase.from('providers').delete().eq('id', testUserId);
    await supabase.from('practices').delete().eq('id', testPracticeId);
  });
  
  describe('GET /api/v1/compliance/dashboard', () => {
    test('should return compliance dashboard data', async () => {
      const response = await request(app)
        .get('/api/v1/compliance/dashboard')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('dashboard');
      expect(response.body.data).toHaveProperty('recent_alerts');
      expect(response.body.data).toHaveProperty('compliance_metrics');
      expect(response.body.data).toHaveProperty('compliance_status');
    });
    
    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/compliance/dashboard');
      
      expect(response.status).toBe(401);
    });
    
    test('should require compliance officer role', async () => {
      // Create regular user
      const regularUserId = 'regular-user-' + Date.now();
      await supabase.from('providers').insert({
        id: regularUserId,
        email: 'regular@test.com',
        password_hash: 'test-hash',
        first_name: 'Regular',
        last_name: 'User',
        role: 'provider',
        practice_id: testPracticeId
      });
      
      const authResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'regular@test.com',
          password: 'TestPassword123!'
        });
      
      const regularToken = authResponse.body.token;
      
      const response = await request(app)
        .get('/api/v1/compliance/dashboard')
        .set('Authorization', `Bearer ${regularToken}`);
      
      expect(response.status).toBe(403);
      
      // Cleanup
      await supabase.from('providers').delete().eq('id', regularUserId);
    });
  });
  
  describe('GET /api/v1/compliance/alerts', () => {
    test('should return compliance alerts with pagination', async () => {
      // Create test alerts
      await supabase.from('compliance_alerts').insert([
        {
          severity: 'high',
          title: 'Test Alert 1',
          details: { test: 'data1' },
          practice_id: testPracticeId
        },
        {
          severity: 'medium',
          title: 'Test Alert 2',
          details: { test: 'data2' },
          practice_id: testPracticeId
        }
      ]);
      
      const response = await request(app)
        .get('/api/v1/compliance/alerts?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('alerts');
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.alerts.length).toBeGreaterThanOrEqual(2);
    });
    
    test('should filter alerts by severity', async () => {
      const response = await request(app)
        .get('/api/v1/compliance/alerts?severity=high')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.alerts.every(alert => alert.severity === 'high')).toBe(true);
    });
  });
  
  describe('PUT /api/v1/compliance/alerts/:alertId/resolve', () => {
    test('should resolve compliance alert', async () => {
      // Create test alert
      const { data: alert } = await supabase
        .from('compliance_alerts')
        .insert({
          severity: 'medium',
          title: 'Test Resolvable Alert',
          details: { test: 'resolve' },
          practice_id: testPracticeId
        })
        .select()
        .single();
      
      const response = await request(app)
        .put(`/api/v1/compliance/alerts/${alert.id}/resolve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          resolution_notes: 'Resolved during testing'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.resolved).toBe(true);
      expect(response.body.data.resolution_notes).toBe('Resolved during testing');
    });
    
    test('should return 404 for non-existent alert', async () => {
      const response = await request(app)
        .put('/api/v1/compliance/alerts/non-existent-id/resolve')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          resolution_notes: 'Test'
        });
      
      expect(response.status).toBe(404);
    });
  });
  
  describe('POST /api/v1/compliance/reports/generate', () => {
    test('should generate compliance report', async () => {
      const response = await request(app)
        .post('/api/v1/compliance/reports/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'custom',
          start_date: '2024-01-01T00:00:00Z',
          end_date: '2024-01-31T23:59:59Z'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('compliance_score');
      expect(response.body.data).toHaveProperty('audit_statistics');
    });
    
    test('should validate date range', async () => {
      const response = await request(app)
        .post('/api/v1/compliance/reports/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'custom',
          start_date: '2024-01-31T00:00:00Z',
          end_date: '2024-01-01T23:59:59Z' // End before start
        });
      
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Start date must be before end date');
    });
  });
  
  describe('GET /api/v1/compliance/violations', () => {
    test('should return compliance violations', async () => {
      // Create test violation
      await supabase.from('compliance_violations').insert({
        violation_type: 'unauthorized_access',
        severity: 'high',
        description: 'Test violation',
        user_id: testUserId,
        practice_id: testPracticeId
      });
      
      const response = await request(app)
        .get('/api/v1/compliance/violations')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('violations');
      expect(response.body.data).toHaveProperty('pagination');
    });
  });
  
  describe('GET /api/v1/compliance/metrics', () => {
    test('should return compliance metrics', async () => {
      // Create test metrics
      await supabase.from('compliance_metrics').insert([
        {
          metric_name: 'login_success_rate',
          metric_value: 95.5,
          metric_type: 'percentage',
          practice_id: testPracticeId
        },
        {
          metric_name: 'phi_access_count',
          metric_value: 150,
          metric_type: 'count',
          practice_id: testPracticeId
        }
      ]);
      
      const response = await request(app)
        .get('/api/v1/compliance/metrics')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    test('should filter metrics by name', async () => {
      const response = await request(app)
        .get('/api/v1/compliance/metrics?metric_name=login_success_rate')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.every(metric => metric.metric_name === 'login_success_rate')).toBe(true);
    });
  });
});

describe('Database Functions', () => {
  let testPracticeId;
  
  beforeAll(async () => {
    testPracticeId = 'test-practice-db-' + Date.now();
    
    await supabase.from('practices').insert({
      id: testPracticeId,
      name: 'Test DB Practice',
      email: 'db@test.com'
    });
  });
  
  afterAll(async () => {
    await supabase.from('compliance_alerts').delete().eq('practice_id', testPracticeId);
    await supabase.from('compliance_violations').delete().eq('practice_id', testPracticeId);
    await supabase.from('practices').delete().eq('id', testPracticeId);
  });
  
  test('should calculate compliance score using database function', async () => {
    const { data, error } = await supabase
      .rpc('calculate_compliance_score', {
        p_practice_id: testPracticeId
      });
    
    expect(error).toBeNull();
    expect(typeof data).toBe('number');
    expect(data).toBeGreaterThanOrEqual(0);
    expect(data).toBeLessThanOrEqual(100);
  });
  
  test('should log compliance metric using database function', async () => {
    const { data, error } = await supabase
      .rpc('log_compliance_metric', {
        p_metric_name: 'test_metric',
        p_metric_value: 75.5,
        p_metric_type: 'percentage',
        p_practice_id: testPracticeId,
        p_metadata: { test: 'data' }
      });
    
    expect(error).toBeNull();
    expect(data).toBeDefined(); // Should return UUID
    
    // Verify metric was stored
    const { data: metrics } = await supabase
      .from('compliance_metrics')
      .select('*')
      .eq('id', data)
      .single();
    
    expect(metrics.metric_name).toBe('test_metric');
    expect(metrics.metric_value).toBe(75.5);
    expect(metrics.metric_type).toBe('percentage');
  });
  
  test('should create compliance violation using database function', async () => {
    const { data, error } = await supabase
      .rpc('create_compliance_violation', {
        p_violation_type: 'test_violation',
        p_severity: 'medium',
        p_description: 'Test violation description',
        p_practice_id: testPracticeId,
        p_metadata: { source: 'test' }
      });
    
    expect(error).toBeNull();
    expect(data).toBeDefined(); // Should return UUID
    
    // Verify violation was stored
    const { data: violation } = await supabase
      .from('compliance_violations')
      .select('*')
      .eq('id', data)
      .single();
    
    expect(violation.violation_type).toBe('test_violation');
    expect(violation.severity).toBe('medium');
    expect(violation.description).toBe('Test violation description');
    expect(violation.resolved).toBe(false);
  });
});