-- Create backup management tables for disaster recovery
-- HIPAA-compliant backup tracking and encryption key management

-- =============================================
-- BACKUP RECORDS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS backup_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly', 'yearly', 'manual')),
    
    -- Storage information
    size BIGINT NOT NULL DEFAULT 0,
    s3_location TEXT NOT NULL,
    encryption_key_id UUID NOT NULL,
    checksum VARCHAR(64) NOT NULL, -- SHA-256 checksum for integrity
    
    -- Backup metadata
    database_version VARCHAR(50),
    backup_method VARCHAR(50) DEFAULT 'pg_dump',
    compression_used BOOLEAN DEFAULT false,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'failed', 'corrupted')),
    error_message TEXT,
    
    -- Timing information
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Retention and compliance
    retention_date DATE NOT NULL,
    is_archived BOOLEAN DEFAULT false,
    compliance_verified BOOLEAN DEFAULT false,
    
    -- Constraints
    CONSTRAINT backup_records_name_not_empty CHECK (name != ''),
    CONSTRAINT backup_records_size_positive CHECK (size >= 0),
    CONSTRAINT backup_records_checksum_format CHECK (checksum ~ '^[a-f0-9]{64}$'),
    CONSTRAINT backup_records_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

-- =============================================
-- BACKUP ENCRYPTION KEYS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS backup_encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Encryption key data (encrypted at rest)
    key_data JSONB NOT NULL,
    
    -- Key metadata
    algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
    key_size INTEGER NOT NULL DEFAULT 256,
    
    -- Key lifecycle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit trail
    created_by UUID,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    
    -- Constraints
    CONSTRAINT backup_encryption_keys_algorithm_valid CHECK (algorithm IN ('aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305')),
    CONSTRAINT backup_encryption_keys_key_size_valid CHECK (key_size IN (128, 192, 256)),
    CONSTRAINT backup_encryption_keys_usage_count_positive CHECK (usage_count >= 0)
);

-- =============================================
-- BACKUP RESTORE LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS backup_restore_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES backup_records(id) ON DELETE CASCADE,
    
    -- Restore details
    restore_type VARCHAR(50) NOT NULL CHECK (restore_type IN ('full', 'partial', 'point_in_time', 'disaster_recovery')),
    target_database VARCHAR(255),
    restore_point TIMESTAMP WITH TIME ZONE,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'in_progress', 'completed', 'failed', 'cancelled')),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Results
    records_restored BIGINT DEFAULT 0,
    tables_restored INTEGER DEFAULT 0,
    error_message TEXT,
    
    -- Audit information
    initiated_by UUID NOT NULL,
    approved_by UUID,
    approval_required BOOLEAN DEFAULT true,
    
    -- Compliance
    reason TEXT NOT NULL,
    business_justification TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT backup_restore_logs_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT backup_restore_logs_records_positive CHECK (records_restored >= 0),
    CONSTRAINT backup_restore_logs_tables_positive CHECK (tables_restored >= 0)
);

-- =============================================
-- BACKUP VERIFICATION LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS backup_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES backup_records(id) ON DELETE CASCADE,
    
    -- Verification details
    verification_type VARCHAR(50) NOT NULL CHECK (verification_type IN ('integrity', 'restore_test', 'encryption', 'compliance')),
    verification_method VARCHAR(100) NOT NULL,
    
    -- Results
    status VARCHAR(20) NOT NULL CHECK (status IN ('passed', 'failed', 'warning', 'skipped')),
    score INTEGER CHECK (score >= 0 AND score <= 100),
    
    -- Details
    checks_performed JSONB,
    issues_found JSONB,
    recommendations JSONB,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Audit
    performed_by UUID,
    automated BOOLEAN DEFAULT true,
    
    -- Constraints
    CONSTRAINT backup_verification_logs_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Backup records indexes
