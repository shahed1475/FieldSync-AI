-- Compliance Alerts and Reports Tables
-- HIPAA-compliant compliance tracking and monitoring

-- Create compliance_alerts table
CREATE TABLE IF NOT EXISTS compliance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    details JSONB NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES providers(id),
    resolution_notes TEXT,
    practice_id UUID REFERENCES practices(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create compliance_reports table
CREATE TABLE IF NOT EXISTS compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly', 'quarterly')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    compliance_score DECIMAL(5,2) NOT NULL CHECK (compliance_score >= 0 AND compliance_score <= 100),
    report_data JSONB NOT NULL,
    practice_id UUID REFERENCES practices(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create compliance_metrics table for tracking key metrics over time
CREATE TABLE IF NOT EXISTS compliance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,2) NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- 'count', 'percentage', 'score', 'duration'
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    practice_id UUID REFERENCES practices(id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create compliance_violations table for detailed violation tracking
CREATE TABLE IF NOT EXISTS compliance_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    user_id UUID REFERENCES providers(id),
    practice_id UUID REFERENCES practices(id),
    audit_log_id UUID REFERENCES audit_logs(id),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES providers(id),
    resolution_action TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_timestamp ON compliance_alerts(timestamp);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_severity ON compliance_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_resolved ON compliance_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_practice ON compliance_alerts(practice_id);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_type ON compliance_reports(type);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_period ON compliance_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_practice ON compliance_reports(practice_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_score ON compliance_reports(compliance_score);

CREATE INDEX IF NOT EXISTS idx_compliance_metrics_name ON compliance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_compliance_metrics_timestamp ON compliance_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_compliance_metrics_practice ON compliance_metrics(practice_id);

CREATE INDEX IF NOT EXISTS idx_compliance_violations_type ON compliance_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_severity ON compliance_violations(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_detected ON compliance_violations(detected_at);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_resolved ON compliance_violations(resolved);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_practice ON compliance_violations(practice_id);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_user ON compliance_violations(user_id);

-- Enable Row Level Security
ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for compliance_alerts
CREATE POLICY "compliance_alerts_select_policy" ON compliance_alerts
    FOR SELECT USING (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid()
        )
    );

CREATE POLICY "compliance_alerts_insert_policy" ON compliance_alerts
    FOR INSERT WITH CHECK (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid() AND role IN ('admin', 'compliance_officer')
        )
    );

CREATE POLICY "compliance_alerts_update_policy" ON compliance_alerts
    FOR UPDATE USING (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid() AND role IN ('admin', 'compliance_officer')
        )
    );

-- RLS Policies for compliance_reports
CREATE POLICY "compliance_reports_select_policy" ON compliance_reports
    FOR SELECT USING (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid()
        )
    );

CREATE POLICY "compliance_reports_insert_policy" ON compliance_reports
    FOR INSERT WITH CHECK (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid() AND role IN ('admin', 'compliance_officer')
        )
    );

-- RLS Policies for compliance_metrics
CREATE POLICY "compliance_metrics_select_policy" ON compliance_metrics
    FOR SELECT USING (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid()
        )
    );

CREATE POLICY "compliance_metrics_insert_policy" ON compliance_metrics
    FOR INSERT WITH CHECK (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid() AND role IN ('admin', 'compliance_officer')
        )
    );

-- RLS Policies for compliance_violations
CREATE POLICY "compliance_violations_select_policy" ON compliance_violations
    FOR SELECT USING (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid()
        )
    );

CREATE POLICY "compliance_violations_insert_policy" ON compliance_violations
    FOR INSERT WITH CHECK (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid() AND role IN ('admin', 'compliance_officer')
        )
    );

CREATE POLICY "compliance_violations_update_policy" ON compliance_violations
    FOR UPDATE USING (
        practice_id IS NULL OR 
        practice_id IN (
            SELECT practice_id FROM provider_practices 
            WHERE provider_id = auth.uid() AND role IN ('admin', 'compliance_officer')
        )
    );

-- Create functions for compliance tracking

-- Function to automatically resolve old alerts
CREATE OR REPLACE FUNCTION auto_resolve_old_alerts()
RETURNS INTEGER AS $$
DECLARE
    resolved_count INTEGER;
