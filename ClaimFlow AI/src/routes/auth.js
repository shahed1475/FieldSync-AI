const express = require('express');
const { supabase } = require('../database/connection');
const { encryptionService } = require('../utils/encryption');
const { logger, logHelpers } = require('../utils/logger');
const { 
  generateToken, 
  validatePasswordStrength, 
  limitAuthAttempts,
  generate2FASecret,
  generate2FAQRCode,
  verify2FAToken,
  authMiddleware,
  validatePassword,
  hashPassword,
  verifyPassword,
  checkAccountLocked,
  checkPasswordExpiry
} = require('../middleware/auth');
const { 
  ValidationError, 
  AuthenticationError, 
  ConflictError,
  asyncHandler 
} = require('../middleware/errorHandler');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const PasswordService = require('../services/passwordService');
const passwordPolicy = require('../config/passwordPolicy');

const router = express.Router();

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user and return JWT token
 * @access Public
 */
router.post('/login', 
  limitAuthAttempts,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 1 })
      .withMessage('Password is required')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid login credentials', errors.array());
    }

    const { email, password } = req.body;
    const sessionId = uuidv4();
    const loginAttemptInfo = {
      email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId,
      correlationId: req.correlationId
    };

    try {
      // Find user by email
      const { data: user, error: userError } = await supabase
        .from('providers')
        .select(`
          id,
          practice_id,
          name,
          email,
          role,
          is_active,
          password_hash,
          failed_login_attempts,
          locked_until,
          last_login
        `)
        .eq('email', email)
        .single();

      if (userError || !user) {
        logHelpers.logAuth('login_failed', null, false, {
          ...loginAttemptInfo,
          reason: 'user_not_found'
        });
        throw new AuthenticationError('Invalid email or password');
      }

      // Check if user is active
      if (!user.is_active) {
        logHelpers.logAuth('login_failed', user.id, false, {
          ...loginAttemptInfo,
          reason: 'account_deactivated'
        });
        throw new AuthenticationError('Account is deactivated');
      }

      // Check if user is locked out
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const lockoutEnd = new Date(user.locked_until).toISOString();
        logHelpers.logAuth('login_failed', user.id, false, {
          ...loginAttemptInfo,
          reason: 'account_locked',
          lockoutEnd
        });
        throw new AuthenticationError(`Account locked until ${lockoutEnd}`);
      }

      // Check if account is locked
      const lockStatus = await checkAccountLocked(user.id);
      if (lockStatus.isLocked) {
        const remainingMinutes = Math.ceil(lockStatus.remainingMs / (1000 * 60));
        
        logHelpers.logAuth('login_failed', user.id, false, {
          ...loginAttemptInfo,
          reason: 'account_locked',
          remainingMinutes,
          failedAttempts: lockStatus.failedAttempts
        });
        
        throw new AuthenticationError(`Account locked. Please try again in ${remainingMinutes} minutes.`);
      }

      // Verify password with enhanced tracking
      const isPasswordValid = await verifyPassword(password, user.password_hash, user.id);
      
      if (!isPasswordValid) {
        // Increment failed login attempts
        const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
        const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
        const lockoutDuration = parseInt(process.env.LOCKOUT_DURATION_MINUTES) || 15;
        
        let updateData = {
          failed_login_attempts: newFailedAttempts
        };
        
        // Lock account if max attempts reached
        if (newFailedAttempts >= maxAttempts) {
          const lockoutEnd = new Date(Date.now() + (lockoutDuration * 60 * 1000));
          updateData.locked_until = lockoutEnd.toISOString();
        }
        
        await supabase
          .from('providers')
          .update(updateData)
          .eq('id', user.id);
        
        logHelpers.logAuth('login_failed', user.id, false, {
          ...loginAttemptInfo,
          reason: 'invalid_password',
          failedAttempts: newFailedAttempts,
          accountLocked: newFailedAttempts >= maxAttempts
        });
        
        throw new AuthenticationError('Invalid email or password');
      }

      // Check password expiry
      const expiryStatus = await checkPasswordExpiry(user.id);
      
      if (expiryStatus.isExpired) {
        logHelpers.logAuth('login_failed', user.id, false, {
          ...loginAttemptInfo,
          reason: 'password_expired'
        });
        
        throw new AuthenticationError('Password has expired. Please reset your password.');
      }

      // Successful login - reset failed attempts and update last login
      await supabase
        .from('providers')
        .update({
          failed_login_attempts: 0,
          locked_until: null,
          last_login: new Date().toISOString()
        })
        .eq('id', user.id);

      // Generate JWT token with enhanced claims
      const token = generateToken(user, sessionId);
      
      // Check for password expiry warning
      const passwordWarning = expiryStatus.isExpiring ? {
        isExpiring: true,
        daysRemaining: expiryStatus.daysRemaining,
        message: `Your password will expire in ${expiryStatus.daysRemaining} days. Please change it soon.`
      } : null;

      // Log successful login
      logHelpers.logAuth('login_success', user.id, true, {
        ...loginAttemptInfo,
        practiceId: user.practice_id,
        userRole: user.role
      });

      // Return success response with password warning if needed
      const response = {
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          practice_id: user.practice_id,
          last_login: user.last_login
        },
        session: {
          id: sessionId,
          expires_at: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString() // 24 hours
        }
      };
      
      if (passwordWarning) {
        response.passwordWarning = passwordWarning;
      }
      
      res.status(200).json(response);

    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      logger.error('Login process failed', {
        error: error.message,
        email,
        correlationId: req.correlationId
      });
      
      throw new AuthenticationError('Login failed');
    }
  })
);

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user and invalidate session
 * @access Private
 */
