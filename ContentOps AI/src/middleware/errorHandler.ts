import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { sendInternalError, sendBadRequest, sendNotFound, sendConflict } from '../utils/response';

/**
 * Global error handling middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(error, res);
  }

  // Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    return sendBadRequest(res, 'Invalid data provided');
  }

  // JWT errors (handled in auth middleware, but just in case)
  if (error.name === 'JsonWebTokenError') {
    return sendBadRequest(res, 'Invalid token');
  }

  if (error.name === 'TokenExpiredError') {
    return sendBadRequest(res, 'Token expired');
  }

  // Custom application errors
  if (error.name === 'ValidationError') {
    return sendBadRequest(res, error.message);
  }

  if (error.name === 'NotFoundError') {
    return sendNotFound(res, error.message);
  }

  if (error.name === 'ConflictError') {
    return sendConflict(res, error.message);
  }

  // Default to internal server error
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : error.message;
    
  return sendInternalError(res, message, error.stack);
};

/**
 * Handle Prisma-specific errors
 */
const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError, res: Response) => {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = error.meta?.target as string[] | undefined;
      const fieldName = field ? field[0] : 'field';
      return sendConflict(res, `${fieldName} already exists`);
      
    case 'P2025':
      // Record not found
      return sendNotFound(res, 'Record not found');
      
    case 'P2003':
      // Foreign key constraint violation
      return sendBadRequest(res, 'Invalid reference to related record');
      
    case 'P2014':
      // Required relation violation
      return sendBadRequest(res, 'Required relation missing');
      
    case 'P2021':
      // Table does not exist
      return sendInternalError(res, 'Database table not found');
      
    case 'P2022':
      // Column does not exist
      return sendInternalError(res, 'Database column not found');
      
    default:
      console.error('Unhandled Prisma error:', error.code, error.message);
      return sendInternalError(res, 'Database operation failed');
  }
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  return sendNotFound(res, `Route ${req.method} ${req.path} not found`);
};

/**
 * Async error wrapper to catch async errors in route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error classes
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string = 'Resource already exists') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}