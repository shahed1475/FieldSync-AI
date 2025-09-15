const { logger, auditLogger, logHelpers } = require('../utils/logger');

/**
 * Global error handler middleware
 * Provides consistent error responses and comprehensive logging
 */
const errorHandler = (err, req, res, next) => {
  // Default error response
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || getErrorCode(statusCode);
  
  // Error context for logging
  const errorContext = {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: sanitizeHeaders(req.headers),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      correlationId: req.correlationId
    },
    user: req.user ? {
      id: req.user.id,
      role: req.user.role,
      practice_id: req.user.practice_id
    } : null,
    timestamp: new Date().toISOString()
  };
  
  // Handle specific error types
  switch (err.name) {
    case 'ValidationError':
      statusCode = 422;
      message = 'Validation failed';
      code = 'VALIDATION_ERROR';
      break;
      
    case 'CastError':
      statusCode = 400;
      message = 'Invalid data format';
      code = 'INVALID_FORMAT';
      break;
      
    case 'JsonWebTokenError':
      statusCode = 401;
      message = 'Invalid authentication token';
      code = 'INVALID_TOKEN';
      break;
      
    case 'TokenExpiredError':
      statusCode = 401;
      message = 'Authentication token expired';
      code = 'TOKEN_EXPIRED';
      break;
      
    case 'MulterError':
      statusCode = 400;
      message = handleMulterError(err);
      code = 'FILE_UPLOAD_ERROR';
      break;
      
    case 'SequelizeValidationError':
    case 'SequelizeUniqueConstraintError':
      statusCode = 422;
      message = 'Database validation failed';
      code = 'DATABASE_VALIDATION_ERROR';
      break;
      
    case 'SequelizeForeignKeyConstraintError':
      statusCode = 409;
      message = 'Referenced record does not exist';
      code = 'FOREIGN_KEY_CONSTRAINT';
      break;
  }
  
  // Handle Supabase errors
  if (err.code && err.code.startsWith('PGRST')) {
    const supabaseError = handleSupabaseError(err);
    statusCode = supabaseError.statusCode;
    message = supabaseError.message;
    code = supabaseError.code;
  }
  
  // Determine log level based on status code
  const logLevel = getLogLevel(statusCode);
  
  // Log the error
  logger[logLevel]('Request error occurred', {
    ...errorContext,
    statusCode,
    finalMessage: message,
    finalCode: code
  });
  
  // Log security-related errors to audit trail
  if (isSecurityError(statusCode, err)) {
    auditLogger.warn('Security-related error', {
      ...errorContext,
      action: 'SECURITY_ERROR',
      riskLevel: 'medium',
      complianceFlags: ['SECURITY_INCIDENT']
    });
  }
  
  // Log HIPAA compliance violations
  if (isHIPAAViolation(err)) {
    auditLogger.error('HIPAA compliance violation', {
      ...errorContext,
      action: 'HIPAA_VIOLATION',
      riskLevel: 'critical',
      complianceFlags: ['HIPAA_VIOLATION', 'COMPLIANCE_INCIDENT']
    });
  }
  
  // Prepare error response
  const errorResponse = {
    error: message,
    code,
    timestamp: errorContext.timestamp,
    correlationId: req.correlationId
  };
  
  // Add validation details for validation errors
  if (statusCode === 422 && err.details) {
    errorResponse.validation_errors = err.details;
  }
  
  // Add stack trace in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.debug = {
      name: err.name,
      originalMessage: err.message
    };
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Handle async route errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create custom error with additional context
 */
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create validation error
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 422, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Create authentication error
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_REQUIRED');
    this.name = 'AuthenticationError';
  }
}

/**
 * Create authorization error
 */
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'INSUFFICIENT_PERMISSIONS');
    this.name = 'AuthorizationError';
  }
}

/**
 * Create not found error
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Create conflict error
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Handle Multer file upload errors
 */
function handleMulterError(err) {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File size exceeds maximum allowed limit';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field';
    case 'LIMIT_PART_COUNT':
      return 'Too many parts in multipart upload';
    default:
      return 'File upload error';
  }
}

/**
 * Handle Supabase/PostgreSQL errors
 */
function handleSupabaseError(err) {
  const errorMap = {
    'PGRST116': {
      statusCode: 404,
      message: 'Table or view not found',
      code: 'TABLE_NOT_FOUND'
    },
    'PGRST301': {
      statusCode: 404,
      message: 'Record not found',
      code: 'RECORD_NOT_FOUND'
    },
    'PGRST204': {
      statusCode: 409,
      message: 'Duplicate key violation',
      code: 'DUPLICATE_KEY'
    },
    'PGRST202': {
      statusCode: 400,
      message: 'Invalid request format',
      code: 'INVALID_REQUEST'
    }
  };
  
  return errorMap[err.code] || {
    statusCode: 500,
    message: 'Database operation failed',
    code: 'DATABASE_ERROR'
  };
}

/**
 * Get error code based on status code
 */
function getErrorCode(statusCode) {
  const codes = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT'
  };
  
  return codes[statusCode] || 'UNKNOWN_ERROR';
}

/**
 * Get appropriate log level based on status code
 */
function getLogLevel(statusCode) {
  if (statusCode >= 500) {
    return 'error';
  } else if (statusCode >= 400) {
    return 'warn';
  } else {
    return 'info';
  }
}

/**
 * Check if error is security-related
 */
function isSecurityError(statusCode, err) {
  const securityStatusCodes = [401, 403, 429];
  const securityErrorNames = [
    'JsonWebTokenError',
    'TokenExpiredError',
    'AuthenticationError',
    'AuthorizationError'
  ];
  
  return securityStatusCodes.includes(statusCode) || 
         securityErrorNames.includes(err.name);
}

/**
 * Check if error represents a HIPAA violation
 */
function isHIPAAViolation(err) {
  const hipaaViolationIndicators = [
    'PHI_ACCESS_VIOLATION',
    'UNAUTHORIZED_PHI_ACCESS',
    'PHI_ENCRYPTION_FAILURE',
    'AUDIT_LOG_FAILURE'
  ];
  
  return hipaaViolationIndicators.includes(err.code) ||
         (err.message && err.message.toLowerCase().includes('phi'));
}

/**
 * Sanitize headers for logging (remove sensitive information)
 */
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token'
  ];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason.toString(),
    stack: reason.stack,
    promise: promise.toString()
  });
  
  // Graceful shutdown
  process.exit(1);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Graceful shutdown
  process.exit(1);
});

module.exports = {
  errorHandler,
  asyncHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError
};