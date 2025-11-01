"use strict";
/**
 * VaultService - Secure credential storage and encryption
 * Handles encryption/decryption of sensitive payment credentials
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
class VaultService {
    constructor(config, vaultPath = './storage/vault') {
        this.config = config;
        this.vaultPath = vaultPath;
        this.credentials = new Map();
    }
    /**
     * Initialize vault service and load existing credentials
     */
    async initialize() {
        await fs_extra_1.default.ensureDir(this.vaultPath);
        await this.loadCredentials();
    }
    /**
     * Store a secure credential
     */
    async storeCredential(provider, credentialType, value, metadata) {
        try {
            const encryptedValue = this.encrypt(value);
            const credential = {
                id: (0, uuid_1.v4)(),
                provider,
                credentialType,
                encryptedValue: JSON.stringify(encryptedValue),
                issuer: provider,
                scope: 'payment',
                lastRotated: new Date(),
                metadata,
                createdAt: new Date(),
            };
            this.credentials.set(this.getCredentialKey(provider, credentialType), credential);
            await this.persistCredentials();
            return {
                success: true,
                credentialId: credential.id,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to store credential: ${error.message}`,
            };
        }
    }
    /**
     * Retrieve a credential
     */
    async getCredential(options) {
        try {
            const key = this.getCredentialKey(options.provider, options.credentialType);
            const credential = this.credentials.get(key);
            if (!credential) {
                return null;
            }
            if (options.decrypt !== false) {
                const encryptedData = JSON.parse(credential.encryptedValue);
                return this.decrypt(encryptedData);
            }
            return credential.encryptedValue;
        }
        catch (error) {
            throw new Error(`Failed to retrieve credential: ${error}`);
        }
    }
    /**
     * Delete a credential
     */
    async deleteCredential(provider, credentialType) {
        try {
            const key = this.getCredentialKey(provider, credentialType);
            if (!this.credentials.has(key)) {
                return {
                    success: false,
                    error: 'Credential not found',
                };
            }
            this.credentials.delete(key);
            await this.persistCredentials();
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to delete credential: ${error.message}`,
            };
        }
    }
    /**
     * Encrypt data using AES-256-GCM
     */
    encrypt(data, options) {
        const algorithm = options?.algorithm || 'aes-256-gcm';
        const encoding = options?.encoding || 'hex';
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv(algorithm, Buffer.from(this.config.encryptionKey, 'hex').slice(0, 32), iv);
        let encrypted = cipher.update(data, 'utf8', encoding);
        encrypted += cipher.final(encoding);
        const authTag = cipher.getAuthTag?.();
        return {
            iv: iv.toString('hex'),
            authTag: authTag ? authTag.toString('hex') : undefined,
            encryptedContent: encrypted,
            algorithm,
            encoding,
        };
    }
    /**
     * Decrypt data
     */
    decrypt(encryptedData) {
        const decipher = crypto_1.default.createDecipheriv(encryptedData.algorithm, Buffer.from(this.config.encryptionKey, 'hex').slice(0, 32), Buffer.from(encryptedData.iv, 'hex'));
        if (encryptedData.authTag) {
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        }
        let decrypted = decipher.update(encryptedData.encryptedContent, encryptedData.encoding, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    /**
     * Generate credential key for storage
     */
    getCredentialKey(provider, credentialType) {
        return `${provider}:${credentialType}`;
    }
    /**
     * Load credentials from disk
     */
    async loadCredentials() {
        try {
            const vaultFile = path_1.default.join(this.vaultPath, 'credentials.enc');
            if (await fs_extra_1.default.pathExists(vaultFile)) {
                const encryptedContent = await fs_extra_1.default.readFile(vaultFile, 'utf8');
                const decrypted = this.decrypt(JSON.parse(encryptedContent));
                const credentials = JSON.parse(decrypted);
                this.credentials.clear();
                for (const [key, value] of Object.entries(credentials)) {
                    this.credentials.set(key, value);
                }
            }
        }
        catch (error) {
            // Vault file doesn't exist or is corrupted, start fresh
            this.credentials.clear();
        }
    }
    /**
     * Persist credentials to disk
     */
    async persistCredentials() {
        const vaultFile = path_1.default.join(this.vaultPath, 'credentials.enc');
        const credentialsObj = Object.fromEntries(this.credentials);
        const serialized = JSON.stringify(credentialsObj);
        const encrypted = this.encrypt(serialized);
        await fs_extra_1.default.writeFile(vaultFile, JSON.stringify(encrypted), 'utf8');
    }
    /**
     * Rotate encryption key (advanced feature)
     */
    async rotateEncryptionKey(newKey) {
        try {
            // Re-encrypt all credentials with new key
            const reencryptedCredentials = new Map();
            for (const [key, credential] of this.credentials.entries()) {
                const encryptedData = JSON.parse(credential.encryptedValue);
                const decrypted = this.decrypt(encryptedData);
                // Update config temporarily for re-encryption
                this.config.encryptionKey = newKey;
                const newEncrypted = this.encrypt(decrypted);
                reencryptedCredentials.set(key, {
                    ...credential,
                    encryptedValue: JSON.stringify(newEncrypted),
                    rotatedAt: new Date(),
                });
            }
            this.credentials = reencryptedCredentials;
            await this.persistCredentials();
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to rotate encryption key: ${error.message}`,
            };
        }
    }
}
exports.VaultService = VaultService;
//# sourceMappingURL=vault.service.js.map