-- Create password history table for tracking password reuse
-- This supports HIPAA compliance requirements for password management

CREATE TABLE IF NOT EXISTS password_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT password_history_user_id_not_null CHECK (user_id IS NOT NULL),
    CONSTRAINT password_history_password_hash_not_null CHECK (password_hash IS NOT NULL AND password_hash != '')
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_password_history_created_at ON password_history(created_at);
CREATE INDEX IF NOT EXISTS idx_password_history_user_created ON password_history(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE password_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only system and the user themselves can access password history
CREATE POLICY password_history_select_policy ON password_history
    FOR SELECT
    USING (
        -- System admin can see all
        current_setting('app.current_user_role', true) = 'admin'
        OR
        -- Users can only see their own password history
        user_id = current_setting('app.current_user_id', true)::uuid
    );

-- Only system can insert password history
CREATE POLICY password_history_insert_policy ON password_history
    FOR INSERT
    WITH CHECK (
        -- Only system processes can insert (no user role check)
        current_setting('app.bypass_rls', true) = 'true'
        OR
        current_setting('app.current_user_role', true) = 'admin'
    );

-- No updates allowed on password history (immutable audit trail)
CREATE POLICY password_history_no_update_policy ON password_history
    FOR UPDATE
    USING (false);

-- Only system admin can delete (for cleanup)
CREATE POLICY password_history_delete_policy ON password_history
    FOR DELETE
    USING (
        current_setting('app.current_user_role', true) = 'admin'
    );

-- Create function to automatically clean up old password history
CREATE OR REPLACE FUNCTION cleanup_password_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Keep only the last 12 passwords per user (configurable)
    DELETE FROM password_history
    WHERE id NOT IN (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
            FROM password_history
        ) ranked
        WHERE rn <= 12
    );
    
    -- Log cleanup activity
    INSERT INTO audit_logs (
        event_type,
        action,
        resource_type,
        user_id,
        metadata,
        created_at
    ) VALUES (
        'system_maintenance',
        'password_history_cleanup',
        'password_history',
        '00000000-0000-0000-0000-000000000000'::uuid, -- System user
        jsonb_build_object(
            'cleanup_timestamp', CURRENT_TIMESTAMP,
            'retention_count', 12
        ),
        CURRENT_TIMESTAMP
    );
END;
$$;

-- Create function to add password to history
CREATE OR REPLACE FUNCTION add_password_to_history(
    p_user_id UUID,
    p_password_hash TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert new password into history
    INSERT INTO password_history (user_id, password_hash, created_at)
    VALUES (p_user_id, p_password_hash, CURRENT_TIMESTAMP);
    
    -- Clean up old entries for this user (keep last 12)
    DELETE FROM password_history
    WHERE user_id = p_user_id
    AND id NOT IN (
        SELECT id
        FROM password_history
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 12
    );
END;
$$;

-- Create trigger to automatically add password to history when provider password changes
CREATE OR REPLACE FUNCTION trigger_add_password_to_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only add to history if password actually changed
    IF TG_OP = 'UPDATE' AND OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
        PERFORM add_password_to_history(NEW.id, NEW.password_hash);
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM add_password_to_history(NEW.id, NEW.password_hash);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on providers table
DROP TRIGGER IF EXISTS providers_password_history_trigger ON providers;
CREATE TRIGGER providers_password_history_trigger
    AFTER INSERT OR UPDATE OF password_hash ON providers
    FOR EACH ROW
    EXECUTE FUNCTION trigger_add_password_to_history();

-- Add password-related columns to providers table if they don't exist
DO $$
BEGIN
    -- Add password_changed_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'providers' AND column_name = 'password_changed_at') THEN
        ALTER TABLE providers ADD COLUMN password_changed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add password_expires_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'providers' AND column_name = 'password_expires_at') THEN
        ALTER TABLE providers ADD COLUMN password_expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add failed_login_attempts column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'providers' AND column_name = 'failed_login_attempts') THEN
        ALTER TABLE providers ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
    END IF;
    
    -- Add locked_until column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'providers' AND column_name = 'locked_until') THEN
        ALTER TABLE providers ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add lockout_count column for progressive lockouts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'providers' AND column_name = 'lockout_count') THEN
        ALTER TABLE providers ADD COLUMN lockout_count INTEGER DEFAULT 0;
    END IF;
    
    -- Add last_lockout_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'providers' AND column_name = 'last_lockout_at') THEN
        ALTER TABLE providers ADD COLUMN last_lockout_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add password_warning_sent column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'providers' AND column_name = 'password_warning_sent') THEN
        ALTER TABLE providers ADD COLUMN password_warning_sent BOOLEAN DEFAULT false;
    END IF;
END
$$;

