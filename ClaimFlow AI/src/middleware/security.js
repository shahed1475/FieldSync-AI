const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Rate limiting configurations
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.round(windowMs / 1000)
      });
    }
  });
};

// Security middleware configurations
const securityMiddleware = {
  // Helmet configuration for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }),

  // CORS configuration
  cors: cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://claimflow.com',
        'https://app.claimflow.com'
      ];
      
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
  }),

  // Rate limiters for different endpoints
  rateLimiters: {
    general: createRateLimiter(15 * 60 * 1000, 100, 'Too many requests'),
    auth: createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts'),
    api: createRateLimiter(15 * 60 * 1000, 1000, 'API rate limit exceeded'),
    upload: createRateLimiter(60 * 60 * 1000, 10, 'Too many file uploads')
  }
};

// JWT Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is blacklisted
    const blacklistCheck = await pool.query(
      'SELECT 1 FROM token_blacklist WHERE token_hash = $1',
      [crypto.createHash('sha256').update(token).digest('hex')]
    );
    
    if (blacklistCheck.rows.length > 0) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // Get user details
    const userResult = await pool.query(
      'SELECT id, email, role, first_name, last_name, active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    if (!user.active) {
      return res.status(401).json({ error: 'Account has been deactivated' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Role-based authorization middleware
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// API Key authentication middleware
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Hash the API key for comparison
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const result = await pool.query(`
      SELECT ak.*, u.id as user_id, u.role, u.active
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = $1 AND ak.active = true AND u.active = true
    `, [hashedKey]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const apiKeyData = result.rows[0];
    
    // Check expiration
    if (apiKeyData.expires_at && new Date() > apiKeyData.expires_at) {
      return res.status(401).json({ error: 'API key expired' });
    }

    // Update last used timestamp
    await pool.query(
      'UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
      [apiKeyData.id]
    );

    req.user = {
      id: apiKeyData.user_id,
      role: apiKeyData.role,
      apiKey: true
    };
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj.replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/<[^>]*>/g, '')
                .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  if (req.query) {
    req.query = sanitize(req.query);
  }
  
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

// Request validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const errors = [];
    
    // Validate required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!req.body[field]) {
          errors.push(`${field} is required`);
        }
      }
    }
    
    // Validate field types and formats
    if (schema.fields) {
      for (const [field, rules] of Object.entries(schema.fields)) {
        const value = req.body[field];
        
        if (value !== undefined && value !== null) {
          // Type validation
          if (rules.type) {
            const expectedType = rules.type;
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            
            if (actualType !== expectedType) {
              errors.push(`${field} must be of type ${expectedType}`);
            }
          }
          
          // String length validation
          if (rules.minLength && value.length < rules.minLength) {
            errors.push(`${field} must be at least ${rules.minLength} characters`);
          }
          
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${field} must be no more than ${rules.maxLength} characters`);
          }
          
          // Pattern validation
          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`${field} format is invalid`);
          }
          
          // Custom validation
          if (rules.validate && !rules.validate(value)) {
            errors.push(`${field} validation failed`);
          }
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }
    
    next();
  };
};

// HIPAA compliance middleware
const hipaaCompliance = async (req, res, next) => {
  try {
    // Log access to PHI (Protected Health Information)
    if (req.route && req.route.path.includes('patient')) {
      await pool.query(`
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        req.user?.id,
        req.method,
        'patient_data',
        req.params.id || req.body.patientId,
        req.ip,
        req.get('User-Agent')
      ]);
    }
    
    // Set security headers for PHI
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    next();
  } catch (error) {
    console.error('HIPAA compliance middleware error:', error);
    next(); // Continue even if logging fails
  }
};

// Data encryption middleware for sensitive fields
const encryptSensitiveData = (sensitiveFields = []) => {
  return (req, res, next) => {
    if (req.body && sensitiveFields.length > 0) {
      for (const field of sensitiveFields) {
        if (req.body[field]) {
          // Encrypt sensitive data before processing
          const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
          let encrypted = cipher.update(req.body[field], 'utf8', 'hex');
          encrypted += cipher.final('hex');
          req.body[`${field}_encrypted`] = encrypted;
          delete req.body[field]; // Remove plain text
        }
      }
    }
    next();
  };
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

// Error handling middleware
const securityErrorHandler = (error, req, res, next) => {
  // Log security-related errors
  if (error.name === 'UnauthorizedError' || error.status === 401) {
    console.warn('Unauthorized access attempt:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
  }
  
  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production') {
    if (error.status >= 400 && error.status < 500) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(error.status || 500).json({
      error: error.message,
      stack: error.stack
    });
  }
};

module.exports = {
  securityMiddleware,
  authenticateToken,
  authenticateApiKey,
  requireRole,
  sanitizeInput,
  validateRequest,
  hipaaCompliance,
  encryptSensitiveData,
  securityHeaders,
  securityErrorHandler
};