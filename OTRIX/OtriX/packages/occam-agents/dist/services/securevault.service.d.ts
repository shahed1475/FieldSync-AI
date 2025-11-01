/**
 * SecureVault Service
 * Secure storage for API keys, tokens, and sensitive credentials using AES-256 encryption
 */
import { Logger } from '../utils/logger';
export interface SecureCredential {
    key: string;
    value: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, any>;
}
export interface VaultConfig {
    encryptionKey?: string;
    storagePath?: string;
}
/**
 * SecureVault - Encrypted Credential Storage
 */
export declare class SecureVault {
    private logger;
    private storagePath;
    private vaultPath;
    private encryptionKey;
    private algorithm;
    private ivLength;
    private tagLength;
    constructor(config?: VaultConfig, logger?: Logger);
    /**
     * Generate a new encryption key
     */
    private generateKey;
    /**
     * Initialize vault storage
     */
    initialize(): Promise<void>;
    /**
     * Store a credential
     */
    storeCredential(key: string, value: string, metadata?: Record<string, any>): Promise<void>;
    /**
     * Retrieve a credential
     */
    getCredential(key: string): Promise<string | null>;
    /**
     * Delete a credential
     */
    deleteCredential(key: string): Promise<boolean>;
    /**
     * List all credential keys
     */
    listCredentials(): Promise<string[]>;
    /**
     * Check if a credential exists
     */
    hasCredential(key: string): Promise<boolean>;
    /**
     * Get credential metadata
     */
    getCredentialMetadata(key: string): Promise<Omit<SecureCredential, 'value'> | null>;
    /**
     * Encrypt data
     */
    private encrypt;
    /**
     * Decrypt data
     */
    private decrypt;
    /**
     * Load vault from storage
     */
    private loadVault;
    /**
     * Save vault to storage
     */
    private saveVault;
    /**
     * Rotate encryption key
     */
    rotateKey(newKey: string): Promise<void>;
}
export default SecureVault;
//# sourceMappingURL=securevault.service.d.ts.map