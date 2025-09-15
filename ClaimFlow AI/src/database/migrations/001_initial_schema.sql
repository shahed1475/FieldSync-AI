-- ClaimFlow AI Database Schema - SQLite Version
-- HIPAA-Compliant Healthcare Data Management System
-- Converted from PostgreSQL to SQLite

-- =============================================
-- PRACTICES TABLE
-- =============================================
CREATE TABLE practices (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    npi TEXT UNIQUE NOT NULL CHECK (length(npi) = 10 AND npi GLOB '[0-9]*'),
    subscription_tier TEXT NOT NULL DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'professional', 'enterprise')),
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    is_active INTEGER DEFAULT 1,
    hipaa_compliance_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT
);

-- =============================================
-- PROVIDERS TABLE
-- =============================================
CREATE TABLE providers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    npi TEXT UNIQUE NOT NULL CHECK (length(npi) = 10 AND npi GLOB '[0-9]*'),
    specialty TEXT,
    license_number TEXT,
    license_state TEXT,
    dea_number TEXT,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'provider' CHECK (role IN ('admin', 'provider', 'staff', 'readonly')),
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    password_hash TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT
);

-- =============================================
-- PATIENTS TABLE (PHI ENCRYPTED)
-- =============================================
CREATE TABLE patients (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    
    -- Encrypted PHI fields
    encrypted_first_name TEXT NOT NULL,
    encrypted_last_name TEXT NOT NULL,
    encrypted_dob TEXT NOT NULL,
    encrypted_ssn TEXT,
    encrypted_phone TEXT,
    encrypted_email TEXT,
    encrypted_address_line1 TEXT,
    encrypted_address_line2 TEXT,
    encrypted_city TEXT,
    encrypted_state TEXT,
    encrypted_zip_code TEXT,
    
    -- Insurance information (encrypted)
    encrypted_insurance_primary_name TEXT,
    encrypted_insurance_primary_id TEXT,
    encrypted_insurance_primary_group TEXT,
    encrypted_insurance_secondary_name TEXT,
    encrypted_insurance_secondary_id TEXT,
    encrypted_insurance_secondary_group TEXT,
    
    -- Non-PHI fields
    gender TEXT,
    is_active INTEGER DEFAULT 1,
    
    -- Audit fields
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    created_by TEXT NOT NULL,
    updated_by TEXT,
    
    -- Encryption metadata
    encryption_version INTEGER DEFAULT 1,
    phi_hash TEXT -- For duplicate detection without decryption
);

-- =============================================
-- AUTHORIZATIONS TABLE
-- =============================================
CREATE TABLE authorizations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    
    -- Authorization details
    authorization_number TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'cancelled')),
    payer_name TEXT NOT NULL,
    payer_id TEXT,
    
    -- Service information
    service_code TEXT,
    service_description TEXT,
    diagnosis_codes TEXT, -- JSON array of ICD-10 codes
    
    -- Dates
    requested_date TEXT NOT NULL,
    effective_date TEXT,
    expiration_date TEXT,
    approved_date TEXT,
    denied_date TEXT,
    
    -- Clinical information
    clinical_notes TEXT,
    denial_reason TEXT,
    
    -- Audit fields
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    created_by TEXT NOT NULL,
    updated_by TEXT
);

-- =============================================
-- DOCUMENTS TABLE (ENCRYPTED STORAGE)
-- =============================================
CREATE TABLE documents (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    authorization_id TEXT REFERENCES authorizations(id) ON DELETE CASCADE,
    patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
    practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    
    -- Document metadata
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('medical_record', 'insurance_card', 'authorization_form', 'clinical_note', 'lab_result', 'imaging', 'other')),
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    
    -- Encrypted storage information
    encrypted_storage_url TEXT NOT NULL,
    encryption_key_id TEXT NOT NULL,
    file_hash TEXT NOT NULL, -- SHA-256 hash for integrity
    
    -- Access control
    is_phi INTEGER DEFAULT 1,
    access_level INTEGER DEFAULT 1, -- 1=restricted, 2=normal, 3=public
    
    -- Audit fields
    uploaded_at TEXT DEFAULT (datetime('now')),
    uploaded_by TEXT NOT NULL,
    last_accessed TEXT,
    access_count INTEGER DEFAULT 0,
    
    -- Retention policy
    retention_date TEXT,
    is_archived INTEGER DEFAULT 0
);