router.post('/logout', 
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const userId = req.user?.id;
    const sessionId = req.user?.sessionId;

    // Log logout attempt
    logHelpers.logAuth('logout', userId, true, {
      sessionId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      correlationId: req.correlationId
    });

    // In a production environment, you would typically:
    // 1. Add token to a blacklist/revocation list
    // 2. Store revoked tokens in Redis or database
    // 3. Check blacklist in auth middleware
    
    // For now, we'll just log the logout
    logger.info('User logged out', {
      userId,
      sessionId,
      correlationId: req.correlationId
    });

    res.status(200).json({
      message: 'Logout successful'
    });
  })
);

/**
 * @route POST /api/v1/auth/register
 * @desc Register new provider (admin only)
 * @access Private (Admin)
 */
router.post('/register',
  [
    body('name')
      .isLength({ min: 2, max: 255 })
      .withMessage('Name must be between 2 and 255 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 12 })
      .withMessage('Password must be at least 12 characters long'),
    body('npi')
      .matches(/^[0-9]{10}$/)
      .withMessage('NPI must be exactly 10 digits'),
    body('practice_id')
      .isUUID()
      .withMessage('Valid practice ID is required'),
    body('role')
      .isIn(['admin', 'provider', 'staff', 'readonly'])
      .withMessage('Invalid role specified'),
    body('specialty')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Specialty must be less than 100 characters')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Registration validation failed', errors.array());
    }

    const {
      name,
      email,
      password,
      npi,
      practice_id,
      role,
      specialty,
      license_number,
      license_state
    } = req.body;

    // Enhanced password validation
      const passwordValidation = await validatePassword(password, null, { email, name });
      if (!passwordValidation.isValid) {
        throw new ValidationError('Password does not meet security requirements', {
          password_issues: passwordValidation.issues,
          requirements: passwordPolicy.getRequirementsText(role),
          strength: passwordValidation.strength
        });
      }

    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('providers')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        throw new ConflictError('Email address already registered');
      }

      // Check if NPI already exists
      const { data: existingNPI } = await supabase
        .from('providers')
        .select('id')
        .eq('npi', npi)
        .single();

      if (existingNPI) {
        throw new ConflictError('NPI already registered');
      }

      // Verify practice exists
      const { data: practice, error: practiceError } = await supabase
        .from('practices')
        .select('id, name')
        .eq('id', practice_id)
        .single();

      if (practiceError || !practice) {
        throw new ValidationError('Invalid practice ID');
      }

      // Hash password with enhanced security
      const passwordHash = await hashPassword(password);

      // Create new provider
      const { data: newProvider, error: createError } = await supabase
        .from('providers')
        .insert({
          name,
          email,
          password_hash: passwordHash,
          npi,
          practice_id,
          role,
          specialty,
          license_number,
          license_state,
          is_active: true,
          created_by: req.user?.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        logger.error('Provider creation failed', {
          error: createError.message,
          email,
          npi,
          correlationId: req.correlationId
        });
        throw new Error('Failed to create provider account');
      }

      // Log successful registration
      logHelpers.logAuth('registration', newProvider.id, true, {
        registeredBy: req.user?.id,
        practiceId: practice_id,
        role,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      // Return success response (without password hash)
      const { password_hash, ...providerResponse } = newProvider;
      
      res.status(201).json({
        message: 'Provider registered successfully',
        provider: providerResponse
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ConflictError) {
        throw error;
      }
      
      logger.error('Registration process failed', {
        error: error.message,
        email,
        correlationId: req.correlationId
      });
      
      throw new Error('Registration failed');
    }
  })
);

