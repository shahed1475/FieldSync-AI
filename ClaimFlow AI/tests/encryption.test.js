const { EncryptionService } = require('../src/utils/encryption');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

describe('Encryption System', () => {
  let encryptionService;
  let testCorrelationId;
  
  beforeEach(() => {
    encryptionService = new EncryptionService();
    testCorrelationId = global.testUtils.generateCorrelationId();
  });
  
  describe('General Encryption/Decryption', () => {
    test('should encrypt and decrypt text data correctly', () => {
      const plaintext = 'This is sensitive data that needs encryption';
      
      const encrypted = encryptionService.encrypt(plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
      
      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
    
    test('should handle empty strings', () => {
      const plaintext = '';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });
    
    test('should handle special characters and unicode', () => {
      const plaintext = 'Special chars: !@#$%^&*()_+ Unicode: 你好 🚀 émojis';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });
    
    test('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'Same data encrypted twice';
      
      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2); // Different due to random IV
      expect(encryptionService.decrypt(encrypted1)).toBe(plaintext);
      expect(encryptionService.decrypt(encrypted2)).toBe(plaintext);
    });
    
    test('should throw error for invalid encrypted data', () => {
      expect(() => {
        encryptionService.decrypt('invalid-encrypted-data');
      }).toThrow();
      
      expect(() => {
        encryptionService.decrypt('');
      }).toThrow();
      
      expect(() => {
        encryptionService.decrypt('short');
      }).toThrow();
    });
  });
  
  describe('PHI-Specific Encryption', () => {
    test('should encrypt and decrypt PHI data correctly', () => {
      const phiData = {
        firstName: 'John',
        lastName: 'Doe',
        ssn: '123-45-6789',
        dateOfBirth: '1985-06-15',
        address: '123 Main St, Anytown, ST 12345',
        phone: '555-123-4567',
        email: 'john.doe@email.com'
      };
      
      const encrypted = encryptionService.encryptPHI(phiData);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain('John');
      expect(encrypted).not.toContain('123-45-6789');
      
      const decrypted = encryptionService.decryptPHI(encrypted);
      expect(decrypted).toEqual(phiData);
    });
    
    test('should handle nested PHI objects', () => {
      const complexPHI = {
        patient: {
          demographics: {
            firstName: 'Jane',
            lastName: 'Smith',
            ssn: '987-65-4321'
          },
          insurance: {
            memberId: 'INS123456',
            groupNumber: 'GRP789'
          }
        },
        medicalHistory: [
          { condition: 'Diabetes', diagnosisDate: '2020-01-15' },
          { condition: 'Hypertension', diagnosisDate: '2019-08-22' }
        ]
      };
      
      const encrypted = encryptionService.encryptPHI(complexPHI);
      const decrypted = encryptionService.decryptPHI(encrypted);
      
      expect(decrypted).toEqual(complexPHI);
    });
    
    test('should throw error for invalid PHI encrypted data', () => {
      expect(() => {
        encryptionService.decryptPHI('invalid-phi-data');
      }).toThrow();
    });
  });
  
  describe('Password Security', () => {
    test('should hash passwords securely', async () => {
      const password = 'SecurePassword123!';
      
      const hash = await encryptionService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 chars
      expect(hash.startsWith('$2b$')).toBe(true); // bcrypt format
    });
    
    test('should verify passwords correctly', async () => {
      const password = 'TestPassword456!';
      const hash = await encryptionService.hashPassword(password);
      
      const isValid = await encryptionService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await encryptionService.verifyPassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });
    
    test('should produce different hashes for same password', async () => {
      const password = 'SamePassword789!';
      
      const hash1 = await encryptionService.hashPassword(password);
      const hash2 = await encryptionService.hashPassword(password);
      
      expect(hash1).not.toBe(hash2); // Different due to random salt
      
      // Both should verify correctly
      expect(await encryptionService.verifyPassword(password, hash1)).toBe(true);
      expect(await encryptionService.verifyPassword(password, hash2)).toBe(true);
    });
  });
  
  describe('File Encryption', () => {
    const testDir = path.join(__dirname, 'temp');
    const testFile = path.join(testDir, 'test-file.txt');
    const encryptedFile = path.join(testDir, 'test-file.txt.enc');
    
    beforeEach(async () => {
      // Create test directory
      try {
        await fs.mkdir(testDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    });
    
    afterEach(async () => {
      // Clean up test files
      try {
        await fs.unlink(testFile);
      } catch (error) {
        // File might not exist
      }
      
      try {
        await fs.unlink(encryptedFile);
      } catch (error) {
        // File might not exist
      }
      
      try {
        await fs.rmdir(testDir);
      } catch (error) {
        // Directory might not be empty or not exist
      }
    });
    
    test('should encrypt and decrypt files correctly', async () => {
      const fileContent = 'This is sensitive file content\nWith multiple lines\nAnd special characters: !@#$%';
      
      // Create test file
      await fs.writeFile(testFile, fileContent, 'utf8');
      
      // Encrypt file
      await encryptionService.encryptFile(testFile, encryptedFile);
      
      // Verify encrypted file exists and is different
      const encryptedContent = await fs.readFile(encryptedFile);
      expect(encryptedContent).toBeDefined();
      expect(encryptedContent.toString()).not.toContain('sensitive file content');
      
      // Decrypt file
      const decryptedFile = path.join(testDir, 'decrypted-file.txt');
      await encryptionService.decryptFile(encryptedFile, decryptedFile);
      
      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedFile, 'utf8');
      expect(decryptedContent).toBe(fileContent);
      
      // Clean up
      await fs.unlink(decryptedFile);
    });
    
    test('should handle binary files', async () => {
      // Create a small binary file (simulated)
      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header
      
      await fs.writeFile(testFile, binaryData);
      
      // Encrypt and decrypt
      await encryptionService.encryptFile(testFile, encryptedFile);
      
      const decryptedFile = path.join(testDir, 'decrypted-binary.bin');
      await encryptionService.decryptFile(encryptedFile, decryptedFile);
      
      // Verify binary data matches
      const decryptedData = await fs.readFile(decryptedFile);
      expect(Buffer.compare(binaryData, decryptedData)).toBe(0);
      
      // Clean up
      await fs.unlink(decryptedFile);
    });
    
    test('should throw error for non-existent files', async () => {
      await expect(
        encryptionService.encryptFile('/non/existent/file.txt', encryptedFile)
      ).rejects.toThrow();
      
      await expect(
        encryptionService.decryptFile('/non/existent/encrypted.enc', testFile)
      ).rejects.toThrow();
    });
  });
  
  describe('Key Validation', () => {
    test('should validate encryption keys correctly', () => {
      // Valid key (32 bytes)
      const validKey = 'a'.repeat(32);
      expect(() => encryptionService.validateKey(validKey)).not.toThrow();
      
      // Invalid keys
      expect(() => encryptionService.validateKey('')).toThrow('Encryption key must be exactly 32 characters');
      expect(() => encryptionService.validateKey('short')).toThrow('Encryption key must be exactly 32 characters');
      expect(() => encryptionService.validateKey('a'.repeat(31))).toThrow('Encryption key must be exactly 32 characters');
      expect(() => encryptionService.validateKey('a'.repeat(33))).toThrow('Encryption key must be exactly 32 characters');
      expect(() => encryptionService.validateKey(null)).toThrow('Encryption key is required');
      expect(() => encryptionService.validateKey(undefined)).toThrow('Encryption key is required');
    });
  });
  
  describe('Error Handling', () => {
    test('should handle corrupted encrypted data gracefully', () => {
      const validEncrypted = encryptionService.encrypt('test data');
      
      // Corrupt the encrypted data
      const corrupted = validEncrypted.slice(0, -5) + 'xxxxx';
      
      expect(() => {
        encryptionService.decrypt(corrupted);
      }).toThrow();
    });
    
    test('should handle invalid JSON in PHI decryption', () => {
      // Create invalid encrypted PHI data
      const invalidPHI = encryptionService.encrypt('invalid json {');
      
      expect(() => {
        encryptionService.decryptPHI(invalidPHI);
      }).toThrow();
    });
  });
  
  describe('Performance', () => {
    test('should encrypt/decrypt large data efficiently', () => {
      const largeData = 'x'.repeat(100000); // 100KB of data
      
      const startTime = Date.now();
      const encrypted = encryptionService.encrypt(largeData);
      const decrypted = encryptionService.decrypt(encrypted);
      const endTime = Date.now();
      
      expect(decrypted).toBe(largeData);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
    
    test('should handle multiple concurrent encryptions', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise((resolve) => {
            const data = `Test data ${i}`;
            const encrypted = encryptionService.encrypt(data);
            const decrypted = encryptionService.decrypt(encrypted);
            resolve(decrypted === data);
          })
        );
      }
      
      const results = await Promise.all(promises);
      expect(results.every(result => result === true)).toBe(true);
    });
  });
});