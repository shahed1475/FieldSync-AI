import { RequestHandler, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyAccessToken, extractTokenFromHeader } from '../utils/jwt';
import { sendUnauthorized, sendForbidden } from '../utils/response';
import { AuthRequest } from '../types';

/**
 * Middleware to authenticate requests using JWT tokens
 */
export const authenticate: RequestHandler = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      sendUnauthorized(res, 'Access token required');
      return;
    }
    
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    
    next();
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    sendUnauthorized(res, message);
    return;
  }
};

/**
 * Middleware to authorize requests based on user roles
 */
export const authorize = (...roles: UserRole[]) => {
  return ((req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res, 'Authentication required');
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      sendForbidden(res, 'Insufficient permissions');
      return;
    }
    
    next();
    return;
  }) as RequestHandler;
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = authorize(UserRole.ADMIN);

/**
 * Middleware to check if user is authenticated (any role)
 */
export const requireAuth: RequestHandler = authenticate;

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export const optionalAuth: RequestHandler = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (token) {
      const decoded = verifyAccessToken(token);
      req.user = decoded;
    }
    
    next();
    return;
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
    return;
  }
};

/**
 * Middleware to check if user owns the resource or is admin
 */
export const requireOwnershipOrAdmin = (userIdParam: string = 'userId') => {
  return ((req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res, 'Authentication required');
      return;
    }
    
    const resourceUserId = req.params[userIdParam] || req.body.accountId;
    
    // Allow if user is admin or owns the resource
    if (req.user.role === UserRole.ADMIN || req.user.id === resourceUserId) {
      next();
      return;
    }
    
    sendForbidden(res, 'Access denied: insufficient permissions');
    return;
  }) as RequestHandler;
};