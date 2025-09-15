/**
 * Role-Based Access Control (RBAC) Middleware
 * Implements secure authorization for Admin, Provider, and Staff roles
 * HIPAA-compliant with comprehensive audit logging
 */

const { supabase } = require('../database/connection');
const logger = require('../utils/logger');
const logHelpers = require('../utils/logger');
const { AuthorizationError } = require('../utils/errors');

// Define role hierarchy and permissions
const ROLES = {
  ADMIN: 'admin',
  PROVIDER: 'provider', 
  STAFF: 'staff'
};

// Role hierarchy (higher roles inherit lower role permissions)
const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 3,
  [ROLES.PROVIDER]: 2,
  [ROLES.STAFF]: 1
};

// Define permissions for each role
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    // System administration
    'system:manage',
    'system:configure',
    'system:audit',
    
    // User management
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'users:invite',
    'users:manage_roles',
    
    // Practice management
    'practices:create',
    'practices:read',
    'practices:update',
    'practices:delete',
    'practices:manage',
    
    // Patient data (full access)
    'patients:create',
    'patients:read',
    'patients:update',
    'patients:delete',
    'patients:export',
    
    // Prior authorizations
    'authorizations:create',
    'authorizations:read',
    'authorizations:update',
    'authorizations:delete',
    'authorizations:approve',
    'authorizations:manage',
    
    // Documents
    'documents:create',
    'documents:read',
    'documents:update',
    'documents:delete',
    'documents:manage',
    
    // Reports and analytics
    'reports:view',
    'reports:export',
    'analytics:view'
  ],
  
  [ROLES.PROVIDER]: [
    // User management (limited)
    'users:read',
    'users:update_own',
    
    // Practice management (own practice)
    'practices:read_own',
    'practices:update_own',
    
    // Patient data (practice-scoped)
    'patients:create',
    'patients:read_practice',
    'patients:update_practice',
    'patients:delete_practice',
    
    // Prior authorizations (practice-scoped)
    'authorizations:create',
    'authorizations:read_practice',
    'authorizations:update_practice',
    'authorizations:approve_practice',
    
    // Documents (practice-scoped)
    'documents:create',
    'documents:read_practice',
    'documents:update_practice',
    'documents:delete_practice',
    
    // Reports (practice-scoped)
    'reports:view_practice'
  ],
  
  [ROLES.STAFF]: [
    // User management (own profile only)
    'users:read_own',
    'users:update_own',
    
    // Practice (read-only)
    'practices:read_own',
    
    // Patient data (limited)
    'patients:read_practice',
    'patients:update_practice',
    
    // Prior authorizations (limited)
    'authorizations:read_practice',
    'authorizations:update_practice',
    
    // Documents (limited)
    'documents:read_practice',
    'documents:update_practice'
  ]
};

/**
 * Check if user has required permission
 * @param {string} userRole - User's role
 * @param {string} permission - Required permission
 * @returns {boolean} - Whether user has permission
 */
function hasPermission(userRole, permission) {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
}

/**
 * Check if user role has sufficient hierarchy level
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required minimum role
 * @returns {boolean} - Whether user has sufficient role level
 */
function hasRoleLevel(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Middleware to require specific permission
 * @param {string} permission - Required permission
 * @returns {Function} - Express middleware function
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthorizationError('Authentication required');
      }
      
      const { role, id: userId, practice_id } = req.user;
      
      // Check if user has the required permission
      if (!hasPermission(role, permission)) {
        logHelpers.logSecurityEvent('authorization_denied', 'warning', {
          userId,
          role,
          requiredPermission: permission,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId,
          resource: req.originalUrl
        });
        
        throw new AuthorizationError(`Insufficient permissions. Required: ${permission}`);
      }
      
      // Log successful authorization
      logHelpers.logSecurityEvent('authorization_granted', 'info', {
        userId,
        role,
        permission,
        ipAddress: req.ip,
        correlationId: req.correlationId,
        resource: req.originalUrl
      });
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to require minimum role level
 * @param {string} requiredRole - Minimum required role
 * @returns {Function} - Express middleware function
 */
function requireRole(requiredRole) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthorizationError('Authentication required');
      }
      
      const { role, id: userId } = req.user;
      
      // Check if user has sufficient role level
      if (!hasRoleLevel(role, requiredRole)) {
        logHelpers.logSecurityEvent('role_authorization_denied', 'warning', {
          userId,
          userRole: role,
          requiredRole,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId,
          resource: req.originalUrl
        });
        
        throw new AuthorizationError(`Insufficient role level. Required: ${requiredRole}`);
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to ensure practice-scoped access
 * @param {string} resourceType - Type of resource being accessed
 * @returns {Function} - Express middleware function
 */
function requirePracticeAccess(resourceType = 'resource') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthorizationError('Authentication required');
      }
      
      const { role, id: userId, practice_id: userPracticeId } = req.user;
      
      // Admins have access to all practices
      if (role === ROLES.ADMIN) {
        return next();
      }
      
      // Get practice ID from request (params, body, or query)
      const requestedPracticeId = req.params.practice_id || 
                                 req.body.practice_id || 
                                 req.query.practice_id;
      
      // If no specific practice requested, use user's practice
      if (!requestedPracticeId) {
        req.practiceId = userPracticeId;
        return next();
      }
      
      // Check if user can access the requested practice
      if (requestedPracticeId !== userPracticeId) {
        logHelpers.logSecurityEvent('practice_access_denied', 'warning', {
          userId,
          userPracticeId,
          requestedPracticeId,
          resourceType,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId,
          resource: req.originalUrl
        });
        
        throw new AuthorizationError('Access denied to requested practice');
      }
      
      req.practiceId = requestedPracticeId;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to ensure user can only access their own data
 * @returns {Function} - Express middleware function
 */
function requireSelfAccess() {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthorizationError('Authentication required');
      }
      
      const { role, id: userId } = req.user;
      
      // Admins can access any user data
      if (role === ROLES.ADMIN) {
        return next();
      }
      
      // Get requested user ID from params
      const requestedUserId = req.params.user_id || req.params.id;
      
      if (!requestedUserId) {
        throw new AuthorizationError('User ID required');
      }
      
      // Check if user is accessing their own data
      if (requestedUserId !== userId) {
        logHelpers.logSecurityEvent('self_access_denied', 'warning', {
          userId,
          requestedUserId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId,
          resource: req.originalUrl
        });
        
        throw new AuthorizationError('Access denied to other user data');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Get user's effective permissions
 * @param {string} role - User's role
 * @returns {Array} - Array of permissions
 */
function getUserPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if user can perform action on resource
 * @param {Object} user - User object
 * @param {string} action - Action to perform
 * @param {string} resource - Resource type
 * @param {Object} context - Additional context (practice_id, etc.)
 * @returns {boolean} - Whether action is allowed
 */
function canPerformAction(user, action, resource, context = {}) {
  const { role, practice_id: userPracticeId } = user;
  const permission = `${resource}:${action}`;
  
  // Check basic permission
  if (!hasPermission(role, permission)) {
    return false;
  }
  
  // For practice-scoped permissions, check practice access
  if (permission.includes('_practice') && context.practice_id) {
    if (role !== ROLES.ADMIN && context.practice_id !== userPracticeId) {
      return false;
    }
  }
  
  return true;
}

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  hasPermission,
  hasRoleLevel,
  requirePermission,
  requireRole,
  requirePracticeAccess,
  requireSelfAccess,
  getUserPermissions,
  canPerformAction
};