import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { sendError } from '../utils/response';

/**
 * General API rate limiter
 */
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    error: 'Rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    return sendError(res, 'Too many requests, please try again later.', 429);
  }
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
    error: 'Authentication rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: Request, res: Response) => {
    return sendError(res, 'Too many authentication attempts, please try again in 15 minutes.', 429);
  }
});

/**
 * Content creation rate limiter
 */
export const contentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 content items per hour
  message: {
    success: false,
    message: 'Content creation limit reached, please try again later.',
    error: 'Content creation rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    return sendError(res, 'Content creation limit reached, please try again in an hour.', 429);
  }
});

/**
 * Post scheduling rate limiter
 */
export const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 posts per hour
  message: {
    success: false,
    message: 'Post scheduling limit reached, please try again later.',
    error: 'Post scheduling rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    return sendError(res, 'Post scheduling limit reached, please try again in an hour.', 429);
  }
});

/**
 * Analytics rate limiter (more lenient for dashboard)
 */
export const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    success: false,
    message: 'Analytics request limit reached, please try again later.',
    error: 'Analytics rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    return sendError(res, 'Analytics request limit reached, please try again in a minute.', 429);
  }
});

/**
 * Admin endpoints rate limiter (more lenient)
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window for admin operations
  message: {
    success: false,
    message: 'Admin request limit reached, please try again later.',
    error: 'Admin rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    return sendError(res, 'Admin request limit reached, please try again later.', 429);
  }
});

/**
 * Create a custom rate limiter with specific options
 */
export const createCustomLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      success: false,
      message: options.message,
      error: 'Rate limit exceeded'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      return sendError(res, options.message, 429);
    }
  });
};

// Aliases for route imports
export const generalRateLimit = generalLimiter;
export const authRateLimit = authLimiter;
export const contentCreationRateLimit = contentLimiter;
export const postSchedulingRateLimit = postLimiter;
export const analyticsRateLimit = analyticsLimiter;
export const adminRateLimit = adminLimiter;