CREATE INDEX IF NOT EXISTS idx_backup_records_type ON backup_records(type);
CREATE INDEX IF NOT EXISTS idx_backup_records_created_at ON backup_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_records_status ON backup_records(status);
CREATE INDEX IF NOT EXISTS idx_backup_records_retention_date ON backup_records(retention_date);
CREATE INDEX IF NOT EXISTS idx_backup_records_type_created ON backup_records(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_records_encryption_key ON backup_records(encryption_key_id);

-- Encryption keys indexes
CREATE INDEX IF NOT EXISTS idx_backup_encryption_keys_created_at ON backup_encryption_keys(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_encryption_keys_active ON backup_encryption_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_backup_encryption_keys_expires_at ON backup_encryption_keys(expires_at);

-- Restore logs indexes
CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_backup_id ON backup_restore_logs(backup_id);
CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_status ON backup_restore_logs(status);
CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_started_at ON backup_restore_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_initiated_by ON backup_restore_logs(initiated_by);

-- Verification logs indexes
CREATE INDEX IF NOT EXISTS idx_backup_verification_logs_backup_id ON backup_verification_logs(backup_id);
CREATE INDEX IF NOT EXISTS idx_backup_verification_logs_type ON backup_verification_logs(verification_type);
CREATE INDEX IF NOT EXISTS idx_backup_verification_logs_status ON backup_verification_logs(status);
CREATE INDEX IF NOT EXISTS idx_backup_verification_logs_started_at ON backup_verification_logs(started_at DESC);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all backup tables
ALTER TABLE backup_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_restore_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_verification_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for backup_records
CREATE POLICY backup_records_select_policy ON backup_records
    FOR SELECT
    USING (
        -- System admin can see all backups
        current_setting('app.current_user_role', true) IN ('admin', 'system_admin')
        OR
        -- Backup operators can see all backups
        current_setting('app.current_user_role', true) = 'backup_operator'
    );

CREATE POLICY backup_records_insert_policy ON backup_records
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_role', true) IN ('admin', 'system_admin', 'backup_operator')
    );

CREATE POLICY backup_records_update_policy ON backup_records
    FOR UPDATE
    USING (
        current_setting('app.current_user_role', true) IN ('admin', 'system_admin', 'backup_operator')
    );

-- RLS Policies for backup_encryption_keys (highly restricted)
CREATE POLICY backup_encryption_keys_select_policy ON backup_encryption_keys
    FOR SELECT
    USING (
        -- Only system admin and backup service can access encryption keys
        current_setting('app.current_user_role', true) IN ('system_admin', 'backup_service')
    );

CREATE POLICY backup_encryption_keys_insert_policy ON backup_encryption_keys
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_role', true) IN ('system_admin', 'backup_service')
    );

-- RLS Policies for backup_restore_logs
CREATE POLICY backup_restore_logs_select_policy ON backup_restore_logs
    FOR SELECT
    USING (
        -- System admin can see all restore logs
        current_setting('app.current_user_role', true) IN ('admin', 'system_admin')
        OR
        -- Users can see their own restore requests
        initiated_by = current_setting('app.current_user_id', true)::uuid
    );

CREATE POLICY backup_restore_logs_insert_policy ON backup_restore_logs
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_role', true) IN ('admin', 'system_admin', 'backup_operator')
    );

-- RLS Policies for backup_verification_logs
CREATE POLICY backup_verification_logs_select_policy ON backup_verification_logs
    FOR SELECT
    USING (
        current_setting('app.current_user_role', true) IN ('admin', 'system_admin', 'backup_operator')
    );

CREATE POLICY backup_verification_logs_insert_policy ON backup_verification_logs
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_role', true) IN ('admin', 'system_admin', 'backup_operator')
    );

-- =============================================
-- FUNCTIONS FOR BACKUP MANAGEMENT
-- =============================================

