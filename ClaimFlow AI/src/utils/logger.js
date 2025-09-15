const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };
    
    // Add correlation ID if available
    if (meta.correlationId) {
      logEntry.correlationId = meta.correlationId;
    }
    
    return JSON.stringify(logEntry);
  })
);

// HIPAA-compliant audit format
const auditFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const auditEntry = {
      timestamp,
      level: level.toUpperCase(),
      event: message,
      userId: meta.userId || 'system',
      practiceId: meta.practiceId,
      sessionId: meta.sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      action: meta.action,
      resource: meta.resource,
      resourceId: meta.resourceId,
      outcome: meta.outcome || 'success',
      riskLevel: meta.riskLevel || 'low',
      phi_accessed: meta.phiAccessed || false,
      compliance_flags: meta.complianceFlags || [],
      additional_data: meta.additionalData || {},
      ...meta
    };
    
    return JSON.stringify(auditEntry);
  })
);

// Application logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: {
    service: 'claimflow-ai',
    version: process.env.API_VERSION || 'v1',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
      silent: process.env.NODE_ENV === 'production'
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'application.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    }),
    
    // Error-specific log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 3
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 3
    })
  ]
});

// HIPAA-compliant audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: auditFormat,
  defaultMeta: {
    service: 'claimflow-ai-audit',
    version: process.env.API_VERSION || 'v1',
    environment: process.env.NODE_ENV || 'development',
    compliance_standard: 'HIPAA'
  },
  transports: [
    // Dedicated audit log file
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 50, // Keep more audit files for compliance
      tailable: true
    }),
    
    // High-risk events to separate file
    new winston.transports.File({
      filename: path.join(logsDir, 'audit-high-risk.log'),
      level: 'warn',
      maxsize: 50 * 1024 * 1024,
      maxFiles: 20,
      tailable: true
    })
  ]
});

// Security logger for authentication and authorization events
const securityLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: {
    service: 'claimflow-ai-security',
    category: 'security'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 10,
      tailable: true
    })
  ]
});

// Performance logger for monitoring
const performanceLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: {
    service: 'claimflow-ai-performance',
    category: 'performance'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      maxsize: 25 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Helper functions for structured logging
const logHelpers = {
  /**
   * Log user authentication events
   */
  logAuth(event, userId, success, metadata = {}) {
    const logData = {
      userId,
      action: event,
      outcome: success ? 'success' : 'failure',
      riskLevel: success ? 'low' : 'medium',
      ...metadata
    };
    
    if (success) {
      securityLogger.info(`Authentication ${event} successful`, logData);
      auditLogger.info(`User authentication: ${event}`, logData);
    } else {
      securityLogger.warn(`Authentication ${event} failed`, logData);
      auditLogger.warn(`User authentication failed: ${event}`, logData);
    }
  },
  
  /**
   * Log PHI access events
   */
  logPHIAccess(userId, action, resourceType, resourceId, metadata = {}) {
    const logData = {
      userId,
      action,
      resource: resourceType,
      resourceId,
      phiAccessed: true,
      riskLevel: 'high',
      complianceFlags: ['PHI_ACCESS'],
      ...metadata
    };
    
    auditLogger.info(`PHI Access: ${action} on ${resourceType}`, logData);
    logger.info(`PHI accessed: ${resourceType}/${resourceId}`, logData);
  },
  
  /**
   * Log data export events
   */
  logDataExport(userId, exportType, recordCount, metadata = {}) {
    const logData = {
      userId,
      action: 'EXPORT',
      exportType,
      recordCount,
      riskLevel: 'high',
      complianceFlags: ['DATA_EXPORT'],
      ...metadata
    };
    
    auditLogger.warn(`Data export: ${exportType} (${recordCount} records)`, logData);
    securityLogger.warn('Data export performed', logData);
  },
  
  /**
   * Log security violations
   */
  logSecurityViolation(event, severity, metadata = {}) {
    const logData = {
      action: 'SECURITY_VIOLATION',
      violation: event,
      riskLevel: 'critical',
      complianceFlags: ['SECURITY_INCIDENT'],
      ...metadata
    };
    
    securityLogger.error(`Security violation: ${event}`, logData);
    auditLogger.error(`Security incident: ${event}`, logData);
    logger.error(`Security violation detected: ${event}`, logData);
  },
  
  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, metadata = {}) {
    const logData = {
      operation,
      duration,
      unit: 'ms',
      ...metadata
    };
    
    performanceLogger.info(`Performance: ${operation}`, logData);
    
    // Log slow operations as warnings
    if (duration > 5000) { // 5 seconds
      logger.warn(`Slow operation detected: ${operation}`, logData);
    }
  },
  
  /**
   * Log database operations
   */
  logDatabaseOperation(operation, table, recordId, userId, metadata = {}) {
    const logData = {
      userId,
      action: operation.toUpperCase(),
      resource: 'database',
      table,
      resourceId: recordId,
      riskLevel: operation === 'DELETE' ? 'high' : 'medium',
      ...metadata
    };
    
    auditLogger.info(`Database ${operation}: ${table}`, logData);
  },
  
  /**
   * Log system events
   */
  logSystemEvent(event, level = 'info', metadata = {}) {
    const logData = {
      action: 'SYSTEM_EVENT',
      event,
      ...metadata
    };
    
    logger[level](`System event: ${event}`, logData);
    
    if (level === 'error' || level === 'warn') {
      auditLogger[level](`System event: ${event}`, logData);
    }
  },
  
  /**
   * Create correlation ID for request tracking
   */
  createCorrelationId() {
    return require('uuid').v4();
  },
  
  /**
   * Add correlation ID to logger context
   */
  withCorrelation(correlationId) {
    return {
      info: (message, meta = {}) => logger.info(message, { ...meta, correlationId }),
      warn: (message, meta = {}) => logger.warn(message, { ...meta, correlationId }),
      error: (message, meta = {}) => logger.error(message, { ...meta, correlationId }),
      debug: (message, meta = {}) => logger.debug(message, { ...meta, correlationId })
    };
  }
};

// Log rotation cleanup (run daily)
setInterval(() => {
  const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 2555; // 7 years
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  // This is a placeholder - in production, implement proper log archival
  logger.info('Log retention check completed', {
    retentionDays,
    cutoffDate: cutoffDate.toISOString()
  });
}, 24 * 60 * 60 * 1000); // 24 hours

// Export loggers and helpers
module.exports = {
  logger,
  auditLogger,
  securityLogger,
  performanceLogger,
  ...logHelpers
};