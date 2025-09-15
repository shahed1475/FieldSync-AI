const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { supabase } = require('../database/connection');
const { logger, securityLogger, logHelpers } = require('../utils/logger');
const { encryptionService } = require('../utils/encryption');
const PasswordService = require('../services/passwordService');
const passwordPolicy = require('../config/passwordPolicy');

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and sets user context
 */
const authMiddleware = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return handleAuthError(req, res, 'No authentication token provided', 401);
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check token expiration
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return handleAuthError(req, res, 'Token expired', 401);
    }
    
    // Fetch user details from database
    const { data: user, error } = await supabase
      .from('providers')
      .select(`
        id,
        practice_id,
        name,
        email,
        role,
        is_active,
        last_login,
        failed_login_attempts,
        locked_until
      `)
      .eq('id', decoded.userId)
      .single();
    
    if (error || !user) {
      return handleAuthError(req, res, 'Invalid user token', 401);
    }
    
    // Check if user is active
    if (!user.is_active) {
      return handleAuthError(req, res, 'User account is deactivated', 403);
    }
    
    // Check if user is locked out
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockoutEnd = new Date(user.locked_until).toISOString();
      return handleAuthError(req, res, `Account locked until ${lockoutEnd}`, 423);
    }
    
    // Check session timeout (15 minutes for HIPAA compliance)
    const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 15;
    const lastActivity = new Date(decoded.iat * 1000);
    const timeoutThreshold = new Date(Date.now() - (sessionTimeout * 60 * 1000));
    
    if (lastActivity < timeoutThreshold) {
      return handleAuthError(req, res, 'Session expired due to inactivity', 401);
    }
    
    // Check if 2FA is required and validated
    if (user.two_factor_enabled && !decoded.twoFactorVerified) {
      return handleAuthError(req, res, 'Two-factor authentication required', 401);
    }
    
    // Set user context
    req.user = {
      id: user.id,
      practice_id: user.practice_id,
      name: user.name,
      email: user.email,
      role: user.role,
      sessionId: decoded.sessionId,
      loginTime: new Date(decoded.iat * 1000),
      twoFactorEnabled: user.two_factor_enabled,
      twoFactorVerified: decoded.twoFactorVerified || false
    };
    
    // Log successful authentication
    logHelpers.logAuth('token_validation', user.id, true, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: decoded.sessionId,
      correlationId: req.correlationId
    });
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return handleAuthError(req, res, 'Invalid token format', 401);
    } else if (error.name === 'TokenExpiredError') {
      return handleAuthError(req, res, 'Token expired', 401);
    } else {
      logger.error('Authentication middleware error', {
        error: error.message,
        stack: error.stack,
        correlationId: req.correlationId
      });
      return handleAuthError(req, res, 'Authentication failed', 500);
    }
  }
};

/**
 * Role-based authorization middleware
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return handleAuthError(req, res, 'Authentication required', 401);
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logHelpers.logSecurityViolation(
        `Unauthorized role access attempt: ${req.user.role} to ${req.path}`,
        'medium',
        {
          userId: req.user.id,
          requiredRoles: allowedRoles,
          userRole: req.user.role,
          path: req.path,
          ipAddress: req.ip,
          correlationId: req.correlationId
        }
      );
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required_roles: allowedRoles
      });
    }
    
    next();
  };
};

/**
 * Practice-based authorization middleware
 * Ensures users can only access data from their own practice
 */
const requirePracticeAccess = (req, res, next) => {
  if (!req.user) {
    return handleAuthError(req, res, 'Authentication required', 401);
  }
  
  // Admin users can access all practices
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Extract practice ID from request (URL params, query, or body)
  const requestedPracticeId = req.params.practiceId || 
                             req.query.practice_id || 
                             req.body?.practice_id;
  
  if (requestedPracticeId && requestedPracticeId !== req.user.practice_id) {
    logHelpers.logSecurityViolation(
      'Cross-practice access attempt',
      'high',
      {
        userId: req.user.id,
        userPracticeId: req.user.practice_id,
        requestedPracticeId,
        path: req.path,
        ipAddress: req.ip,
        correlationId: req.correlationId
      }
    );
    
    return res.status(403).json({
      error: 'Access denied to practice data',
      code: 'PRACTICE_ACCESS_DENIED'
    });
  }
  
  next();
};

/**
 * Rate limiting middleware for authentication endpoints
 */
const authRateLimit = {};

