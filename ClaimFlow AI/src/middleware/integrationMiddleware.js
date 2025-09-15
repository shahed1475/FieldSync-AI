const ComplianceService = require('../services/complianceService');
const { authenticateToken, requireRole, hipaaCompliance, sanitizeInput } = require('./security');
const WorkflowEngine = require('../services/workflowEngine');
const NotificationService = require('../services/notificationService');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

class IntegrationMiddleware {
  constructor() {
    this.complianceService = new ComplianceService();
    this.workflowEngine = new WorkflowEngine();
    this.notificationService = new NotificationService();
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    this.initialize();
  }

  async initialize() {
    try {
      await this.complianceService.initialize();
      await this.workflowEngine.initialize();
      await this.notificationService.initialize();
      console.log('Integration middleware initialized successfully');
    } catch (error) {
      console.error('Failed to initialize integration middleware:', error);
      throw error;
    }
  }

  // Comprehensive authorization workflow middleware
  authorizationWorkflowMiddleware() {
    return [
      // Security layer
      sanitizeInput,
      authenticateToken,
      
      // Rate limiting for authorization endpoints
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many authorization requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false
      }),
      
      // HIPAA compliance logging
      hipaaCompliance,
      
      // Custom authorization tracking
      this.trackAuthorizationActivity.bind(this),
      
      // Workflow state validation
      this.validateWorkflowState.bind(this),
      
