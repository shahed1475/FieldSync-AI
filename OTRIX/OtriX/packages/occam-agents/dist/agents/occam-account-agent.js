"use strict";
/**
 * OCCAM Account Agent
 * Secure account creation, credential management, and 2FA handling
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCCAMAccountAgent = void 0;
const crypto = __importStar(require("crypto"));
const uuid_1 = require("uuid");
const FactBoxService_1 = require("../services/FactBoxService");
const AuditService_1 = require("../services/AuditService");
const SecureVault_1 = require("../services/SecureVault");
const logger_1 = require("../services/logger");
/**
 * OCCAMAccountAgent
 * Intelligent automation agent for secure account operations
 *
 * Core Capabilities:
 * - Automated account creation on regulatory/client portals
 * - Secure credential storage with AES-256 encryption
 * - Multi-method 2FA support (TOTP, SMS, Email)
 * - Credential rotation and lifecycle management
 * - Policy enforcement and validation
 * - Comprehensive audit logging
 */
class OCCAMAccountAgent {
    constructor(options = {}) {
        this.factBoxService = options.factBoxService || new FactBoxService_1.FactBoxService();
        this.auditService = options.auditService || new AuditService_1.AuditService();
        this.secureVault = options.secureVault || new SecureVault_1.SecureVault();
        this.passwordPolicy = options.passwordPolicy || OCCAMAccountAgent.DEFAULT_PASSWORD_POLICY;
        this.rotationPolicy = options.rotationPolicy || OCCAMAccountAgent.DEFAULT_ROTATION_POLICY;
        this.enable2FA = options.enable2FA !== undefined ? options.enable2FA : true;
        this.default2FAMethod = options.default2FAMethod || 'TOTP';
        this.maxLoginAttempts = options.maxLoginAttempts || 5;
        this.rateLimitDelay = options.rateLimitDelay || 1000;
        this.loginAttempts = new Map();
        logger_1.logger.info('OCCAM Account Agent initialized', {
            enable2FA: this.enable2FA,
            default2FAMethod: this.default2FAMethod,
            passwordPolicyMinLength: this.passwordPolicy.minLength,
        });
    }
    /**
     * Create a new account on a portal
     *
     * @param portalUrl - The URL of the portal to create account on
     * @param data - Account information including credentials
     * @param entityId - Optional entity ID for linking to FactBox data
     * @returns Account creation result with credential ID and 2FA details
     */
    async createAccount(portalUrl, data, entityId) {
        const traceId = this.auditService.generateTraceId();
        const startTime = Date.now();
        logger_1.logger.info(`Starting account creation for ${portalUrl}`, {
            traceId,
            portalUrl,
            email: data.email,
            entityId,
        });
        try {
            // Step 1: Validate account data
            const validation = await this.validateAccountData(data);
            if (!validation.isValid) {
                await this.auditService.logFailure('account_creation', { portalUrl, email: data.email, errors: validation.errors }, traceId);
                return {
                    success: false,
                    portalUrl,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    twoFactorEnabled: false,
                    metadata: {
                        traceId,
                        createdAt: new Date(),
                        requiresVerification: false,
                    },
                };
            }
            // Step 2: Verify entity if provided
            if (entityId) {
                const entityData = await this.factBoxService.getEntityData(entityId, traceId);
                if (!entityData) {
                    await this.auditService.logFailure('account_creation', { portalUrl, email: data.email, entityId, error: 'Entity not found' }, traceId);
                    return {
                        success: false,
                        portalUrl,
                        error: 'Entity verification failed - entity not found',
                        twoFactorEnabled: false,
                        metadata: {
                            traceId,
                            createdAt: new Date(),
                            requiresVerification: false,
                        },
                    };
                }
                // Merge entity contact info if not provided
                if (!data.phone && entityData.contactInfo?.phone) {
                    data.phone = entityData.contactInfo.phone;
                }
            }
            // Step 3: Store credentials securely
            const credentialId = await this.storeCredentialsSecurely(portalUrl, data.email, data.password, true, entityId);
            // Step 4: Simulate account creation on portal
            // In production, this would make actual API calls or use automation tools
            const accountId = `ACC-${(0, uuid_1.v4)().substring(0, 8).toUpperCase()}`;
            logger_1.logger.info(`Account created successfully: ${accountId}`, {
                traceId,
                accountId,
                portalUrl,
            });
            // Step 5: Set up 2FA if enabled
            let twoFactorAuth;
            let backupCodes;
            if (this.enable2FA) {
                const twoFactorResult = await this.setup2FA(accountId, this.default2FAMethod, data.email, data.phone);
                if (twoFactorResult.success) {
                    twoFactorAuth = {
                        method: this.default2FAMethod,
                        secret: twoFactorResult.secret,
                        backupCodes: twoFactorResult.backupCodes,
                        phoneNumber: data.phone,
                        email: data.email,
                        verified: false,
                    };
                    backupCodes = twoFactorResult.backupCodes;
                    logger_1.logger.info(`2FA setup completed for ${accountId}`, {
                        traceId,
                        method: this.default2FAMethod,
                    });
                }
            }
            // Step 6: Log success to audit
            await this.auditService.logSuccess('account_creation', {
                accountId,
                portalUrl,
                email: data.email,
                entityId,
                credentialId,
                twoFactorEnabled: !!twoFactorAuth,
                duration: Date.now() - startTime,
            }, traceId);
            return {
                success: true,
                accountId,
                portalUrl,
                username: data.username || data.email,
                credentialId,
                twoFactorEnabled: !!twoFactorAuth,
                twoFactorMethod: twoFactorAuth?.method,
                backupCodes,
                metadata: {
                    traceId,
                    createdAt: new Date(),
                    requiresVerification: true,
                },
            };
        }
        catch (error) {
            logger_1.logger.error('Account creation failed', error, {
                traceId,
                portalUrl,
                email: data.email,
            });
            await this.auditService.logFailure('account_creation', { portalUrl, email: data.email, entityId }, traceId, error);
            return {
                success: false,
                portalUrl,
                error: error.message,
                twoFactorEnabled: false,
                metadata: {
                    traceId,
                    createdAt: new Date(),
                    requiresVerification: false,
                },
            };
        }
    }
    /**
     * Handle 2FA verification
     *
     * @param type - 2FA method type (TOTP, SMS, Email)
     * @param accountId - Account identifier
     * @param code - Verification code
     * @returns Verification result
     */
    async handle2FA(type, accountId, code) {
        const traceId = this.auditService.generateTraceId();
        logger_1.logger.info(`Handling 2FA verification`, {
            traceId,
            accountId,
            method: type,
        });
        try {
            // Rate limiting check
            const rateLimitCheck = await this.checkRateLimit(accountId);
            if (!rateLimitCheck.allowed) {
                await this.auditService.logWarning('2fa_verification_rate_limited', {
                    accountId,
                    method: type,
                    remainingAttempts: rateLimitCheck.remainingAttempts,
                }, traceId);
                return {
                    success: false,
                    method: type,
                    verified: false,
                    remainingAttempts: rateLimitCheck.remainingAttempts,
                    error: 'Too many attempts. Please wait before trying again.',
                    metadata: {
                        traceId,
                    },
                };
            }
            // Verify the code based on method
            let verified = false;
            switch (type) {
                case 'TOTP':
                    verified = await this.verifyTOTP(accountId, code, traceId);
                    break;
                case 'SMS':
                    verified = await this.verifySMS(accountId, code, traceId);
                    break;
                case 'Email':
                    verified = await this.verifyEmail(accountId, code, traceId);
                    break;
            }
            if (verified) {
                // Reset login attempts on successful verification
                this.loginAttempts.delete(accountId);
                await this.auditService.logSuccess('2fa_verification', { accountId, method: type }, traceId);
                return {
                    success: true,
                    method: type,
                    verified: true,
                    metadata: {
                        traceId,
                        verifiedAt: new Date(),
                    },
                };
            }
            else {
                // Increment failed attempts
                this.incrementLoginAttempts(accountId);
                const remainingAttempts = this.maxLoginAttempts - this.getLoginAttemptCount(accountId);
                await this.auditService.logWarning('2fa_verification_failed', {
                    accountId,
                    method: type,
                    remainingAttempts,
                }, traceId);
                return {
                    success: false,
                    method: type,
                    verified: false,
                    remainingAttempts: Math.max(0, remainingAttempts),
                    error: 'Invalid verification code',
                    metadata: {
                        traceId,
                    },
                };
            }
        }
        catch (error) {
            logger_1.logger.error('2FA verification error', error, {
                traceId,
                accountId,
                method: type,
            });
            await this.auditService.logFailure('2fa_verification', { accountId, method: type }, traceId, error);
            return {
                success: false,
                method: type,
                verified: false,
                error: error.message,
                metadata: {
                    traceId,
                },
            };
        }
    }
    /**
     * Store credentials securely in the vault
     *
     * @param portalUrl - Portal URL for scope
     * @param username - Account username
     * @param password - Account password
     * @param encrypted - Whether to encrypt (always true for production)
     * @param entityId - Optional entity ID for metadata
     * @returns Credential ID
     */
    async storeCredentialsSecurely(portalUrl, username, password, encrypted = true, entityId) {
        const traceId = this.auditService.generateTraceId();
        logger_1.logger.info(`Storing credentials securely`, {
            traceId,
            portalUrl,
            username,
            encrypted,
        });
        try {
            if (!encrypted) {
                logger_1.logger.warn('Credentials stored without encryption - not recommended for production', {
                    traceId,
                });
            }
            // Calculate expiration based on rotation policy
            const expiresAt = this.rotationPolicy.enforceRotation
                ? new Date(Date.now() + this.rotationPolicy.frequency * 24 * 60 * 60 * 1000)
                : undefined;
            // Store username
            const usernameKey = `${portalUrl}:username`;
            const usernameId = await this.secureVault.storeCredential('portal', usernameKey, username, {
                expiresAt,
                metadata: { portalUrl, entityId, type: 'username' },
            });
            // Store password
            const passwordKey = `${portalUrl}:password`;
            const passwordId = await this.secureVault.storeCredential('portal', passwordKey, password, {
                expiresAt,
                metadata: { portalUrl, entityId, type: 'password', usernameId },
            });
            await this.auditService.logSuccess('credentials_stored', {
                portalUrl,
                username,
                usernameId,
                passwordId,
                encrypted,
                expiresAt,
            }, traceId);
            logger_1.logger.info(`Credentials stored successfully`, {
                traceId,
                passwordId,
                expiresAt,
            });
            return passwordId;
        }
        catch (error) {
            logger_1.logger.error('Failed to store credentials', error, {
                traceId,
                portalUrl,
                username,
            });
            await this.auditService.logFailure('credentials_storage', { portalUrl, username }, traceId, error);
            throw error;
        }
    }
    /**
     * Rotate credentials for a portal account
     *
     * @param credentialId - Existing credential ID
     * @param newPassword - New password (optional, will be generated if not provided)
     * @param reason - Reason for rotation
     * @returns Rotation result
     */
    async rotateCredentials(credentialId, newPassword, reason) {
        const traceId = this.auditService.generateTraceId();
        logger_1.logger.info(`Starting credential rotation`, {
            traceId,
            credentialId,
            reason,
        });
        try {
            // Verify credential exists
            const isValid = await this.secureVault.isCredentialValid(credentialId);
            if (!isValid) {
                await this.auditService.logWarning('credential_rotation_failed', {
                    credentialId,
                    reason,
                    error: 'Credential not found or invalid',
                }, traceId);
                return {
                    success: false,
                    oldCredentialId: credentialId,
                    rotatedAt: new Date(),
                    error: 'Credential not found or invalid',
                    metadata: {
                        traceId,
                        reason,
                    },
                };
            }
            // Rotate the credential
            const rotated = await this.secureVault.rotateCredential(credentialId);
            if (!rotated) {
                await this.auditService.logFailure('credential_rotation', { credentialId, reason }, traceId);
                return {
                    success: false,
                    oldCredentialId: credentialId,
                    rotatedAt: new Date(),
                    error: 'Rotation failed',
                    metadata: {
                        traceId,
                        reason,
                    },
                };
            }
            await this.auditService.logSuccess('credential_rotation', {
                oldCredentialId: credentialId,
                reason,
            }, traceId);
            return {
                success: true,
                oldCredentialId: credentialId,
                rotatedAt: new Date(),
                metadata: {
                    traceId,
                    reason,
                },
            };
        }
        catch (error) {
            logger_1.logger.error('Credential rotation failed', error, {
                traceId,
                credentialId,
            });
            await this.auditService.logFailure('credential_rotation', { credentialId, reason }, traceId, error);
            return {
                success: false,
                oldCredentialId: credentialId,
                rotatedAt: new Date(),
                error: error.message,
                metadata: {
                    traceId,
                    reason,
                },
            };
        }
    }
    /**
     * Validate account data before creation
     */
    async validateAccountData(data) {
        const errors = [];
        const warnings = [];
        // Validate email
        if (!data.email || !this.isValidEmail(data.email)) {
            errors.push('Invalid email address');
        }
        // Validate password against policy
        const passwordValidation = this.validatePassword(data.password);
        if (!passwordValidation.isValid) {
            errors.push(...passwordValidation.errors);
        }
        // Check for common weak passwords
        if (this.passwordPolicy.preventCommonPasswords &&
            OCCAMAccountAgent.COMMON_PASSWORDS.includes(data.password.toLowerCase())) {
            errors.push('Password is too common. Please choose a stronger password.');
        }
        // Warnings for optional fields
        if (!data.fullName) {
            warnings.push('Full name not provided');
        }
        if (!data.phone && this.default2FAMethod === 'SMS') {
            warnings.push('Phone number required for SMS 2FA');
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            passwordStrength: this.assessPasswordStrength(data.password),
        };
    }
    /**
     * Validate password against policy
     */
    validatePassword(password) {
        const errors = [];
        if (password.length < this.passwordPolicy.minLength) {
            errors.push(`Password must be at least ${this.passwordPolicy.minLength} characters`);
        }
        if (this.passwordPolicy.maxLength && password.length > this.passwordPolicy.maxLength) {
            errors.push(`Password must not exceed ${this.passwordPolicy.maxLength} characters`);
        }
        if (this.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (this.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (this.passwordPolicy.requireNumbers && !/\d/.test(password)) {
            errors.push('Password must contain at least one number');
        }
        if (this.passwordPolicy.requireSpecialChars) {
            const specialChars = this.passwordPolicy.specialChars || '!@#$%^&*()_+-=[]{}|;:,.<>?';
            const hasSpecialChar = specialChars.split('').some(char => password.includes(char));
            if (!hasSpecialChar) {
                errors.push('Password must contain at least one special character');
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    /**
     * Assess password strength
     */
    assessPasswordStrength(password) {
        let score = 0;
        if (password.length >= 12)
            score++;
        if (password.length >= 16)
            score++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password))
            score++;
        if (/\d/.test(password))
            score++;
        if (/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password))
            score++;
        if (password.length >= 20)
            score++;
        if (score <= 2)
            return 'weak';
        if (score <= 4)
            return 'medium';
        return 'strong';
    }
    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    /**
     * Set up 2FA for an account
     */
    async setup2FA(accountId, method, email, phone) {
        try {
            let secret;
            const backupCodes = [];
            // Generate backup codes
            for (let i = 0; i < 10; i++) {
                backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
            }
            switch (method) {
                case 'TOTP':
                    // Generate TOTP secret (base32 encoded)
                    secret = crypto.randomBytes(20).toString('base64');
                    logger_1.logger.info(`TOTP secret generated for ${accountId}`);
                    break;
                case 'SMS':
                    if (!phone) {
                        return {
                            success: false,
                            error: 'Phone number required for SMS 2FA',
                        };
                    }
                    logger_1.logger.info(`SMS 2FA configured for ${accountId}`);
                    break;
                case 'Email':
                    if (!email) {
                        return {
                            success: false,
                            error: 'Email required for Email 2FA',
                        };
                    }
                    logger_1.logger.info(`Email 2FA configured for ${accountId}`);
                    break;
            }
            return {
                success: true,
                secret,
                backupCodes,
            };
        }
        catch (error) {
            logger_1.logger.error('2FA setup failed', error, { accountId, method });
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Verify TOTP code
     */
    async verifyTOTP(accountId, code, traceId) {
        // In production, this would use the speakeasy library
        // For now, we'll simulate verification
        logger_1.logger.info(`Verifying TOTP for ${accountId}`, { traceId });
        // Simulate verification (in production, use speakeasy.totp.verify())
        const isValid = code.length === 6 && /^\d{6}$/.test(code);
        return isValid;
    }
    /**
     * Verify SMS code
     */
    async verifySMS(accountId, code, traceId) {
        // In production, this would verify against sent SMS code
        logger_1.logger.info(`Verifying SMS for ${accountId}`, { traceId });
        // Simulate verification
        const isValid = code.length === 6 && /^\d{6}$/.test(code);
        return isValid;
    }
    /**
     * Verify Email code
     */
    async verifyEmail(accountId, code, traceId) {
        // In production, this would verify against sent email code
        logger_1.logger.info(`Verifying Email code for ${accountId}`, { traceId });
        // Simulate verification
        const isValid = code.length === 6 && /^[A-Z0-9]{6}$/.test(code);
        return isValid;
    }
    /**
     * Check rate limiting for login attempts
     */
    async checkRateLimit(accountId) {
        const attempts = this.loginAttempts.get(accountId);
        if (!attempts) {
            return { allowed: true, remainingAttempts: this.maxLoginAttempts };
        }
        const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();
        if (timeSinceLastAttempt < this.rateLimitDelay) {
            return {
                allowed: false,
                remainingAttempts: Math.max(0, this.maxLoginAttempts - attempts.count),
            };
        }
        if (attempts.count >= this.maxLoginAttempts) {
            // Check if enough time has passed to reset (e.g., 1 hour)
            if (timeSinceLastAttempt > 3600000) {
                this.loginAttempts.delete(accountId);
                return { allowed: true, remainingAttempts: this.maxLoginAttempts };
            }
            return { allowed: false, remainingAttempts: 0 };
        }
        return {
            allowed: true,
            remainingAttempts: this.maxLoginAttempts - attempts.count,
        };
    }
    /**
     * Increment login attempt counter
     */
    incrementLoginAttempts(accountId) {
        const attempts = this.loginAttempts.get(accountId);
        if (attempts) {
            attempts.count++;
            attempts.lastAttempt = new Date();
        }
        else {
            this.loginAttempts.set(accountId, {
                count: 1,
                lastAttempt: new Date(),
            });
        }
    }
    /**
     * Get login attempt count
     */
    getLoginAttemptCount(accountId) {
        return this.loginAttempts.get(accountId)?.count || 0;
    }
}
exports.OCCAMAccountAgent = OCCAMAccountAgent;
/**
 * Default password policy
 */
OCCAMAccountAgent.DEFAULT_PASSWORD_POLICY = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    maxLength: 128,
    preventCommonPasswords: true,
};
/**
 * Default rotation policy
 */
OCCAMAccountAgent.DEFAULT_ROTATION_POLICY = {
    frequency: 90, // 90 days
    notifyBeforeDays: 7,
    enforceRotation: true,
    maxCredentialAge: 180, // 180 days max
};
/**
 * Common weak passwords to prevent
 */
OCCAMAccountAgent.COMMON_PASSWORDS = [
    'password', 'password123', '123456', '12345678', 'qwerty',
    'abc123', 'monkey', '1234567', 'letmein', 'trustno1',
    'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
    'ashley', 'bailey', 'passw0rd', 'shadow', '123123',
    'welcome', 'admin', 'root', 'toor'
];
//# sourceMappingURL=occam-account-agent.js.map