/**
 * @route POST /api/v1/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password',
  [
    body('current_password')
      .isLength({ min: 1 })
      .withMessage('Current password is required'),
    body('new_password')
      .isLength({ min: 12 })
      .withMessage('New password must be at least 12 characters long')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Password change validation failed', errors.array());
    }

    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    // Enhanced password validation with personal info
      const personalInfo = {
        name: user.name,
        email: user.email,
        practiceId: user.practice_id
      };
      
      const passwordValidation = await validatePassword(new_password, userId, personalInfo);
      if (!passwordValidation.isValid) {
        throw new ValidationError('New password does not meet security requirements', {
          password_issues: passwordValidation.issues,
          requirements: passwordPolicy.getRequirementsText(user.role),
          strength: passwordValidation.strength
        });
      }

    try {
      // Get current user data
      const { data: user, error: userError } = await supabase
        .from('providers')
        .select('password_hash')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new AuthenticationError('User not found');
      }

      // Verify current password with enhanced tracking
      const isCurrentPasswordValid = await verifyPassword(
        current_password, 
        user.password_hash,
        userId
      );

      if (!isCurrentPasswordValid) {
        logHelpers.logSecurityViolation(
          'Invalid current password in password change attempt',
          'medium',
          {
            userId,
            ipAddress: req.ip,
            correlationId: req.correlationId
          }
        );
        throw new AuthenticationError('Current password is incorrect');
      }

      // Check if new password is same as current
      const isSamePassword = await verifyPassword(new_password, user.password_hash);
      if (isSamePassword) {
        throw new ValidationError('New password must be different from current password');
      }
      
      // Hash new password with history tracking
      const newPasswordHash = await hashPassword(new_password, userId);

      // Update password with expiry
      const passwordExpiresAt = new Date();
      passwordExpiresAt.setDate(passwordExpiresAt.getDate() + passwordPolicy.expiry.maxAge);
      
      const { error: updateError } = await supabase
        .from('providers')
        .update({
          password_hash: newPasswordHash,
          password_changed_at: new Date().toISOString(),
          password_expires_at: passwordExpiresAt.toISOString(),
          password_warning_sent: false,
          failed_login_attempts: 0, // Reset on successful password change
          locked_until: null, // Clear any existing locks
          updated_at: new Date().toISOString(),
          updated_by: userId
        })
        .eq('id', userId);

      if (updateError) {
        throw new Error('Failed to update password');
      }

      // Log password change with strength info
      logHelpers.logAuth('password_change', userId, true, {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: req.correlationId,
        passwordStrength: passwordValidation.strength.level,
        passwordScore: passwordValidation.strength.score,
        expiresAt: passwordExpiresAt.toISOString()
      });

      res.status(200).json({
        message: 'Password changed successfully',
        data: {
          passwordStrength: passwordValidation.strength,
          expiresAt: passwordExpiresAt.toISOString(),
          expiresInDays: passwordPolicy.expiry.maxAge
        }
      });

    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof ValidationError) {
        throw error;
      }
      
      logger.error('Password change failed', {
        error: error.message,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Password change failed');
    }
  })
);

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', 
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const { data: user, error } = await supabase
        .from('providers')
        .select(`
          id,
          practice_id,
          name,
          email,
          role,
          specialty,
          license_number,
          license_state,
          is_active,
          last_login,
          created_at,
          practices!inner(
            id,
            name,
            subscription_tier
          )
        `)
        .eq('id', userId)
        .single();

      if (error || !user) {
        throw new AuthenticationError('User not found');
      }

      res.status(200).json({
        user
      });

    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      logger.error('Failed to get user profile', {
        error: error.message,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to retrieve user profile');
    }
  })
);

/**
 * @route POST /api/v1/auth/2fa/setup
 * @desc Setup 2FA for user account
 * @access Private
 */
