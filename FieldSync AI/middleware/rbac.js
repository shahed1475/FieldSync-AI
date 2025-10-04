const { Organization } = require('../models');

// Define role hierarchy and permissions
const ROLES = {
  ORG_ADMIN: 'org_admin',
  ANALYST: 'analyst', 
  VIEWER: 'viewer'
};

const PERMISSIONS = {
  // Organization management
  MANAGE_ORGANIZATION: 'manage_organization',
  VIEW_ORGANIZATION: 'view_organization',
  
  // User management
  MANAGE_USERS: 'manage_users',
  VIEW_USERS: 'view_users',
  
  // Data source management
  MANAGE_DATA_SOURCES: 'manage_data_sources',
  VIEW_DATA_SOURCES: 'view_data_sources',
  
  // Query management
  CREATE_QUERIES: 'create_queries',
  EDIT_QUERIES: 'edit_queries',
  DELETE_QUERIES: 'delete_queries',
  VIEW_QUERIES: 'view_queries',
  EXECUTE_QUERIES: 'execute_queries',
  
  // Dashboard management
  CREATE_DASHBOARDS: 'create_dashboards',
  EDIT_DASHBOARDS: 'edit_dashboards',
  DELETE_DASHBOARDS: 'delete_dashboards',
  VIEW_DASHBOARDS: 'view_dashboards',
  SHARE_DASHBOARDS: 'share_dashboards',
  
  // Insights management
  CREATE_INSIGHTS: 'create_insights',
  EDIT_INSIGHTS: 'edit_insights',
  DELETE_INSIGHTS: 'delete_insights',
  VIEW_INSIGHTS: 'view_insights',
  
  // AI features
  USE_AI_QUERY: 'use_ai_query',
  VIEW_AI_INSIGHTS: 'view_ai_insights',
  
  // Analytics and visualization
  VIEW_ANALYTICS: 'view_analytics',
  EXPORT_DATA: 'export_data',
  
  // System administration
  VIEW_SYSTEM_LOGS: 'view_system_logs',
  MANAGE_INTEGRATIONS: 'manage_integrations'
};

// Role-permission mapping
const ROLE_PERMISSIONS = {
  [ROLES.ORG_ADMIN]: [
    // Full access to everything
    PERMISSIONS.MANAGE_ORGANIZATION,
    PERMISSIONS.VIEW_ORGANIZATION,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.MANAGE_DATA_SOURCES,
    PERMISSIONS.VIEW_DATA_SOURCES,
    PERMISSIONS.CREATE_QUERIES,
    PERMISSIONS.EDIT_QUERIES,
    PERMISSIONS.DELETE_QUERIES,
    PERMISSIONS.VIEW_QUERIES,
    PERMISSIONS.EXECUTE_QUERIES,
    PERMISSIONS.CREATE_DASHBOARDS,
    PERMISSIONS.EDIT_DASHBOARDS,
    PERMISSIONS.DELETE_DASHBOARDS,
    PERMISSIONS.VIEW_DASHBOARDS,
    PERMISSIONS.SHARE_DASHBOARDS,
    PERMISSIONS.CREATE_INSIGHTS,
    PERMISSIONS.EDIT_INSIGHTS,
    PERMISSIONS.DELETE_INSIGHTS,
    PERMISSIONS.VIEW_INSIGHTS,
    PERMISSIONS.USE_AI_QUERY,
    PERMISSIONS.VIEW_AI_INSIGHTS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.EXPORT_DATA,
    PERMISSIONS.VIEW_SYSTEM_LOGS,
    PERMISSIONS.MANAGE_INTEGRATIONS
  ],
  
  [ROLES.ANALYST]: [
    // Can create and manage content but not users or organization
    PERMISSIONS.VIEW_ORGANIZATION,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_DATA_SOURCES,
    PERMISSIONS.CREATE_QUERIES,
    PERMISSIONS.EDIT_QUERIES,
    PERMISSIONS.VIEW_QUERIES,
    PERMISSIONS.EXECUTE_QUERIES,
    PERMISSIONS.CREATE_DASHBOARDS,
    PERMISSIONS.EDIT_DASHBOARDS,
    PERMISSIONS.VIEW_DASHBOARDS,
    PERMISSIONS.SHARE_DASHBOARDS,
    PERMISSIONS.CREATE_INSIGHTS,
    PERMISSIONS.EDIT_INSIGHTS,
    PERMISSIONS.VIEW_INSIGHTS,
    PERMISSIONS.USE_AI_QUERY,
    PERMISSIONS.VIEW_AI_INSIGHTS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.EXPORT_DATA
  ],
  
  [ROLES.VIEWER]: [
    // Read-only access
    PERMISSIONS.VIEW_ORGANIZATION,
    PERMISSIONS.VIEW_DATA_SOURCES,
    PERMISSIONS.VIEW_QUERIES,
    PERMISSIONS.VIEW_DASHBOARDS,
    PERMISSIONS.VIEW_INSIGHTS,
    PERMISSIONS.VIEW_AI_INSIGHTS,
    PERMISSIONS.VIEW_ANALYTICS
  ]
};

// Check if user has specific permission
const hasPermission = (userRole, permission) => {
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  return rolePermissions.includes(permission);
};

// Check if user has any of the specified permissions
const hasAnyPermission = (userRole, permissions) => {
  return permissions.some(permission => hasPermission(userRole, permission));
};

// Check if user has all specified permissions
const hasAllPermissions = (userRole, permissions) => {
  return permissions.every(permission => hasPermission(userRole, permission));
};

// Middleware to require specific permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required_permission: permission,
        user_role: req.user.role,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Middleware to require any of the specified permissions
const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    if (!hasAnyPermission(req.user.role, permissions)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required_permissions: permissions,
        user_role: req.user.role,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Middleware to require all specified permissions
const requireAllPermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    if (!hasAllPermissions(req.user.role, permissions)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required_permissions: permissions,
        user_role: req.user.role,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Resource ownership middleware
const requireResourceOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          timestamp: new Date().toISOString()
        });
      }

      // Org admins can access any resource in their organization
      if (req.user.role === ROLES.ORG_ADMIN) {
        return next();
      }

      const resourceId = req.params.id || req.params.resourceId;
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID required',
          timestamp: new Date().toISOString()
        });
      }

      // Check resource ownership based on type
      let resource;
      const { Query, Dashboard, Insight } = require('../models');
      
      switch (resourceType) {
        case 'query':
          resource = await Query.findByPk(resourceId);
          break;
        case 'dashboard':
          resource = await Dashboard.findByPk(resourceId);
          break;
        case 'insight':
          resource = await Insight.findByPk(resourceId);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid resource type',
            timestamp: new Date().toISOString()
          });
      }

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: `${resourceType} not found`,
          timestamp: new Date().toISOString()
        });
      }

      // Check if user owns the resource or has organization access
      if (resource.userId !== req.user.id && resource.organizationId !== req.user.orgId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this resource',
          timestamp: new Date().toISOString()
        });
      }

      req.resource = resource;
      next();

    } catch (error) {
      console.error('Resource ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Resource ownership check failed',
        timestamp: new Date().toISOString()
      });
    }
  };
};

// Get user permissions
const getUserPermissions = (userRole) => {
  return ROLE_PERMISSIONS[userRole] || [];
};

// Validate role
const isValidRole = (role) => {
  return Object.values(ROLES).includes(role);
};

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireResourceOwnership,
  getUserPermissions,
  isValidRole
};