/**
 * SecureVault
 * Manages credentials, API tokens, and scoped secrets
 * Uses AES-256 encryption for secure storage
 */
import { SecureCredential } from '../types';
export declare class SecureVault {
    private vault;
    private encryptedData;
    private algorithm;
    private encryptionKey;
    constructor(encryptionKey?: string);
    /**
     * Encrypts data using AES-256-GCM
     */
    private encrypt;
    /**
     * Decrypts data using AES-256-GCM
     */
    private decrypt;
    /**
     * Stores a credential securely
     */
    storeCredential(scope: string, type: SecureCredential['type'], value: string, expiresAt?: Date): Promise<string>;
    /**
     * Retrieves and decrypts a credential
     */
    getCredential(id: string): Promise<string | null>;
    /**
     * Retrieves credentials by scope
     */
    getCredentialsByScope(scope: string): Promise<SecureCredential[]>;
    /**
     * Deletes a credential
     */
    deleteCredential(id: string): Promise<boolean>;
    /**
     * Rotates a credential (creates new version with new encryption)
     */
    rotateCredential(id: string): Promise<string | null>;
    /**
     * Clears all credentials (for testing purposes only)
     */
    clearVault(): void;
    /**
     * Gets the total count of stored credentials
     */
    getCredentialCount(): number;
    /**
     * Gets the encryption key (for backup/export purposes)
     * SECURITY WARNING: Handle with extreme care in production
     */
    getEncryptionKey(): string;
}
//# sourceMappingURL=SecureVault.d.ts.map