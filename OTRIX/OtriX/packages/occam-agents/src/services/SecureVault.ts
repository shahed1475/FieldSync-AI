/**
 * SecureVault
 * Manages credentials, API tokens, and scoped secrets
 * Uses AES-256 encryption for secure storage
 */

import { SecureCredential } from '../types';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export class SecureVault {
  private vault: Map<string, SecureCredential>;
  private encryptedData: Map<string, string>;
  private algorithm: string = 'aes-256-gcm';
  private encryptionKey: Buffer;

  constructor(encryptionKey?: string) {
    this.vault = new Map();
    this.encryptedData = new Map();

    // In production, this key should come from environment variables
    // and should be managed by a secure key management system
    this.encryptionKey = encryptionKey
      ? Buffer.from(encryptionKey, 'hex')
      : randomBytes(32);
  }

  /**
   * Encrypts data using AES-256-GCM
   */
  private encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  /**
   * Decrypts data using AES-256-GCM
   */
  private decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Stores a credential securely
   */
  async storeCredential(
    scope: string,
    type: SecureCredential['type'],
    value: string,
    expiresAt?: Date
  ): Promise<string> {
    const id = uuidv4();
    const { encrypted, iv, tag } = this.encrypt(value);

    const credential: SecureCredential = {
      id,
      scope,
      type,
      encrypted: true,
      metadata: {
        created_at: new Date(),
        expires_at: expiresAt,
      },
    };

    this.vault.set(id, credential);
    this.encryptedData.set(id, JSON.stringify({ encrypted, iv, tag }));

    return id;
  }

  /**
   * Retrieves and decrypts a credential
   */
  async getCredential(id: string): Promise<string | null> {
    const credential = this.vault.get(id);

    if (!credential) {
      return null;
    }

    // Check if credential has expired
    if (credential.metadata.expires_at && credential.metadata.expires_at < new Date()) {
      return null;
    }

    const encryptedData = this.encryptedData.get(id);

    if (!encryptedData) {
      return null;
    }

    const { encrypted, iv, tag } = JSON.parse(encryptedData);

    try {
      const decrypted = this.decrypt(encrypted, iv, tag);

      // Update last used timestamp
      credential.metadata.last_used = new Date();
      this.vault.set(id, credential);

      return decrypted;
    } catch (error) {
      return null;
    }
  }

  /**
   * Retrieves credentials by scope
   */
  async getCredentialsByScope(scope: string): Promise<SecureCredential[]> {
    const credentials: SecureCredential[] = [];

    for (const [, credential] of this.vault) {
      if (credential.scope === scope) {
        credentials.push(credential);
      }
    }

    return credentials;
  }

  /**
   * Deletes a credential
   */
  async deleteCredential(id: string): Promise<boolean> {
    const hasCredential = this.vault.has(id);

    if (hasCredential) {
      this.vault.delete(id);
      this.encryptedData.delete(id);
    }

    return hasCredential;
  }

  /**
   * Rotates a credential (creates new version with new encryption)
   */
  async rotateCredential(id: string): Promise<string | null> {
    const value = await this.getCredential(id);

    if (!value) {
      return null;
    }

    const oldCredential = this.vault.get(id);

    if (!oldCredential) {
      return null;
    }

    // Delete old credential
    await this.deleteCredential(id);

    // Create new credential with same properties
    const newId = await this.storeCredential(
      oldCredential.scope,
      oldCredential.type,
      value,
      oldCredential.metadata.expires_at
    );

    return newId;
  }

  /**
   * Clears all credentials (for testing purposes only)
   */
  clearVault(): void {
    this.vault.clear();
    this.encryptedData.clear();
  }

  /**
   * Gets the total count of stored credentials
   */
  getCredentialCount(): number {
    return this.vault.size;
  }

  /**
   * Gets the encryption key (for backup/export purposes)
   * SECURITY WARNING: Handle with extreme care in production
   */
  getEncryptionKey(): string {
    return this.encryptionKey.toString('hex');
  }
}
