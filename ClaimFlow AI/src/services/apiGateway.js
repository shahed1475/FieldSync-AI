const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { Pool } = require('pg');
const logger = require('../utils/logger');

/**
 * Secure API Gateway for Payer Portals
 * Handles authentication, rate limiting, request routing, and security for external payer integrations
 */
class APIGateway {
    constructor(dbPool) {
        this.db = dbPool;
        this.app = express();
        this.payerEndpoints = new Map();
        this.apiKeys = new Map();
        this.rateLimiters = new Map();
        this.requestCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.isInitialized = false;
    }

    /**
     * Initialize the API Gateway
     */
    async initialize() {
        try {
            await this.loadPayerEndpoints();
            await this.loadAPIKeys();
            this.setupMiddleware();
            this.setupRoutes();
            this.isInitialized = true;
            logger.info('API Gateway initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize API Gateway:', error);
            throw error;
        }
    }

    /**
     * Setup security and middleware
     */
    setupMiddleware() {
        // Security headers
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            },
            crossOriginEmbedderPolicy: false
        }));

        // CORS configuration
        this.app.use(cors({
            origin: (origin, callback) => {
                // Allow requests from registered payer domains
                const allowedOrigins = Array.from(this.payerEndpoints.values())
                    .map(endpoint => endpoint.allowedOrigins)
                    .flat()
                    .filter(Boolean);
                
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID']
        }));

        // Request parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request ID and logging
        this.app.use((req, res, next) => {
            req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
            res.setHeader('X-Request-ID', req.requestId);
            
            logger.info(`API Gateway Request: ${req.method} ${req.path}`, {
                requestId: req.requestId,
                userAgent: req.headers['user-agent'],
                ip: req.ip
            });
            
            next();
        });

        // Global rate limiting
        const globalRateLimit = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // limit each IP to 1000 requests per windowMs
            message: {
                error: 'Too many requests from this IP',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false
        });
        
        this.app.use('/api/gateway', globalRateLimit);
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        const router = express.Router();

        // Health check
        router.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                endpoints: this.payerEndpoints.size
            });
        });

        // Authentication endpoint
        router.post('/auth/token', this.handleTokenRequest.bind(this));
        
        // Payer-specific routes with authentication
        router.use('/payer/:payerId/*', this.authenticateRequest.bind(this));
        router.use('/payer/:payerId/*', this.applyPayerRateLimit.bind(this));
        
        // Authorization submission
        router.post('/payer/:payerId/authorization', this.handleAuthorizationSubmission.bind(this));
        
        // Authorization status check
        router.get('/payer/:payerId/authorization/:authId/status', this.handleStatusCheck.bind(this));
        
        // Authorization update
        router.put('/payer/:payerId/authorization/:authId', this.handleAuthorizationUpdate.bind(this));
        
        // Document submission
        router.post('/payer/:payerId/authorization/:authId/documents', this.handleDocumentSubmission.bind(this));
        
        // Eligibility verification
        router.post('/payer/:payerId/eligibility', this.handleEligibilityCheck.bind(this));
        
        // Benefits inquiry
        router.post('/payer/:payerId/benefits', this.handleBenefitsInquiry.bind(this));
        
        // Claims status
        router.get('/payer/:payerId/claims/:claimId/status', this.handleClaimStatus.bind(this));
        
        // Provider directory
        router.get('/payer/:payerId/providers', this.handleProviderDirectory.bind(this));
        
        // Formulary lookup
        router.get('/payer/:payerId/formulary', this.handleFormularyLookup.bind(this));
        
        // Webhook endpoints for payer notifications
        router.post('/webhook/:payerId/authorization', this.handleAuthorizationWebhook.bind(this));
        router.post('/webhook/:payerId/claim', this.handleClaimWebhook.bind(this));
        
        // Error handling
        router.use(this.handleErrors.bind(this));
        
        this.app.use('/api/gateway', router);
    }

    /**
     * Handle token requests for API authentication
     */
    async handleTokenRequest(req, res) {
        try {
            const { client_id, client_secret, grant_type, scope } = req.body;
            
            if (grant_type !== 'client_credentials') {
                return res.status(400).json({
                    error: 'unsupported_grant_type',
                    error_description: 'Only client_credentials grant type is supported'
                });
            }
            
            // Validate client credentials
            const apiKey = this.apiKeys.get(client_id);
            if (!apiKey || !this.verifyClientSecret(client_secret, apiKey.hashedSecret)) {
                return res.status(401).json({
                    error: 'invalid_client',
                    error_description: 'Invalid client credentials'
                });
            }
            
            // Generate JWT token
            const token = jwt.sign(
                {
                    client_id,
                    payer_id: apiKey.payerId,
                    scope: scope || apiKey.defaultScope,
                    iat: Math.floor(Date.now() / 1000),
                    exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
                },
                process.env.JWT_SECRET || 'your-secret-key'
            );
            
            // Log token issuance
            await this.logAPIAccess({
                client_id,
                payer_id: apiKey.payerId,
                action: 'token_issued',
                ip: req.ip,
                user_agent: req.headers['user-agent']
            });
            
            res.json({
                access_token: token,
                token_type: 'Bearer',
                expires_in: 3600,
                scope: scope || apiKey.defaultScope
            });
        } catch (error) {
            logger.error('Token request failed:', error);
            res.status(500).json({
                error: 'server_error',
                error_description: 'Internal server error'
            });
        }
    }

    /**
     * Authenticate API requests
     */
    async authenticateRequest(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const apiKey = req.headers['x-api-key'];
            
            let clientId, payerId;
            
            if (authHeader && authHeader.startsWith('Bearer ')) {
                // JWT token authentication
                const token = authHeader.substring(7);
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                
                clientId = decoded.client_id;
                payerId = decoded.payer_id;
                req.tokenScope = decoded.scope;
            } else if (apiKey) {
                // API key authentication
                const keyData = this.apiKeys.get(apiKey);
                if (!keyData) {
                    return res.status(401).json({ error: 'Invalid API key' });
                }
                
                clientId = apiKey;
                payerId = keyData.payerId;
                req.tokenScope = keyData.defaultScope;
            } else {
                return res.status(401).json({ error: 'Authentication required' });
            }
            
            // Verify payer ID matches route parameter
            if (req.params.payerId !== payerId) {
                return res.status(403).json({ error: 'Access denied for this payer' });
            }
            
            req.clientId = clientId;
            req.payerId = payerId;
            
            // Log API access
            await this.logAPIAccess({
                client_id: clientId,
                payer_id: payerId,
                action: 'api_access',
                endpoint: req.path,
                method: req.method,
                ip: req.ip,
                user_agent: req.headers['user-agent']
            });
            
            next();
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Invalid token' });
            } else if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            
            logger.error('Authentication error:', error);
            res.status(500).json({ error: 'Authentication failed' });
        }
    }

    /**
     * Apply payer-specific rate limiting
     */
    async applyPayerRateLimit(req, res, next) {
        try {
            const payerId = req.params.payerId;
            const endpoint = this.payerEndpoints.get(payerId);
            
            if (!endpoint) {
                return res.status(404).json({ error: 'Payer not found' });
            }
            
            // Get or create rate limiter for this payer
            let rateLimiter = this.rateLimiters.get(payerId);
            if (!rateLimiter) {
                rateLimiter = rateLimit({
                    windowMs: endpoint.rateLimitWindow || 60 * 1000, // 1 minute default
                    max: endpoint.rateLimitMax || 100, // 100 requests per minute default
                    message: {
                        error: 'Rate limit exceeded for this payer',
                        retryAfter: Math.ceil((endpoint.rateLimitWindow || 60000) / 1000)
                    },
                    standardHeaders: true,
                    legacyHeaders: false,
                    keyGenerator: (req) => `${req.clientId}_${payerId}`
                });
                
                this.rateLimiters.set(payerId, rateLimiter);
            }
            
            rateLimiter(req, res, next);
        } catch (error) {
            logger.error('Rate limiting error:', error);
            next();
        }
    }

    /**
     * Handle authorization submission to payer
     */
    async handleAuthorizationSubmission(req, res) {
        try {
            const { payerId } = req.params;
            const authorizationData = req.body;
            
            // Validate required fields
            const validation = this.validateAuthorizationData(authorizationData);
            if (!validation.valid) {
                return res.status(400).json({
                    error: 'validation_failed',
                    details: validation.errors
                });
            }
            
            // Transform data to payer format
            const payerData = await this.transformToPayerFormat(payerId, authorizationData);
            
            // Submit to payer
            const result = await this.submitToPayer(payerId, 'authorization', payerData);
            
            // Store submission record
            await this.storeSubmissionRecord({
                payer_id: payerId,
                client_id: req.clientId,
                submission_type: 'authorization',
                external_id: result.id || result.reference_number,
                status: result.status || 'submitted',
                request_data: authorizationData,
                response_data: result
            });
            
            res.json({
                success: true,
                submission_id: result.id || result.reference_number,
                status: result.status || 'submitted',
                estimated_processing_time: result.estimated_processing_time,
                next_steps: result.next_steps
            });
        } catch (error) {
            logger.error('Authorization submission failed:', error);
            res.status(500).json({
                error: 'submission_failed',
                message: 'Failed to submit authorization to payer'
            });
        }
    }

    /**
     * Handle authorization status check
     */
    async handleStatusCheck(req, res) {
        try {
            const { payerId, authId } = req.params;
            
            // Check cache first
            const cacheKey = `status_${payerId}_${authId}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                return res.json(cached);
            }
            
            // Query payer for status
            const status = await this.queryPayerStatus(payerId, authId);
            
            // Cache the result
            this.setCache(cacheKey, status);
            
            // Update our records
            await this.updateSubmissionStatus(payerId, authId, status);
            
            res.json(status);
        } catch (error) {
            logger.error('Status check failed:', error);
            res.status(500).json({
                error: 'status_check_failed',
                message: 'Failed to retrieve authorization status'
            });
        }
    }

    /**
     * Handle authorization updates
     */
    async handleAuthorizationUpdate(req, res) {
        try {
            const { payerId, authId } = req.params;
            const updateData = req.body;
            
            // Validate update data
            const validation = this.validateUpdateData(updateData);
            if (!validation.valid) {
                return res.status(400).json({
                    error: 'validation_failed',
                    details: validation.errors
                });
            }
            
            // Transform data to payer format
            const payerData = await this.transformToPayerFormat(payerId, updateData);
            
            // Submit update to payer
            const result = await this.updatePayerAuthorization(payerId, authId, payerData);
            
            // Update our records
            await this.updateSubmissionRecord(payerId, authId, {
                status: result.status,
                last_updated: new Date().toISOString(),
                update_data: updateData,
                response_data: result
            });
            
            res.json({
                success: true,
                status: result.status,
                updated_fields: result.updated_fields,
                message: result.message
            });
        } catch (error) {
            logger.error('Authorization update failed:', error);
            res.status(500).json({
                error: 'update_failed',
                message: 'Failed to update authorization'
            });
        }
    }

    /**
     * Handle document submission
     */
    async handleDocumentSubmission(req, res) {
        try {
            const { payerId, authId } = req.params;
            const documents = req.body.documents || [];
            
            if (documents.length === 0) {
                return res.status(400).json({
                    error: 'no_documents',
                    message: 'No documents provided'
                });
            }
            
            const results = [];
            
            for (const document of documents) {
                try {
                    // Validate document
                    const validation = this.validateDocument(document);
                    if (!validation.valid) {
                        results.push({
                            document_id: document.id,
                            success: false,
                            errors: validation.errors
                        });
                        continue;
                    }
                    
                    // Submit document to payer
                    const result = await this.submitDocumentToPayer(payerId, authId, document);
                    
                    results.push({
                        document_id: document.id,
                        success: true,
                        payer_document_id: result.id,
                        status: result.status
                    });
                } catch (error) {
                    results.push({
                        document_id: document.id,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            res.json({
                success: true,
                results,
                total_documents: documents.length,
                successful_submissions: results.filter(r => r.success).length
            });
        } catch (error) {
            logger.error('Document submission failed:', error);
            res.status(500).json({
                error: 'document_submission_failed',
                message: 'Failed to submit documents'
            });
        }
    }

    /**
     * Handle eligibility verification
     */
    async handleEligibilityCheck(req, res) {
        try {
            const { payerId } = req.params;
            const { member_id, service_date, service_codes } = req.body;
            
            // Check cache first
            const cacheKey = `eligibility_${payerId}_${member_id}_${service_date}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                return res.json(cached);
            }
            
            // Query payer for eligibility
            const eligibility = await this.checkPayerEligibility(payerId, {
                member_id,
                service_date,
                service_codes
            });
            
            // Cache the result for 1 hour
            this.setCache(cacheKey, eligibility, 60 * 60 * 1000);
            
            res.json(eligibility);
        } catch (error) {
            logger.error('Eligibility check failed:', error);
            res.status(500).json({
                error: 'eligibility_check_failed',
                message: 'Failed to verify eligibility'
            });
        }
    }

    /**
     * Handle benefits inquiry
     */
    async handleBenefitsInquiry(req, res) {
        try {
            const { payerId } = req.params;
            const inquiryData = req.body;
            
            const benefits = await this.queryPayerBenefits(payerId, inquiryData);
            
            res.json(benefits);
        } catch (error) {
            logger.error('Benefits inquiry failed:', error);
            res.status(500).json({
                error: 'benefits_inquiry_failed',
                message: 'Failed to retrieve benefits information'
            });
        }
    }

    /**
     * Handle webhook notifications from payers
     */
    async handleAuthorizationWebhook(req, res) {
        try {
            const { payerId } = req.params;
            const webhookData = req.body;
            
            // Verify webhook signature
            const isValid = await this.verifyWebhookSignature(payerId, req);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
            
            // Process webhook data
            await this.processAuthorizationWebhook(payerId, webhookData);
            
            res.json({ success: true, message: 'Webhook processed' });
        } catch (error) {
            logger.error('Webhook processing failed:', error);
            res.status(500).json({
                error: 'webhook_processing_failed',
                message: 'Failed to process webhook'
            });
        }
    }

    /**
     * Utility and helper methods
     */
    validateAuthorizationData(data) {
        const errors = [];
        
        if (!data.patient_id) errors.push('patient_id is required');
        if (!data.provider_id) errors.push('provider_id is required');
        if (!data.service_type) errors.push('service_type is required');
        if (!data.procedure_codes || data.procedure_codes.length === 0) {
            errors.push('procedure_codes are required');
        }
        if (!data.diagnosis_codes || data.diagnosis_codes.length === 0) {
            errors.push('diagnosis_codes are required');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateUpdateData(data) {
        const errors = [];
        const allowedFields = ['status', 'notes', 'supporting_documents', 'estimated_cost'];
        
        const providedFields = Object.keys(data);
        const invalidFields = providedFields.filter(field => !allowedFields.includes(field));
        
        if (invalidFields.length > 0) {
            errors.push(`Invalid fields: ${invalidFields.join(', ')}`);
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateDocument(document) {
        const errors = [];
        
        if (!document.type) errors.push('document type is required');
        if (!document.content && !document.url) {
            errors.push('document content or URL is required');
        }
        if (document.content && document.content.length > 10 * 1024 * 1024) {
            errors.push('document size exceeds 10MB limit');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    async transformToPayerFormat(payerId, data) {
        const endpoint = this.payerEndpoints.get(payerId);
        if (!endpoint || !endpoint.dataTransform) {
            return data; // No transformation needed
        }
        
        // Apply payer-specific data transformations
        // This would be customized for each payer's API format
        return data;
    }

    async submitToPayer(payerId, type, data) {
        const endpoint = this.payerEndpoints.get(payerId);
        if (!endpoint) {
            throw new Error(`Payer endpoint not found: ${payerId}`);
        }
        
        const response = await axios.post(
            `${endpoint.baseUrl}/${type}`,
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${endpoint.apiToken}`,
                    'X-API-Version': endpoint.apiVersion || '1.0'
                },
                timeout: endpoint.timeout || 30000
            }
        );
        
        return response.data;
    }

    async queryPayerStatus(payerId, authId) {
        const endpoint = this.payerEndpoints.get(payerId);
        if (!endpoint) {
            throw new Error(`Payer endpoint not found: ${payerId}`);
        }
        
        const response = await axios.get(
            `${endpoint.baseUrl}/authorization/${authId}/status`,
            {
                headers: {
                    'Authorization': `Bearer ${endpoint.apiToken}`,
                    'X-API-Version': endpoint.apiVersion || '1.0'
                },
                timeout: endpoint.timeout || 15000
            }
        );
        
        return response.data;
    }

    verifyClientSecret(providedSecret, hashedSecret) {
        const hash = crypto.createHash('sha256').update(providedSecret).digest('hex');
        return hash === hashedSecret;
    }

    async verifyWebhookSignature(payerId, req) {
        const endpoint = this.payerEndpoints.get(payerId);
        if (!endpoint || !endpoint.webhookSecret) {
            return false;
        }
        
        const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
        if (!signature) {
            return false;
        }
        
        const expectedSignature = crypto
            .createHmac('sha256', endpoint.webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');
        
        return signature === expectedSignature;
    }

    async loadPayerEndpoints() {
        try {
            const query = `
                SELECT 
                    id,
                    name,
                    base_url,
                    api_token,
                    api_version,
                    webhook_secret,
                    rate_limit_window,
                    rate_limit_max,
                    timeout,
                    allowed_origins,
                    data_transform,
                    is_active
                FROM payer_endpoints
                WHERE is_active = true
            `;
            
            const result = await this.db.query(query);
            
            for (const row of result.rows) {
                this.payerEndpoints.set(row.id, {
                    name: row.name,
                    baseUrl: row.base_url,
                    apiToken: row.api_token,
                    apiVersion: row.api_version,
                    webhookSecret: row.webhook_secret,
                    rateLimitWindow: row.rate_limit_window,
                    rateLimitMax: row.rate_limit_max,
                    timeout: row.timeout,
                    allowedOrigins: row.allowed_origins || [],
                    dataTransform: row.data_transform
                });
            }
            
            logger.info(`Loaded ${result.rows.length} payer endpoints`);
        } catch (error) {
            logger.error('Failed to load payer endpoints:', error);
            throw error;
        }
    }

    async loadAPIKeys() {
        try {
            const query = `
                SELECT 
                    client_id,
                    hashed_secret,
                    payer_id,
                    default_scope,
                    is_active
                FROM api_keys
                WHERE is_active = true
            `;
            
            const result = await this.db.query(query);
            
            for (const row of result.rows) {
                this.apiKeys.set(row.client_id, {
                    hashedSecret: row.hashed_secret,
                    payerId: row.payer_id,
                    defaultScope: row.default_scope
                });
            }
            
            logger.info(`Loaded ${result.rows.length} API keys`);
        } catch (error) {
            logger.error('Failed to load API keys:', error);
            throw error;
        }
    }

    async logAPIAccess(logData) {
        try {
            const query = `
                INSERT INTO api_access_logs (
                    client_id, payer_id, action, endpoint, method, 
                    ip_address, user_agent, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            
            await this.db.query(query, [
                logData.client_id,
                logData.payer_id,
                logData.action,
                logData.endpoint,
                logData.method,
                logData.ip,
                logData.user_agent,
                new Date()
            ]);
        } catch (error) {
            logger.error('Failed to log API access:', error);
        }
    }

    async storeSubmissionRecord(data) {
        try {
            const query = `
                INSERT INTO payer_submissions (
                    payer_id, client_id, submission_type, external_id, 
                    status, request_data, response_data, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `;
            
            const result = await this.db.query(query, [
                data.payer_id,
                data.client_id,
                data.submission_type,
                data.external_id,
                data.status,
                JSON.stringify(data.request_data),
                JSON.stringify(data.response_data),
                new Date()
            ]);
            
            return result.rows[0].id;
        } catch (error) {
            logger.error('Failed to store submission record:', error);
            throw error;
        }
    }

    getFromCache(key, customTimeout = null) {
        const cached = this.requestCache.get(key);
        const timeout = customTimeout || this.cacheTimeout;
        
        if (cached && Date.now() - cached.timestamp < timeout) {
            return cached.data;
        }
        
        this.requestCache.delete(key);
        return null;
    }

    setCache(key, data, customTimeout = null) {
        this.requestCache.set(key, {
            data,
            timestamp: Date.now(),
            timeout: customTimeout || this.cacheTimeout
        });
    }

    clearCache() {
        this.requestCache.clear();
        logger.info('API Gateway cache cleared');
    }

    handleErrors(error, req, res, next) {
        logger.error('API Gateway error:', {
            error: error.message,
            stack: error.stack,
            requestId: req.requestId,
            path: req.path,
            method: req.method
        });
        
        if (res.headersSent) {
            return next(error);
        }
        
        res.status(500).json({
            error: 'internal_server_error',
            message: 'An unexpected error occurred',
            requestId: req.requestId
        });
    }

    getApp() {
        return this.app;
    }
}

module.exports = APIGateway;