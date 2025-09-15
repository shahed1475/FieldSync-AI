/**
 * Password Policy Enforcement Middleware
 * Enforces HIPAA-compliant password policies and security requirements
 */

const { supabase } = require('../database/connection');
const { logHelpers } = require('../utils/logger');
const passwordPolicy = require('../config/passwordPolicy');
const { checkPasswordExpiry, checkAccountLocked } = require('./auth');
const { v4: uuidv4 } = require('uuid');

/**
 * Middleware to check password expiry and enforce password change
 * Blocks access if password is expired
 */
const enforcePasswordExpiry = async (req, res, next) => {
  try {
    // Skip for certain endpoints
    const skipPaths = [
      '/api/v1/auth/change-password',
      '/api/v1/auth/reset-password',
      '/api/v1/auth/logout',
      '/api/v1/health'
    ];
    
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Only apply to authenticated users
    if (!req.user || !req.user.userId) {
      return next();
    }
    
    const userId = req.user.userId;
    const expiryStatus = await checkPasswordExpiry(userId);
    
    if (expiryStatus.isExpired) {
      await logHelpers.logSecurityViolation(
        'Access blocked - password expired',
        'medium',
        {
          userId,
          path: req.path,
          method: req.method,
          expiresAt: expiryStatus.expiresAt,
          correlationId: req.correlationId || uuidv4()
        }
      );
      
      return res.status(403).json({
        success: false,
        error: 'Password has expired. Please change your password to continue.',
        passwordExpired: true,
        resetRequired: true,
        expiresAt: expiryStatus.expiresAt
      });
    }
    
    // Add expiry warning to response headers if expiring soon
    if (expiryStatus.isExpiring) {
      res.set({
        'X-Password-Expiring': 'true',
        'X-Password-Days-Remaining': expiryStatus.daysRemaining.toString(),
        'X-Password-Expires-At': expiryStatus.expiresAt.toISOString()
      });
    }
    
    next();
  } catch (error) {
    console.error('Password expiry check error:', error);
    // Don't block on error, but log it
    await logHelpers.logError(
      'Password expiry middleware error',
      error,
      { userId: req.user?.userId, path: req.path }
    );
    next();
  }
};

/**
 * Middleware to check account lockout status
 * Blocks access if account is locked
 */
const enforceAccountLockout = async (req, res, next) => {
  try {
    // Skip for certain endpoints
    const skipPaths = [
      '/api/v1/auth/login',
      '/api/v1/auth/reset-password',
      '/api/v1/health'
    ];
    
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Only apply to authenticated users
    if (!req.user || !req.user.userId) {
      return next();
    }
    
    const userId = req.user.userId;
    const lockStatus = await checkAccountLocked(userId);
    
    if (lockStatus.isLocked) {
      const remainingMinutes = Math.ceil(lockStatus.remainingMs / (1000 * 60));
      
      await logHelpers.logSecurityViolation(
        'Access blocked - account locked',
        'high',
        {
          userId,
          path: req.path,
          method: req.method,
          remainingMinutes,
          failedAttempts: lockStatus.failedAttempts,
          correlationId: req.correlationId || uuidv4()
        }
      );
      
      return res.status(423).json({
        success: false,
        error: `Account is locked. Please try again in ${remainingMinutes} minutes.`,
        accountLocked: true,
        lockout: {
          remainingMinutes,
          failedAttempts: lockStatus.failedAttempts
        }
      });
    }
    
    next();
  } catch (error) {
    console.error('Account lockout check error:', error);
    // Don't block on error, but log it
    await logHelpers.logError(
      'Account lockout middleware error',
      error,
      { userId: req.user?.userId, path: req.path }
    );
    next();
  }
};

/**
 * Middleware to enforce session security policies
 * Checks session age, concurrent sessions, etc.
 */
const enforceSessionSecurity = async (req, res, next) => {
  try {
    // Only apply to authenticated users
    if (!req.user || !req.user.userId) {
      return next();
    }
    
    const userId = req.user.userId;
    const sessionId = req.user.sessionId;
    const tokenIat = req.user.iat; // Token issued at time
    
    // Check session age
    const sessionAge = Date.now() - (tokenIat * 1000);
    const maxSessionAge = passwordPolicy.session.maxAge;
    
    if (sessionAge > maxSessionAge) {
      await logHelpers.logSecurityViolation(
        'Session expired - max age exceeded',
        'medium',
        {
          userId,
          sessionId,
          sessionAge,
          maxSessionAge,
          correlationId: req.correlationId || uuidv4()
        }
      );
      
      return res.status(401).json({
        success: false,
        error: 'Session has expired. Please log in again.',
        sessionExpired: true
      });
    }
    
    // Check for concurrent session limits (if enabled)
    if (passwordPolicy.session.maxConcurrent > 0) {
      // This would require session tracking in database
      // For now, we'll add the header for future implementation
      res.set('X-Session-Id', sessionId);
    }
    
    // Add session info to response headers
    const remainingTime = maxSessionAge - sessionAge;
    const remainingMinutes = Math.floor(remainingTime / (1000 * 60));
    
    res.set({
      'X-Session-Remaining': remainingMinutes.toString(),
      'X-Session-Max-Age': Math.floor(maxSessionAge / (1000 * 60)).toString()
    });
    
    next();
  } catch (error) {
    console.error('Session security check error:', error);
    // Don't block on error, but log it
    await logHelpers.logError(
      'Session security middleware error',
      error,
      { userId: req.user?.userId, sessionId: req.user?.sessionId }
    );
    next();
  }
};