const limitAuthAttempts = (req, res, next) => {
  const clientId = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
  
  if (!authRateLimit[clientId]) {
    authRateLimit[clientId] = {
      attempts: 0,
      windowStart: now
    };
  }
  
  const clientData = authRateLimit[clientId];
  
  // Reset window if expired
  if (now - clientData.windowStart > windowMs) {
    clientData.attempts = 0;
    clientData.windowStart = now;
  }
  
  // Check if limit exceeded
  if (clientData.attempts >= maxAttempts) {
    logHelpers.logSecurityViolation(
      'Authentication rate limit exceeded',
      'high',
      {
        ipAddress: req.ip,
        attempts: clientData.attempts,
        maxAttempts,
        correlationId: req.correlationId
      }
    );
    
    return res.status(429).json({
      error: 'Too many authentication attempts',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retry_after: Math.ceil((windowMs - (now - clientData.windowStart)) / 1000)
    });
  }
  
  // Increment attempts on failed authentication
  res.on('finish', () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      clientData.attempts++;
    } else if (res.statusCode === 200) {
      // Reset on successful authentication
      clientData.attempts = 0;
    }
  });
  
  next();
};

/**
 * Extract JWT token from request headers
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check for token in cookies (for web clients)
  if (req.cookies && req.cookies.auth_token) {
    return req.cookies.auth_token;
  }
  
  return null;
}

/**
 * Handle authentication errors consistently
 */
function handleAuthError(req, res, message, statusCode) {
  const errorData = {
    message,
    statusCode,
    path: req.path,
    method: req.method,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    correlationId: req.correlationId,
    timestamp: new Date().toISOString()
  };
  
  // Log authentication failure
  securityLogger.warn('Authentication failed', errorData);
  
  // Log to audit trail
  logHelpers.logAuth('authentication_failed', null, false, errorData);
  
  return res.status(statusCode).json({
    error: message,
    code: getErrorCode(statusCode),
    timestamp: errorData.timestamp
  });
}

/**
 * Get error code based on status code
 */
function getErrorCode(statusCode) {
  const codes = {
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    423: 'LOCKED',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR'
  };
  
  return codes[statusCode] || 'UNKNOWN_ERROR';
}

/**
 * Generate JWT token for authenticated user
 */
function generateToken(user, sessionId, twoFactorVerified = false) {
  const payload = {
    userId: user.id,
    practiceId: user.practice_id,
    role: user.role,
    sessionId,
    twoFactorVerified,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET);
}

/**
 * Generate 2FA secret for user
 */
function generate2FASecret(userEmail, serviceName = 'ClaimFlow AI') {
  const secret = speakeasy.generateSecret({
    name: userEmail,
    service: serviceName,
    length: 32
  });
  
  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url
  };
}

/**
 * Generate QR code for 2FA setup
 */
async function generate2FAQRCode(otpauthUrl) {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
    return qrCodeDataURL;
  } catch (error) {
    logger.error('Failed to generate QR code', { error: error.message });
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Verify 2FA token
 */
function verify2FAToken(secret, token) {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2 // Allow 2 time steps (60 seconds) of drift
  });
}

/**
 * Middleware to require 2FA verification
 */
const require2FA = (req, res, next) => {
  if (!req.user) {
    return handleAuthError(req, res, 'Authentication required', 401);
  }
  
  if (req.user.twoFactorEnabled && !req.user.twoFactorVerified) {
    return res.status(401).json({
      error: 'Two-factor authentication required',
      code: 'TWO_FACTOR_REQUIRED',
      requires_2fa: true
    });
  }
  
  next();
};

/**
 * Validate password strength
 */
function validatePasswordStrength(password) {
  const requirements = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true
  };
  
  const issues = [];
  
  if (password.length < requirements.minLength) {
    issues.push(`Password must be at least ${requirements.minLength} characters long`);
  }
  
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    issues.push('Password must contain at least one uppercase letter');
  }
  
  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    issues.push('Password must contain at least one lowercase letter');
  }
  
  if (requirements.requireNumbers && !/[0-9]/.test(password)) {
    issues.push('Password must contain at least one number');
  }
  
  if (requirements.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) {
    issues.push('Password must contain at least one special character');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Enhanced password validation with policy enforcement
 */
async function validatePassword(password, userId = null, personalInfo = {}) {
  try {
    const passwordService = new PasswordService();
    
    // Get user's role for role-specific requirements
    let userRole = 'provider'; // default
    if (userId) {
      const { data: user } = await supabase
        .from('providers')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (user) {
        userRole = user.role;
      }
    }
    
    // Validate against policy
    const validation = await passwordService.validatePassword(password, {
      userId,
      personalInfo,
      role: userRole
    });
    
    return {
      isValid: validation.isValid,
      issues: validation.errors,
      strength: validation.strength,
      requirements: validation.requirements
    };
  } catch (error) {
    logger.error('Password validation error:', error);
    return {
      isValid: false,
      issues: ['Password validation failed. Please try again.'],
      strength: { score: 0, level: 'very_weak' }
    };
  }
}

/**
 * Clean up expired rate limit entries
 */
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  
  Object.keys(authRateLimit).forEach(clientId => {
    if (now - authRateLimit[clientId].windowStart > windowMs) {
      delete authRateLimit[clientId];
    }
  });
}, 5 * 60 * 1000); // Clean up every 5 minutes

/**
 * Enhanced password hashing with policy compliance
 */
