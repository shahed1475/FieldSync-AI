const fs = require('fs');
const path = require('path');
const https = require('https');
const { logger } = require('./logger');

/**
 * SSL Configuration Module
 * Handles SSL certificate loading and HTTPS server setup
 */

class SSLConfig {
  constructor() {
    this.sslEnabled = process.env.SSL_ENABLED === 'true';
    this.forceHttps = process.env.FORCE_HTTPS === 'true';
    this.certPath = process.env.SSL_CERT_PATH || './ssl/cert.pem';
    this.keyPath = process.env.SSL_KEY_PATH || './ssl/key.pem';
    this.caPath = process.env.SSL_CA_PATH || './ssl/ca.pem';
    
    this.sslOptions = null;
    this.certificateInfo = null;
  }

  /**
   * Initialize SSL configuration
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (!this.sslEnabled) {
      logger.info('SSL is disabled');
      return false;
    }

    try {
      await this.loadCertificates();
      await this.validateCertificates();
      this.logCertificateInfo();
      
      logger.info('SSL configuration initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize SSL configuration:', error);
      
      // In production, fail hard if SSL is required
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      
      // In development, warn and continue without SSL
      logger.warn('Continuing without SSL in development mode');
      this.sslEnabled = false;
      return false;
    }
  }

  /**
   * Load SSL certificates from files
   * @private
   */
  async loadCertificates() {
    const certFullPath = path.resolve(this.certPath);
    const keyFullPath = path.resolve(this.keyPath);
    const caFullPath = path.resolve(this.caPath);

    // Check if certificate files exist
    if (!fs.existsSync(certFullPath)) {
      throw new Error(`SSL certificate not found: ${certFullPath}`);
    }

    if (!fs.existsSync(keyFullPath)) {
      throw new Error(`SSL private key not found: ${keyFullPath}`);
    }

    try {
      // Load certificate and key
      const cert = fs.readFileSync(certFullPath, 'utf8');
      const key = fs.readFileSync(keyFullPath, 'utf8');
      
      this.sslOptions = {
        cert,
        key,
        // Security options
        secureProtocol: 'TLSv1_2_method',
        ciphers: [
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES128-SHA256',
          'ECDHE-RSA-AES256-SHA384'
        ].join(':'),
        honorCipherOrder: true
      };

      // Load CA certificate if available
      if (fs.existsSync(caFullPath)) {
        const ca = fs.readFileSync(caFullPath, 'utf8');
        this.sslOptions.ca = ca;
        logger.debug('CA certificate loaded');
      }

      logger.debug('SSL certificates loaded successfully');
    } catch (error) {
      throw new Error(`Failed to load SSL certificates: ${error.message}`);
    }
  }

  /**
   * Validate SSL certificates
   * @private
   */
  async validateCertificates() {
    const crypto = require('crypto');
    
    try {
      // Parse certificate to get information
      const cert = crypto.createHash('sha256')
        .update(this.sslOptions.cert)
        .digest('hex');
      
      const key = crypto.createHash('sha256')
        .update(this.sslOptions.key)
        .digest('hex');

      // Basic validation - ensure cert and key are not empty
      if (!this.sslOptions.cert.includes('BEGIN CERTIFICATE')) {
        throw new Error('Invalid certificate format');
      }

      if (!this.sslOptions.key.includes('BEGIN PRIVATE KEY') && 
          !this.sslOptions.key.includes('BEGIN RSA PRIVATE KEY')) {
        throw new Error('Invalid private key format');
      }

      // Store certificate fingerprint for monitoring
      this.certificateInfo = {
        certFingerprint: cert.substring(0, 16),
        keyFingerprint: key.substring(0, 16),
        loadedAt: new Date().toISOString()
      };

      logger.debug('SSL certificates validated successfully');
    } catch (error) {
      throw new Error(`SSL certificate validation failed: ${error.message}`);
    }
  }