BEGIN
    -- Auto-resolve low severity alerts older than 30 days
    UPDATE compliance_alerts 
    SET resolved = TRUE,
        resolved_at = NOW(),
        resolution_notes = 'Auto-resolved: Alert older than 30 days'
    WHERE severity = 'low' 
        AND resolved = FALSE 
        AND timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    
    -- Auto-resolve medium severity alerts older than 60 days
    UPDATE compliance_alerts 
    SET resolved = TRUE,
        resolved_at = NOW(),
        resolution_notes = 'Auto-resolved: Alert older than 60 days'
    WHERE severity = 'medium' 
        AND resolved = FALSE 
        AND timestamp < NOW() - INTERVAL '60 days';
    
    GET DIAGNOSTICS resolved_count = resolved_count + ROW_COUNT;
    
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate compliance score
CREATE OR REPLACE FUNCTION calculate_compliance_score(
    p_practice_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    base_score DECIMAL(5,2) := 100.00;
    violation_count INTEGER;
    critical_violations INTEGER;
    high_violations INTEGER;
    medium_violations INTEGER;
    failed_logins INTEGER;
    total_logins INTEGER;
    login_success_rate DECIMAL(5,4);
BEGIN
    -- Count violations by severity
    SELECT 
        COUNT(*) FILTER (WHERE severity = 'critical'),
        COUNT(*) FILTER (WHERE severity = 'high'),
        COUNT(*) FILTER (WHERE severity = 'medium'),
        COUNT(*)
    INTO critical_violations, high_violations, medium_violations, violation_count
    FROM compliance_violations
    WHERE detected_at BETWEEN p_start_date AND p_end_date
        AND (p_practice_id IS NULL OR practice_id = p_practice_id)
        AND resolved = FALSE;
    
    -- Get login statistics
    SELECT 
        COUNT(*) FILTER (WHERE description ILIKE '%failed%'),
        COUNT(*)
    INTO failed_logins, total_logins
    FROM audit_logs
    WHERE action = 'LOGIN'
        AND timestamp BETWEEN p_start_date AND p_end_date
        AND (p_practice_id IS NULL OR practice_id = p_practice_id);
    
    -- Calculate login success rate
    IF total_logins > 0 THEN
        login_success_rate := (total_logins - failed_logins)::DECIMAL / total_logins;
    ELSE
        login_success_rate := 1.0;
    END IF;
    
    -- Deduct points for violations
    base_score := base_score - (critical_violations * 20);
    base_score := base_score - (high_violations * 10);
    base_score := base_score - (medium_violations * 5);
    
    -- Deduct points for poor login success rate
    IF login_success_rate < 0.95 THEN
        base_score := base_score - ((0.95 - login_success_rate) * 100);
    END IF;
    
    -- Ensure score is between 0 and 100
    RETURN GREATEST(0.00, LEAST(100.00, base_score));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log compliance metrics
CREATE OR REPLACE FUNCTION log_compliance_metric(
    p_metric_name VARCHAR(100),
    p_metric_value DECIMAL(10,2),
    p_metric_type VARCHAR(50),
    p_practice_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    metric_id UUID;
BEGIN
    INSERT INTO compliance_metrics (
        metric_name,
        metric_value,
        metric_type,
        practice_id,
        metadata
    ) VALUES (
        p_metric_name,
        p_metric_value,
        p_metric_type,
        p_practice_id,
        p_metadata
    ) RETURNING id INTO metric_id;
    
    RETURN metric_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create compliance violation
CREATE OR REPLACE FUNCTION create_compliance_violation(
    p_violation_type VARCHAR(100),
    p_severity VARCHAR(20),
    p_description TEXT,
    p_user_id UUID DEFAULT NULL,
    p_practice_id UUID DEFAULT NULL,
    p_audit_log_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    violation_id UUID;
BEGIN
    INSERT INTO compliance_violations (
        violation_type,
        severity,
        description,
        user_id,
        practice_id,
        audit_log_id,
        metadata
    ) VALUES (
        p_violation_type,
        p_severity,
        p_description,
        p_user_id,
        p_practice_id,
        p_audit_log_id,
        p_metadata
    ) RETURNING id INTO violation_id;
    
    RETURN violation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_compliance_alerts_updated_at
    BEFORE UPDATE ON compliance_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compliance_reports_updated_at
    BEFORE UPDATE ON compliance_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compliance_violations_updated_at
    BEFORE UPDATE ON compliance_violations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create view for compliance dashboard
CREATE OR REPLACE VIEW compliance_dashboard AS
SELECT 
    p.id as practice_id,
    p.name as practice_name,
    calculate_compliance_score(p.id) as current_score,
    (
        SELECT COUNT(*) 
        FROM compliance_alerts ca 
        WHERE ca.practice_id = p.id 
            AND ca.resolved = FALSE
    ) as open_alerts,
    (
        SELECT COUNT(*) 
        FROM compliance_violations cv 
        WHERE cv.practice_id = p.id 
            AND cv.resolved = FALSE
    ) as open_violations,
    (
        SELECT COUNT(*) 
        FROM audit_logs al 
        WHERE al.practice_id = p.id 
            AND al.timestamp >= NOW() - INTERVAL '24 hours'
    ) as daily_audit_events,
    (
        SELECT COUNT(*) 
        FROM audit_logs al 
        WHERE al.practice_id = p.id 
            AND al.timestamp >= NOW() - INTERVAL '24 hours'
            AND al.table_name IN ('patients', 'documents')
    ) as daily_phi_access
FROM practices p;

-- Grant permissions
GRANT SELECT ON compliance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_compliance_score TO authenticated;
GRANT EXECUTE ON FUNCTION log_compliance_metric TO authenticated;
GRANT EXECUTE ON FUNCTION create_compliance_violation TO authenticated;

-- Create notification function for critical alerts
CREATE OR REPLACE FUNCTION notify_critical_alert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.severity = 'critical' THEN
        PERFORM pg_notify(
            'critical_compliance_alert',
            json_build_object(
                'alert_id', NEW.id,
                'title', NEW.title,
                'practice_id', NEW.practice_id,
                'timestamp', NEW.timestamp
            )::text
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compliance_alert_notification
    AFTER INSERT ON compliance_alerts
    FOR EACH ROW
    EXECUTE FUNCTION notify_critical_alert();

-- Comments for documentation
COMMENT ON TABLE compliance_alerts IS 'Stores compliance alerts and notifications';
COMMENT ON TABLE compliance_reports IS 'Stores generated compliance reports';
COMMENT ON TABLE compliance_metrics IS 'Tracks compliance metrics over time';
COMMENT ON TABLE compliance_violations IS 'Detailed tracking of compliance violations';
COMMENT ON VIEW compliance_dashboard IS 'Real-time compliance status dashboard';
COMMENT ON FUNCTION calculate_compliance_score IS 'Calculates compliance score based on violations and metrics';
COMMENT ON FUNCTION log_compliance_metric IS 'Logs a compliance metric for tracking';
COMMENT ON FUNCTION create_compliance_violation IS 'Creates a new compliance violation record';