router.post('/2fa/setup',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    try {
      // Check if 2FA is already enabled
      const { data: existingUser, error: fetchError } = await supabase
        .from('providers')
        .select('two_factor_enabled, two_factor_secret')
        .eq('id', userId)
        .single();
        
      if (fetchError) {
        throw new Error('Failed to fetch user data');
      }
      
      if (existingUser.two_factor_enabled) {
        return res.status(400).json({
          error: 'Two-factor authentication is already enabled',
          code: 'TWO_FACTOR_ALREADY_ENABLED'
        });
      }
      
      // Generate new 2FA secret
      const { secret, otpauthUrl } = generate2FASecret(userEmail);
      
      // Generate QR code
      const qrCodeDataURL = await generate2FAQRCode(otpauthUrl);
      
      // Encrypt and store the secret (but don't enable 2FA yet)
      const encryptedSecret = encryptionService.encrypt(secret);
      
      const { error: updateError } = await supabase
        .from('providers')
        .update({
          two_factor_secret: encryptedSecret,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
        
      if (updateError) {
        throw new Error('Failed to save 2FA secret');
      }
      
      // Log 2FA setup initiation
      logHelpers.logSecurityEvent('2fa_setup_initiated', 'info', {
        userId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        data: {
          qr_code: qrCodeDataURL,
          manual_entry_key: secret,
          backup_codes: [] // TODO: Generate backup codes
        },
        message: 'Scan the QR code with your authenticator app and verify with a token'
      });
      
    } catch (error) {
      logger.error('2FA setup failed', {
        error: error.message,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to setup two-factor authentication');
    }
  })
);

/**
 * @route POST /api/v1/auth/2fa/verify
 * @desc Verify and enable 2FA for user account
 * @access Private
 */
router.post('/2fa/verify',
  authMiddleware,
  [
    body('token')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('2FA token must be 6 digits')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid 2FA token format', errors.array());
    }
    
    const { token } = req.body;
    const userId = req.user.id;
    
    try {
      // Get user's 2FA secret
      const { data: user, error: fetchError } = await supabase
        .from('providers')
        .select('two_factor_secret, two_factor_enabled')
        .eq('id', userId)
        .single();
        
      if (fetchError || !user) {
        throw new Error('User not found');
      }
      
      if (!user.two_factor_secret) {
        return res.status(400).json({
          error: 'Two-factor authentication setup not initiated',
          code: 'TWO_FACTOR_NOT_SETUP'
        });
      }
      
      if (user.two_factor_enabled) {
        return res.status(400).json({
          error: 'Two-factor authentication is already enabled',
          code: 'TWO_FACTOR_ALREADY_ENABLED'
        });
      }
      
      // Decrypt the secret
      const decryptedSecret = encryptionService.decrypt(user.two_factor_secret);
      
      // Verify the token
      const isValid = verify2FAToken(decryptedSecret, token);
      
      if (!isValid) {
        logHelpers.logSecurityEvent('2fa_verification_failed', 'warning', {
          userId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId
        });
        
        return res.status(400).json({
          error: 'Invalid 2FA token',
          code: 'INVALID_TWO_FACTOR_TOKEN'
        });
      }
      
      // Enable 2FA for the user
      const { error: updateError } = await supabase
        .from('providers')
        .update({
          two_factor_enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
        
      if (updateError) {
        throw new Error('Failed to enable 2FA');
      }
      
      // Log successful 2FA enablement
      logHelpers.logSecurityEvent('2fa_enabled', 'info', {
        userId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        message: 'Two-factor authentication has been successfully enabled'
      });
      
    } catch (error) {
      logger.error('2FA verification failed', {
        error: error.message,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to verify two-factor authentication');
    }
  })
);

/**
 * @route POST /api/v1/auth/2fa/authenticate
 * @desc Authenticate with 2FA token during login
 * @access Public
 */
router.post('/2fa/authenticate',
  limitAuthAttempts,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 1 })
      .withMessage('Password is required'),
    body('token')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('2FA token must be 6 digits')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid login credentials', errors.array());
    }
    
    const { email, password, token } = req.body;
    const sessionId = uuidv4();
    
    try {
      // First verify email and password
      const { data: user, error: userError } = await supabase
        .from('providers')
        .select(`
          id,
          practice_id,
          name,
          email,
          role,
          is_active,
          password_hash,
          two_factor_enabled,
          two_factor_secret,
          failed_login_attempts,
          locked_until
        `)
        .eq('email', email)
        .single();
        
      if (userError || !user) {
        throw new AuthenticationError('Invalid email or password');
      }
      
      // Verify password (assuming bcrypt is used)
      const bcrypt = require('bcrypt');
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid email or password');
      }
      
      // Check if 2FA is enabled
      if (!user.two_factor_enabled || !user.two_factor_secret) {
        throw new AuthenticationError('Two-factor authentication not enabled');
      }
      
      // Verify 2FA token
      const decryptedSecret = encryptionService.decrypt(user.two_factor_secret);
      const is2FAValid = verify2FAToken(decryptedSecret, token);
      
      if (!is2FAValid) {
        logHelpers.logAuth('2fa_login_failed', user.id, false, {
          email,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId,
          correlationId: req.correlationId,
          reason: 'invalid_2fa_token'
        });
        
        throw new AuthenticationError('Invalid 2FA token');
      }
      
      // Generate JWT token with 2FA verified flag
      const jwtToken = generateToken(user, sessionId, true);
      
      // Update last login
      await supabase
        .from('providers')
        .update({
          last_login: new Date().toISOString(),
          failed_login_attempts: 0,
          locked_until: null
        })
        .eq('id', user.id);
        
      // Log successful login with 2FA
      logHelpers.logAuth('2fa_login_success', user.id, true, {
        email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId,
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        data: {
          token: jwtToken,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            practice_id: user.practice_id,
            two_factor_enabled: true
          },
          session: {
            id: sessionId,
            expires_at: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString()
          }
        },
        message: 'Authentication successful'
      });
      
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      logger.error('2FA authentication failed', {
        error: error.message,
        email,
        correlationId: req.correlationId
      });
      
      throw new Error('Authentication failed');
    }
  })
);

