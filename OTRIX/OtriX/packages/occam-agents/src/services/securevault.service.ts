/**
 * SecureVault Service
 * Secure storage for API keys, tokens, and sensitive credentials using AES-256 encryption
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
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
export class SecureVault {
  private logger: Logger;
  private storagePath: string;
  private vaultPath: string;
  private encryptionKey: Buffer;
  private algorithm = 'aes-256-gcm';
  private ivLength = 16;
  private tagLength = 16;

  constructor(config?: VaultConfig, logger?: Logger) {
    this.logger = logger || new Logger();
    this.storagePath = config?.storagePath || path.join(process.cwd(), 'storage', 'vault');
    this.vaultPath = path.join(this.storagePath, 'credentials.enc');

    // Use provided key or environment variable or generate one
    const keyString =
      config?.encryptionKey || process.env.VAULT_ENCRYPTION_KEY || this.generateKey();
    this.encryptionKey = Buffer.from(keyString, 'base64');

    if (this.encryptionKey.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (256 bits)');
    }
  }

  /**
   * Generate a new encryption key
   */
  private generateKey(): string {
    const key = crypto.randomBytes(32);
    return key.toString('base64');
  }

  /**
   * Initialize vault storage
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });

      // Initialize empty vault if it doesn't exist
      try {
        await fs.access(this.vaultPath);
      } catch {
        const emptyVault: Record<string, SecureCredential> = {};
        await this.saveVault(emptyVault);
      }

      this.logger.info('SecureVault initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SecureVault', error as Error);
      throw error;
    }
  }

  /**
   * Store a credential
   */
  async storeCredential(key: string, value: string, metadata?: Record<string, any>): Promise<void> {
    try {
      const vault = await this.loadVault();

      const credential: SecureCredential = {
        key,
        value,
        createdAt: vault[key]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata,
      };

      vault[key] = credential;
      await this.saveVault(vault);

      this.logger.info(`Stored credential: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to store credential: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Retrieve a credential
   */
  async getCredential(key: string): Promise<string | null> {
    try {
      const vault = await this.loadVault();
      const credential = vault[key];

      if (!credential) {
        this.logger.warn(`Credential not found: ${key}`);
        return null;
      }

      this.logger.debug(`Retrieved credential: ${key}`);
      return credential.value;
    } catch (error) {
      this.logger.error(`Failed to get credential: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Delete a credential
   */
  async deleteCredential(key: string): Promise<boolean> {
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
    } catch (error) {
      this.logger.error(`Failed to delete credential: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * List all credential keys
   */
  async listCredentials(): Promise<string[]> {
    try {
      const vault = await this.loadVault();
      const keys = Object.keys(vault);

      this.logger.debug(`Listed ${keys.length} credentials`);
      return keys;
    } catch (error) {
      this.logger.error('Failed to list credentials', error as Error);
      throw error;
    }
  }

  /**
   * Check if a credential exists
   */
  async hasCredential(key: string): Promise<boolean> {
    try {
      const vault = await this.loadVault();
      return key in vault;
    } catch (error) {
      this.logger.error(`Failed to check credential: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Get credential metadata
   */
  async getCredentialMetadata(key: string): Promise<Omit<SecureCredential, 'value'> | null> {
    try {
      const vault = await this.loadVault();
      const credential = vault[key];

      if (!credential) {
        return null;
      }

      const { value, ...metadata } = credential;
      return metadata;
    } catch (error) {
      this.logger.error(`Failed to get credential metadata: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Encrypt data
   */
  private encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv) as crypto.CipherGCM;

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
    } catch (error) {
      this.logger.error('Encryption failed', error as Error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data
   */
  private decrypt(ciphertext: string): string {
    try {
      const combined = Buffer.from(ciphertext, 'base64');

      // Extract IV, encrypted data, and auth tag
      const iv = combined.subarray(0, this.ivLength);
      const authTag = combined.subarray(combined.length - this.tagLength);
      const encrypted = combined.subarray(this.ivLength, combined.length - this.tagLength);

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', error as Error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Load vault from storage
   */
  private async loadVault(): Promise<Record<string, SecureCredential>> {
    try {
      const encryptedData = await fs.readFile(this.vaultPath, 'utf-8');

      if (!encryptedData) {
        return {};
      }

      const decryptedData = this.decrypt(encryptedData);
      return JSON.parse(decryptedData);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      this.logger.error('Failed to load vault', error as Error);
      throw error;
    }
  }

  /**
   * Save vault to storage
   */
  private async saveVault(vault: Record<string, SecureCredential>): Promise<void> {
    try {
      const plaintextData = JSON.stringify(vault, null, 2);
      const encryptedData = this.encrypt(plaintextData);

      await fs.writeFile(this.vaultPath, encryptedData, 'utf-8');
    } catch (error) {
      this.logger.error('Failed to save vault', error as Error);
      throw error;
    }
  }

  /**
   * Rotate encryption key
   */
  async rotateKey(newKey: string): Promise<void> {
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
    } catch (error) {
      this.logger.error('Failed to rotate encryption key', error as Error);
      throw error;
    }
  }
}

export default SecureVault;