  /**
   * Log certificate information
   * @private
   */
  logCertificateInfo() {
    if (!this.certificateInfo) return;

    logger.info('SSL Certificate Information:', {
      certFingerprint: this.certificateInfo.certFingerprint,
      loadedAt: this.certificateInfo.loadedAt,
      certPath: this.certPath,
      keyPath: this.keyPath,
      caPath: fs.existsSync(path.resolve(this.caPath)) ? this.caPath : 'not provided'
    });
  }

  /**
   * Create HTTPS server
   * @param {Object} app - Express application
   * @returns {https.Server} HTTPS server instance
   */
  createHttpsServer(app) {
    if (!this.sslEnabled || !this.sslOptions) {
      throw new Error('SSL is not enabled or configured');
    }

    const server = https.createServer(this.sslOptions, app);
    
    // Handle SSL errors
    server.on('tlsClientError', (err, tlsSocket) => {
      logger.warn('TLS Client Error:', {
        error: err.message,
        remoteAddress: tlsSocket.remoteAddress
      });
    });

    server.on('secureConnection', (tlsSocket) => {
      logger.debug('Secure connection established:', {
        remoteAddress: tlsSocket.remoteAddress,
        protocol: tlsSocket.getProtocol(),
        cipher: tlsSocket.getCipher()
      });
    });

    return server;
  }

  /**
   * Get HTTPS redirect middleware
   * @returns {Function} Express middleware
   */
  getHttpsRedirectMiddleware() {
    return (req, res, next) => {
      if (!this.forceHttps) {
        return next();
      }

      // Check if request is already HTTPS
      const isHttps = req.secure || 
                     req.get('X-Forwarded-Proto') === 'https' ||
                     req.get('X-Forwarded-Ssl') === 'on';

      if (!isHttps) {
        const httpsUrl = `https://${req.get('Host')}${req.originalUrl}`;
        logger.debug('Redirecting to HTTPS:', { from: req.originalUrl, to: httpsUrl });
        return res.redirect(301, httpsUrl);
      }

      next();
    };
  }

  /**
   * Get security headers middleware
   * @returns {Function} Express middleware
   */
  getSecurityHeadersMiddleware() {
    return (req, res, next) => {
      if (this.sslEnabled) {
        // HSTS (HTTP Strict Transport Security)
        const maxAge = process.env.HSTS_MAX_AGE || 31536000; // 1 year
        res.setHeader('Strict-Transport-Security', `max-age=${maxAge}; includeSubDomains; preload`);
        
        // Secure cookie settings
        if (process.env.SECURE_COOKIES === 'true') {
          const originalCookie = res.cookie;
          res.cookie = function(name, value, options = {}) {
            options.secure = true;
            options.sameSite = process.env.SAME_SITE_COOKIES || 'strict';
            return originalCookie.call(this, name, value, options);
          };
        }
      }

      // Additional security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      next();
    };
  }

  /**
   * Get SSL health check information
   * @returns {Object} SSL health status
   */
  getHealthStatus() {
    if (!this.sslEnabled) {
      return { ssl: 'disabled' };
    }

    if (!this.sslOptions || !this.certificateInfo) {
      return { ssl: 'error', message: 'SSL not properly configured' };
    }

    return {
      ssl: 'enabled',
      certificate: 'valid',
      fingerprint: this.certificateInfo.certFingerprint,
      loadedAt: this.certificateInfo.loadedAt,
      forceHttps: this.forceHttps
    };
  }

  /**
   * Reload SSL certificates (for certificate renewal)
   * @returns {Promise<boolean>} Success status
   */
  async reloadCertificates() {
    logger.info('Reloading SSL certificates...');
    
    try {
      await this.loadCertificates();
      await this.validateCertificates();
      this.logCertificateInfo();
      
      logger.info('SSL certificates reloaded successfully');
      return true;
    } catch (error) {
      logger.error('Failed to reload SSL certificates:', error);
      return false;
    }
  }

  // Getters
  get isEnabled() {
    return this.sslEnabled;
  }

  get options() {
    return this.sslOptions;
  }

  get info() {
    return this.certificateInfo;
  }
}

// Create singleton instance
const sslConfig = new SSLConfig();

module.exports = sslConfig;