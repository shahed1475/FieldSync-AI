# Security Architecture Documentation

## Overview

This document provides a detailed technical overview of the ClaimFlow AI security architecture, including implementation details, configuration guidelines, and operational procedures for maintaining a secure HIPAA-compliant healthcare application.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Security Components](#security-components)
3. [Implementation Details](#implementation-details)
4. [Configuration Management](#configuration-management)
5. [Operational Security](#operational-security)
6. [Security Testing](#security-testing)
7. [Incident Response Technical Procedures](#incident-response-technical-procedures)
8. [Monitoring and Alerting](#monitoring-and-alerting)

## Architecture Overview

### High-Level Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Internet/External Users                        │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                         CDN/WAF Layer                                       │
│  • DDoS Protection  • SSL Termination  • Geographic Filtering              │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                      Load Balancer/API Gateway                              │
│  • Rate Limiting  • Authentication  • Request Routing  • SSL Offloading    │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                       Application Layer                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │   Web Server    │  │   API Server    │  │  Background     │            │
│  │   (Frontend)    │  │   (Backend)     │  │   Workers       │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                        Data Layer                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │   PostgreSQL    │  │   File Storage  │  │   Cache Layer   │            │
│  │   (Encrypted)   │  │   (Encrypted)   │  │   (Redis)       │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Security Zones

#### DMZ (Demilitarized Zone)
- **Components**: Load balancers, WAF, reverse proxies
- **Security Level**: High
- **Access**: Internet-facing with restricted inbound rules
- **Monitoring**: Comprehensive logging and real-time monitoring

#### Application Zone
- **Components**: Web servers, API servers, application services
- **Security Level**: Very High
- **Access**: Internal network only, authenticated requests
- **Monitoring**: Application-level logging and performance monitoring

#### Data Zone
- **Components**: Databases, file storage, backup systems
- **Security Level**: Maximum
- **Access**: Application zone only, encrypted connections
- **Monitoring**: Data access logging and integrity monitoring

#### Management Zone
- **Components**: Monitoring systems, log aggregation, admin tools
- **Security Level**: Maximum
- **Access**: VPN-only, multi-factor authentication required
- **Monitoring**: Administrative action logging

## Security Components

### 1. Web Application Firewall (WAF)

#### Configuration
```yaml
waf_rules:
  - name: "SQL Injection Protection"
    pattern: "(?i)(union|select|insert|delete|update|drop|create|alter)"
    action: "block"
    severity: "high"
  
  - name: "XSS Protection"
    pattern: "(?i)(<script|javascript:|vbscript:|onload=|onerror=)"
    action: "block"
    severity: "high"
  
  - name: "Path Traversal Protection"
    pattern: "(\.\./|\.\.\\|%2e%2e%2f|%2e%2e%5c)"
    action: "block"
    severity: "medium"
  
  - name: "Rate Limiting"
    requests_per_minute: 1000
    burst_limit: 1500
    action: "throttle"
    severity: "low"
```

#### Custom Rules for Healthcare
```yaml
healthcare_specific_rules:
  - name: "PHI Pattern Detection"
    pattern: "(?i)(ssn|social.security|patient.id|medical.record)"
    action: "log_and_alert"
    severity: "critical"
  
  - name: "HIPAA Violation Keywords"
    pattern: "(?i)(diagnosis|prescription|treatment|medical.history)"
    action: "enhanced_logging"
    severity: "high"
```

### 2. Identity and Access Management (IAM)

#### JWT Configuration
```javascript
const jwtConfig = {
  algorithm: 'RS256',
  expiresIn: '30m',
  issuer: 'claimflow-ai',
  audience: 'claimflow-api',
  keyRotation: {
    enabled: true,
    interval: '90d',
    gracePeriod: '7d'
  },
  claims: {
    required: ['sub', 'role', 'practice_id', 'permissions'],
    optional: ['department', 'specialization']
  }
};
```

#### Role Definitions
```javascript
const roles = {
  system_admin: {
    permissions: [
      'system:*',
      'audit:read',
      'users:*',
      'practices:*'
    ],
    restrictions: {
      phi_access: 'admin_only',
      time_based: false,
      ip_restrictions: true
    }
  },
  practice_admin: {
    permissions: [
      'practice:manage',
      'users:practice_scope',
      'patients:practice_scope',
      'reports:practice_scope'
    ],
    restrictions: {
      phi_access: 'practice_scope',
      time_based: true,
      ip_restrictions: false
    }
  },
  provider: {
    permissions: [
      'patients:assigned',
      'authorizations:create',
      'documents:upload',
      'reports:own'
    ],
    restrictions: {
      phi_access: 'assigned_patients',
      time_based: true,
      ip_restrictions: false
    }
  }
};
```

### 3. Encryption Services

#### Database Encryption Implementation
```javascript
const crypto = require('crypto');
const { KMS } = require('aws-sdk');

class EncryptionService {
  constructor() {
    this.kms = new KMS({ region: process.env.AWS_REGION });
    this.algorithm = 'aes-256-gcm';
  }

  async encryptPHI(data, context = {}) {
    try {
      // Get data encryption key from KMS
      const { Plaintext: dek } = await this.kms.generateDataKey({
        KeyId: process.env.KMS_KEY_ID,
        KeySpec: 'AES_256',
        EncryptionContext: context
      }).promise();

      // Encrypt data with DEK
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, dek, iv);
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();

      return {
        encrypted_data: encrypted,
        iv: iv.toString('hex'),
        auth_tag: authTag.toString('hex'),
        encryption_context: context
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  async decryptPHI(encryptedData, context = {}) {
    try {
      const { encrypted_data, iv, auth_tag } = encryptedData;
      
      // Get data encryption key from KMS
      const { Plaintext: dek } = await this.kms.decrypt({
        CiphertextBlob: encryptedData.encrypted_dek,
        EncryptionContext: context
      }).promise();

      // Decrypt data with DEK
      const decipher = crypto.createDecipher(
        this.algorithm, 
        dek, 
        Buffer.from(iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(auth_tag, 'hex'));
      
      let decrypted = decipher.update(encrypted_data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }
}
```

#### File Encryption Implementation
```javascript
class FileEncryptionService {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    this.keySize = 32;
    this.ivSize = 16;
  }

  async encryptFile(filePath, outputPath) {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(this.keySize);
      const iv = crypto.randomBytes(this.ivSize);
      
      const cipher = crypto.createCipher(this.algorithm, key, iv);
      const input = fs.createReadStream(filePath);
      const output = fs.createWriteStream(outputPath);
      
      // Write encryption metadata
      output.write(JSON.stringify({
        algorithm: this.algorithm,
        iv: iv.toString('hex'),
        encrypted_key: this.encryptKey(key)
      }) + '\n---\n');
      
      input.pipe(cipher).pipe(output);
      
      output.on('finish', () => resolve(outputPath));
      output.on('error', reject);
    });
  }

  encryptKey(key) {
    // Encrypt the file key with KMS
    return this.kms.encrypt({
      KeyId: process.env.FILE_KMS_KEY_ID,
      Plaintext: key
    }).promise();
  }
}
```

### 4. Audit Logging System

#### Audit Logger Implementation
```javascript
class AuditLogger {
  constructor() {
    this.logStream = this.createSecureLogStream();
    this.hashChain = [];
  }

  async logEvent(event) {
    const auditEntry = {
      audit_log_id: uuidv4(),
      timestamp: new Date().toISOString(),
      event_type: event.type,
      action: event.action,
      user_id: event.user?.id,
      user_email: event.user?.email,
      user_role: event.user?.role,
      practice_id: event.practice_id,
      resource_type: event.resource?.type,
      resource_id: event.resource?.id,
      ip_address: event.request?.ip,
      user_agent: event.request?.userAgent,
      correlation_id: event.correlation_id,
      session_id: event.session_id,
      outcome: event.outcome,
      metadata: event.metadata || {},
      previous_hash: this.getLastHash(),
      hash: null
    };

    // Calculate hash for integrity
    auditEntry.hash = this.calculateHash(auditEntry);
    this.hashChain.push(auditEntry.hash);

    // Write to secure log storage
    await this.writeToSecureStorage(auditEntry);
    
    // Send to SIEM if critical event
    if (this.isCriticalEvent(event)) {
      await this.sendToSIEM(auditEntry);
    }

    return auditEntry.audit_log_id;
  }

  calculateHash(entry) {
    const data = JSON.stringify({
      ...entry,
      hash: null // Exclude hash from hash calculation
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async verifyLogIntegrity(logId) {
    const entry = await this.getLogEntry(logId);
    const calculatedHash = this.calculateHash({
      ...entry,
      hash: null
    });
    
    return calculatedHash === entry.hash;
  }
}
```

## Implementation Details

### Database Security Implementation

#### Row Level Security Policies
```sql
-- Enable RLS on all PHI tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Patient access policy
CREATE POLICY patient_practice_isolation ON patients
FOR ALL TO authenticated
USING (
  practice_id = current_setting('app.current_practice_id')::uuid
);

-- Provider-specific patient access
CREATE POLICY patient_provider_access ON patients
FOR SELECT TO authenticated
USING (
  practice_id = current_setting('app.current_practice_id')::uuid
  AND (
    current_setting('app.current_user_role') = 'practice_admin'
    OR EXISTS (
      SELECT 1 FROM patient_providers pp
      WHERE pp.patient_id = patients.patient_id
      AND pp.provider_id = current_setting('app.current_user_id')::uuid
      AND pp.is_active = true
    )
  )
);

-- Audit log access policy
CREATE POLICY audit_log_access ON audit_logs
FOR SELECT TO authenticated
USING (
  CASE 
    WHEN current_setting('app.current_user_role') = 'system_admin' THEN true
    WHEN current_setting('app.current_user_role') = 'auditor' THEN true
    WHEN current_setting('app.current_user_role') = 'practice_admin' THEN
      practice_id = current_setting('app.current_practice_id')::uuid
    ELSE false
  END
);
```

#### Database Connection Security
```javascript
const { Pool } = require('pg');

const createSecurePool = () => {
  return new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ca: fs.readFileSync(process.env.DB_CA_CERT),
      cert: fs.readFileSync(process.env.DB_CLIENT_CERT),
      key: fs.readFileSync(process.env.DB_CLIENT_KEY)
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,
    query_timeout: 30000
  });
};
```

### API Security Implementation

#### Request Validation Middleware
```javascript
const Joi = require('joi');

const createValidationMiddleware = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      // Log validation failure for security monitoring
      auditLogger.logEvent({
        type: 'validation_failure',
        action: 'request_validation',
        user: req.user,
        request: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method
        },
        outcome: 'failure',
        metadata: { validation_errors: validationErrors }
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    req.validatedBody = value;
    next();
  };
};

// PHI validation schemas
const patientSchema = Joi.object({
  first_name: Joi.string().min(1).max(50).required(),
  last_name: Joi.string().min(1).max(50).required(),
  date_of_birth: Joi.date().max('now').required(),
  ssn: Joi.string().pattern(/^\d{3}-\d{2}-\d{4}$/).required(),
  phone: Joi.string().pattern(/^\+?1?[2-9]\d{2}[2-9]\d{2}\d{4}$/).required(),
  email: Joi.string().email().max(100),
  address: Joi.object({
    street: Joi.string().max(100).required(),
    city: Joi.string().max(50).required(),
    state: Joi.string().length(2).required(),
    zip_code: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required()
  }).required()
});
```

#### Rate Limiting Implementation
```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('redis');

const redisClient = Redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined
});

const createRateLimiter = (options) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:'
    }),
    windowMs: options.windowMs || 60 * 1000, // 1 minute
    max: options.max || 1000,
    message: {
      error: 'Too many requests',
      retry_after: Math.ceil(options.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID for authenticated requests, IP for anonymous
      return req.user?.id || req.ip;
    },
    onLimitReached: (req, res, options) => {
      auditLogger.logEvent({
        type: 'rate_limit_exceeded',
        action: 'request_blocked',
        user: req.user,
        request: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method
        },
        outcome: 'blocked',
        metadata: {
          limit: options.max,
          window_ms: options.windowMs
        }
      });
    }
  });
};

// Different rate limits for different endpoints
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  skipSuccessfulRequests: true
});

const apiRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 1000 // 1000 requests per minute
});

const phiRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 500 // 500 PHI requests per minute
});
```

## Configuration Management

### Environment Configuration
```bash
# Security Configuration
NODE_ENV=production
SECURE_COOKIES=true
SESSION_SECRET=<strong-random-secret>
JWT_SECRET=<rsa-private-key>
ENCRYPTION_KEY=<aes-256-key>

# Database Security
DB_SSL_MODE=require
DB_SSL_CERT_PATH=/path/to/client-cert.pem
DB_SSL_KEY_PATH=/path/to/client-key.pem
DB_SSL_CA_PATH=/path/to/ca-cert.pem

# API Security
CORS_ORIGIN=https://app.claimflow-ai.com
CSP_POLICY="default-src 'self'; script-src 'self' 'unsafe-inline'"
HSTS_MAX_AGE=31536000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_REDIS_URL=redis://localhost:6379

# Audit Logging
AUDIT_LOG_LEVEL=info
AUDIT_LOG_RETENTION_DAYS=2555 # 7 years
AUDIT_SIEM_ENDPOINT=https://siem.company.com/api/events

# File Upload Security
MAX_FILE_SIZE=10485760 # 10MB
ALLOWED_FILE_TYPES=pdf,jpg,jpeg,png,doc,docx
FILE_SCAN_ENABLED=true
FILE_QUARANTINE_PATH=/secure/quarantine

# Monitoring
MONITORING_ENDPOINT=https://monitoring.company.com/api
ALERT_WEBHOOK_URL=https://alerts.company.com/webhook
HEALTH_CHECK_INTERVAL=30000
```

### Security Headers Configuration
```javascript
const helmet = require('helmet');

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});
```

## Operational Security

### Secure Deployment Pipeline

#### CI/CD Security Checks
```yaml
# .github/workflows/security.yml
name: Security Checks

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run SAST Scan
        uses: github/super-linter@v4
        env:
          DEFAULT_BRANCH: main
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          VALIDATE_JAVASCRIPT_ES: true
          VALIDATE_TYPESCRIPT_ES: true
          VALIDATE_JSON: true
          VALIDATE_YAML: true
      
      - name: Run Dependency Check
        run: |
          npm audit --audit-level high
          npm run security:check
      
      - name: Run Container Security Scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'claimflow-ai:latest'
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload SARIF file
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

#### Infrastructure as Code Security
```terraform
# security.tf
resource "aws_security_group" "app_sg" {
  name_description = "ClaimFlow AI Application Security Group"
  vpc_id          = var.vpc_id

  # HTTPS inbound
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP redirect to HTTPS
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Database access from app servers only
  egress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.db_sg.id]
  }

  tags = {
    Name        = "claimflow-ai-app-sg"
    Environment = var.environment
    Compliance  = "HIPAA"
  }
}

resource "aws_security_group" "db_sg" {
  name_description = "ClaimFlow AI Database Security Group"
  vpc_id          = var.vpc_id

  # PostgreSQL access from app servers only
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]
  }

  tags = {
    Name        = "claimflow-ai-db-sg"
    Environment = var.environment
    Compliance  = "HIPAA"
  }
}
```

### Backup and Recovery Security

#### Encrypted Backup Implementation
```javascript
class SecureBackupService {
  constructor() {
    this.s3 = new AWS.S3({
      region: process.env.AWS_REGION,
      serverSideEncryption: 'aws:kms',
      ssekmsKeyId: process.env.BACKUP_KMS_KEY_ID
    });
  }

  async createEncryptedBackup(databaseUrl, backupName) {
    try {
      // Create database dump
      const dumpCommand = `pg_dump ${databaseUrl} --no-password --clean --create`;
      const dumpProcess = spawn('pg_dump', dumpCommand.split(' '));
      
      // Encrypt dump on-the-fly
      const encryptionKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', encryptionKey, iv);
      
      // Upload encrypted backup to S3
      const uploadParams = {
        Bucket: process.env.BACKUP_BUCKET,
        Key: `backups/${backupName}.sql.enc`,
        Body: dumpProcess.stdout.pipe(cipher),
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.BACKUP_KMS_KEY_ID,
        Metadata: {
          'backup-type': 'database',
          'encryption-algorithm': 'aes-256-cbc',
          'created-at': new Date().toISOString(),
          'retention-period': '7-years'
        }
      };
      
      const result = await this.s3.upload(uploadParams).promise();
      
      // Store encryption metadata securely
      await this.storeEncryptionMetadata(backupName, {
        iv: iv.toString('hex'),
        key_id: process.env.BACKUP_KMS_KEY_ID,
        s3_location: result.Location
      });
      
      // Log backup creation
      await auditLogger.logEvent({
        type: 'backup_created',
        action: 'database_backup',
        outcome: 'success',
        metadata: {
          backup_name: backupName,
          size_bytes: result.ContentLength,
          encryption: 'aes-256-cbc',
          storage_location: 's3'
        }
      });
      
      return result;
    } catch (error) {
      await auditLogger.logEvent({
        type: 'backup_failed',
        action: 'database_backup',
        outcome: 'failure',
        metadata: {
          backup_name: backupName,
          error: error.message
        }
      });
      throw error;
    }
  }
}
```

## Security Testing

### Automated Security Testing

#### Unit Tests for Security Functions
```javascript
// tests/security/encryption.test.js
const { EncryptionService } = require('../../src/services/encryption');

describe('Encryption Service', () => {
  let encryptionService;
  
  beforeEach(() => {
    encryptionService = new EncryptionService();
  });
  
  describe('PHI Encryption', () => {
    test('should encrypt and decrypt PHI data correctly', async () => {
      const testData = {
        first_name: 'John',
        last_name: 'Doe',
        ssn: '123-45-6789',
        date_of_birth: '1980-01-01'
      };
      
      const encrypted = await encryptionService.encryptPHI(testData);
      expect(encrypted.encrypted_data).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.auth_tag).toBeDefined();
      
      const decrypted = await encryptionService.decryptPHI(encrypted);
      expect(decrypted).toEqual(testData);
    });
    
    test('should fail decryption with tampered data', async () => {
      const testData = { ssn: '123-45-6789' };
      const encrypted = await encryptionService.encryptPHI(testData);
      
      // Tamper with encrypted data
      encrypted.encrypted_data = encrypted.encrypted_data.slice(0, -2) + 'XX';
      
      await expect(encryptionService.decryptPHI(encrypted))
        .rejects.toThrow('Decryption failed');
    });
  });
});
```

#### Integration Tests for Security
```javascript
// tests/security/api-security.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('API Security', () => {
  describe('Rate Limiting', () => {
    test('should block requests after rate limit exceeded', async () => {
      const endpoint = '/api/auth/login';
      const requests = [];
      
      // Make requests up to the limit
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post(endpoint)
            .send({ email: 'test@example.com', password: 'wrong' })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // First 5 should be processed (even if they fail auth)
      responses.slice(0, 5).forEach(response => {
        expect(response.status).not.toBe(429);
      });
      
      // 6th request should be rate limited
      expect(responses[5].status).toBe(429);
      expect(responses[5].body.error).toBe('Too many requests');
    });
  });
  
  describe('Input Validation', () => {
    test('should reject malicious SQL injection attempts', async () => {
      const maliciousInput = {
        first_name: "'; DROP TABLE patients; --",
        last_name: 'Test',
        date_of_birth: '1980-01-01'
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${validToken}`)
        .send(maliciousInput);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
    
    test('should reject XSS attempts in input fields', async () => {
      const xssInput = {
        first_name: '<script>alert("xss")</script>',
        last_name: 'Test',
        date_of_birth: '1980-01-01'
      };
      
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${validToken}`)
        .send(xssInput);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });
});
```

### Penetration Testing Checklist

#### OWASP Top 10 Testing
1. **Injection Attacks**
   - [ ] SQL injection testing
   - [ ] NoSQL injection testing
   - [ ] Command injection testing
   - [ ] LDAP injection testing

2. **Broken Authentication**
   - [ ] Weak password policy testing
   - [ ] Session management testing
   - [ ] Multi-factor authentication bypass
   - [ ] Credential stuffing resistance

3. **Sensitive Data Exposure**
   - [ ] Data encryption verification
   - [ ] Transport layer security testing
   - [ ] Data leakage in error messages
   - [ ] Backup security testing

4. **XML External Entities (XXE)**
   - [ ] XML parsing security
   - [ ] File disclosure attempts
   - [ ] SSRF via XXE testing

5. **Broken Access Control**
   - [ ] Horizontal privilege escalation
   - [ ] Vertical privilege escalation
   - [ ] Direct object reference testing
   - [ ] Missing function level access control

## Monitoring and Alerting

### Security Monitoring Dashboard

#### Key Security Metrics
```javascript
const securityMetrics = {
  authentication: {
    failed_logins_per_hour: 0,
    successful_logins_per_hour: 0,
    mfa_failures_per_hour: 0,
    account_lockouts_per_hour: 0
  },
  authorization: {
    access_denied_per_hour: 0,
    privilege_escalation_attempts: 0,
    unauthorized_phi_access_attempts: 0
  },
  data_access: {
    phi_records_accessed_per_hour: 0,
    bulk_data_exports_per_hour: 0,
    unusual_access_patterns: 0
  },
  system_security: {
    vulnerability_scan_results: {},
    security_patch_status: {},
    certificate_expiry_warnings: 0,
    encryption_failures: 0
  }
};
```

#### Alert Configuration
```yaml
alerts:
  critical:
    - name: "PHI Data Breach"
      condition: "phi_unauthorized_access > 0"
      notification: ["security-team", "compliance-team", "executives"]
      escalation_time: "immediate"
    
    - name: "Multiple Failed Logins"
      condition: "failed_logins_per_hour > 100"
      notification: ["security-team"]
      escalation_time: "5 minutes"
    
    - name: "System Compromise Indicators"
      condition: "privilege_escalation_attempts > 5"
      notification: ["security-team", "infrastructure-team"]
      escalation_time: "immediate"
  
  warning:
    - name: "Unusual Access Patterns"
      condition: "unusual_access_patterns > 10"
      notification: ["security-team"]
      escalation_time: "15 minutes"
    
    - name: "High API Error Rate"
      condition: "api_error_rate > 5%"
      notification: ["development-team"]
      escalation_time: "10 minutes"
  
  info:
    - name: "Certificate Expiry Warning"
      condition: "certificate_expires_in_days < 30"
      notification: ["infrastructure-team"]
      escalation_time: "daily"
```

---

## Conclusion

This security architecture documentation provides the technical foundation for implementing and maintaining a secure, HIPAA-compliant healthcare application. Regular reviews and updates of these security measures are essential to address evolving threats and maintain compliance with regulatory requirements.

For technical questions or security concerns, contact:
- **Security Team**: security-tech@claimflow-ai.com
- **DevOps Team**: devops@claimflow-ai.com
- **Architecture Team**: architecture@claimflow-ai.com

---

*Document Version: 1.0*  
*Last Updated: January 2024*  
*Next Review Date: April 2024*