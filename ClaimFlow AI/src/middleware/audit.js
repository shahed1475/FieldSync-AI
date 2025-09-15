const { auditLogger, logHelpers } = require('../utils/logger');
const { supabase } = require('../database/connection');

/**
 * HIPAA-compliant audit middleware
 * Logs all API requests and responses for compliance tracking
 */
const auditMiddleware = async (req, res, next) => {
  const startTime = Date.now();
  const correlationId = logHelpers.createCorrelationId();
  
  // Add correlation ID to request for tracking
  req.correlationId = correlationId;
  
  // Extract request information
  const requestInfo = {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  };
  
  // Extract user information if available
  if (req.user) {
    requestInfo.userId = req.user.id;
    requestInfo.practiceId = req.user.practice_id;
    requestInfo.userRole = req.user.role;
  }
  
  // Determine if this is a PHI-related request
  const phiEndpoints = ['/patients', '/authorizations', '/documents'];
  const isPHIRequest = phiEndpoints.some(endpoint => req.path.includes(endpoint));
  
  // Determine risk level based on request
  let riskLevel = 'low';
  if (req.method === 'DELETE') {
    riskLevel = 'high';
  } else if (isPHIRequest || req.method === 'POST' || req.method === 'PUT') {
    riskLevel = 'medium';
  }
  
  // Log request start
  auditLogger.info('API Request Started', {
    ...requestInfo,
    action: 'API_REQUEST_START',
    riskLevel,
    phiAccessed: isPHIRequest,
    complianceFlags: isPHIRequest ? ['PHI_ENDPOINT'] : []
  });
  
  // Override res.json to capture response data
  const originalJson = res.json;
  let responseData = null;
  
  res.json = function(data) {
    responseData = data;
    return originalJson.call(this, data);
  };
  
  // Override res.send to capture response data
  const originalSend = res.send;
  
  res.send = function(data) {
    if (!responseData) {
      responseData = data;
    }
    return originalSend.call(this, data);
  };
  
  // Capture response when finished
  res.on('finish', async () => {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Determine outcome based on status code
    const outcome = res.statusCode < 400 ? 'success' : 'failure';
    
    // Prepare response audit data
    const responseInfo = {
      correlationId,
      statusCode: res.statusCode,
      duration,
      outcome,
      responseSize: res.get('Content-Length') || 0,
      timestamp: new Date().toISOString()
    };
    
    // Add error information for failed requests
    if (outcome === 'failure') {
      responseInfo.errorType = getErrorType(res.statusCode);
      responseInfo.riskLevel = 'high';
      
      // Log security-relevant failures
      if (res.statusCode === 401 || res.statusCode === 403) {
        logHelpers.logSecurityViolation(
          `Unauthorized access attempt to ${req.path}`,
          'medium',
          {
            ...requestInfo,
            statusCode: res.statusCode,
            correlationId
          }
        );
      }
    }
    
    // Log response completion
    auditLogger.info('API Request Completed', {
      ...requestInfo,
      ...responseInfo,
      action: 'API_REQUEST_COMPLETE',
      riskLevel: responseInfo.riskLevel || riskLevel,
      phiAccessed: isPHIRequest,
      complianceFlags: isPHIRequest ? ['PHI_ENDPOINT'] : []
    });
    
    // Log performance metrics
    logHelpers.logPerformance(
      `${req.method} ${req.path}`,
      duration,
      {
        correlationId,
        statusCode: res.statusCode,
        userId: req.user?.id
      }
    );
    
    // Store audit record in database for long-term compliance
    try {
      await storeAuditRecord({
        ...requestInfo,
        ...responseInfo,
        action: 'API_REQUEST',
        table_name: 'api_requests',
        description: `${req.method} ${req.path}`,
        risk_level: getRiskLevelNumber(responseInfo.riskLevel || riskLevel)
      });
    } catch (error) {
      auditLogger.error('Failed to store audit record', {
        error: error.message,
        correlationId
      });
    }
  });
  
  next();
};

/**
 * Store audit record in database
 */