-- Create function to update password expiry
CREATE OR REPLACE FUNCTION update_password_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update password_changed_at and calculate expiry when password changes
    IF TG_OP = 'UPDATE' AND OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
        NEW.password_changed_at = CURRENT_TIMESTAMP;
        NEW.password_expires_at = CURRENT_TIMESTAMP + INTERVAL '90 days'; -- 90 days from policy
        NEW.password_warning_sent = false;
    ELSIF TG_OP = 'INSERT' THEN
        NEW.password_changed_at = CURRENT_TIMESTAMP;
        NEW.password_expires_at = CURRENT_TIMESTAMP + INTERVAL '90 days';
        NEW.password_warning_sent = false;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for password expiry
DROP TRIGGER IF EXISTS providers_password_expiry_trigger ON providers;
CREATE TRIGGER providers_password_expiry_trigger
    BEFORE INSERT OR UPDATE OF password_hash ON providers
    FOR EACH ROW
    EXECUTE FUNCTION update_password_expiry();

-- Create indexes on new columns
CREATE INDEX IF NOT EXISTS idx_providers_password_expires_at ON providers(password_expires_at);
CREATE INDEX IF NOT EXISTS idx_providers_locked_until ON providers(locked_until);
CREATE INDEX IF NOT EXISTS idx_providers_failed_attempts ON providers(failed_login_attempts);

-- Create view for password policy compliance monitoring
CREATE OR REPLACE VIEW password_policy_compliance AS
SELECT 
    p.id,
    p.name,
    p.email,
    p.role,
    p.practice_id,
    p.password_changed_at,
    p.password_expires_at,
    p.failed_login_attempts,
    p.locked_until,
    p.lockout_count,
    p.last_lockout_at,
    p.password_warning_sent,
    
    -- Compliance status
    CASE 
        WHEN p.password_expires_at < CURRENT_TIMESTAMP THEN 'EXPIRED'
        WHEN p.password_expires_at < CURRENT_TIMESTAMP + INTERVAL '14 days' THEN 'EXPIRING_SOON'
        ELSE 'COMPLIANT'
    END as password_status,
    
    -- Days until expiry
    EXTRACT(DAYS FROM (p.password_expires_at - CURRENT_TIMESTAMP))::INTEGER as days_until_expiry,
    
    -- Account status
    CASE 
        WHEN p.locked_until > CURRENT_TIMESTAMP THEN 'LOCKED'
        WHEN p.failed_login_attempts >= 5 THEN 'HIGH_RISK'
        ELSE 'NORMAL'
    END as account_status,
    
    -- Password history count
    COALESCE(ph.history_count, 0) as password_history_count,
    
    p.created_at,
    p.updated_at
FROM providers p
LEFT JOIN (
    SELECT 
        user_id,
        COUNT(*) as history_count
    FROM password_history
    GROUP BY user_id
) ph ON p.id = ph.user_id
WHERE p.is_active = true;

-- Grant appropriate permissions
GRANT SELECT ON password_policy_compliance TO authenticated;

-- Add comments
COMMENT ON TABLE password_history IS 'Stores password history for preventing password reuse - HIPAA compliance requirement';
COMMENT ON COLUMN password_history.user_id IS 'Reference to the provider who owns this password history';
COMMENT ON COLUMN password_history.password_hash IS 'Hashed password (bcrypt) - never store plaintext';
COMMENT ON COLUMN password_history.created_at IS 'When this password was set';

COMMENT ON FUNCTION cleanup_password_history() IS 'Automated cleanup function to maintain password history retention policy';
COMMENT ON FUNCTION add_password_to_history(UUID, TEXT) IS 'Safely add password to history with automatic cleanup';
COMMENT ON VIEW password_policy_compliance IS 'Monitoring view for password policy compliance and security status';

-- Create scheduled job for password expiry notifications (if pg_cron is available)
-- This would typically be handled by the application, but can be done at DB level
CREATE OR REPLACE FUNCTION notify_password_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expiring_user RECORD;
BEGIN
    -- Find users whose passwords expire in 14 days and haven't been warned
    FOR expiring_user IN
        SELECT id, name, email, password_expires_at
        FROM providers
        WHERE password_expires_at BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '14 days'
        AND password_warning_sent = false
        AND is_active = true
    LOOP
        -- Log the notification (application should pick this up)
        INSERT INTO audit_logs (
            event_type,
            action,
            resource_type,
            resource_id,
            user_id,
            metadata,
            created_at
        ) VALUES (
            'password_expiry_warning',
            'notification_required',
            'provider',
            expiring_user.id,
            expiring_user.id,
            jsonb_build_object(
                'email', expiring_user.email,
                'name', expiring_user.name,
                'expires_at', expiring_user.password_expires_at,
                'days_remaining', EXTRACT(DAYS FROM (expiring_user.password_expires_at - CURRENT_TIMESTAMP))
            ),
            CURRENT_TIMESTAMP
        );
        
        -- Mark as warned
        UPDATE providers
        SET password_warning_sent = true
        WHERE id = expiring_user.id;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION notify_password_expiry() IS 'Function to identify users needing password expiry notifications';