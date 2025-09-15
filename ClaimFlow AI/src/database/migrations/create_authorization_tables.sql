-- Authorization Workflow Database Schema
-- This migration creates tables for prior authorization workflow management

-- Authorization requests table
CREATE TABLE IF NOT EXISTS authorization_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL,
    payer_name VARCHAR(255) NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    procedure_codes TEXT[], -- Array of CPT/HCPCS codes
    diagnosis_codes TEXT[], -- Array of ICD-10 codes
    service_date DATE,
    urgency_level VARCHAR(20) DEFAULT 'routine' CHECK (urgency_level IN ('urgent', 'expedited', 'routine')),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'pending', 'approved', 'denied', 'cancelled', 'expired')),
    workflow_state VARCHAR(50) DEFAULT 'intake' CHECK (workflow_state IN ('intake', 'validation', 'payer_review', 'clinical_review', 'decision', 'appeal', 'completed')),
    priority_score INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10,2),
    clinical_notes TEXT,
    supporting_documents JSONB DEFAULT '[]',
    fhir_bundle_id VARCHAR(255),
    external_reference VARCHAR(255),
    submitted_at TIMESTAMP WITH TIME ZONE,
    decision_date TIMESTAMP WITH TIME ZONE,
    expiry_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Authorization workflow states tracking
CREATE TABLE IF NOT EXISTS authorization_workflow_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authorization_id UUID NOT NULL REFERENCES authorization_requests(id) ON DELETE CASCADE,
    state VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    entered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    exited_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    notes TEXT,
    automated BOOLEAN DEFAULT false,
    user_id UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}'
);

-- Payer requirements and rules
CREATE TABLE IF NOT EXISTS payer_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID NOT NULL,
    payer_name VARCHAR(255) NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    procedure_codes TEXT[],
    diagnosis_codes TEXT[],
    requirements JSONB NOT NULL, -- Structured requirements data
    documentation_needed TEXT[],
    processing_time_days INTEGER DEFAULT 14,
    auto_approval_criteria JSONB DEFAULT '{}',
    denial_criteria JSONB DEFAULT '{}',
    appeal_process JSONB DEFAULT '{}',
    effective_date DATE NOT NULL,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id)
);

-- Authorization decisions and outcomes
CREATE TABLE IF NOT EXISTS authorization_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authorization_id UUID NOT NULL REFERENCES authorization_requests(id) ON DELETE CASCADE,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'denied', 'partial', 'pending_info')),
    decision_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decision_reason TEXT,
    approved_services JSONB DEFAULT '[]',
    denied_services JSONB DEFAULT '[]',
    conditions TEXT,
    valid_from DATE,
    valid_until DATE,
    authorization_number VARCHAR(100),
    reviewer_name VARCHAR(255),
    reviewer_contact VARCHAR(255),
    appeal_deadline DATE,
    decision_letter_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- FHIR resources for EHR integration
CREATE TABLE IF NOT EXISTS fhir_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authorization_id UUID REFERENCES authorization_requests(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    fhir_version VARCHAR(10) DEFAULT '4.0.1',
    resource_data JSONB NOT NULL,
    source_system VARCHAR(100),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Authorization notifications
CREATE TABLE IF NOT EXISTS authorization_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authorization_id UUID NOT NULL REFERENCES authorization_requests(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('status_update', 'decision', 'reminder', 'expiry_warning', 'appeal_deadline')),
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('patient', 'provider', 'practice', 'payer')),
    recipient_id UUID NOT NULL,
    delivery_method VARCHAR(20) NOT NULL CHECK (delivery_method IN ('email', 'sms', 'in_app', 'fax')),
    recipient_address VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    template_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Smart field detection templates
CREATE TABLE IF NOT EXISTS intake_form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    payer_id UUID,
    form_schema JSONB NOT NULL, -- JSON schema for form fields
    field_mappings JSONB NOT NULL, -- Mapping to database fields
    validation_rules JSONB DEFAULT '{}',
    auto_population_rules JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_auth_requests_patient ON authorization_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_auth_requests_provider ON authorization_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_auth_requests_practice ON authorization_requests(practice_id);
CREATE INDEX IF NOT EXISTS idx_auth_requests_status ON authorization_requests(status);
CREATE INDEX IF NOT EXISTS idx_auth_requests_workflow_state ON authorization_requests(workflow_state);
CREATE INDEX IF NOT EXISTS idx_auth_requests_created_at ON authorization_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_requests_payer ON authorization_requests(payer_id);
CREATE INDEX IF NOT EXISTS idx_auth_requests_service_date ON authorization_requests(service_date);

