/**
 * Vault Type Definitions for OCCAM Payment Agent
 * Defines secure storage and encryption interfaces
 */
export type CredentialType = 'api_key' | 'secret_key' | 'webhook_secret' | 'encryption_key' | 'access_token';
/**
 * Secure credential storage
 */
export interface SecureCredential {
    id: string;
    provider: string;
    credentialType: CredentialType;
    encryptedValue: string;
    issuer: string;
    scope: string;
    lastRotated: Date;
    metadata?: Record<string, any>;
    createdAt: Date;
    expiresAt?: Date;
    rotatedAt?: Date;
    type?: CredentialType;
}
/**
 * Vault configuration
 */
export interface VaultConfig {
    encryptionKey: string;
    vaultSecret: string;
    rotationPeriodDays?: number;
    enableAutoRotation?: boolean;
}
/**
 * Credential retrieval options
 */
export interface CredentialOptions {
    provider: string;
    credentialType: CredentialType;
    decrypt?: boolean;
}
/**
 * Encryption options
 */
export interface EncryptionOptions {
    algorithm?: 'aes-256-gcm' | 'aes-256-cbc';
    encoding?: 'hex' | 'base64';
}
/**
 * Vault operation result
 */
export interface VaultOperationResult {
    success: boolean;
    credentialId?: string;
    error?: string;
}
/**
 * Encrypted data structure
 */
export interface EncryptedData {
    iv: string;
    authTag?: string;
    encryptedContent: string;
    algorithm: string;
    encoding: string;
}
//# sourceMappingURL=vault.types.d.ts.map