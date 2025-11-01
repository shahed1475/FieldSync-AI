"use strict";
/**
 * SecureVault Service
 * Secure storage for API keys, tokens, and sensitive credentials using AES-256 encryption
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
exports.SecureVault = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const logger_1 = require("../utils/logger");
/**
 * SecureVault - Encrypted Credential Storage
 */
class SecureVault {
    constructor(config, logger) {
        this.algorithm = 'aes-256-gcm';
        this.ivLength = 16;
        this.tagLength = 16;
        this.logger = logger || new logger_1.Logger();
        this.storagePath = config?.storagePath || path.join(process.cwd(), 'storage', 'vault');
        this.vaultPath = path.join(this.storagePath, 'credentials.enc');
        // Use provided key or environment variable or generate one
        const keyString = config?.encryptionKey || process.env.VAULT_ENCRYPTION_KEY || this.generateKey();
        this.encryptionKey = Buffer.from(keyString, 'base64');
        if (this.encryptionKey.length !== 32) {
            throw new Error('Encryption key must be 32 bytes (256 bits)');
        }
    }
    /**
     * Generate a new encryption key
     */
    generateKey() {
        const key = crypto.randomBytes(32);
        return key.toString('base64');
    }
    /**
     * Initialize vault storage
     */
    async initialize() {
        try {
            await fs.mkdir(this.storagePath, { recursive: true });
            // Initialize empty vault if it doesn't exist
            try {
                await fs.access(this.vaultPath);
            }
            catch {
                const emptyVault = {};
                await this.saveVault(emptyVault);
            }
            this.logger.info('SecureVault initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize SecureVault', error);
            throw error;
        }
    }
    /**
     * Store a credential
     */
    async storeCredential(key, value, metadata) {
        try {
            const vault = await this.loadVault();
            const credential = {
                key,
                value,
                createdAt: vault[key]?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata,
            };
            vault[key] = credential;
            await this.saveVault(vault);
            this.logger.info(`Stored credential: ${key}`);
        }
        catch (error) {
            this.logger.error(`Failed to store credential: ${key}`, error);
            throw error;
        }
    }
    /**
     * Retrieve a credential
     */
    async getCredential(key) {
        try {
            const vault = await this.loadVault();
            const credential = vault[key];
            if (!credential) {
                this.logger.warn(`Credential not found: ${key}`);
                return null;
            }
            this.logger.debug(`Retrieved credential: ${key}`);
            return credential.value;
        }
        catch (error) {
            this.logger.error(`Failed to get credential: ${key}`, error);
            throw error;
        }
    }
    /**
     * Delete a credential
     */
    async deleteCredential(key) {
        try {
            const vault = await this.loadVault();
            if (!vault[key]) {
                this.logger.warn(`Credential not found for deletion: ${key}`);
                return false;
            }
            delete vault[key];
            await this.saveVault(vault);
            this.logger.info(`Deleted credential: ${key}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to delete credential: ${key}`, error);
            throw error;
        }
    }
    /**
     * List all credential keys
     */
    async listCredentials() {
        try {
            const vault = await this.loadVault();
            const keys = Object.keys(vault);
            this.logger.debug(`Listed ${keys.length} credentials`);
            return keys;
        }
        catch (error) {
            this.logger.error('Failed to list credentials', error);
            throw error;
        }
    }
    /**
     * Check if a credential exists
     */
    async hasCredential(key) {
        try {
            const vault = await this.loadVault();
            return key in vault;
        }
        catch (error) {
            this.logger.error(`Failed to check credential: ${key}`, error);
            throw error;
        }
    }
    /**
     * Get credential metadata
     */
    async getCredentialMetadata(key) {
        try {
            const vault = await this.loadVault();
            const credential = vault[key];
            if (!credential) {
                return null;
            }
            const { value, ...metadata } = credential;
            return metadata;
        }
        catch (error) {
            this.logger.error(`Failed to get credential metadata: ${key}`, error);
            throw error;
        }
    }
    /**
     * Encrypt data
     */
    encrypt(plaintext) {
        try {
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            // Combine IV, encrypted data, and auth tag
            const combined = Buffer.concat([
                iv,
                Buffer.from(encrypted, 'hex'),
                authTag,
            ]);
            return combined.toString('base64');
        }
        catch (error) {
            this.logger.error('Encryption failed', error);
            throw new Error('Failed to encrypt data');
        }
    }
    /**
     * Decrypt data
     */
    decrypt(ciphertext) {
        try {
            const combined = Buffer.from(ciphertext, 'base64');
            // Extract IV, encrypted data, and auth tag
            const iv = combined.subarray(0, this.ivLength);
            const authTag = combined.subarray(combined.length - this.tagLength);
            const encrypted = combined.subarray(this.ivLength, combined.length - this.tagLength);
            const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            this.logger.error('Decryption failed', error);
            throw new Error('Failed to decrypt data');
        }
    }
    /**
     * Load vault from storage
     */
    async loadVault() {
        try {
            const encryptedData = await fs.readFile(this.vaultPath, 'utf-8');
            if (!encryptedData) {
                return {};
            }
            const decryptedData = this.decrypt(encryptedData);
            return JSON.parse(decryptedData);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return {};
            }
            this.logger.error('Failed to load vault', error);
            throw error;
        }
    }
    /**
     * Save vault to storage
     */
    async saveVault(vault) {
        try {
            const plaintextData = JSON.stringify(vault, null, 2);
            const encryptedData = this.encrypt(plaintextData);
            await fs.writeFile(this.vaultPath, encryptedData, 'utf-8');
        }
        catch (error) {
            this.logger.error('Failed to save vault', error);
            throw error;
        }
    }
    /**
     * Rotate encryption key
     */
    async rotateKey(newKey) {
        try {
            // Load vault with old key
            const vault = await this.loadVault();
            // Update encryption key
            this.encryptionKey = Buffer.from(newKey, 'base64');
            if (this.encryptionKey.length !== 32) {
                throw new Error('New encryption key must be 32 bytes (256 bits)');
            }
            // Save vault with new key
            await this.saveVault(vault);
            this.logger.info('Encryption key rotated successfully');
        }
        catch (error) {
            this.logger.error('Failed to rotate encryption key', error);
            throw error;
        }
    }
}
exports.SecureVault = SecureVault;
exports.default = SecureVault;
//# sourceMappingURL=securevault.service.js.map