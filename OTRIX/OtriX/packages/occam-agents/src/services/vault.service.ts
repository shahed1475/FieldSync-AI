/**
 * VaultService - Secure credential storage and encryption
 * Handles encryption/decryption of sensitive payment credentials
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  SecureCredential,
  VaultConfig,
  CredentialOptions,
  EncryptionOptions,
  VaultOperationResult,
  EncryptedData,
  CredentialType
} from '../types';

export class VaultService {
  private config: VaultConfig;
  private vaultPath: string;
  private credentials: Map<string, SecureCredential>;

  constructor(config: VaultConfig, vaultPath: string = './storage/vault') {
    this.config = config;
    this.vaultPath = vaultPath;
    this.credentials = new Map();
  }

  /**
   * Initialize vault service and load existing credentials
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.vaultPath);
    await this.loadCredentials();
  }

  /**
   * Store a secure credential
   */
  async storeCredential(
    provider: string,
    credentialType: CredentialType,
    value: string,
    metadata?: Record<string, any>
  ): Promise<VaultOperationResult> {
    try {
      const encryptedValue = this.encrypt(value);

      const credential: SecureCredential = {
        id: uuidv4(),
        provider,
        credentialType,
        encryptedValue: JSON.stringify(encryptedValue),
        metadata,
        createdAt: new Date(),
      };

      this.credentials.set(this.getCredentialKey(provider, credentialType), credential);
      await this.persistCredentials();

      return {
        success: true,
        credentialId: credential.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to store credential: ${error.message}`,
      };
    }
  }

  /**
   * Retrieve a credential
   */
  async getCredential(options: CredentialOptions): Promise<string | null> {
    try {
      const key = this.getCredentialKey(options.provider, options.credentialType);
      const credential = this.credentials.get(key);

      if (!credential) {
        return null;
      }

      if (options.decrypt !== false) {
        const encryptedData: EncryptedData = JSON.parse(credential.encryptedValue);
        return this.decrypt(encryptedData);
      }

      return credential.encryptedValue;
    } catch (error) {
      throw new Error(`Failed to retrieve credential: ${error}`);
    }
  }

  /**
   * Delete a credential
   */
  async deleteCredential(provider: string, credentialType: CredentialType): Promise<VaultOperationResult> {
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
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to delete credential: ${error.message}`,
      };
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: string, options?: EncryptionOptions): EncryptedData {
    const algorithm = options?.algorithm || 'aes-256-gcm';
    const encoding = options?.encoding || 'hex';

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      algorithm,
      Buffer.from(this.config.encryptionKey, 'hex').slice(0, 32),
      iv
    );

    let encrypted = cipher.update(data, 'utf8', encoding);
    encrypted += cipher.final(encoding);

    const authTag = (cipher as any).getAuthTag?.();

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
  private decrypt(encryptedData: EncryptedData): string {
    const decipher = crypto.createDecipheriv(
      encryptedData.algorithm,
      Buffer.from(this.config.encryptionKey, 'hex').slice(0, 32),
      Buffer.from(encryptedData.iv, 'hex')
    );

    if (encryptedData.authTag) {
      (decipher as any).setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    }

    let decrypted = decipher.update(
      encryptedData.encryptedContent,
      encryptedData.encoding as any,
      'utf8'
    );
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate credential key for storage
   */
  private getCredentialKey(provider: string, credentialType: CredentialType): string {
    return `${provider}:${credentialType}`;
  }

  /**
   * Load credentials from disk
   */
  private async loadCredentials(): Promise<void> {
    try {
      const vaultFile = path.join(this.vaultPath, 'credentials.enc');

      if (await fs.pathExists(vaultFile)) {
        const encryptedContent = await fs.readFile(vaultFile, 'utf8');
        const decrypted = this.decrypt(JSON.parse(encryptedContent));
        const credentials = JSON.parse(decrypted);

        this.credentials.clear();
        for (const [key, value] of Object.entries(credentials)) {
          this.credentials.set(key, value as SecureCredential);
        }
      }
    } catch (error) {
      // Vault file doesn't exist or is corrupted, start fresh
      this.credentials.clear();
    }
  }

  /**
   * Persist credentials to disk
   */
  private async persistCredentials(): Promise<void> {
    const vaultFile = path.join(this.vaultPath, 'credentials.enc');
    const credentialsObj = Object.fromEntries(this.credentials);
    const serialized = JSON.stringify(credentialsObj);
    const encrypted = this.encrypt(serialized);

    await fs.writeFile(vaultFile, JSON.stringify(encrypted), 'utf8');
  }

  /**
   * Rotate encryption key (advanced feature)
   */
  async rotateEncryptionKey(newKey: string): Promise<VaultOperationResult> {
    try {
      // Re-encrypt all credentials with new key
      const reencryptedCredentials = new Map<string, SecureCredential>();

      for (const [key, credential] of this.credentials.entries()) {
        const encryptedData: EncryptedData = JSON.parse(credential.encryptedValue);
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
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to rotate encryption key: ${error.message}`,
      };
    }
  }
}
