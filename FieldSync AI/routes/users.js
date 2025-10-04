const express = require('express');
const { User, Organization } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { 
  requirePermission, 
  requireAnyPermission,
  PERMISSIONS,
  ROLES,
  isValidRole 
} = require('../middleware/rbac');
const { body, param, query, validationResult } = require('express-validator');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Get all users in organization (Org Admin only)
router.get('/', 
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_USERS),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('role').optional().isIn(Object.values(ROLES)).withMessage('Invalid role'),
    query('active').optional().isBoolean().withMessage('Active must be a boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      
      const whereClause = {
        organization_id: req.user.orgId
      };

      if (req.query.role) {
        whereClause.role = req.query.role;
      }

      if (req.query.active !== undefined) {
        whereClause.is_active = req.query.active === 'true';
      }

      const { count, rows: users } = await User.findAndCountAll({
        where: whereClause,
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'subscription_tier']
        }],
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total: count,
            pages: Math.ceil(count / limit)
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve users',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Get user by ID
router.get('/:id',
  authenticateToken,
  requireAnyPermission([PERMISSIONS.VIEW_USERS, PERMISSIONS.MANAGE_USERS]),
  [
    param('id').isUUID().withMessage('Invalid user ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findOne({
        where: {
          id: req.params.id,
          organization_id: req.user.orgId
        },
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'subscription_tier']
        }]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: user,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Create new user (Org Admin only)
router.post('/',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_USERS),
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().isLength({ min: 1, max: 50 }).withMessage('First name is required (1-50 characters)'),
    body('last_name').trim().isLength({ min: 1, max: 50 }).withMessage('Last name is required (1-50 characters)'),
    body('role').isIn(Object.values(ROLES)).withMessage('Invalid role')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, first_name, last_name, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists',
          timestamp: new Date().toISOString()
        });
      }

      // Create new user
      const user = await User.create({
        email,
        password,
        first_name,
        last_name,
        role,
        organization_id: req.user.orgId,
        is_active: true,
        email_verified: false
      });

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: user,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create user',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Update user (Org Admin only)
router.put('/:id',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_USERS),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('first_name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
    body('last_name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
    body('role').optional().isIn(Object.values(ROLES)).withMessage('Invalid role'),
    body('is_active').optional().isBoolean().withMessage('Active status must be boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findOne({
        where: {
          id: req.params.id,
          organization_id: req.user.orgId
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      // Prevent user from deactivating themselves
      if (user.id === req.user.id && req.body.is_active === false) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate your own account',
          timestamp: new Date().toISOString()
        });
      }

      // Update user
      await user.update(req.body);

      res.json({
        success: true,
        message: 'User updated successfully',
        data: user,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Delete user (Org Admin only)
router.delete('/:id',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_USERS),
  [
    param('id').isUUID().withMessage('Invalid user ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findOne({
        where: {
          id: req.params.id,
          organization_id: req.user.orgId
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      // Prevent user from deleting themselves
      if (user.id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account',
          timestamp: new Date().toISOString()
        });
      }

      await user.destroy();

      res.json({
        success: true,
        message: 'User deleted successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Get current user profile
router.get('/profile/me',
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findOne({
        where: { id: req.user.id },
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'subscription_tier']
        }]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: user,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve profile',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Update current user profile
router.put('/profile/me',
  authenticateToken,
  [
    body('first_name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
    body('last_name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      // Only allow updating certain fields
      const allowedFields = ['first_name', 'last_name', 'email'];
      const updateData = {};
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      await user.update(updateData);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        timestamp: new Date().toISOString()
      });
    }
  }
);

module.exports = router;