/**
 * Middleware to enforce role-based password requirements
 * Ensures users with elevated roles have stronger passwords
 */
const enforceRoleBasedSecurity = async (req, res, next) => {
  try {
    // Only apply to authenticated users
    if (!req.user || !req.user.userId) {
      return next();
    }
    
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    // Get role-specific requirements
    const roleRequirements = passwordPolicy.getRoleRequirements(userRole);
    
    // Check if user's password meets current role requirements
    // This would typically be done during password change, but we can
    // add warnings for users who may need to update their passwords
    
    if (roleRequirements.requireMFA && userRole === 'admin') {
      // Check if MFA is enabled for admin users
      const { data: user } = await supabase
        .from('providers')
        .select('mfa_enabled')
        .eq('id', userId)
        .single();
      
      if (user && !user.mfa_enabled) {
        res.set('X-MFA-Required', 'true');
        res.set('X-Security-Warning', 'MFA is required for your role');
      }
    }
    
    next();
  } catch (error) {
    console.error('Role-based security check error:', error);
    // Don't block on error, but log it
    await logHelpers.logError(
      'Role-based security middleware error',
      error,
      { userId: req.user?.userId, role: req.user?.role }
    );
    next();
  }
};

/**
 * Combined security middleware that applies all password policy checks
 */
const enforcePasswordPolicies = [enforceAccountLockout, enforcePasswordExpiry, enforceSessionSecurity, enforceRoleBasedSecurity];

/**
 * Middleware to add password policy information to API responses
 * Useful for frontend to display current policy requirements
 */
const addPasswordPolicyInfo = (req, res, next) => {
  // Add policy info to response for authenticated users
  if (req.user && req.user.role) {
    const originalJson = res.json;
    res.json = function(data) {
      // Only add policy info to successful responses
      if (data && data.success !== false) {
        data.passwordPolicy = {
          requirements: passwordPolicy.getRequirementsText(req.user.role),
          expiry: {
            maxAge: passwordPolicy.expiry.maxAge,
            warningDays: passwordPolicy.expiry.warningDays
          },
          lockout: {
            maxAttempts: passwordPolicy.lockout.maxAttempts,
            baseDuration: passwordPolicy.lockout.baseDuration
          }
        };
      }
      return originalJson.call(this, data);
    };
  }
  next();
};

/**
 * Utility function to get password policy status for a user
 */
const getPasswordPolicyStatus = async (userId) => {
  try {
    const [expiryStatus, lockStatus] = await Promise.all([
      checkPasswordExpiry(userId),
      checkAccountLocked(userId)
    ]);
    
    const { data: user } = await supabase
      .from('providers')
      .select('role, mfa_enabled, failed_login_attempts, lockout_count')
      .eq('id', userId)
      .single();
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const roleRequirements = passwordPolicy.getRoleRequirements(user.role);
    
    return {
      passwordExpiry: {
        isExpired: expiryStatus.isExpired,
        isExpiring: expiryStatus.isExpiring,
        daysRemaining: expiryStatus.daysRemaining,
        expiresAt: expiryStatus.expiresAt
      },
      accountLockout: {
        isLocked: lockStatus.isLocked,
        failedAttempts: user.failed_login_attempts || 0,
        maxAttempts: passwordPolicy.lockout.maxAttempts,
        lockoutCount: user.lockout_count || 0
      },
      roleRequirements: {
        role: user.role,
        requireMFA: roleRequirements.requireMFA,
        mfaEnabled: user.mfa_enabled || false,
        minLength: roleRequirements.minLength,
        complexity: roleRequirements.complexity
      },
      compliance: {
        passwordCompliant: !expiryStatus.isExpired,
        accountSecure: !lockStatus.isLocked,
        mfaCompliant: !roleRequirements.requireMFA || user.mfa_enabled,
        overallStatus: (!expiryStatus.isExpired && !lockStatus.isLocked && (!roleRequirements.requireMFA || user.mfa_enabled)) ? 'compliant' : 'non_compliant'
      }
    };
  } catch (error) {
    console.error('Error getting password policy status:', error);
    throw error;
  }
};

module.exports = {
  enforcePasswordExpiry,
  enforceAccountLockout,
  enforceSessionSecurity,
  enforceRoleBasedSecurity,
  enforcePasswordPolicies,
  addPasswordPolicyInfo,
  getPasswordPolicyStatus
};