      // Compliance checks
      this.performComplianceChecks.bind(this)
    ];
  }

  // Track authorization activity for compliance
  async trackAuthorizationActivity(req, res, next) {
    try {
      const startTime = Date.now();
      
      // Log the request
      await this.complianceService.logAuditEvent({
        userId: req.user?.id,
        action: `${req.method}_${req.route?.path || req.path}`,
        resourceType: 'authorization',
        resourceId: req.params.id || req.body.authorizationId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestData: this.sanitizeRequestData(req.body),
        sessionId: req.sessionID,
        riskLevel: this.assessRiskLevel(req)
      });

      // Override res.json to capture response data
      const originalJson = res.json;
      res.json = function(data) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Log response for audit trail
        this.complianceService.logAuditEvent({
          userId: req.user?.id,
          action: `${req.method}_${req.route?.path || req.path}_RESPONSE`,
          resourceType: 'authorization',
          resourceId: req.params.id || data?.id,
          responseStatus: res.statusCode,
          responseTime,
          sessionId: req.sessionID
        }).catch(err => console.error('Failed to log response:', err));
        
        return originalJson.call(this, data);
      }.bind(this);

      next();
    } catch (error) {
      console.error('Failed to track authorization activity:', error);
      next(); // Continue even if tracking fails
    }
  }

  // Validate workflow state transitions
  async validateWorkflowState(req, res, next) {
    try {
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const authorizationId = req.params.id || req.body.authorizationId;
        
        if (authorizationId && req.body.status) {
          // Get current authorization state
          const currentAuth = await this.pool.query(
            'SELECT status, workflow_state FROM authorizations WHERE id = $1',
            [authorizationId]
          );

          if (currentAuth.rows.length > 0) {
            const currentState = currentAuth.rows[0].workflow_state;
            const newState = req.body.status;

            // Validate state transition
            const isValidTransition = await this.workflowEngine.validateStateTransition(
              currentState,
              newState,
              req.user.role
            );

            if (!isValidTransition) {
              await this.complianceService.reportViolation({
                violationType: 'invalid_state_transition',
                severity: 'medium',
                description: `Invalid workflow state transition from ${currentState} to ${newState}`,
                resourceType: 'authorization',
                resourceId: authorizationId,
                userId: req.user.id
              });

              return res.status(400).json({
                error: 'Invalid workflow state transition',
                currentState,
                requestedState: newState
              });
            }
          }
        }
      }
      
      next();
    } catch (error) {
      console.error('Failed to validate workflow state:', error);
      next();
    }
  }

  // Perform compliance checks
  async performComplianceChecks(req, res, next) {
    try {
      // Check for suspicious patterns
      await this.checkSuspiciousPatterns(req);
      
      // Validate data access permissions
      await this.validateDataAccess(req);
      
      // Check business rules compliance
      await this.checkBusinessRules(req);
      
      next();
    } catch (error) {
      console.error('Compliance check failed:', error);
      
      // Log compliance failure
      await this.complianceService.reportViolation({
        violationType: 'compliance_check_failure',
        severity: 'high',
        description: `Compliance check failed: ${error.message}`,
        userId: req.user?.id,
        resourceType: 'system'
      });
      
      res.status(500).json({ error: 'Compliance validation failed' });
    }
  }

  // Check for suspicious activity patterns
  async checkSuspiciousPatterns(req) {
    const userId = req.user?.id;
    if (!userId) return;

    // Check for rapid successive requests
    const recentRequests = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '1 minute'
    `, [userId]);

    if (parseInt(recentRequests.rows[0].count) > 10) {
      await this.complianceService.reportViolation({
        violationType: 'rapid_requests',
        severity: 'medium',
        description: `User making ${recentRequests.rows[0].count} requests per minute`,
        userId
      });
    }

    // Check for off-hours access
    const currentHour = new Date().getHours();
    if (currentHour < 6 || currentHour > 22) {
      await this.complianceService.logAuditEvent({
        userId,
        action: 'off_hours_access',
        resourceType: 'system',
        riskLevel: 'medium',
        ipAddress: req.ip
      });
    }

    // Check for geographic anomalies (simplified)
    const userLocation = this.extractLocationFromIP(req.ip);
    if (userLocation && userLocation !== 'expected_location') {
      await this.complianceService.logAuditEvent({
        userId,
        action: 'geographic_anomaly',
        resourceType: 'system',
        riskLevel: 'high',
        ipAddress: req.ip,
        requestData: { location: userLocation }
      });
    }
  }

  // Validate data access permissions
  async validateDataAccess(req) {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // Check if user is accessing patient data
    const patientId = req.params.patientId || req.body.patientId;
    if (patientId) {
      // Log PHI access
      await this.complianceService.logDataAccess({
        userId,
        patientId,
        dataType: 'patient_record',
        accessType: req.method.toLowerCase(),
        purpose: req.body.purpose || 'authorization_processing',
        ipAddress: req.ip,
        authorized: true
      });

      // Check if user has permission to access this patient's data
      const hasPermission = await this.checkPatientAccessPermission(userId, patientId, userRole);
      if (!hasPermission) {
        await this.complianceService.logDataAccess({
          userId,
          patientId,
          dataType: 'patient_record',
          accessType: req.method.toLowerCase(),
          purpose: 'unauthorized_attempt',
          ipAddress: req.ip,
          authorized: false
        });
        
        throw new Error('Unauthorized access to patient data');
      }
    }
  }

  // Check business rules compliance
  async checkBusinessRules(req) {
    // Validate authorization amount limits
    if (req.body.estimatedCost) {
      const cost = parseFloat(req.body.estimatedCost);
      const userRole = req.user?.role;
      
      const approvalLimits = {
        'staff': 1000,
        'supervisor': 5000,
        'manager': 25000,
        'admin': Infinity
      };
      
      const userLimit = approvalLimits[userRole] || 0;
      
      if (cost > userLimit) {
        await this.complianceService.reportViolation({
          violationType: 'approval_limit_exceeded',
          severity: 'medium',
          description: `User attempted to approve $${cost} authorization (limit: $${userLimit})`,
          userId: req.user.id,
          resourceType: 'authorization'
        });
        
        throw new Error(`Authorization amount exceeds approval limit ($${userLimit})`);
      }
    }

    // Validate required documentation
    if (req.body.status === 'submitted' && req.body.requiredDocuments) {
      const missingDocs = req.body.requiredDocuments.filter(doc => !doc.uploaded);
      if (missingDocs.length > 0) {
        throw new Error(`Missing required documents: ${missingDocs.map(d => d.name).join(', ')}`);
      }
    }
  }

  // Check patient access permission
  async checkPatientAccessPermission(userId, patientId, userRole) {
    try {
      // Admin and managers have access to all patients
      if (['admin', 'manager'].includes(userRole)) {
        return true;
      }

      // Check if user is assigned to this patient
      const assignment = await this.pool.query(`
        SELECT 1 FROM patient_assignments 
        WHERE user_id = $1 AND patient_id = $2 AND active = true
      `, [userId, patientId]);

      if (assignment.rows.length > 0) {
        return true;
      }

      // Check if user is part of the care team
      const careTeam = await this.pool.query(`
        SELECT 1 FROM care_team_members 
        WHERE user_id = $1 AND patient_id = $2 AND active = true
      `, [userId, patientId]);

      return careTeam.rows.length > 0;
    } catch (error) {
      console.error('Failed to check patient access permission:', error);
      return false;
    }
  }

  // Assess risk level of request
  assessRiskLevel(req) {
    let riskScore = 0;
    
    // High-risk operations
    const highRiskActions = ['DELETE', 'export', 'bulk_update'];
    if (highRiskActions.some(action => req.path.includes(action) || req.method === 'DELETE')) {
      riskScore += 3;
    }
    
    // Sensitive data access
    if (req.path.includes('patient') || req.body.patientId) {
      riskScore += 2;
    }
    
    // Off-hours access
    const currentHour = new Date().getHours();
    if (currentHour < 6 || currentHour > 22) {
      riskScore += 2;
    }
    
    // External IP (simplified check)
    if (!req.ip.startsWith('192.168.') && !req.ip.startsWith('10.')) {
      riskScore += 1;
    }
    
    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  // Sanitize request data for logging
  sanitizeRequestData(data) {
    if (!data) return null;
    
    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'ssn', 'creditCard', 'bankAccount'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  // Extract location from IP (simplified)
  extractLocationFromIP(ip) {
    // In a real implementation, you would use a GeoIP service
    // This is a simplified placeholder
    if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return 'internal_network';
    }
    return 'external';
  }

  // Notification integration middleware
  notificationMiddleware() {
    return async (req, res, next) => {
      try {
        // Override res.json to trigger notifications
        const originalJson = res.json;
        res.json = function(data) {
          // Trigger notifications based on response
          this.handleNotificationTriggers(req, res, data)
            .catch(err => console.error('Notification trigger failed:', err));
          
          return originalJson.call(this, data);
        }.bind(this);
        
        next();
      } catch (error) {
        console.error('Notification middleware error:', error);
        next();
      }
    };
  }

  // Handle notification triggers
  async handleNotificationTriggers(req, res, data) {
    try {
      const statusCode = res.statusCode;
      const method = req.method;
      const path = req.path;
      
      // Authorization status changes
      if (path.includes('authorization') && method === 'PUT' && statusCode === 200) {
        if (data.status && data.status !== data.previousStatus) {
          await this.notificationService.sendNotification({
            type: 'authorization_status_change',
            recipients: [data.submittedBy, data.assignedTo].filter(Boolean),
            data: {
              authorizationId: data.id,
              newStatus: data.status,
              previousStatus: data.previousStatus,
              patientName: data.patientName
            }
          });
        }
      }
      
      // High-priority alerts
      if (statusCode >= 400) {
        await this.notificationService.sendNotification({
          type: 'system_alert',
          recipients: ['admin'],
          priority: 'high',
          data: {
            error: data.error,
            path,
            method,
            userId: req.user?.id,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Compliance violations
      if (data.violationType) {
        await this.notificationService.sendNotification({
          type: 'compliance_violation',
          recipients: ['compliance_team'],
          priority: data.severity === 'high' ? 'urgent' : 'normal',
          data
        });
      }
    } catch (error) {
      console.error('Failed to handle notification triggers:', error);
    }
  }

  // Workflow integration middleware
  workflowMiddleware() {
    return async (req, res, next) => {
      try {
        // Add workflow context to request
        if (req.params.id || req.body.authorizationId) {
          const authId = req.params.id || req.body.authorizationId;
          const workflow = await this.workflowEngine.getWorkflowState(authId);
          req.workflow = workflow;
        }
        
        next();
      } catch (error) {
        console.error('Workflow middleware error:', error);
        next();
      }
    };
  }

  // Get all middleware for authorization routes
  getAuthorizationMiddleware() {
    return [
      ...this.authorizationWorkflowMiddleware(),
      this.notificationMiddleware(),
      this.workflowMiddleware()
    ];
  }

  // Get middleware for admin routes
  getAdminMiddleware() {
    return [
      sanitizeInput,
      authenticateToken,
      requireRole(['admin', 'manager']),
      hipaaCompliance,
      this.trackAuthorizationActivity.bind(this)
    ];
  }

  // Get middleware for reporting routes
  getReportingMiddleware() {
    return [
      sanitizeInput,
      authenticateToken,
      requireRole(['admin', 'manager', 'compliance']),
      rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // limit each user to 10 report requests per hour
        message: 'Too many report requests'
      }),
      this.trackAuthorizationActivity.bind(this)
    ];
  }
}

module.exports = IntegrationMiddleware;