/**
 * @route POST /api/v1/auth/2fa/disable
 * @desc Disable 2FA for user account
 * @access Private
 */
router.post('/2fa/disable',
  authMiddleware,
  [
    body('password')
      .isLength({ min: 1 })
      .withMessage('Current password is required'),
    body('token')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('2FA token must be 6 digits')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid input', errors.array());
    }
    
    const { password, token } = req.body;
    const userId = req.user.id;
    
    try {
      // Get user data
      const { data: user, error: fetchError } = await supabase
        .from('providers')
        .select('password_hash, two_factor_enabled, two_factor_secret')
        .eq('id', userId)
        .single();
        
      if (fetchError || !user) {
        throw new Error('User not found');
      }
      
      if (!user.two_factor_enabled) {
        return res.status(400).json({
          error: 'Two-factor authentication is not enabled',
          code: 'TWO_FACTOR_NOT_ENABLED'
        });
      }
      
      // Verify password
      const bcrypt = require('bcrypt');
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid password');
      }
      
      // Verify 2FA token
      const decryptedSecret = encryptionService.decrypt(user.two_factor_secret);
      const is2FAValid = verify2FAToken(decryptedSecret, token);
      
      if (!is2FAValid) {
        throw new AuthenticationError('Invalid 2FA token');
      }
      
      // Disable 2FA
      const { error: updateError } = await supabase
        .from('providers')
        .update({
          two_factor_enabled: false,
          two_factor_secret: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
        
      if (updateError) {
        throw new Error('Failed to disable 2FA');
      }
      
      // Log 2FA disablement
      logHelpers.logSecurityEvent('2fa_disabled', 'warning', {
        userId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: req.correlationId
      });
      
      res.json({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
      
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      logger.error('2FA disable failed', {
        error: error.message,
        userId,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to disable two-factor authentication');
    }
  })
);

/**
 * @route POST /api/v1/auth/register
 * @desc Register new user (public registration)
 * @access Public
 */
router.post('/register-user',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number and special character'),
    body('firstName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name is required and must be less than 50 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name is required and must be less than 50 characters'),
    body('role')
      .isIn(['provider', 'staff'])
      .withMessage('Role must be provider or staff'),
    body('practiceId')
      .optional()
      .isUUID()
      .withMessage('Invalid practice ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Registration validation failed', errors.array());
    }

    const { email, password, firstName, lastName, role, practiceId } = req.body;

    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('providers')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }

      // Hash password
      const passwordHash = encryptionService.hashPassword(password);

      // Create user
      const { data: newUser, error: createError } = await supabase
        .from('providers')
        .insert({
          id: uuidv4(),
          email,
          password_hash: passwordHash,
          name: `${firstName} ${lastName}`,
          role,
          practice_id: practiceId,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        throw new Error('Failed to create user');
      }

      // Log user registration
      logHelpers.logAuth('user_registration', newUser.id, true, {
        email,
        role,
        practiceId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: req.correlationId
      });

      // Generate JWT token
      const token = generateToken(newUser, uuidv4());

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          practice_id: newUser.practice_id
        }
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ConflictError) {
        throw error;
      }
      
      logger.error('User registration failed', {
        error: error.message,
        email,
        correlationId: req.correlationId
      });
      
      throw new Error('Registration failed');
    }
  })
);