-- Function to update backup record status
CREATE OR REPLACE FUNCTION update_backup_status(
    p_backup_id UUID,
    p_status VARCHAR(20),
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE backup_records
    SET 
        status = p_status,
        error_message = p_error_message,
        completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END,
        duration_seconds = CASE 
            WHEN p_status IN ('completed', 'failed') AND started_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::INTEGER
            ELSE duration_seconds
        END
    WHERE id = p_backup_id;
    
    RETURN FOUND;
END;
$$;

-- Function to get backup statistics
CREATE OR REPLACE FUNCTION get_backup_statistics(
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    backup_type VARCHAR(50),
    total_backups BIGINT,
    successful_backups BIGINT,
    failed_backups BIGINT,
    total_size BIGINT,
    avg_duration_seconds NUMERIC,
    success_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        br.type,
        COUNT(*) as total_backups,
        COUNT(*) FILTER (WHERE br.status = 'completed') as successful_backups,
        COUNT(*) FILTER (WHERE br.status = 'failed') as failed_backups,
        COALESCE(SUM(br.size), 0) as total_size,
        ROUND(AVG(br.duration_seconds), 2) as avg_duration_seconds,
        ROUND(
            (COUNT(*) FILTER (WHERE br.status = 'completed')::NUMERIC / COUNT(*)::NUMERIC) * 100, 
            2
        ) as success_rate
    FROM backup_records br
    WHERE br.created_at >= CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL
    GROUP BY br.type
    ORDER BY br.type;
END;
$$;

-- Function to cleanup expired backups
CREATE OR REPLACE FUNCTION cleanup_expired_backups()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cleanup_count INTEGER := 0;
    backup_record RECORD;
BEGIN
    -- Find expired backups
    FOR backup_record IN
        SELECT id, name, type, s3_location, encryption_key_id
        FROM backup_records
        WHERE retention_date < CURRENT_DATE
        AND status = 'completed'
        AND is_archived = false
    LOOP
        -- Mark as archived (actual S3 deletion should be handled by application)
        UPDATE backup_records
        SET is_archived = true
        WHERE id = backup_record.id;
        
        -- Log the cleanup
        INSERT INTO audit_logs (
            action,
            table_name,
            record_id,
            description,
            metadata
        ) VALUES (
            'ARCHIVE',
            'backup_records',
            backup_record.id,
            'Backup archived due to retention policy',
            jsonb_build_object(
                'backup_name', backup_record.name,
                'backup_type', backup_record.type,
                'retention_date', CURRENT_DATE
            )
        );
        
        cleanup_count := cleanup_count + 1;
    END LOOP;
    
    RETURN cleanup_count;
END;
$$;

-- Function to verify backup integrity
CREATE OR REPLACE FUNCTION verify_backup_integrity(
    p_backup_id UUID,
    p_verification_type VARCHAR(50),
    p_status VARCHAR(20),
    p_checks_performed JSONB DEFAULT NULL,
    p_issues_found JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    verification_id UUID;
BEGIN
    INSERT INTO backup_verification_logs (
        backup_id,
        verification_type,
        verification_method,
        status,
        checks_performed,
        issues_found,
        completed_at,
        duration_seconds
    ) VALUES (
        p_backup_id,
        p_verification_type,
        'automated_checksum',
        p_status,
        p_checks_performed,
        p_issues_found,
        CURRENT_TIMESTAMP,
        0
    )
    RETURNING id INTO verification_id;
    
    -- Update backup compliance verification status
    UPDATE backup_records
    SET compliance_verified = (p_status = 'passed')
    WHERE id = p_backup_id;
    
    RETURN verification_id;
END;
$$;

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger to update encryption key usage
CREATE OR REPLACE FUNCTION update_encryption_key_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE backup_encryption_keys
        SET 
            last_used_at = CURRENT_TIMESTAMP,
            usage_count = usage_count + 1
        WHERE id = NEW.encryption_key_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER backup_records_encryption_key_usage_trigger
    AFTER INSERT ON backup_records
    FOR EACH ROW
    EXECUTE FUNCTION update_encryption_key_usage();

-- Trigger to set retention date based on backup type
CREATE OR REPLACE FUNCTION set_backup_retention_date()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.retention_date IS NULL THEN
        NEW.retention_date := CASE NEW.type
            WHEN 'daily' THEN CURRENT_DATE + INTERVAL '30 days'
            WHEN 'weekly' THEN CURRENT_DATE + INTERVAL '90 days'
            WHEN 'monthly' THEN CURRENT_DATE + INTERVAL '365 days'
            WHEN 'yearly' THEN CURRENT_DATE + INTERVAL '2555 days' -- 7 years
            WHEN 'manual' THEN CURRENT_DATE + INTERVAL '90 days'
            ELSE CURRENT_DATE + INTERVAL '30 days'
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER backup_records_retention_date_trigger
    BEFORE INSERT ON backup_records
    FOR EACH ROW
    EXECUTE FUNCTION set_backup_retention_date();

-- =============================================
-- VIEWS FOR REPORTING
-- =============================================

-- Backup dashboard view
CREATE OR REPLACE VIEW backup_dashboard AS
SELECT 
    br.type,
    COUNT(*) as total_backups,
    COUNT(*) FILTER (WHERE br.status = 'completed') as successful_backups,
    COUNT(*) FILTER (WHERE br.status = 'failed') as failed_backups,
    COUNT(*) FILTER (WHERE br.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as last_24h_backups,
    COALESCE(SUM(br.size), 0) as total_size_bytes,
    ROUND(AVG(br.duration_seconds), 2) as avg_duration_seconds,
    MAX(br.created_at) as last_backup_time,
    ROUND(
        (COUNT(*) FILTER (WHERE br.status = 'completed')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100, 
        2
    ) as success_rate_percentage
FROM backup_records br
WHERE br.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY br.type
ORDER BY br.type;

-- Recent backup activity view
CREATE OR REPLACE VIEW recent_backup_activity AS
SELECT 
    br.id,
    br.name,
    br.type,
    br.status,
    br.size,
    br.duration_seconds,
    br.created_at,
    br.completed_at,
    br.error_message,
    CASE 
        WHEN br.status = 'completed' THEN '✅'
        WHEN br.status = 'failed' THEN '❌'
        WHEN br.status = 'in_progress' THEN '⏳'
        ELSE '❓'
    END as status_icon
FROM backup_records br
ORDER BY br.created_at DESC
LIMIT 50;

-- =============================================
-- PERMISSIONS
-- =============================================

-- Grant permissions to authenticated users (adjust based on your roles)
GRANT SELECT ON backup_dashboard TO authenticated;
GRANT SELECT ON recent_backup_activity TO authenticated;

-- Grant function execution permissions
GRANT EXECUTE ON FUNCTION get_backup_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_backup_status(UUID, VARCHAR(20), TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_backup_integrity(UUID, VARCHAR(50), VARCHAR(20), JSONB, JSONB) TO authenticated;

-- Restrict sensitive functions to admin roles only
REVOKE EXECUTE ON FUNCTION cleanup_expired_backups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_backups() TO postgres;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE backup_records IS 'HIPAA-compliant backup tracking with encryption and retention management';
COMMENT ON TABLE backup_encryption_keys IS 'Secure storage of backup encryption keys with lifecycle management';
COMMENT ON TABLE backup_restore_logs IS 'Audit trail for all backup restore operations';
COMMENT ON TABLE backup_verification_logs IS 'Backup integrity and compliance verification logs';

COMMENT ON COLUMN backup_records.checksum IS 'SHA-256 checksum for backup integrity verification';
COMMENT ON COLUMN backup_records.retention_date IS 'Date when backup can be safely deleted per retention policy';
COMMENT ON COLUMN backup_encryption_keys.key_data IS 'Encrypted encryption key data (never store plaintext keys)';
COMMENT ON COLUMN backup_restore_logs.business_justification IS 'Required business justification for restore operation';

COMMENT ON FUNCTION cleanup_expired_backups() IS 'Automated cleanup of expired backups based on retention policy';
COMMENT ON FUNCTION get_backup_statistics(INTEGER) IS 'Generate backup statistics for specified number of days';
COMMENT ON FUNCTION verify_backup_integrity(UUID, VARCHAR(50), VARCHAR(20), JSONB, JSONB) IS 'Record backup integrity verification results';

COMMENT ON VIEW backup_dashboard IS 'Real-time backup status dashboard for monitoring';
COMMENT ON VIEW recent_backup_activity IS 'Recent backup operations with status indicators';