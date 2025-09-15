-- ClaimFlow AI Database Schema
-- HIPAA-Compliant Healthcare Data Management System
-- Created: 2024

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create custom types
CREATE TYPE subscription_tier AS ENUM ('basic', 'professional', 'enterprise');
CREATE TYPE authorization_status AS ENUM ('pending', 'approved', 'denied', 'expired', 'cancelled');
CREATE TYPE document_type AS ENUM ('medical_record', 'insurance_card', 'authorization_form', 'clinical_note', 'lab_result', 'imaging', 'other');
CREATE TYPE audit_action AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT');
CREATE TYPE user_role AS ENUM ('admin', 'provider', 'staff', 'readonly');

-- =============================================
-- PRACTICES TABLE
-- =============================================
CREATE TABLE practices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    npi VARCHAR(10) UNIQUE NOT NULL CHECK (npi ~ '^[0-9]{10}$'),
    subscription_tier subscription_tier NOT NULL DEFAULT 'basic',
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(255),
    tax_id VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    hipaa_compliance_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- =============================================
-- PROVIDERS TABLE
-- =============================================
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    npi VARCHAR(10) UNIQUE NOT NULL CHECK (npi ~ '^[0-9]{10}$'),
    specialty VARCHAR(100),
    license_number VARCHAR(50),
    license_state VARCHAR(2),
    dea_number VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(20),
    role user_role DEFAULT 'provider',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    password_hash VARCHAR(255),
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- =============================================
-- PATIENTS TABLE (PHI ENCRYPTED)
-- =============================================
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    
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
    gender VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_by UUID,
    
    -- Encryption metadata
    encryption_version INTEGER DEFAULT 1,
    phi_hash VARCHAR(64) -- For duplicate detection without decryption
);

-- =============================================
-- AUTHORIZATIONS TABLE
-- =============================================
CREATE TABLE authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    
    -- Authorization details
    authorization_number VARCHAR(50),
    status authorization_status DEFAULT 'pending',
    payer_name VARCHAR(255) NOT NULL,
    payer_id VARCHAR(50),
    
    -- Service information
    service_code VARCHAR(20),
    service_description TEXT,
    diagnosis_codes TEXT[], -- Array of ICD-10 codes
    
    -- Dates
    requested_date DATE NOT NULL,
    effective_date DATE,
    expiration_date DATE,
    approved_date DATE,
    denied_date DATE,
    
    -- Clinical information
    clinical_notes TEXT,
    denial_reason TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_by UUID,
    
    -- Constraints
    CONSTRAINT valid_dates CHECK (
        (approved_date IS NULL OR approved_date >= requested_date) AND
        (denied_date IS NULL OR denied_date >= requested_date) AND
        (expiration_date IS NULL OR expiration_date > effective_date)
    )
);

-- =============================================
-- DOCUMENTS TABLE (ENCRYPTED STORAGE)
-- =============================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    authorization_id UUID REFERENCES authorizations(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    
    -- Document metadata
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    document_type document_type NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    
    -- Encrypted storage information
    encrypted_storage_url TEXT NOT NULL,
    encryption_key_id VARCHAR(100) NOT NULL,
    file_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for integrity
    
    -- Access control
    is_phi BOOLEAN DEFAULT true,
    access_level INTEGER DEFAULT 1, -- 1=restricted, 2=normal, 3=public
    
    -- Audit fields
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_by UUID NOT NULL,
    last_accessed TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0,
    
    -- Retention policy
    retention_date DATE,
    is_archived BOOLEAN DEFAULT false
);

-- =============================================
-- AUDIT LOGS TABLE (COMPREHENSIVE LOGGING)
-- =============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Event information
    action audit_action NOT NULL,
    table_name VARCHAR(50),
    record_id UUID,
    
    -- User information
    user_id UUID,
    user_role user_role,
    practice_id UUID REFERENCES practices(id),
    
    -- Request information
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    
    -- Data changes (for UPDATE operations)
    old_values JSONB,
    new_values JSONB,
    
    -- Additional context
    description TEXT,
    risk_level INTEGER DEFAULT 1, -- 1=low, 2=medium, 3=high, 4=critical
    
    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Compliance
    hipaa_logged BOOLEAN DEFAULT true,
    retention_date DATE DEFAULT (CURRENT_DATE + INTERVAL '7 years')
);

-- =============================================
-- SYSTEM CONFIGURATION TABLE
-- =============================================
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID
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
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- TRIGGERS FOR AUDIT LOGGING
-- =============================================

-- Function to log all data changes
CREATE OR REPLACE FUNCTION log_data_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values, user_id, description)
        VALUES ('DELETE', TG_TABLE_NAME, OLD.id, row_to_json(OLD), current_setting('app.current_user_id', true)::UUID, 'Record deleted');
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values, user_id, description)
        VALUES ('UPDATE', TG_TABLE_NAME, NEW.id, row_to_json(OLD), row_to_json(NEW), current_setting('app.current_user_id', true)::UUID, 'Record updated');
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (action, table_name, record_id, new_values, user_id, description)
        VALUES ('CREATE', TG_TABLE_NAME, NEW.id, row_to_json(NEW), current_setting('app.current_user_id', true)::UUID, 'Record created');
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for all main tables
CREATE TRIGGER practices_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON practices
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

CREATE TRIGGER providers_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON providers
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

CREATE TRIGGER patients_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

CREATE TRIGGER authorizations_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON authorizations
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

CREATE TRIGGER documents_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

-- =============================================
-- FUNCTIONS FOR UPDATED_AT TIMESTAMPS
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at triggers
CREATE TRIGGER practices_updated_at_trigger
    BEFORE UPDATE ON practices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER providers_updated_at_trigger
    BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER patients_updated_at_trigger
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER authorizations_updated_at_trigger
    BEFORE UPDATE ON authorizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
-- COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE practices IS 'Healthcare practices/organizations using the system';
COMMENT ON TABLE providers IS 'Healthcare providers within practices';
COMMENT ON TABLE patients IS 'Patient records with encrypted PHI data';
COMMENT ON TABLE authorizations IS 'Prior authorization requests and approvals';
COMMENT ON TABLE documents IS 'Encrypted document storage with access controls';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for HIPAA compliance';
COMMENT ON TABLE system_config IS 'System-wide configuration settings';

COMMENT ON COLUMN patients.encrypted_first_name IS 'AES-256 encrypted patient first name';
COMMENT ON COLUMN patients.encrypted_last_name IS 'AES-256 encrypted patient last name';
COMMENT ON COLUMN patients.encrypted_dob IS 'AES-256 encrypted date of birth';
COMMENT ON COLUMN patients.phi_hash IS 'SHA-256 hash for duplicate detection without decryption';
COMMENT ON COLUMN documents.encrypted_storage_url IS 'Encrypted URL to document storage location';
COMMENT ON COLUMN audit_logs.retention_date IS 'Date when audit log can be archived (7 years from creation)';

-- Grant necessary permissions (adjust based on your user roles)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;