/**
 * @route POST /api/v1/auth/invite
 * @desc Send invitation to new user
 * @access Private (Admin)
 */
router.post('/invite',
  authMiddleware,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('role')
      .isIn(['admin', 'provider', 'staff', 'readonly'])
      .withMessage('Invalid role specified'),
    body('practiceId')
      .isUUID()
      .withMessage('Valid practice ID is required')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invitation validation failed', errors.array());
    }

    const { email, role, practiceId } = req.body;
    const invitedBy = req.user.id;

    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('providers')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }

      // Check if invitation already exists
      const { data: existingInvitation } = await supabase
        .from('user_invitations')
        .select('id')
        .eq('email', email)
        .eq('status', 'pending')
        .single();

      if (existingInvitation) {
        throw new ConflictError('Pending invitation already exists for this email');
      }

      // Create invitation
      const invitationToken = uuidv4();
      const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days

      const { data: invitation, error: createError } = await supabase
        .from('user_invitations')
        .insert({
          id: uuidv4(),
          email,
          role,
          practice_id: practiceId,
          invited_by: invitedBy,
          invitation_token: invitationToken,
          expires_at: expiresAt.toISOString(),
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        throw new Error('Failed to create invitation');
      }

      // Log invitation creation
      logHelpers.logAuth('user_invitation_sent', invitedBy, true, {
        invitedEmail: email,
        role,
        practiceId,
        invitationId: invitation.id,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      // TODO: Send invitation email
      // await emailService.sendInvitation(email, invitationToken);

      res.status(201).json({
        message: 'Invitation sent successfully',
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expires_at: invitation.expires_at,
          status: invitation.status
        }
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ConflictError) {
        throw error;
      }
      
      logger.error('Invitation creation failed', {
        error: error.message,
        email,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to send invitation');
    }
  })
);

/**
 * @route POST /api/v1/auth/accept-invitation
 * @desc Accept invitation and create account
 * @access Public
 */
router.post('/accept-invitation',
  [
    body('token')
      .isUUID()
      .withMessage('Valid invitation token is required'),
    body('password')
      .isLength({ min: 12 })
      .withMessage('Password must be at least 12 characters long'),
    body('firstName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name is required'),
    body('lastName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name is required')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invitation acceptance validation failed', errors.array());
    }

    const { token, password, firstName, lastName } = req.body;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new ValidationError('Password does not meet security requirements', {
        password_issues: passwordValidation.issues
      });
    }

    try {
      // Find and validate invitation
      const { data: invitation, error: invitationError } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('invitation_token', token)
        .eq('status', 'pending')
        .single();

      if (invitationError || !invitation) {
        throw new AuthenticationError('Invalid or expired invitation');
      }

      // Check if invitation is expired
      if (new Date(invitation.expires_at) < new Date()) {
        throw new AuthenticationError('Invitation has expired');
      }

      // Hash password
      const passwordHash = encryptionService.hashPassword(password);

      // Create user account
      const { data: newUser, error: createError } = await supabase
        .from('providers')
        .insert({
          id: uuidv4(),
          email: invitation.email,
          password_hash: passwordHash,
          name: `${firstName} ${lastName}`,
          role: invitation.role,
          practice_id: invitation.practice_id,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        throw new Error('Failed to create user account');
      }

      // Mark invitation as accepted
      await supabase
        .from('user_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          user_id: newUser.id
        })
        .eq('id', invitation.id);

      // Log successful invitation acceptance
      logHelpers.logAuth('invitation_accepted', newUser.id, true, {
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        practiceId: invitation.practice_id,
        ipAddress: req.ip,
        correlationId: req.correlationId
      });

      // Generate JWT token
      const sessionId = uuidv4();
      const jwtToken = generateToken(newUser, sessionId);

      res.status(201).json({
        message: 'Account created successfully',
        token: jwtToken,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          practice_id: newUser.practice_id
        },
        session: {
          id: sessionId,
          expires_at: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString()
        }
      });

    } catch (error) {
      if (error instanceof ValidationError || error instanceof AuthenticationError) {
        throw error;
      }
      
      logger.error('Invitation acceptance failed', {
        error: error.message,
        token,
        correlationId: req.correlationId
      });
      
      throw new Error('Failed to accept invitation');
    }
  })
);

module.exports = router;