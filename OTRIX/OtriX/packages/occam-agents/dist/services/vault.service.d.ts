/**
 * VaultService - Secure credential storage and encryption
 * Handles encryption/decryption of sensitive payment credentials
 */
import { VaultConfig, CredentialOptions, VaultOperationResult, CredentialType } from '../types';
export declare class VaultService {
    private config;
    private vaultPath;
    private credentials;
    constructor(config: VaultConfig, vaultPath?: string);
    /**
     * Initialize vault service and load existing credentials
     */
    initialize(): Promise<void>;
    /**
     * Store a secure credential
     */
    storeCredential(provider: string, credentialType: CredentialType, value: string, metadata?: Record<string, any>): Promise<VaultOperationResult>;
    /**
     * Retrieve a credential
     */
    getCredential(options: CredentialOptions): Promise<string | null>;
    /**
     * Delete a credential
     */
    deleteCredential(provider: string, credentialType: CredentialType): Promise<VaultOperationResult>;
    /**
     * Encrypt data using AES-256-GCM
     */
    private encrypt;
    /**
     * Decrypt data
     */
    private decrypt;
    /**
     * Generate credential key for storage
     */
    private getCredentialKey;
    /**
     * Load credentials from disk
     */
    private loadCredentials;
    /**
     * Persist credentials to disk
     */
    private persistCredentials;
    /**
     * Rotate encryption key (advanced feature)
     */
    rotateEncryptionKey(newKey: string): Promise<VaultOperationResult>;
}
//# sourceMappingURL=vault.service.d.ts.map