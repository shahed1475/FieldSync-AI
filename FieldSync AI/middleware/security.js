const rateLimit = require('express-rate-limit');

// Enhanced XSS protection
const xssProtection = (req, res, next) => {
  // Set XSS protection headers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

// HTTP Parameter Pollution (HPP) protection
const hppProtection = (req, res, next) => {
  // Prevent parameter pollution by keeping only the last value for duplicate parameters
  const cleanParams = (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
    
    const cleaned = {};
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        const value = params[key];
        // If it's an array, keep only the last value (unless it's a whitelisted parameter)
        const whitelistedArrayParams = ['tags', 'categories', 'filters'];
        if (Array.isArray(value) && !whitelistedArrayParams.includes(key)) {
          cleaned[key] = value[value.length - 1];
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  };

  req.query = cleanParams(req.query);
  req.body = cleanParams(req.body);
  
  next();
};

// CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'https://insightflow-ai.vercel.app',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Create different rate limiters for different endpoints
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message || 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// General API rate limiter
const apiLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many API requests from this IP, please try again later.'
);

// Strict rate limiter for auth endpoints
const authLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 requests per windowMs
  'Too many authentication attempts from this IP, please try again later.'
);

// Query processing rate limiter
const queryLimiter = createRateLimit(
  60 * 1000, // 1 minute
  10, // limit each IP to 10 query requests per minute
  'Too many query requests from this IP, please try again later.'
);

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS attempts from string inputs
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  };

  const sanitizeObject = (obj) => {
    if (obj === null || typeof obj !== 'object') {
      return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Request size limiter
const requestSizeLimiter = (req, res, next) => {
  const contentLength = parseInt(req.get('content-length'));
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (contentLength && contentLength > maxSize) {
    return res.status(413).json({
      error: 'Request entity too large. Maximum size is 10MB.'
    });
  }

  next();
};

// SQL injection protection middleware
const sqlInjectionProtection = (req, res, next) => {
  const sqlInjectionPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(;|\-\-|\/\*|\*\/)/g,
    /(\b(OR|AND)\b.*=.*)/gi
  ];

  const checkForSQLInjection = (value) => {
    if (typeof value === 'string') {
      return sqlInjectionPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  const checkObject = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          if (checkObject(value)) return true;
        } else if (checkForSQLInjection(value)) {
          return true;
        }
      }
    }
    return false;
  };

  // Skip SQL injection check for certain endpoints that legitimately need SQL
  const skipPaths = ['/api/queries'];
  const shouldSkip = skipPaths.some(path => req.path.startsWith(path));

  if (!shouldSkip) {
    if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
      return res.status(400).json({
        error: 'Potential SQL injection detected in request'
      });
    }
  }

  next();
};

module.exports = {
  apiLimiter,
  authLimiter,
  queryLimiter,
  sanitizeInput,
  requestSizeLimiter,
  sqlInjectionProtection,
  xssProtection,
  hppProtection,
  corsOptions
};