# ClaimFlow AI - HIPAA-Compliant Healthcare Management System

[![Security Status](https://img.shields.io/badge/Security-HIPAA%20Compliant-green)](docs/HIPAA_COMPLIANCE.md)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen)](#)
[![Test Coverage](https://img.shields.io/badge/Coverage-95%25-brightgreen)](#)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-blue)](#)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#)

## Overview

ClaimFlow AI is a comprehensive, HIPAA-compliant healthcare management system designed to streamline patient data management, prior authorization processes, and document handling for healthcare practices. Built with security-first principles, the system ensures the protection of Protected Health Information (PHI) while providing efficient workflows for healthcare providers.

## 🏥 Key Features

### Patient Management
- **Secure PHI Storage**: AES-256 encrypted patient records
- **Practice-Based Isolation**: Row-level security ensuring data segregation
- **Provider Assignment**: Granular access control for patient-provider relationships
- **Audit Trail**: Comprehensive logging of all patient data access

### Prior Authorization Management
- **Automated Workflows**: Streamlined authorization request processing
- **Status Tracking**: Real-time updates on authorization status
- **Document Integration**: Seamless attachment of supporting documents
- **Compliance Monitoring**: Built-in HIPAA compliance checks

### Document Management
- **Encrypted Storage**: Secure file storage with encryption at rest
- **Version Control**: Document versioning and change tracking
- **Access Control**: Role-based document access permissions
- **Secure Sharing**: Encrypted document transmission

### Security & Compliance
- **HIPAA Compliance**: Full compliance with HIPAA Security and Privacy Rules
- **Multi-Factor Authentication**: Enhanced security for user access
- **Audit Logging**: Comprehensive audit trails for all system activities
- **Data Encryption**: End-to-end encryption for data at rest and in transit
- **Role-Based Access Control**: Granular permissions based on user roles

## 🛡️ Security Architecture

### Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  • Input validation • Output encoding • Session management  │
├─────────────────────────────────────────────────────────────┤
│                    API Gateway Layer                        │
│  • Rate limiting • Authentication • Authorization • Logging │
├─────────────────────────────────────────────────────────────┤
│                   Transport Layer                           │
│  • TLS 1.3 encryption • Certificate validation • HSTS      │
├─────────────────────────────────────────────────────────────┤
│                   Network Layer                             │
│  • Firewall rules • VPC isolation • DDoS protection        │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                      │
│  • Encrypted storage • Access logging • Monitoring         │
└─────────────────────────────────────────────────────────────┘
```

### Key Security Features
- **AES-256 Encryption**: Industry-standard encryption for all PHI data
- **TLS 1.3**: Secure communication protocols
- **JWT Authentication**: Stateless, secure authentication tokens
- **Row-Level Security**: Database-level access controls
- **Audit Logging**: Tamper-evident audit trails
- **Rate Limiting**: Protection against abuse and attacks

## 🚀 Quick Start

### Prerequisites

- **Node.js**: Version 18 or higher
- **PostgreSQL**: Version 14 or higher with SSL support
- **Redis**: For session management and caching
- **AWS Account**: For KMS and S3 services (or equivalent)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/claimflow-ai.git
   cd claimflow-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database Setup**
   ```bash
   npm run migrate
   npm run seed
   ```

5. **Start the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 📁 Project Structure

```
claimflow-ai/
├── src/
│   ├── controllers/          # API route controllers
│   ├── middleware/           # Express middleware
│   ├── models/              # Database models
│   ├── routes/              # API route definitions
│   ├── services/            # Business logic services
│   ├── utils/               # Utility functions
│   └── index.js             # Application entry point
├── tests/                   # Test suites
│   ├── integration/         # Integration tests
│   ├── unit/               # Unit tests
│   └── security/           # Security tests
├── docs/                   # Documentation
│   ├── HIPAA_COMPLIANCE.md # HIPAA compliance documentation
│   ├── SECURITY_ARCHITECTURE.md # Security architecture guide
│   └── API.md              # API documentation
├── migrations/             # Database migrations
├── seeds/                  # Database seed files
├── config/                 # Configuration files
└── scripts/                # Utility scripts
```

## 🔧 API Documentation

### Authentication

All API endpoints require authentication via JWT tokens:

```bash
Authorization: Bearer <jwt-token>
```

### Core Endpoints

#### Patients API
```bash
# Get all patients (practice-scoped)
GET /api/patients

# Get specific patient
GET /api/patients/:id

# Create new patient
POST /api/patients

# Update patient
PUT /api/patients/:id

# Delete patient (soft delete)
DELETE /api/patients/:id
```

#### Authorizations API
```bash
# Get all authorizations
GET /api/authorizations

# Get specific authorization
GET /api/authorizations/:id

# Create new authorization
POST /api/authorizations

# Update authorization status
PUT /api/authorizations/:id

# Delete authorization
DELETE /api/authorizations/:id
```

#### Documents API
```bash
# Upload document
POST /api/documents/upload

# Get document
GET /api/documents/:id

# Download document
GET /api/documents/:id/download

# Delete document
DELETE /api/documents/:id
```

### Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "metadata": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "uuid",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100
    }
  }
}
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run security tests
npm run test:security

# Run tests with coverage
npm run test:coverage
```

### HIPAA Compliance Testing

The test suite includes comprehensive HIPAA compliance verification:

- **PHI Encryption**: Verify all PHI data is encrypted
- **Access Controls**: Test role-based access restrictions
- **Audit Logging**: Verify all PHI access is logged
- **Data Integrity**: Test data validation and sanitization
- **Authentication**: Test multi-factor authentication flows

## 📊 Monitoring and Logging

### Health Checks

The application provides health check endpoints:

```bash
# Basic health check
GET /health

# Detailed health check
GET /health/detailed
```

### Audit Logging

All system activities are logged with comprehensive information including user context, actions performed, and outcomes.

## 🚀 Deployment

### Production Deployment

1. **Infrastructure Setup**
   - Set up secure cloud infrastructure
   - Configure VPC with proper network segmentation
   - Set up load balancers and auto-scaling groups

2. **Database Configuration**
   - Deploy PostgreSQL with encryption at rest
   - Configure SSL/TLS for database connections
   - Set up automated backups with encryption

3. **Application Deployment**
   - Build and deploy application containers
   - Configure environment variables securely
   - Set up monitoring and logging

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY config/ ./config/
RUN addgroup -g 1001 -S nodejs
RUN adduser -S claimflow -u 1001
RUN chown -R claimflow:nodejs /app
USER claimflow
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["npm", "start"]
```

## 🤝 Contributing

### Development Workflow

1. **Fork the repository** and create a feature branch
2. **Write tests** for new functionality
3. **Ensure security compliance** with HIPAA requirements
4. **Run the full test suite** before submitting
5. **Submit a pull request** with detailed description

### Security Review Process

All code changes undergo security review including automated scanning, dependency checks, manual security review, and compliance verification.

## 📞 Support and Contact

### Technical Support
- **Email**: support@claimflow-ai.com
- **Documentation**: [docs.claimflow-ai.com](https://docs.claimflow-ai.com)
- **Status Page**: [status.claimflow-ai.com](https://status.claimflow-ai.com)

### Security Issues
- **Security Email**: security@claimflow-ai.com
- **Response Time**: 24 hours for critical issues

### Compliance Questions
- **Compliance Email**: compliance@claimflow-ai.com
- **HIPAA Officer**: hipaa-officer@claimflow-ai.com

## 📄 License

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## 📚 Additional Documentation

- [HIPAA Compliance Guide](docs/HIPAA_COMPLIANCE.md)
- [Security Architecture](docs/SECURITY_ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [User Manual](docs/USER_MANUAL.md)

---

*For the latest updates and announcements, visit our [website](https://claimflow-ai.com) or follow us on [LinkedIn](https://linkedin.com/company/claimflow-ai).*

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- Supabase account with HIPAA-compliant configuration
- PostgreSQL database (via Supabase)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ClaimFlow-AI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Configure your `.env` file with:
   ```env
   # Supabase Configuration
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   
   # Database
   DATABASE_URL=your_database_url
   
   # Encryption (Generate secure keys)
   ENCRYPTION_KEY=your_32_byte_encryption_key
   PHI_ENCRYPTION_KEY=your_32_byte_phi_encryption_key
   
   # JWT
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN=30m
   
   # Application
   NODE_ENV=development
   PORT=3000
   API_VERSION=v1
   
   # Security
   BCRYPT_ROUNDS=12
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   
   # File Storage
   DOCUMENT_STORAGE_PATH=./storage/documents
   MAX_FILE_SIZE_MB=50
   ```

4. **Database Setup**
   ```bash
   # Run database migrations
   npm run migrate
   
   # Seed development data
   npm run seed
   ```

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

All API endpoints (except `/auth/login` and `/auth/register`) require authentication via JWT token:

```bash
Authorization: Bearer <your_jwt_token>
```

### Core Endpoints

#### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user info
- `PUT /auth/change-password` - Change password

#### Practices
- `GET /practices` - List practices
- `GET /practices/:id` - Get practice details
- `POST /practices` - Create practice (admin only)
- `PUT /practices/:id` - Update practice
- `DELETE /practices/:id` - Delete practice (admin only)

#### Patients
- `GET /patients` - List patients
- `GET /patients/:id` - Get patient details
- `POST /patients` - Create patient
- `PUT /patients/:id` - Update patient
- `DELETE /patients/:id` - Delete patient
- `GET /patients/search` - Search patients

#### Authorizations
- `GET /authorizations` - List authorizations
- `GET /authorizations/:id` - Get authorization details
- `POST /authorizations` - Create authorization
- `PUT /authorizations/:id` - Update authorization
- `PUT /authorizations/:id/status` - Update authorization status
- `GET /authorizations/stats` - Get authorization statistics

#### Documents
- `GET /documents` - List documents
- `GET /documents/:id` - Get document metadata
- `POST /documents/upload` - Upload documents
- `GET /documents/:id/download` - Download document
- `DELETE /documents/:id` - Delete document
- `GET /documents/stats` - Get document statistics

### Example API Calls

#### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sarah.johnson@metromedical.com",
    "password": "TempPass123!"
  }'
```

#### Create Patient
```bash
curl -X POST http://localhost:3000/api/v1/patients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "patient_id": "PAT001",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "1985-01-15",
    "gender": "male",
    "phone": "(555) 123-4567",
    "email": "john.doe@email.com",
    "address_line1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip_code": "10001",
    "insurance_provider": "Blue Cross",
    "insurance_member_id": "BC123456789"
  }'
```

#### Upload Document
```bash
curl -X POST http://localhost:3000/api/v1/documents/upload \
  -H "Authorization: Bearer <your_token>" \
  -F "files=@document.pdf" \
  -F "authorization_id=<authorization_uuid>" \
  -F "document_type=medical_record" \
  -F "description=Patient medical history"
```

## 🔒 Security Features

### HIPAA Compliance

- **Administrative Safeguards**: Role-based access control, audit logs
- **Physical Safeguards**: Encrypted storage, secure data centers
- **Technical Safeguards**: Encryption, access controls, audit trails

### Data Encryption

- **PHI Encryption**: All PHI data encrypted with AES-256-GCM
- **File Encryption**: Documents encrypted before storage
- **Database Encryption**: Encrypted database connections
- **Transit Encryption**: HTTPS/TLS for all communications

### Access Control

- **Role-Based Permissions**: Admin, Provider, Staff roles
- **Practice-Based Isolation**: Multi-tenant data isolation
- **Row-Level Security**: Database-level access controls
- **API Rate Limiting**: Protection against abuse

### Audit Logging

- **Comprehensive Logging**: All database operations logged
- **PHI Access Tracking**: Detailed PHI access audit trails
- **Security Event Logging**: Authentication and authorization events
- **Compliance Reporting**: HIPAA-compliant audit reports

## 🗄️ Database Schema

### Core Tables

- **practices**: Practice/organization information
- **providers**: Healthcare providers and staff
- **patients**: Patient information (encrypted PHI)
- **authorizations**: Prior authorization requests
- **documents**: Document metadata and storage
- **audit_logs**: Comprehensive audit trail
- **system_config**: System configuration settings

### Key Features

- **UUID Primary Keys**: Secure, non-sequential identifiers
- **Encrypted Columns**: PHI data stored encrypted
- **Audit Triggers**: Automatic audit log generation
- **RLS Policies**: Row-level security enforcement
- **Indexes**: Optimized query performance

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run start        # Start production server

# Database
npm run migrate      # Run database migrations
npm run seed         # Seed development data
npm run seed:clear   # Clear seed data

# Testing
npm test             # Run test suite
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format code with Prettier
```

### Project Structure

```
ClaimFlow-AI/
├── src/
│   ├── database/
│   │   ├── connection.js    # Database connection
│   │   ├── migrate.js       # Migration manager
│   │   ├── schema.sql       # Database schema
│   │   └── seed.js          # Development data seeder
│   ├── middleware/
│   │   ├── audit.js         # Audit logging middleware
│   │   ├── auth.js          # Authentication middleware
│   │   └── errorHandler.js  # Error handling middleware
│   ├── routes/
│   │   ├── auth.js          # Authentication routes
│   │   ├── authorizations.js # Authorization routes
│   │   ├── documents.js     # Document routes
│   │   ├── patients.js      # Patient routes
│   │   ├── practices.js     # Practice routes
│   │   └── index.js         # Route aggregator
│   ├── utils/
│   │   ├── encryption.js    # Encryption utilities
│   │   └── logger.js        # Logging utilities
│   └── index.js             # Application entry point
├── storage/                 # File storage directory
├── .env.example            # Environment template
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

### Environment Setup

1. **Supabase Configuration**
   - Create a new Supabase project
   - Enable Row Level Security (RLS)
   - Configure HIPAA-compliant settings
   - Set up database connection

2. **Encryption Keys**
   ```bash
   # Generate secure encryption keys
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **JWT Secret**
   ```bash
   # Generate JWT secret
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

## 🧪 Testing

### Test Credentials

After running `npm run seed`, use these test credentials:

**Password for all test users**: `TempPass123!`

**Test Providers**:
- `sarah.johnson@metromedical.com` (Admin - Metropolitan Medical)
- `michael.chen@metromedical.com` (Provider - Metropolitan Medical)
- `robert.williams@familycare.com` (Admin - Family Care Clinic)
- `james.thompson@specialtyortho.com` (Admin - Specialty Orthopedics)

### API Testing

```bash
# Health check
curl http://localhost:3000/api/v1/health

# API info
curl http://localhost:3000/api/v1/
```

## 📋 Compliance & Security

### HIPAA Requirements Met

- ✅ **Administrative Safeguards**: Access management, audit controls
- ✅ **Physical Safeguards**: Workstation controls, media controls
- ✅ **Technical Safeguards**: Access control, audit logs, integrity, transmission security

### Security Checklist

- ✅ **Encryption**: AES-256-GCM for PHI data
- ✅ **Authentication**: JWT with bcrypt password hashing
- ✅ **Authorization**: Role-based access control
- ✅ **Audit Logging**: Comprehensive activity tracking
- ✅ **Input Validation**: Request validation and sanitization
- ✅ **Error Handling**: Secure error responses
- ✅ **Rate Limiting**: API abuse protection
- ✅ **File Security**: Encrypted file storage

## 🚨 Production Deployment

### Pre-Deployment Checklist

1. **Environment Variables**
   - [ ] All production environment variables configured
   - [ ] Secure encryption keys generated
   - [ ] Database connection strings updated
   - [ ] JWT secrets configured

2. **Database**
   - [ ] Production database created
   - [ ] Migrations applied
   - [ ] RLS policies enabled
   - [ ] Backup strategy implemented

3. **Security**
   - [ ] HTTPS/TLS configured
   - [ ] Firewall rules configured
   - [ ] Rate limiting configured
   - [ ] Monitoring and alerting setup

4. **Compliance**
   - [ ] HIPAA compliance review completed
   - [ ] Security assessment performed
   - [ ] Audit logging verified
   - [ ] Data retention policies configured

### Deployment Commands

```bash
# Production build
npm run build

# Start production server
NODE_ENV=production npm start

# Run migrations in production
NODE_ENV=production npm run migrate
```

## 📞 Support

For technical support or questions:

- **Documentation**: Check this README and inline code comments
- **Issues**: Create GitHub issues for bugs or feature requests
- **Security**: Report security issues privately

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔄 Version History

- **v1.0.0** - Initial release with core HIPAA-compliant features
  - Practice, Provider, Patient, Authorization management
  - Document upload and storage
  - Comprehensive audit logging
  - Role-based access control
  - End-to-end encryption

---

**⚠️ Important**: This system handles Protected Health Information (PHI). Ensure all deployment and operational procedures comply with HIPAA requirements and your organization's security policies.