async function storeAuditRecord(auditData) {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        action: auditData.action,
        table_name: auditData.table_name,
        record_id: auditData.resourceId,
        user_id: auditData.userId,
        user_role: auditData.userRole,
        practice_id: auditData.practiceId,
        ip_address: auditData.ipAddress,
        user_agent: auditData.userAgent,
        session_id: auditData.correlationId,
        description: auditData.description,
        risk_level: auditData.risk_level,
        old_values: auditData.oldValues,
        new_values: auditData.newValues,
        timestamp: new Date().toISOString()
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    // Don't throw here to avoid breaking the request flow
    auditLogger.error('Database audit logging failed', {
      error: error.message,
      auditData: JSON.stringify(auditData)
    });
  }
}

/**
 * Get error type based on status code
 */
function getErrorType(statusCode) {
  const errorTypes = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Validation Error',
    429: 'Rate Limited',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return errorTypes[statusCode] || 'Unknown Error';
}

/**
 * Convert risk level string to number for database storage
 */
function getRiskLevelNumber(riskLevel) {
  const levels = {
    'low': 1,
    'medium': 2,
    'high': 3,
    'critical': 4
  };
  
  return levels[riskLevel] || 1;
}

/**
 * Middleware to log database operations
 */
const auditDatabaseOperation = (operation, tableName) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Store original operation for later logging
    req.auditInfo = {
      operation: operation.toUpperCase(),
      tableName,
      startTime,
      correlationId: req.correlationId
    };
    
    next();
  };
};

/**
 * Log successful database operation
 */
const logDatabaseSuccess = (req, recordId, oldData = null, newData = null) => {
  if (!req.auditInfo) return;
  
  const duration = Date.now() - req.auditInfo.startTime;
  
  logHelpers.logDatabaseOperation(
    req.auditInfo.operation,
    req.auditInfo.tableName,
    recordId,
    req.user?.id,
    {
      correlationId: req.auditInfo.correlationId,
      duration,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }
  );
  
  // Store detailed audit record
  storeAuditRecord({
    action: req.auditInfo.operation,
    table_name: req.auditInfo.tableName,
    resourceId: recordId,
    userId: req.user?.id,
    userRole: req.user?.role,
    practiceId: req.user?.practice_id,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    correlationId: req.auditInfo.correlationId,
    description: `${req.auditInfo.operation} operation on ${req.auditInfo.tableName}`,
    risk_level: req.auditInfo.operation === 'DELETE' ? 3 : 2,
    oldValues: oldData,
    newValues: newData
  });
};

/**
 * Middleware to validate HIPAA compliance requirements
 */
const validateHIPAACompliance = (req, res, next) => {
  const complianceChecks = [];
  
  // Check for required headers
  if (!req.get('User-Agent')) {
    complianceChecks.push('Missing User-Agent header');
  }
  
  // Check for authentication on protected endpoints
  const protectedPaths = ['/patients', '/authorizations', '/documents', '/providers'];
  const isProtectedPath = protectedPaths.some(path => req.path.includes(path));
  
  if (isProtectedPath && !req.user) {
    complianceChecks.push('Unauthenticated access to protected resource');
  }
  
  // Check for proper content type on POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.get('Content-Type')) {
    complianceChecks.push('Missing Content-Type header');
  }
  
  // Log compliance violations
  if (complianceChecks.length > 0) {
    auditLogger.warn('HIPAA Compliance Violations Detected', {
      violations: complianceChecks,
      method: req.method,
      path: req.path,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      correlationId: req.correlationId,
      riskLevel: 'high',
      complianceFlags: ['HIPAA_VIOLATION']
    });
  }
  
  next();
};

// Function that returns audit middleware with custom message
const auditLog = (message) => {
  return (req, res, next) => {
    // Add custom audit message to request
    req.auditMessage = message;
    return auditMiddleware(req, res, next);
  };
};

module.exports = {
  auditMiddleware,
  auditLog,
  auditDatabaseOperation,
  logDatabaseSuccess,
  validateHIPAACompliance,
  storeAuditRecord
};