/**
 * OCCAM Account Agent
 * Secure account creation, credential management, and 2FA handling
 */
import { AccountInfo, AccountCreationResult, TwoFactorMethod, TwoFactorVerificationResult, CredentialRotationResult, OCCAMAccountAgentOptions } from '../types';
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
export declare class OCCAMAccountAgent {
    private factBoxService;
    private auditService;
    private secureVault;
    private passwordPolicy;
    private rotationPolicy;
    private enable2FA;
    private default2FAMethod;
    private maxLoginAttempts;
    private rateLimitDelay;
    private loginAttempts;
    /**
     * Default password policy
     */
    private static readonly DEFAULT_PASSWORD_POLICY;
    /**
     * Default rotation policy
     */
    private static readonly DEFAULT_ROTATION_POLICY;
    /**
     * Common weak passwords to prevent
     */
    private static readonly COMMON_PASSWORDS;
    constructor(options?: OCCAMAccountAgentOptions);
    /**
     * Create a new account on a portal
     *
     * @param portalUrl - The URL of the portal to create account on
     * @param data - Account information including credentials
     * @param entityId - Optional entity ID for linking to FactBox data
     * @returns Account creation result with credential ID and 2FA details
     */
    createAccount(portalUrl: string, data: AccountInfo, entityId?: string): Promise<AccountCreationResult>;
    /**
     * Handle 2FA verification
     *
     * @param type - 2FA method type (TOTP, SMS, Email)
     * @param accountId - Account identifier
     * @param code - Verification code
     * @returns Verification result
     */
    handle2FA(type: TwoFactorMethod, accountId: string, code: string): Promise<TwoFactorVerificationResult>;
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
    storeCredentialsSecurely(portalUrl: string, username: string, password: string, encrypted?: boolean, entityId?: string): Promise<string>;
    /**
     * Rotate credentials for a portal account
     *
     * @param credentialId - Existing credential ID
     * @param newPassword - New password (optional, will be generated if not provided)
     * @param reason - Reason for rotation
     * @returns Rotation result
     */
    rotateCredentials(credentialId: string, newPassword?: string, reason?: string): Promise<CredentialRotationResult>;
    /**
     * Validate account data before creation
     */
    private validateAccountData;
    /**
     * Validate password against policy
     */
    private validatePassword;
    /**
     * Assess password strength
     */
    private assessPasswordStrength;
    /**
     * Validate email format
     */
    private isValidEmail;
    /**
     * Set up 2FA for an account
     */
    private setup2FA;
    /**
     * Verify TOTP code
     */
    private verifyTOTP;
    /**
     * Verify SMS code
     */
    private verifySMS;
    /**
     * Verify Email code
     */
    private verifyEmail;
    /**
     * Check rate limiting for login attempts
     */
    private checkRateLimit;
    /**
     * Increment login attempt counter
     */
    private incrementLoginAttempts;
    /**
     * Get login attempt count
     */
    private getLoginAttemptCount;
}
//# sourceMappingURL=occam-account-agent.d.ts.map