const { Pool } = require('pg');
const { logger } = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');
const cron = require('node-cron');

/**
 * Workflow Engine Service for Prior Authorization Processing
 * Handles intake forms, smart field detection, and workflow automation
 */
class WorkflowEngine {
    constructor(dbPool) {
        this.db = dbPool;
        this.activeWorkflows = new Map();
        this.fieldDetectionRules = new Map();
        this.automationRules = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the workflow engine
     */
    async initialize() {
        try {
            await this.loadFieldDetectionRules();
            await this.loadAutomationRules();
            await this.startWorkflowMonitoring();
            this.isInitialized = true;
            logger.info('Workflow engine initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize workflow engine:', error);
            throw error;
        }
    }

    /**
     * Create a new authorization request with smart field detection
     */
    async createAuthorizationRequest(requestData, userId) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            // Apply smart field detection
            const enhancedData = await this.applySmartFieldDetection(requestData);

            // Validate required fields
            await this.validateRequiredFields(enhancedData);

            // Calculate priority score
            const priorityScore = await this.calculatePriorityScore(enhancedData);

            // Generate unique request number
            const requestNumber = await this.generateRequestNumber();

            // Insert authorization request
            const insertQuery = `
                INSERT INTO authorization_requests (
                    request_number, patient_id, provider_id, practice_id, payer_id, payer_name,
                    service_type, procedure_codes, diagnosis_codes, service_date, urgency_level,
                    estimated_cost, clinical_notes, supporting_documents, priority_score,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING id, request_number, status, workflow_state
            `;

            const result = await client.query(insertQuery, [
                requestNumber,
                enhancedData.patient_id,
                enhancedData.provider_id,
                enhancedData.practice_id,
                enhancedData.payer_id,
                enhancedData.payer_name,
                enhancedData.service_type,
                enhancedData.procedure_codes,
                enhancedData.diagnosis_codes,
                enhancedData.service_date,
                enhancedData.urgency_level || 'routine',
                enhancedData.estimated_cost,
                enhancedData.clinical_notes,
                JSON.stringify(enhancedData.supporting_documents || []),
                priorityScore,
                userId
            ]);

            const authRequest = result.rows[0];

            // Initialize workflow state
            await this.initializeWorkflowState(authRequest.id, userId, client);

            // Apply automation rules
            await this.applyAutomationRules(authRequest.id, enhancedData, client);

            await client.query('COMMIT');

            logger.info(`Authorization request created: ${authRequest.request_number}`, {
                authorizationId: authRequest.id,
                userId,
                serviceType: enhancedData.service_type
            });

            return authRequest;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to create authorization request:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Apply smart field detection to enhance form data
     */
    async applySmartFieldDetection(requestData) {
        try {
            const enhancedData = { ...requestData };

            // Auto-detect service type from procedure codes
            if (!enhancedData.service_type && enhancedData.procedure_codes) {
                enhancedData.service_type = await this.detectServiceType(enhancedData.procedure_codes);
            }

            // Auto-populate payer information
            if (enhancedData.patient_id && !enhancedData.payer_id) {
                const payerInfo = await this.detectPayerInfo(enhancedData.patient_id);
                if (payerInfo) {
                    enhancedData.payer_id = payerInfo.payer_id;
                    enhancedData.payer_name = payerInfo.payer_name;
                }
            }

            // Auto-detect urgency level
            if (!enhancedData.urgency_level) {
                enhancedData.urgency_level = await this.detectUrgencyLevel(enhancedData);
            }

            // Estimate cost if not provided
            if (!enhancedData.estimated_cost && enhancedData.procedure_codes) {
                enhancedData.estimated_cost = await this.estimateCost(enhancedData.procedure_codes);
            }

            // Validate and enhance diagnosis codes
            if (enhancedData.diagnosis_codes) {
                enhancedData.diagnosis_codes = await this.validateDiagnosisCodes(enhancedData.diagnosis_codes);
            }

            return enhancedData;
        } catch (error) {
            logger.error('Smart field detection failed:', error);
            return requestData; // Return original data if detection fails
        }
    }

    /**
     * Detect service type from procedure codes
     */
    async detectServiceType(procedureCodes) {
        const serviceTypeMap = {
            // Imaging
            '70000-79999': 'imaging',
            '76000-76999': 'imaging',
            // Surgery
            '10000-69999': 'surgery',
            // DME
            'E0000-E9999': 'dme',
            'K0000-K9999': 'dme',
            // Physical Therapy
            '97000-97999': 'physical_therapy',
            // Laboratory
            '80000-89999': 'laboratory'
        };

        for (const code of procedureCodes) {
            for (const [range, serviceType] of Object.entries(serviceTypeMap)) {
                if (this.isCodeInRange(code, range)) {
                    return serviceType;
                }
            }
        }

        return 'other';
    }

    /**
     * Detect payer information from patient record
     */
    async detectPayerInfo(patientId) {
        try {
            const query = `
                SELECT insurance_payer_id as payer_id, insurance_payer_name as payer_name
                FROM patients 
                WHERE id = $1 AND insurance_payer_id IS NOT NULL
            `;
            const result = await this.db.query(query, [patientId]);
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to detect payer info:', error);
            return null;
        }
    }

    /**
     * Detect urgency level based on various factors
     */
    async detectUrgencyLevel(requestData) {
        const { service_date, diagnosis_codes, procedure_codes } = requestData;
        
        // Check if service date is within 3 days
        if (service_date) {
            const daysUntilService = Math.ceil((new Date(service_date) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysUntilService <= 3) {
                return 'urgent';
            } else if (daysUntilService <= 7) {
                return 'expedited';
            }
        }

        // Check for urgent diagnosis codes
        const urgentDiagnosisCodes = ['I21', 'I46', 'R06.02', 'N17']; // MI, Cardiac arrest, Acute respiratory distress, Acute kidney failure
        if (diagnosis_codes && diagnosis_codes.some(code => 
            urgentDiagnosisCodes.some(urgent => code.startsWith(urgent))
        )) {
            return 'urgent';
        }

        // Check for urgent procedure codes
        const urgentProcedureCodes = ['99291', '99292', '36415']; // Critical care, emergency procedures
        if (procedure_codes && procedure_codes.some(code => urgentProcedureCodes.includes(code))) {
            return 'urgent';
        }

        return 'routine';
    }

    /**
     * Estimate cost based on procedure codes
     */
    async estimateCost(procedureCodes) {
        try {
            // This would typically integrate with a cost database or API
            // For now, using simplified estimation logic
            const costEstimates = {
                // Imaging
                '70000-79999': 500,
                '76000-76999': 800,
                // Surgery
                '10000-69999': 5000,
                // DME
                'E0000-E9999': 1200,
                'K0000-K9999': 2000,
                // Physical Therapy
                '97000-97999': 150,
                // Laboratory
                '80000-89999': 100
            };

            let totalEstimate = 0;
            for (const code of procedureCodes) {
                for (const [range, cost] of Object.entries(costEstimates)) {
                    if (this.isCodeInRange(code, range)) {
                        totalEstimate += cost;
                        break;
                    }
                }
            }

            return totalEstimate || 500; // Default estimate
        } catch (error) {
            logger.error('Cost estimation failed:', error);
            return 500;
        }
    }

    /**
     * Initialize workflow state for new authorization
     */
    async initializeWorkflowState(authorizationId, userId, client = null) {
        const db = client || this.db;
        
        const query = `
            INSERT INTO authorization_workflow_states (
                authorization_id, state, status, notes, user_id
            ) VALUES ($1, $2, $3, $4, $5)
        `;

        await db.query(query, [
            authorizationId,
            'intake',
            'draft',
            'Authorization request created',
            userId
        ]);
    }

    /**
     * Advance workflow to next state
     */
    async advanceWorkflow(authorizationId, targetState, userId, notes = null) {
        try {
            // Get current state
            const currentStateQuery = `
                SELECT workflow_state, status FROM authorization_requests 
                WHERE id = $1
            `;
            const currentResult = await this.db.query(currentStateQuery, [authorizationId]);
            const currentState = currentResult.rows[0];

            if (!currentState) {
                throw new Error('Authorization request not found');
            }

            // Validate state transition
            if (!this.isValidStateTransition(currentState.workflow_state, targetState)) {
                throw new Error(`Invalid state transition from ${currentState.workflow_state} to ${targetState}`);
            }

            // Determine new status
            const newStatus = this.getStatusForState(targetState);

            // Update workflow state
            await this.db.query(
                'SELECT update_authorization_workflow_state($1, $2, $3, $4, $5)',
                [authorizationId, targetState, newStatus, notes, userId]
            );

            // Apply automation rules for new state
            await this.applyStateAutomation(authorizationId, targetState);

            logger.info(`Workflow advanced for authorization ${authorizationId}`, {
                from: currentState.workflow_state,
                to: targetState,
                userId
            });

            return { state: targetState, status: newStatus };
        } catch (error) {
            logger.error('Failed to advance workflow:', error);
            throw error;
        }
    }

    /**
     * Apply automation rules based on authorization data
     */
    async applyAutomationRules(authorizationId, requestData, client = null) {
        try {
            const db = client || this.db;

            // Check for auto-approval criteria
            const autoApprovalResult = await this.checkAutoApprovalCriteria(requestData);
            if (autoApprovalResult.eligible) {
                await this.processAutoApproval(authorizationId, autoApprovalResult, db);
                return;
            }

            // Check for immediate validation requirements
            const validationResult = await this.checkValidationRequirements(requestData);
            if (validationResult.requiresValidation) {
                await this.scheduleValidation(authorizationId, validationResult, db);
            }

            // Schedule payer submission if ready
            if (this.isReadyForPayerSubmission(requestData)) {
                await this.schedulePayerSubmission(authorizationId, db);
            }
        } catch (error) {
            logger.error('Automation rules application failed:', error);
            // Don't throw - automation failures shouldn't block the main workflow
        }
    }

    /**
     * Check auto-approval criteria
     */
    async checkAutoApprovalCriteria(requestData) {
        try {
            const query = `
                SELECT auto_approval_criteria 
                FROM payer_requirements 
                WHERE payer_id = $1 AND service_type = $2 AND is_active = true
                ORDER BY created_at DESC LIMIT 1
            `;
            
            const result = await this.db.query(query, [requestData.payer_id, requestData.service_type]);
            
            if (!result.rows[0]) {
                return { eligible: false, reason: 'No payer requirements found' };
            }

            const criteria = result.rows[0].auto_approval_criteria;
            
            // Check cost threshold
            if (criteria.max_cost && requestData.estimated_cost > criteria.max_cost) {
                return { eligible: false, reason: 'Cost exceeds auto-approval threshold' };
            }

            // Check procedure codes
            if (criteria.approved_procedures && requestData.procedure_codes) {
                const hasApprovedProcedure = requestData.procedure_codes.some(code => 
                    criteria.approved_procedures.includes(code)
                );
                if (!hasApprovedProcedure) {
                    return { eligible: false, reason: 'Procedure not in auto-approval list' };
                }
            }

            // Check diagnosis codes
            if (criteria.approved_diagnoses && requestData.diagnosis_codes) {
                const hasApprovedDiagnosis = requestData.diagnosis_codes.some(code => 
                    criteria.approved_diagnoses.some(approved => code.startsWith(approved))
                );
                if (!hasApprovedDiagnosis) {
                    return { eligible: false, reason: 'Diagnosis not in auto-approval list' };
                }
            }

            return { eligible: true, criteria };
        } catch (error) {
            logger.error('Auto-approval check failed:', error);
            return { eligible: false, reason: 'Auto-approval check failed' };
        }
    }

    /**
     * Process auto-approval
     */
    async processAutoApproval(authorizationId, approvalResult, client) {
        try {
            // Update to approved state
            await client.query(
                'SELECT update_authorization_workflow_state($1, $2, $3, $4, $5)',
                [authorizationId, 'completed', 'approved', 'Auto-approved based on payer criteria', null]
            );

            // Create approval decision
            const decisionQuery = `
                INSERT INTO authorization_decisions (
                    authorization_id, decision, decision_reason, 
                    authorization_number, reviewer_name
                ) VALUES ($1, $2, $3, $4, $5)
            `;

            await client.query(decisionQuery, [
                authorizationId,
                'approved',
                'Auto-approved based on payer criteria',
                await this.generateAuthorizationNumber(),
                'System Auto-Approval'
            ]);

            logger.info(`Authorization auto-approved: ${authorizationId}`);
        } catch (error) {
            logger.error('Auto-approval processing failed:', error);
            throw error;
        }
    }

    /**
     * Start workflow monitoring for automated processing
     */
    async startWorkflowMonitoring() {
        // Monitor pending authorizations every 15 minutes
        cron.schedule('*/15 * * * *', async () => {
            try {
                await this.processPendingWorkflows();
            } catch (error) {
                logger.error('Workflow monitoring error:', error);
            }
        });

        // Check for expiring authorizations daily at 9 AM
        cron.schedule('0 9 * * *', async () => {
            try {
                await this.checkExpiringAuthorizations();
            } catch (error) {
                logger.error('Expiring authorization check error:', error);
            }
        });

        logger.info('Workflow monitoring started');
    }

    /**
     * Process pending workflows
     */
    async processPendingWorkflows() {
        try {
            const query = `
                SELECT id, workflow_state, status, created_at, service_date
                FROM authorization_requests 
                WHERE status IN ('pending', 'submitted') 
                AND workflow_state != 'completed'
                ORDER BY priority_score DESC, created_at ASC
                LIMIT 50
            `;

            const result = await this.db.query(query);
            
            for (const auth of result.rows) {
                await this.processWorkflowStep(auth);
            }
        } catch (error) {
            logger.error('Failed to process pending workflows:', error);
        }
    }

    /**
     * Process individual workflow step
     */
    async processWorkflowStep(authorization) {
        try {
            const { id, workflow_state, status } = authorization;

            switch (workflow_state) {
                case 'validation':
                    await this.processValidationStep(id);
                    break;
                case 'payer_review':
                    await this.checkPayerResponse(id);
                    break;
                case 'clinical_review':
                    await this.processClinicalReview(id);
                    break;
                default:
                    // No automated processing for this state
                    break;
            }
        } catch (error) {
            logger.error(`Failed to process workflow step for ${authorization.id}:`, error);
        }
    }

    /**
     * Utility functions
     */
    isCodeInRange(code, range) {
        if (range.includes('-')) {
            const [start, end] = range.split('-');
            return code >= start && code <= end;
        }
        return code.startsWith(range);
    }

    isValidStateTransition(currentState, targetState) {
        const validTransitions = {
            'intake': ['validation', 'submitted'],
            'validation': ['payer_review', 'clinical_review', 'submitted'],
            'submitted': ['payer_review', 'pending'],
            'payer_review': ['clinical_review', 'decision', 'pending'],
            'clinical_review': ['decision', 'payer_review'],
            'decision': ['completed', 'appeal'],
            'appeal': ['decision', 'completed'],
            'completed': [] // Terminal state
        };

        return validTransitions[currentState]?.includes(targetState) || false;
    }

    getStatusForState(state) {
        const stateStatusMap = {
            'intake': 'draft',
            'validation': 'pending',
            'submitted': 'submitted',
            'payer_review': 'pending',
            'clinical_review': 'pending',
            'decision': 'pending',
            'appeal': 'pending',
            'completed': 'approved' // Will be overridden by actual decision
        };

        return stateStatusMap[state] || 'pending';
    }

    async generateRequestNumber() {
        const prefix = 'AUTH';
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }

    async generateAuthorizationNumber() {
        const prefix = 'APPR';
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }

    async calculatePriorityScore(requestData) {
        try {
            const query = 'SELECT calculate_authorization_priority($1, $2, $3)';
            const result = await this.db.query(query, [
                requestData.urgency_level || 'routine',
                requestData.service_date,
                requestData.estimated_cost || 0
            ]);
            return result.rows[0].calculate_authorization_priority;
        } catch (error) {
            logger.error('Priority calculation failed:', error);
            return 10; // Default priority
        }
    }

    async validateRequiredFields(requestData) {
        const requiredFields = ['patient_id', 'provider_id', 'practice_id', 'service_type'];
        const missingFields = requiredFields.filter(field => !requestData[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
    }

    async loadFieldDetectionRules() {
        // Load field detection rules from database or configuration
        // This would be expanded based on specific requirements
        logger.info('Field detection rules loaded');
    }

    async loadAutomationRules() {
        // Load automation rules from database or configuration
        // This would be expanded based on specific requirements
        logger.info('Automation rules loaded');
    }

    // Placeholder methods for workflow steps
    async checkValidationRequirements(requestData) {
        return { requiresValidation: false };
    }

    async scheduleValidation(authorizationId, validationResult, client) {
        // Implementation for scheduling validation
    }

    async isReadyForPayerSubmission(requestData) {
        return true; // Simplified logic
    }

    async schedulePayerSubmission(authorizationId, client) {
        // Implementation for scheduling payer submission
    }

    async processValidationStep(authorizationId) {
        // Implementation for validation processing
    }

    async checkPayerResponse(authorizationId) {
        // Implementation for checking payer responses
    }

    async processClinicalReview(authorizationId) {
        // Implementation for clinical review processing
    }

    async checkExpiringAuthorizations() {
        // Implementation for checking expiring authorizations
    }

    async validateDiagnosisCodes(diagnosisCodes) {
        // Implementation for diagnosis code validation
        return diagnosisCodes;
    }
}

module.exports = WorkflowEngine;