CREATE INDEX IF NOT EXISTS idx_workflow_states_auth_id ON authorization_workflow_states(authorization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_states_entered_at ON authorization_workflow_states(entered_at);

CREATE INDEX IF NOT EXISTS idx_payer_requirements_payer ON payer_requirements(payer_id);
CREATE INDEX IF NOT EXISTS idx_payer_requirements_service_type ON payer_requirements(service_type);
CREATE INDEX IF NOT EXISTS idx_payer_requirements_active ON payer_requirements(is_active);

CREATE INDEX IF NOT EXISTS idx_auth_decisions_auth_id ON authorization_decisions(authorization_id);
CREATE INDEX IF NOT EXISTS idx_auth_decisions_decision_date ON authorization_decisions(decision_date);

CREATE INDEX IF NOT EXISTS idx_fhir_resources_auth_id ON fhir_resources(authorization_id);
CREATE INDEX IF NOT EXISTS idx_fhir_resources_type ON fhir_resources(resource_type);

CREATE INDEX IF NOT EXISTS idx_auth_notifications_auth_id ON authorization_notifications(authorization_id);
CREATE INDEX IF NOT EXISTS idx_auth_notifications_status ON authorization_notifications(status);
CREATE INDEX IF NOT EXISTS idx_auth_notifications_created_at ON authorization_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_intake_templates_service_type ON intake_form_templates(service_type);
CREATE INDEX IF NOT EXISTS idx_intake_templates_active ON intake_form_templates(is_active);

-- Row Level Security (RLS) policies
ALTER TABLE authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE payer_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_form_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for authorization_requests
CREATE POLICY auth_requests_practice_isolation ON authorization_requests
    FOR ALL USING (
        practice_id IN (
            SELECT practice_id FROM user_practices 
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- RLS policies for workflow states
CREATE POLICY workflow_states_practice_isolation ON authorization_workflow_states
    FOR ALL USING (
        authorization_id IN (
            SELECT id FROM authorization_requests 
            WHERE practice_id IN (
                SELECT practice_id FROM user_practices 
                WHERE user_id = current_setting('app.current_user_id')::UUID
            )
        )
    );

-- RLS policies for decisions
CREATE POLICY auth_decisions_practice_isolation ON authorization_decisions
    FOR ALL USING (
        authorization_id IN (
            SELECT id FROM authorization_requests 
            WHERE practice_id IN (
                SELECT practice_id FROM user_practices 
                WHERE user_id = current_setting('app.current_user_id')::UUID
            )
        )
    );

-- RLS policies for FHIR resources
CREATE POLICY fhir_resources_practice_isolation ON fhir_resources
    FOR ALL USING (
        authorization_id IN (
            SELECT id FROM authorization_requests 
            WHERE practice_id IN (
                SELECT practice_id FROM user_practices 
                WHERE user_id = current_setting('app.current_user_id')::UUID
            )
        )
    );

-- RLS policies for notifications
CREATE POLICY auth_notifications_practice_isolation ON authorization_notifications
    FOR ALL USING (
        authorization_id IN (
            SELECT id FROM authorization_requests 
            WHERE practice_id IN (
                SELECT practice_id FROM user_practices 
                WHERE user_id = current_setting('app.current_user_id')::UUID
            )
        )
    );

-- Functions for workflow management
CREATE OR REPLACE FUNCTION update_authorization_workflow_state(
    p_authorization_id UUID,
    p_new_state VARCHAR(50),
    p_new_status VARCHAR(50),
    p_notes TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_current_state_id UUID;
    v_entered_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Close current state
    UPDATE authorization_workflow_states 
    SET exited_at = CURRENT_TIMESTAMP,
        duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - entered_at)) / 60
    WHERE authorization_id = p_authorization_id 
      AND exited_at IS NULL
    RETURNING id, entered_at INTO v_current_state_id, v_entered_at;
    
    -- Create new state
    INSERT INTO authorization_workflow_states (
        authorization_id, state, status, notes, user_id
    ) VALUES (
        p_authorization_id, p_new_state, p_new_status, p_notes, p_user_id
    );
    
    -- Update main authorization record
    UPDATE authorization_requests 
    SET workflow_state = p_new_state,
        status = p_new_status,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_user_id
    WHERE id = p_authorization_id;
    
    -- Log audit event
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, risk_level)
    VALUES (
        COALESCE(p_user_id, current_setting('app.current_user_id')::UUID),
        'workflow_state_change',
        'authorization_request',
        p_authorization_id,
        jsonb_build_object(
            'new_state', p_new_state,
            'new_status', p_new_status,
            'notes', p_notes
        ),
        'medium'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate authorization priority score
CREATE OR REPLACE FUNCTION calculate_authorization_priority(
    p_urgency_level VARCHAR(20),
    p_service_date DATE,
    p_estimated_cost DECIMAL(10,2)
) RETURNS INTEGER AS $$
DECLARE
    v_score INTEGER := 0;
    v_days_until_service INTEGER;
BEGIN
    -- Base score by urgency
    CASE p_urgency_level
        WHEN 'urgent' THEN v_score := v_score + 100;
        WHEN 'expedited' THEN v_score := v_score + 50;
        WHEN 'routine' THEN v_score := v_score + 10;
    END CASE;
    
    -- Time sensitivity score
    v_days_until_service := p_service_date - CURRENT_DATE;
    IF v_days_until_service <= 3 THEN
        v_score := v_score + 50;
    ELSIF v_days_until_service <= 7 THEN
        v_score := v_score + 30;
    ELSIF v_days_until_service <= 14 THEN
        v_score := v_score + 20;
    END IF;
    
    -- Cost-based score
    IF p_estimated_cost > 10000 THEN
        v_score := v_score + 30;
    ELSIF p_estimated_cost > 5000 THEN
        v_score := v_score + 20;
    ELSIF p_estimated_cost > 1000 THEN
        v_score := v_score + 10;
    END IF;
    
    RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update priority score
CREATE OR REPLACE FUNCTION update_authorization_priority_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.priority_score := calculate_authorization_priority(
        NEW.urgency_level,
        NEW.service_date,
        NEW.estimated_cost
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authorization_priority_update
    BEFORE INSERT OR UPDATE ON authorization_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_authorization_priority_trigger();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_authorization_timestamp_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authorization_timestamp_update
    BEFORE UPDATE ON authorization_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_authorization_timestamp_trigger();

CREATE TRIGGER payer_requirements_timestamp_update
    BEFORE UPDATE ON payer_requirements
    FOR EACH ROW
    EXECUTE FUNCTION update_authorization_timestamp_trigger();

CREATE TRIGGER intake_templates_timestamp_update
    BEFORE UPDATE ON intake_form_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_authorization_timestamp_trigger();

-- Views for reporting and dashboard
CREATE OR REPLACE VIEW authorization_dashboard AS
SELECT 
    ar.id,
    ar.request_number,
    ar.status,
    ar.workflow_state,
    ar.urgency_level,
    ar.priority_score,
    ar.service_type,
    ar.payer_name,
    ar.service_date,
    ar.estimated_cost,
    ar.created_at,
    ar.submitted_at,
    ar.decision_date,
    p.first_name || ' ' || p.last_name AS patient_name,
    pr.name AS provider_name,
    prac.name AS practice_name,
    ad.decision,
    ad.authorization_number,
    CASE 
        WHEN ar.status = 'pending' AND ar.service_date - CURRENT_DATE <= 3 THEN 'urgent'
        WHEN ar.status = 'pending' AND ar.service_date - CURRENT_DATE <= 7 THEN 'attention'
        ELSE 'normal'
    END AS alert_level
FROM authorization_requests ar
JOIN patients p ON ar.patient_id = p.id
JOIN providers pr ON ar.provider_id = pr.id
JOIN practices prac ON ar.practice_id = prac.id
LEFT JOIN authorization_decisions ad ON ar.id = ad.authorization_id;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON authorization_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON authorization_workflow_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payer_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON authorization_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fhir_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON authorization_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON intake_form_templates TO authenticated;
GRANT SELECT ON authorization_dashboard TO authenticated;

GRANT EXECUTE ON FUNCTION update_authorization_workflow_state TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_authorization_priority TO authenticated;

-- Comments for documentation
COMMENT ON TABLE authorization_requests IS 'Main table for prior authorization requests';
COMMENT ON TABLE authorization_workflow_states IS 'Tracks workflow state transitions for authorization requests';
COMMENT ON TABLE payer_requirements IS 'Stores payer-specific requirements and rules for different services';
COMMENT ON TABLE authorization_decisions IS 'Records authorization decisions and outcomes';
COMMENT ON TABLE fhir_resources IS 'Stores FHIR resources for EHR integration';
COMMENT ON TABLE authorization_notifications IS 'Manages notifications for authorization workflow events';
COMMENT ON TABLE intake_form_templates IS 'Templates for smart intake forms with field detection';

COMMENT ON FUNCTION update_authorization_workflow_state IS 'Updates authorization workflow state and logs the transition';
COMMENT ON FUNCTION calculate_authorization_priority IS 'Calculates priority score based on urgency, timing, and cost';