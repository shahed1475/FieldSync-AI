const jwt = require('jsonwebtoken');
const { User, Organization } = require('../models');

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_ANON === 'true') {
        const demoOrgId = process.env.DEMO_ORG_ID || '00000000-0000-0000-0000-000000000000';
        req.user = {
          id: 'demo-user',
          email: 'demo@localhost',
          role: 'viewer',
          orgId: demoOrgId,
          organizationId: demoOrgId,
          organization_id: demoOrgId,
          organization: { id: demoOrgId, name: 'Demo Org', subscription_tier: 'free' }
        };
        return next();
      }

      return res.status(401).json({
        success: false,
        message: 'Access token is required',
        timestamp: new Date().toISOString()
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Find user with organization
    const user = await User.findOne({
      where: { id: decoded.id },
      include: [{
        model: Organization,
        as: 'organization',
        attributes: ['id', 'name', 'subscription_tier']
      }]
    });

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive user',
        timestamp: new Date().toISOString()
      });
    }

    // Add user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.organization_id,
      organizationId: user.organization_id,
      organization_id: user.organization_id,
      organization: user.organization
    };

    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        timestamp: new Date().toISOString()
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        timestamp: new Date().toISOString()
      });
    }

    console.error('Token authentication error:', error);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token',
      timestamp: new Date().toISOString()
    });
  }
};

// Require specific role (legacy - use RBAC instead)
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${role}`,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Require organization access
const requireOrganization = (req, res, next) => {
  if (!req.user || !req.user.orgId) {
    return res.status(401).json({
      success: false,
      message: 'Organization access required',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Generate JWT token
const generateToken = (userId, organizationId) => {
  return jwt.sign(
    { 
      id: userId,
      orgId: organizationId 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );
};

// Refresh token middleware
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
        timestamp: new Date().toISOString()
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    
    // Generate new access token
    const newToken = generateToken(
      decoded.userId || decoded.id,
      decoded.orgId || decoded.organizationId
    );

    res.json({
      success: true,
      access_token: newToken,
      expires_in: process.env.JWT_EXPIRES_IN || '24h',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  generateToken,
  authenticateToken,
  requireRole,
  requireOrganization
};
