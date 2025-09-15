const { WorkflowEngine } = require('../../src/services/workflowEngine');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('pg');
jest.mock('node-cron');

describe('WorkflowEngine', () => {
  let workflowEngine;
  let mockPool;
  let mockQuery;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockPool = {
      query: mockQuery,
      connect: jest.fn(),
      end: jest.fn()
    };
    Pool.mockImplementation(() => mockPool);
    
    workflowEngine = new WorkflowEngine(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize workflow engine successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      await workflowEngine.initialize();
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM workflow_states')
      );
    });

    it('should handle initialization errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));
      
      await expect(workflowEngine.initialize()).rejects.toThrow('Database connection failed');
    });
  });

  describe('createAuthorizationRequest', () => {
    const mockRequestData = {
      patientId: 'patient-123',
      providerId: 'provider-456',
      serviceType: 'MRI',
      procedureCode: '70553',
      diagnosisCode: 'M25.511',
      urgency: 'routine'
    };

    beforeEach(() => {
      // Mock smart field detection responses
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123', name: 'John Doe' }] }) // Patient lookup
        .mockResolvedValueOnce({ rows: [{ id: 'provider-456', name: 'Dr. Smith' }] }) // Provider lookup
        .mockResolvedValueOnce({ rows: [{ payer_id: 'payer-789', name: 'Insurance Co' }] }) // Payer lookup
        .mockResolvedValueOnce({ rows: [{ estimated_cost: 1500 }] }) // Cost estimation
        .mockResolvedValueOnce({ rows: [{ id: 'auth-001' }] }); // Insert authorization
    });

    it('should create authorization request with smart field detection', async () => {
      const result = await workflowEngine.createAuthorizationRequest(mockRequestData);
      
      expect(result).toHaveProperty('authorizationId');
      expect(result).toHaveProperty('detectedFields');
      expect(result.detectedFields).toHaveProperty('serviceType');
      expect(result.detectedFields).toHaveProperty('payerInfo');
      expect(result.detectedFields).toHaveProperty('urgencyLevel');
      expect(result.detectedFields).toHaveProperty('estimatedCost');
    });

    it('should handle missing patient data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No patient found
      
      await expect(workflowEngine.createAuthorizationRequest(mockRequestData))
        .rejects.toThrow('Patient not found');
    });

    it('should detect high urgency correctly', async () => {
      const urgentRequest = { ...mockRequestData, urgency: 'urgent' };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'provider-456' }] })
        .mockResolvedValueOnce({ rows: [{ payer_id: 'payer-789' }] })
        .mockResolvedValueOnce({ rows: [{ estimated_cost: 1500 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'auth-001' }] });
      
      const result = await workflowEngine.createAuthorizationRequest(urgentRequest);
      
      expect(result.detectedFields.urgencyLevel).toBe('high');
    });
  });

  describe('advanceWorkflowState', () => {
    it('should advance workflow state successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ current_state: 'pending_review', payer_id: 'payer-123' }] })
        .mockResolvedValueOnce({ rows: [{ next_state: 'approved' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'auth-001' }] });
      
      const result = await workflowEngine.advanceWorkflowState('auth-001', 'approve');
      
      expect(result.success).toBe(true);
      expect(result.newState).toBe('approved');
    });

    it('should handle invalid state transitions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ current_state: 'approved' }] })
        .mockResolvedValueOnce({ rows: [] }); // No valid transition
      
      const result = await workflowEngine.advanceWorkflowState('auth-001', 'submit');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state transition');
    });

    it('should handle non-existent authorization', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      const result = await workflowEngine.advanceWorkflowState('invalid-id', 'approve');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Authorization not found');
    });
  });

  describe('applyAutomationRules', () => {
    it('should auto-approve low-cost routine procedures', async () => {
      const authData = {
        id: 'auth-001',
        estimated_cost: 200,
        urgency_level: 'routine',
        procedure_code: '99213',
        payer_id: 'payer-123'
      };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [{ auto_approve_threshold: 500 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'auth-001' }] });
      
      const result = await workflowEngine.applyAutomationRules(authData);
      
      expect(result.autoApproved).toBe(true);
      expect(result.reason).toContain('low-cost routine procedure');
    });

    it('should not auto-approve high-cost procedures', async () => {
      const authData = {
        id: 'auth-001',
        estimated_cost: 5000,
        urgency_level: 'routine',
        procedure_code: '70553',
        payer_id: 'payer-123'
      };
      
      mockQuery.mockResolvedValueOnce({ rows: [{ auto_approve_threshold: 500 }] });
      
      const result = await workflowEngine.applyAutomationRules(authData);
      
      expect(result.autoApproved).toBe(false);
      expect(result.reason).toContain('exceeds auto-approval threshold');
    });

    it('should handle urgent procedures differently', async () => {
      const authData = {
        id: 'auth-001',
        estimated_cost: 800,
        urgency_level: 'urgent',
        procedure_code: '70553',
        payer_id: 'payer-123'
      };
      
      mockQuery
        .mockResolvedValueOnce({ rows: [{ auto_approve_threshold: 500, urgent_threshold: 1000 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'auth-001' }] });
      
      const result = await workflowEngine.applyAutomationRules(authData);
      
      expect(result.autoApproved).toBe(true);
      expect(result.reason).toContain('urgent procedure');
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return workflow status with history', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ 
          id: 'auth-001',
          current_state: 'pending_review',
          created_at: new Date(),
          estimated_cost: 1500
        }] })
        .mockResolvedValueOnce({ rows: [
          { state: 'submitted', timestamp: new Date(), notes: 'Initial submission' },
          { state: 'pending_review', timestamp: new Date(), notes: 'Under review' }
        ] });
      
      const result = await workflowEngine.getWorkflowStatus('auth-001');
      
      expect(result).toHaveProperty('authorization');
      expect(result).toHaveProperty('history');
      expect(result.history).toHaveLength(2);
    });

    it('should handle non-existent authorization', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      const result = await workflowEngine.getWorkflowStatus('invalid-id');
      
      expect(result).toBeNull();
    });
  });

  describe('detectServiceType', () => {
    it('should detect imaging services', () => {
      const result = workflowEngine.detectServiceType('70553', 'M25.511');
      
      expect(result.category).toBe('imaging');
      expect(result.subcategory).toBe('MRI');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect surgical procedures', () => {
      const result = workflowEngine.detectServiceType('29881', 'M23.200');
      
      expect(result.category).toBe('surgery');
      expect(result.subcategory).toBe('arthroscopy');
    });

    it('should handle unknown procedure codes', () => {
      const result = workflowEngine.detectServiceType('99999', 'Z00.00');
      
      expect(result.category).toBe('other');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('estimateCost', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_cost: 1200, min_cost: 800, max_cost: 1800 }] });
    });

    it('should estimate cost based on procedure and payer', async () => {
      const result = await workflowEngine.estimateCost('70553', 'payer-123');
      
      expect(result).toHaveProperty('estimated');
      expect(result).toHaveProperty('range');
      expect(result.estimated).toBe(1200);
      expect(result.range.min).toBe(800);
      expect(result.range.max).toBe(1800);
    });

    it('should handle procedures without cost data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      const result = await workflowEngine.estimateCost('99999', 'payer-123');
      
      expect(result.estimated).toBe(0);
      expect(result.confidence).toBe('low');
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Connection timeout'));
      
      await expect(workflowEngine.createAuthorizationRequest({})).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      const invalidData = { patientId: null };
      
      await expect(workflowEngine.createAuthorizationRequest(invalidData))
        .rejects.toThrow('Patient ID is required');
    });
  });

  describe('performance', () => {
    it('should complete authorization creation within reasonable time', async () => {
      const startTime = Date.now();
      
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'patient-123' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'provider-456' }] })
        .mockResolvedValueOnce({ rows: [{ payer_id: 'payer-789' }] })
        .mockResolvedValueOnce({ rows: [{ estimated_cost: 1500 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'auth-001' }] });
      
      await workflowEngine.createAuthorizationRequest({
        patientId: 'patient-123',
        providerId: 'provider-456',
        serviceType: 'MRI',
        procedureCode: '70553'
      });
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});