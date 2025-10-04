const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Organization } = require('../models');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { body, validationResult } = require('express-validator');

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

// Register new organization with admin user
router.post('/register', 
  [
    body('organization_name').trim().isLength({ min: 2, max: 100 }).withMessage('Organization name must be 2-100 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().isLength({ min: 1, max: 50 }).withMessage('First name is required (1-50 characters)'),
    body('last_name').trim().isLength({ min: 1, max: 50 }).withMessage('Last name is required (1-50 characters)'),
    body('subscription_tier').optional().isIn(['free', 'pro', 'enterprise']).withMessage('Invalid subscription tier')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { organization_name, email, password, first_name, last_name, subscription_tier } = req.body;
      
      // Check if organization already exists
      const existingOrg = await Organization.findOne({ where: { name: organization_name } });
      if (existingOrg) {
        return res.status(409).json({ 
          success: false,
          message: 'Organization name already exists',
          timestamp: new Date().toISOString()
        });
      }

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists',
          timestamp: new Date().toISOString()
        });
      }
      
      // Create organization
      const organization = await Organization.create({
        name: organization_name,
        subscription_tier: subscription_tier || 'free'
      });

      // Create admin user
      const user = await User.create({
        email,
        password,
        first_name,
        last_name,
        role: 'org_admin',
        organization_id: organization.id,
        is_active: true,
        email_verified: false
      });
      
      // Generate JWT token
      const token = generateToken(user.id, organization.id);
      
      res.status(201).json({
        success: true,
        message: 'Organization and admin user created successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role
          },
          organization: {
            id: organization.id,
            name: organization.name,
            subscription_tier: organization.subscription_tier
          },
          token
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to register organization',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// User login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Find user with organization
      const user = await User.findOne({
        where: { email },
        include: [{
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'subscription_tier']
        }]
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          timestamp: new Date().toISOString()
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated. Please contact your administrator.',
          timestamp: new Date().toISOString()
        });
      }

      // Verify password
      const isValidPassword = await user.validatePassword(password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          timestamp: new Date().toISOString()
        });
      }

      // Update last login
      await user.update({ last_login: new Date() });

      // Generate JWT token
      const token = generateToken(user.id, user.organization_id);
      
      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            organization: user.organization
          },
          token
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to login',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Verify token and get user info
router.get('/verify', authenticateToken, async (req, res) => {
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
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          organization: user.organization
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify token',
      timestamp: new Date().toISOString()
    });
  }
});

// Logout (client-side token removal, but we can track it server-side if needed)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;