async function hashPassword(password, userId = null) {
  const bcrypt = require('bcryptjs');
  const saltRounds = passwordPolicy.security.bcryptRounds;
  
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Add to password history if user ID provided
    if (userId) {
      const passwordService = new PasswordService();
      await passwordService.addToHistory(userId, hashedPassword);
    }
    
    return hashedPassword;
  } catch (error) {
    logger.error('Password hashing error:', error);
    throw new Error('Password processing failed');
  }
}

/**
 * Enhanced password verification with security tracking
 */
async function verifyPassword(password, hashedPassword, userId = null) {
  const bcrypt = require('bcryptjs');
  
  try {
    const isValid = await bcrypt.compare(password, hashedPassword);
    
    if (userId) {
      if (isValid) {
        // Reset failed attempts on successful login
        await resetFailedAttempts(userId);
      } else {
        // Track failed attempt
        await trackFailedAttempt(userId);
      }
    }
    
    return isValid;
  } catch (error) {
    logger.error('Password verification error:', error);
    return false;
  }
}

/**
 * Account lockout management
 */
async function trackFailedAttempt(userId) {
  try {
    const { data: user } = await supabase
      .from('providers')
      .select('failed_login_attempts, lockout_count, last_lockout_at')
      .eq('id', userId)
      .single();
    
    if (!user) return;
    
    const newAttempts = (user.failed_login_attempts || 0) + 1;
    const maxAttempts = passwordPolicy.lockout.maxAttempts;
    
    let updateData = {
      failed_login_attempts: newAttempts,
      updated_at: new Date().toISOString()
    };
    
    // Check if account should be locked
    if (newAttempts >= maxAttempts) {
      const lockoutCount = (user.lockout_count || 0) + 1;
      const lockoutDuration = passwordPolicy.getLockoutDuration(lockoutCount);
      
      updateData = {
        ...updateData,
        locked_until: new Date(Date.now() + lockoutDuration).toISOString(),
        lockout_count: lockoutCount,
        last_lockout_at: new Date().toISOString()
      };
      
      // Log security event
      await logHelpers.logSecurityViolation(
        'Account locked due to failed login attempts',
        'high',
        {
          userId,
          failed_attempts: newAttempts,
          lockout_count: lockoutCount,
          lockout_duration_ms: lockoutDuration
        }
      );
    }
    
    await supabase
      .from('providers')
      .update(updateData)
      .eq('id', userId);
      
  } catch (error) {
    logger.error('Failed to track login attempt:', error);
  }
}

async function resetFailedAttempts(userId) {
  try {
    await supabase
      .from('providers')
      .update({
        failed_login_attempts: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
  } catch (error) {
    logger.error('Failed to reset login attempts:', error);
  }
}

async function checkAccountLocked(userId) {
  try {
    const { data: user } = await supabase
      .from('providers')
      .select('locked_until, failed_login_attempts')
      .eq('id', userId)
      .single();
    
    if (!user) return { isLocked: false };
    
    const now = new Date();
    const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
    
    if (lockedUntil && now < lockedUntil) {
      const remainingMs = lockedUntil.getTime() - now.getTime();
      return {
        isLocked: true,
        remainingMs,
        failedAttempts: user.failed_login_attempts || 0
      };
    }
    
    // If lock period expired, clear the lock
    if (lockedUntil && now >= lockedUntil) {
      await supabase
        .from('providers')
        .update({
          locked_until: null,
          failed_login_attempts: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
    }
    
    return { isLocked: false };
  } catch (error) {
    logger.error('Failed to check account lock status:', error);
    return { isLocked: false };
  }
}

/**
 * Password expiry check
 */
async function checkPasswordExpiry(userId) {
  try {
    const { data: user } = await supabase
      .from('providers')
      .select('password_expires_at, password_warning_sent')
      .eq('id', userId)
      .single();
    
    if (!user || !user.password_expires_at) {
      return { isExpired: false, isExpiring: false };
    }
    
    const now = new Date();
    const expiresAt = new Date(user.password_expires_at);
    const warningThreshold = new Date(expiresAt.getTime() - (passwordPolicy.expiry.warningDays * 24 * 60 * 60 * 1000));
    
    return {
      isExpired: now >= expiresAt,
      isExpiring: now >= warningThreshold && now < expiresAt,
      expiresAt,
      daysRemaining: Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    };
  } catch (error) {
    logger.error('Failed to check password expiry:', error);
    return { isExpired: false, isExpiring: false };
  }
}

// Alias for backward compatibility
const authenticateToken = authMiddleware;

module.exports = {
  authMiddleware,
  authenticateToken,
  requireRole,
  requirePracticeAccess,
  limitAuthAttempts,
  require2FA,
  generateToken,
  generate2FASecret,
  generate2FAQRCode,
  verify2FAToken,
  validatePassword,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  trackFailedAttempt,
  resetFailedAttempts,
  checkAccountLocked,
  checkPasswordExpiry,
  extractToken
};