-- =============================================
-- AUDIT LOGS TABLE (COMPREHENSIVE LOGGING)
-- =============================================
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    
    -- Event information
    action TEXT NOT NULL CHECK (action IN ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT')),
    table_name TEXT,
    record_id TEXT,
    
    -- User information
    user_id TEXT,
    user_role TEXT CHECK (user_role IN ('admin', 'provider', 'staff', 'readonly')),
    practice_id TEXT REFERENCES practices(id),
    
    -- Request information
    ip_address TEXT,
    user_agent TEXT,
    session_id TEXT,
    
    -- Data changes (for UPDATE operations)
    old_values TEXT, -- JSON
    new_values TEXT, -- JSON
    
    -- Additional context
    description TEXT,
    risk_level INTEGER DEFAULT 1, -- 1=low, 2=medium, 3=high, 4=critical
    
    -- Timing
    timestamp TEXT DEFAULT (datetime('now')),
    
    -- Compliance
    hipaa_logged INTEGER DEFAULT 1,
    retention_date TEXT DEFAULT (date('now', '+7 years'))
);

-- =============================================
-- SYSTEM CONFIGURATION TABLE
-- =============================================
CREATE TABLE system_config (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT,
    description TEXT,
    is_encrypted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Practices indexes
CREATE INDEX idx_practices_npi ON practices(npi);
CREATE INDEX idx_practices_active ON practices(is_active);

-- Providers indexes
CREATE INDEX idx_providers_practice ON providers(practice_id);
CREATE INDEX idx_providers_npi ON providers(npi);
CREATE INDEX idx_providers_active ON providers(is_active);
CREATE INDEX idx_providers_email ON providers(email);

-- Patients indexes
CREATE INDEX idx_patients_practice ON patients(practice_id);
CREATE INDEX idx_patients_phi_hash ON patients(phi_hash);
CREATE INDEX idx_patients_active ON patients(is_active);
CREATE INDEX idx_patients_created ON patients(created_at);

-- Authorizations indexes
CREATE INDEX idx_authorizations_patient ON authorizations(patient_id);
CREATE INDEX idx_authorizations_provider ON authorizations(provider_id);
CREATE INDEX idx_authorizations_practice ON authorizations(practice_id);
CREATE INDEX idx_authorizations_status ON authorizations(status);
CREATE INDEX idx_authorizations_payer ON authorizations(payer_name);
CREATE INDEX idx_authorizations_dates ON authorizations(requested_date, effective_date, expiration_date);

-- Documents indexes
CREATE INDEX idx_documents_authorization ON documents(authorization_id);
CREATE INDEX idx_documents_patient ON documents(patient_id);
CREATE INDEX idx_documents_practice ON documents(practice_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_uploaded ON documents(uploaded_at);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_practice ON audit_logs(practice_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_record ON audit_logs(record_id);
CREATE INDEX idx_audit_logs_risk ON audit_logs(risk_level);

-- =============================================
-- INITIAL SYSTEM CONFIGURATION
-- =============================================

INSERT INTO system_config (config_key, config_value, description) VALUES
('hipaa_compliance_enabled', 'true', 'HIPAA compliance features enabled'),
('audit_retention_days', '2555', 'Audit log retention period in days (7 years)'),
('encryption_version', '1', 'Current encryption version for PHI data'),
('session_timeout_minutes', '30', 'User session timeout in minutes'),
('max_login_attempts', '5', 'Maximum failed login attempts before lockout'),
('lockout_duration_minutes', '15', 'Account lockout duration in minutes'),
('backup_encryption_enabled', 'true', 'Enable encryption for database backups'),
('phi_access_logging', 'true', 'Log all PHI access attempts');

-- =============================================
-- SAMPLE DATA FOR TESTING
-- =============================================

-- Insert a sample practice
INSERT INTO practices (id, name, npi, subscription_tier, address_line1, city, state, zip_code, phone, email, created_by)
VALUES ('practice-001', 'Demo Healthcare Practice', '1234567890', 'professional', '123 Medical Center Dr', 'Healthcare City', 'CA', '90210', '555-0123', 'admin@demopractice.com', 'system');

-- Insert a sample provider
INSERT INTO providers (id, practice_id, name, npi, specialty, email, role, password_hash, created_by)
VALUES ('provider-001', 'practice-001', 'Dr. John Smith', '9876543210', 'Internal Medicine', 'dr.smith@demopractice.com', 'provider', '$2b$10$example.hash.for.demo', 'system');

-- Insert a sample patient (with mock encrypted data)
INSERT INTO patients (id, practice_id, encrypted_first_name, encrypted_last_name, encrypted_dob, gender, phi_hash, created_by)
VALUES ('patient-001', 'practice-001', 'encrypted_jane', 'encrypted_doe', 'encrypted_1990-01-01', 'F', 'sample_hash_123', 'provider-001');

-- Insert a sample authorization
INSERT INTO authorizations (id, patient_id, provider_id, practice_id, payer_name, service_code, service_description, requested_date, status, created_by)
VALUES ('auth-001', 'patient-001', 'provider-001', 'practice-001', 'Demo Insurance Co', '99213', 'Office Visit - Established Patient', date('now'), 'pending', 'provider-001');