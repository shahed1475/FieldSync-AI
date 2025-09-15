const crypto = require('crypto');
const forge = require('node-forge');
const { logger } = require('./logger');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

class EncryptionService {
  constructor() {
    this.masterKey = this.getMasterKey();
    this.phiKey = this.getPHIKey();
  }

  /**
   * Get master encryption key from environment
   */
  getMasterKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
    return Buffer.from(key.padEnd(32, '0').substring(0, 32), 'utf8');
  }

  /**
   * Get PHI-specific encryption key
   */
  getPHIKey() {
    const key = process.env.PHI_ENCRYPTION_KEY;
    if (!key || key.length < 32) {
      throw new Error('PHI_ENCRYPTION_KEY must be at least 32 characters long');
    }
    return Buffer.from(key.padEnd(32, '0').substring(0, 32), 'utf8');
  }

  /**
   * Generate a random encryption key
   */
  generateKey() {
    return crypto.randomBytes(KEY_LENGTH);
  }

  /**
   * Derive key from password using PBKDF2
   */
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string} plaintext - Data to encrypt
   * @param {Buffer} key - Encryption key (optional, uses master key if not provided)
   * @returns {string} - Base64 encoded encrypted data with IV and tag
   */
  encrypt(plaintext, key = null) {
    try {
      if (!plaintext) {
        throw new Error('Plaintext cannot be empty');
      }

      const encryptionKey = key || this.masterKey;
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipher(ALGORITHM, encryptionKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine IV + tag + encrypted data
      const combined = Buffer.concat([
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]);
      
      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @param {Buffer} key - Decryption key (optional, uses master key if not provided)
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encryptedData, key = null) {
    try {
      if (!encryptedData) {
        throw new Error('Encrypted data cannot be empty');
      }

      const decryptionKey = key || this.masterKey;
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract IV, tag, and encrypted data
      const iv = combined.slice(0, IV_LENGTH);
      const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);
      
      const decipher = crypto.createDecipher(ALGORITHM, decryptionKey, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt PHI data with additional security measures
   * @param {string} plaintext - PHI data to encrypt
   * @returns {string} - Encrypted PHI data
   */
  encryptPHI(plaintext) {
    try {
      if (!plaintext) {
        return null;
      }

      // Add timestamp and random padding for additional security
      const timestamp = Date.now().toString();
      const padding = crypto.randomBytes(8).toString('hex');
      const paddedData = `${timestamp}:${padding}:${plaintext}`;
      
      return this.encrypt(paddedData, this.phiKey);
    } catch (error) {
      logger.error('PHI encryption failed', { error: error.message });
      throw new Error('PHI encryption failed');
    }
  }

  /**
   * Decrypt PHI data
   * @param {string} encryptedData - Encrypted PHI data
   * @returns {string} - Decrypted PHI data
   */
  decryptPHI(encryptedData) {
    try {
      if (!encryptedData) {
        return null;
      }

      const decryptedData = this.decrypt(encryptedData, this.phiKey);
      
      // Remove timestamp and padding
      const parts = decryptedData.split(':');
      if (parts.length >= 3) {
        return parts.slice(2).join(':'); // Rejoin in case original data had colons
      }
      
      return decryptedData;
    } catch (error) {
      logger.error('PHI decryption failed', { error: error.message });
      throw new Error('PHI decryption failed');
    }
  }

  /**
   * Generate hash for duplicate detection without decryption
   * @param {string} data - Data to hash
   * @returns {string} - SHA-256 hash
   */
  generateHash(data) {
    if (!data) {
      return null;
    }
    return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
  }

  /**
   * Generate secure hash for passwords
   * @param {string} password - Password to hash
   * @returns {string} - Bcrypt-style hash
   */
  hashPassword(password) {
    const bcrypt = require('bcryptjs');
    const saltRounds = 12;
    return bcrypt.hashSync(password, saltRounds);
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain password
   * @param {string} hash - Hashed password
   * @returns {boolean} - Verification result
   */
  verifyPassword(password, hash) {
    const bcrypt = require('bcryptjs');
    return bcrypt.compareSync(password, hash);
  }

  /**
   * Encrypt file data for secure storage
   * @param {Buffer} fileBuffer - File data buffer
   * @param {string} filename - Original filename
   * @returns {Object} - Encrypted file data and metadata
   */
  encryptFile(fileBuffer, filename) {
    try {
      const fileKey = this.generateKey();
      const encryptedData = this.encrypt(fileBuffer.toString('base64'), fileKey);
      const encryptedKey = this.encrypt(fileKey.toString('base64'));
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      return {
        encryptedData,
        encryptedKey,
        fileHash,
        originalSize: fileBuffer.length,
        encryptedSize: Buffer.from(encryptedData, 'base64').length
      };
    } catch (error) {
      logger.error('File encryption failed', { filename, error: error.message });
      throw new Error('File encryption failed');
    }
  }

  /**
   * Decrypt file data
   * @param {string} encryptedData - Encrypted file data
   * @param {string} encryptedKey - Encrypted file key
   * @returns {Buffer} - Decrypted file buffer
   */
  decryptFile(encryptedData, encryptedKey) {
    try {
      const fileKey = Buffer.from(this.decrypt(encryptedKey), 'base64');
      const decryptedData = this.decrypt(encryptedData, fileKey);
      return Buffer.from(decryptedData, 'base64');
    } catch (error) {
      logger.error('File decryption failed', { error: error.message });
      throw new Error('File decryption failed');
    }
  }

  /**
   * Generate secure random token
   * @param {number} length - Token length in bytes
   * @returns {string} - Hex encoded token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate UUID v4
   * @returns {string} - UUID v4
   */
  generateUUID() {
    const { v4: uuidv4 } = require('uuid');
    return uuidv4();
  }

  /**
   * Validate encryption key strength
   * @param {string} key - Key to validate
   * @returns {Object} - Validation result
   */
  validateKeyStrength(key) {
    const result = {
      isValid: false,
      score: 0,
      issues: []
    };

    if (!key) {
      result.issues.push('Key is required');
      return result;
    }

    if (key.length < 32) {
      result.issues.push('Key must be at least 32 characters long');
    } else {
      result.score += 25;
    }

    if (!/[A-Z]/.test(key)) {
      result.issues.push('Key should contain uppercase letters');
    } else {
      result.score += 25;
    }

    if (!/[0-9]/.test(key)) {
      result.issues.push('Key should contain numbers');
    } else {
      result.score += 25;
    }

    if (!/[^A-Za-z0-9]/.test(key)) {
      result.issues.push('Key should contain special characters');
    } else {
      result.score += 25;
    }

    result.isValid = result.score >= 75 && result.issues.length === 0;
    return result;
  }
}

// Export singleton instance
const encryptionService = new EncryptionService();

module.exports = {
  encryptionService,
  EncryptionService
};