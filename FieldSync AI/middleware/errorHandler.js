const { ValidationError: SequelizeValidationError, DatabaseError, ConnectionError, TimeoutError } = require('sequelize');

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    user: req.user?.id || 'anonymous'
  });

  // Sequelize validation errors
  if (err instanceof SequelizeValidationError || err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.errors?.map(error => ({
        field: error.path,
        message: error.message,
        value: error.value
      })) || [{ message: err.message }],
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'Duplicate field value entered',
      field: err.errors?.[0]?.path || 'unknown',
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize foreign key constraint error
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid reference to related resource',
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize database errors
  if (err instanceof DatabaseError || err.name.startsWith('Sequelize')) {
    return res.status(500).json({
      success: false,
      message: 'Database error occurred',
      timestamp: new Date().toISOString()
    });
  }

  // Sequelize connection errors
  if (err instanceof ConnectionError || err instanceof TimeoutError) {
    return res.status(503).json({
      success: false,
      message: 'Database connection error',
      timestamp: new Date().toISOString()
    });
  }

  // Custom application errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
      timestamp: new Date().toISOString()
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      timestamp: new Date().toISOString()
    });
  }

  // Joi validation errors
  if (err.isJoi) {
    const message = err.details.map(detail => detail.message).join(', ');
    return res.status(400).json({
      success: false,
      message: `Validation Error: ${message}`,
      errors: err.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      })),
      timestamp: new Date().toISOString()
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
};

// Async handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400);
    this.errors = errors;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

// Database operation wrapper with error handling
const dbOperation = async (operation, errorMessage = 'Database operation failed') => {
  try {
    return await operation();
  } catch (error) {
    console.error('Database operation failed:', error);
    
    if (error instanceof SequelizeValidationError) {
      throw new ValidationError('Validation failed', error.errors);
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new ConflictError('Duplicate entry found');
    }
    
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      throw new ValidationError('Invalid reference to related resource');
    }
    
    if (error instanceof DatabaseError) {
      throw new AppError(errorMessage, 500);
    }
    
    if (error instanceof ConnectionError || error instanceof TimeoutError) {
      throw new AppError('Database connection error', 503);
    }
    
    throw error;
  }
};

// 404 handler for undefined routes
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  errorHandler,
  asyncHandler,
  dbOperation,
  notFoundHandler,
  // Custom error classes
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
};