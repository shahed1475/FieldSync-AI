const { Pool } = require('pg');
const logger = require('../utils/logger');
const cron = require('node-cron');

/**
 * Payer Requirements Rules Engine
 * AI-assisted mapping and intelligent rule processing for authorization requirements
 */
class PayerRulesEngine {
    constructor(dbPool) {
        this.db = dbPool;
        this.rulesCache = new Map();
        this.aiMappings = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
        this.isInitialized = false;
    }

    /**
     * Initialize the rules engine
     */
    async initialize() {
        try {
            await this.loadPayerRules();
            await this.loadAIMappings();
            await this.startRulesMonitoring();
            this.isInitialized = true;
            logger.info('Payer rules engine initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize payer rules engine:', error);
            throw error;
        }
    }

    /**
     * Evaluate authorization request against payer requirements
     */
    async evaluateAuthorizationRequest(authorizationData) {
        try {
            const { payer_id, service_type, procedure_codes, diagnosis_codes, estimated_cost } = authorizationData;

            // Get payer requirements
            const requirements = await this.getPayerRequirements(payer_id, service_type);
            if (!requirements) {
                return {
                    requirementsMet: false,
                    reason: 'No payer requirements found',
                    missingRequirements: ['payer_requirements'],
                    recommendedActions: ['contact_payer_for_requirements']
                };
            }

            // Evaluate requirements
            const evaluation = await this.evaluateRequirements(authorizationData, requirements);
            
            // Apply AI-assisted mapping for missing or unclear requirements
            if (!evaluation.requirementsMet) {
                const aiEnhancement = await this.applyAIMapping(authorizationData, requirements, evaluation);
                evaluation.aiSuggestions = aiEnhancement;
            }

            // Log evaluation for learning
            await this.logEvaluation(authorizationData, requirements, evaluation);

            return evaluation;
        } catch (error) {
            logger.error('Authorization evaluation failed:', error);
            throw error;
        }
    }

    /**
     * Get payer requirements with caching
     */
    async getPayerRequirements(payerId, serviceType) {
        try {
            const cacheKey = `requirements_${payerId}_${serviceType}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            const query = `
                SELECT 
                    id,
                    payer_id,
                    payer_name,
                    service_type,
                    procedure_codes,
                    diagnosis_codes,
                    requirements,
                    documentation_needed,
                    processing_time_days,
                    auto_approval_criteria,
                    denial_criteria,
                    appeal_process,
                    effective_date,
                    expiry_date,
                    created_at,
                    updated_at
                FROM payer_requirements
                WHERE payer_id = $1 
                AND service_type = $2 
                AND is_active = true
                AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                ORDER BY updated_at DESC
                LIMIT 1
            `;

            const result = await this.db.query(query, [payerId, serviceType]);
            const requirements = result.rows[0] || null;

            if (requirements) {
                this.setCache(cacheKey, requirements);
            }

            return requirements;
        } catch (error) {
            logger.error('Failed to get payer requirements:', error);
            return null;
        }
    }

    /**
     * Evaluate requirements against authorization data
     */
    async evaluateRequirements(authorizationData, requirements) {
        const evaluation = {
            requirementsMet: true,
            missingRequirements: [],
            documentationNeeded: [],
            recommendedActions: [],
            autoApprovalEligible: false,
            denialRisk: 'low',
            processingTimeEstimate: requirements.processing_time_days || 14,
            details: {}
        };

        try {
            // Check procedure code requirements
            const procedureCheck = this.checkProcedureCodes(authorizationData.procedure_codes, requirements);
            if (!procedureCheck.valid) {
                evaluation.requirementsMet = false;
                evaluation.missingRequirements.push('valid_procedure_codes');
                evaluation.details.procedureCodeIssues = procedureCheck.issues;
            }

            // Check diagnosis code requirements
            const diagnosisCheck = this.checkDiagnosisCodes(authorizationData.diagnosis_codes, requirements);
            if (!diagnosisCheck.valid) {
                evaluation.requirementsMet = false;
                evaluation.missingRequirements.push('valid_diagnosis_codes');
                evaluation.details.diagnosisCodeIssues = diagnosisCheck.issues;
            }

            // Check cost thresholds
            const costCheck = this.checkCostRequirements(authorizationData.estimated_cost, requirements);
            if (!costCheck.valid) {
                evaluation.requirementsMet = false;
                evaluation.missingRequirements.push('cost_justification');
                evaluation.details.costIssues = costCheck.issues;
            }

            // Check documentation requirements
            const docCheck = this.checkDocumentationRequirements(authorizationData, requirements);
            evaluation.documentationNeeded = docCheck.needed;
            if (docCheck.needed.length > 0) {
                evaluation.requirementsMet = false;
                evaluation.missingRequirements.push('required_documentation');
            }

            // Check auto-approval eligibility
            evaluation.autoApprovalEligible = this.checkAutoApprovalEligibility(authorizationData, requirements);

            // Assess denial risk
            evaluation.denialRisk = this.assessDenialRisk(authorizationData, requirements, evaluation);

            // Generate recommended actions
            evaluation.recommendedActions = this.generateRecommendedActions(evaluation, requirements);

            return evaluation;
        } catch (error) {
            logger.error('Requirements evaluation failed:', error);
            evaluation.requirementsMet = false;
            evaluation.missingRequirements.push('evaluation_error');
            return evaluation;
        }
    }

    /**
     * Check procedure codes against requirements
     */
    checkProcedureCodes(procedureCodes, requirements) {
        const result = { valid: true, issues: [] };

        if (!procedureCodes || procedureCodes.length === 0) {
            result.valid = false;
            result.issues.push('No procedure codes provided');
            return result;
        }

        // Check if procedure codes are in allowed list
        if (requirements.procedure_codes && requirements.procedure_codes.length > 0) {
            const allowedCodes = requirements.procedure_codes;
            const invalidCodes = procedureCodes.filter(code => !allowedCodes.includes(code));
            
            if (invalidCodes.length > 0) {
                result.valid = false;
                result.issues.push(`Invalid procedure codes: ${invalidCodes.join(', ')}`);
            }
        }

        // Check for specific requirements in the requirements object
        if (requirements.requirements && requirements.requirements.procedure_validation) {
            const validation = requirements.requirements.procedure_validation;
            
            // Check for required combinations
            if (validation.required_combinations) {
                const hasRequiredCombination = validation.required_combinations.some(combo => 
                    combo.every(code => procedureCodes.includes(code))
                );
                if (!hasRequiredCombination) {
                    result.valid = false;
                    result.issues.push('Required procedure code combination not found');
                }
            }

            // Check for excluded combinations
            if (validation.excluded_combinations) {
                const hasExcludedCombination = validation.excluded_combinations.some(combo => 
                    combo.every(code => procedureCodes.includes(code))
                );
                if (hasExcludedCombination) {
                    result.valid = false;
                    result.issues.push('Excluded procedure code combination found');
                }
            }
        }

        return result;
    }

    /**
     * Check diagnosis codes against requirements
     */
    checkDiagnosisCodes(diagnosisCodes, requirements) {
        const result = { valid: true, issues: [] };

        if (!diagnosisCodes || diagnosisCodes.length === 0) {
            result.valid = false;
            result.issues.push('No diagnosis codes provided');
            return result;
        }

        // Check if diagnosis codes support the procedure
        if (requirements.diagnosis_codes && requirements.diagnosis_codes.length > 0) {
            const allowedDiagnoses = requirements.diagnosis_codes;
            const hasValidDiagnosis = diagnosisCodes.some(code => 
                allowedDiagnoses.some(allowed => code.startsWith(allowed))
            );
            
            if (!hasValidDiagnosis) {
                result.valid = false;
                result.issues.push('No valid supporting diagnosis codes found');
            }
        }

        // Check for specific diagnosis requirements
        if (requirements.requirements && requirements.requirements.diagnosis_validation) {
            const validation = requirements.requirements.diagnosis_validation;
            
            // Check for primary diagnosis requirements
            if (validation.primary_diagnosis_required && diagnosisCodes.length > 0) {
                const primaryDiagnosis = diagnosisCodes[0];
                if (validation.primary_diagnosis_codes && 
                    !validation.primary_diagnosis_codes.some(code => primaryDiagnosis.startsWith(code))) {
                    result.valid = false;
                    result.issues.push('Primary diagnosis does not meet requirements');
                }
            }
        }

        return result;
    }

    /**
     * Check cost requirements
     */
    checkCostRequirements(estimatedCost, requirements) {
        const result = { valid: true, issues: [] };

        if (requirements.requirements && requirements.requirements.cost_validation) {
            const validation = requirements.requirements.cost_validation;
            
            // Check maximum cost threshold
            if (validation.max_cost && estimatedCost > validation.max_cost) {
                result.valid = false;
                result.issues.push(`Estimated cost $${estimatedCost} exceeds maximum allowed $${validation.max_cost}`);
            }

            // Check minimum cost threshold (for fraud detection)
            if (validation.min_cost && estimatedCost < validation.min_cost) {
                result.valid = false;
                result.issues.push(`Estimated cost $${estimatedCost} below minimum threshold $${validation.min_cost}`);
            }

            // Check cost per procedure limits
            if (validation.cost_per_procedure_limits) {
                // This would require more detailed cost breakdown
                // For now, just flag for manual review
                if (estimatedCost > 10000) {
                    result.issues.push('High cost requires additional justification');
                }
            }
        }

        return result;
    }

    /**
     * Check documentation requirements
     */
    checkDocumentationRequirements(authorizationData, requirements) {
        const needed = [];

        if (requirements.documentation_needed && requirements.documentation_needed.length > 0) {
            // Check which documents are provided
            const providedDocs = authorizationData.supporting_documents || [];
            const providedDocTypes = providedDocs.map(doc => doc.type || doc.document_type);

            for (const requiredDoc of requirements.documentation_needed) {
                if (!providedDocTypes.includes(requiredDoc)) {
                    needed.push(requiredDoc);
                }
            }
        }

        // Check for conditional documentation requirements
        if (requirements.requirements && requirements.requirements.conditional_documentation) {
            const conditions = requirements.requirements.conditional_documentation;
            
            for (const condition of conditions) {
                if (this.evaluateCondition(condition.condition, authorizationData)) {
                    for (const doc of condition.required_documents) {
                        if (!needed.includes(doc)) {
                            needed.push(doc);
                        }
                    }
                }
            }
        }

        return { needed };
    }

    /**
     * Check auto-approval eligibility
     */
    checkAutoApprovalEligibility(authorizationData, requirements) {
        if (!requirements.auto_approval_criteria) {
            return false;
        }

        const criteria = requirements.auto_approval_criteria;

        // Check cost threshold
        if (criteria.max_cost && authorizationData.estimated_cost > criteria.max_cost) {
            return false;
        }

        // Check procedure codes
        if (criteria.approved_procedures && authorizationData.procedure_codes) {
            const hasApprovedProcedure = authorizationData.procedure_codes.some(code => 
                criteria.approved_procedures.includes(code)
            );
            if (!hasApprovedProcedure) {
                return false;
            }
        }

        // Check diagnosis codes
        if (criteria.approved_diagnoses && authorizationData.diagnosis_codes) {
            const hasApprovedDiagnosis = authorizationData.diagnosis_codes.some(code => 
                criteria.approved_diagnoses.some(approved => code.startsWith(approved))
            );
            if (!hasApprovedDiagnosis) {
                return false;
            }
        }

        // Check service type
        if (criteria.service_types && !criteria.service_types.includes(authorizationData.service_type)) {
            return false;
        }

        return true;
    }

    /**
     * Assess denial risk
     */
    assessDenialRisk(authorizationData, requirements, evaluation) {
        let riskScore = 0;

        // High risk factors
        if (evaluation.missingRequirements.length > 2) riskScore += 30;
        if (evaluation.documentationNeeded.length > 3) riskScore += 25;
        if (authorizationData.estimated_cost > 10000) riskScore += 20;

        // Medium risk factors
        if (evaluation.missingRequirements.length > 0) riskScore += 15;
        if (evaluation.documentationNeeded.length > 0) riskScore += 10;
        if (authorizationData.urgency_level === 'urgent') riskScore += 10;

        // Check historical denial patterns
        // This would integrate with historical data analysis
        if (requirements.denial_criteria) {
            const denialCriteria = requirements.denial_criteria;
            if (this.matchesDenialCriteria(authorizationData, denialCriteria)) {
                riskScore += 40;
            }
        }

        // Determine risk level
        if (riskScore >= 60) return 'high';
        if (riskScore >= 30) return 'medium';
        return 'low';
    }

    /**
     * Generate recommended actions
     */
    generateRecommendedActions(evaluation, requirements) {
        const actions = [];

        if (evaluation.missingRequirements.includes('valid_procedure_codes')) {
            actions.push('review_procedure_codes');
            actions.push('verify_medical_necessity');
        }

        if (evaluation.missingRequirements.includes('valid_diagnosis_codes')) {
            actions.push('review_diagnosis_codes');
            actions.push('obtain_clinical_documentation');
        }

        if (evaluation.documentationNeeded.length > 0) {
            actions.push('collect_required_documentation');
            actions.push('schedule_clinical_review');
        }

        if (evaluation.denialRisk === 'high') {
            actions.push('peer_review_recommended');
            actions.push('consider_alternative_procedures');
        }

        if (evaluation.autoApprovalEligible) {
            actions.push('eligible_for_auto_approval');
        } else {
            actions.push('manual_review_required');
        }

        return actions;
    }

    /**
     * Apply AI-assisted mapping for enhanced requirements understanding
     */
    async applyAIMapping(authorizationData, requirements, evaluation) {
        try {
            const aiSuggestions = {
                alternativeProcedures: [],
                alternativeDiagnoses: [],
                documentationSuggestions: [],
                costOptimizations: [],
                similarCases: []
            };

            // Find alternative procedure codes
            if (evaluation.missingRequirements.includes('valid_procedure_codes')) {
                aiSuggestions.alternativeProcedures = await this.findAlternativeProcedures(
                    authorizationData.procedure_codes,
                    authorizationData.service_type,
                    requirements
                );
            }

            // Find supporting diagnosis codes
            if (evaluation.missingRequirements.includes('valid_diagnosis_codes')) {
                aiSuggestions.alternativeDiagnoses = await this.findSupportingDiagnoses(
                    authorizationData.diagnosis_codes,
                    authorizationData.procedure_codes,
                    requirements
                );
            }

            // Suggest documentation based on similar cases
            if (evaluation.documentationNeeded.length > 0) {
                aiSuggestions.documentationSuggestions = await this.suggestDocumentation(
                    authorizationData,
                    requirements,
                    evaluation.documentationNeeded
                );
            }

            // Find similar successful cases
            aiSuggestions.similarCases = await this.findSimilarSuccessfulCases(authorizationData);

            return aiSuggestions;
        } catch (error) {
            logger.error('AI mapping failed:', error);
            return {};
        }
    }

    /**
     * Find alternative procedure codes
     */
    async findAlternativeProcedures(currentProcedures, serviceType, requirements) {
        try {
            // This would typically use ML models or extensive mapping tables
            // For now, using rule-based alternatives
            const alternatives = [];

            if (requirements.procedure_codes && requirements.procedure_codes.length > 0) {
                const allowedCodes = requirements.procedure_codes;
                
                // Find codes in the same category
                for (const currentCode of currentProcedures) {
                    const category = this.getProcedureCategory(currentCode);
                    const categoryAlternatives = allowedCodes.filter(code => 
                        this.getProcedureCategory(code) === category
                    );
                    
                    alternatives.push(...categoryAlternatives.map(code => ({
                        code,
                        description: this.getProcedureDescription(code),
                        similarity: this.calculateProcedureSimilarity(currentCode, code)
                    })));
                }
            }

            return alternatives.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
        } catch (error) {
            logger.error('Failed to find alternative procedures:', error);
            return [];
        }
    }

    /**
     * Find supporting diagnosis codes
     */
    async findSupportingDiagnoses(currentDiagnoses, procedureCodes, requirements) {
        try {
            const suggestions = [];

            if (requirements.diagnosis_codes && requirements.diagnosis_codes.length > 0) {
                const allowedDiagnoses = requirements.diagnosis_codes;
                
                // Find diagnoses that support the procedures
                for (const diagnosisPrefix of allowedDiagnoses) {
                    const commonCodes = this.getCommonDiagnosisCodesForPrefix(diagnosisPrefix);
                    suggestions.push(...commonCodes.map(code => ({
                        code,
                        description: this.getDiagnosisDescription(code),
                        supportsProcedures: this.checkDiagnosisProcedureCompatibility(code, procedureCodes)
                    })));
                }
            }

            return suggestions.filter(s => s.supportsProcedures).slice(0, 5);
        } catch (error) {
            logger.error('Failed to find supporting diagnoses:', error);
            return [];
        }
    }

    /**
     * Suggest documentation based on requirements and similar cases
     */
    async suggestDocumentation(authorizationData, requirements, neededDocs) {
        const suggestions = [];

        for (const docType of neededDocs) {
            suggestions.push({
                type: docType,
                description: this.getDocumentationDescription(docType),
                urgency: this.getDocumentationUrgency(docType, authorizationData),
                templates: this.getDocumentationTemplates(docType)
            });
        }

        return suggestions;
    }

    /**
     * Find similar successful authorization cases
     */
    async findSimilarSuccessfulCases(authorizationData) {
        try {
            const query = `
                SELECT 
                    ar.id,
                    ar.request_number,
                    ar.service_type,
                    ar.procedure_codes,
                    ar.diagnosis_codes,
                    ar.estimated_cost,
                    ad.decision,
                    ad.decision_date
                FROM authorization_requests ar
                JOIN authorization_decisions ad ON ar.id = ad.authorization_id
                WHERE ad.decision = 'approved'
                AND ar.payer_id = $1
                AND ar.service_type = $2
                AND ar.procedure_codes && $3
                ORDER BY ad.decision_date DESC
                LIMIT 5
            `;

            const result = await this.db.query(query, [
                authorizationData.payer_id,
                authorizationData.service_type,
                authorizationData.procedure_codes
            ]);

            return result.rows.map(row => ({
                ...row,
                similarity: this.calculateCaseSimilarity(authorizationData, row)
            }));
        } catch (error) {
            logger.error('Failed to find similar cases:', error);
            return [];
        }
    }

    /**
     * Utility and helper functions
     */
    evaluateCondition(condition, data) {
        // Simple condition evaluation - would be more sophisticated in practice
        try {
            // Example: condition = "estimated_cost > 5000"
            return eval(condition.replace(/\b(\w+)\b/g, (match) => {
                return data[match] !== undefined ? JSON.stringify(data[match]) : match;
            }));
        } catch (error) {
            logger.error('Condition evaluation failed:', error);
            return false;
        }
    }

    matchesDenialCriteria(authorizationData, denialCriteria) {
        // Check if authorization matches common denial patterns
        if (denialCriteria.excluded_procedures) {
            const hasExcludedProcedure = authorizationData.procedure_codes?.some(code => 
                denialCriteria.excluded_procedures.includes(code)
            );
            if (hasExcludedProcedure) return true;
        }

        if (denialCriteria.excluded_diagnoses) {
            const hasExcludedDiagnosis = authorizationData.diagnosis_codes?.some(code => 
                denialCriteria.excluded_diagnoses.some(excluded => code.startsWith(excluded))
            );
            if (hasExcludedDiagnosis) return true;
        }

        return false;
    }

    getProcedureCategory(code) {
        // Simplified procedure categorization
        const codeNum = parseInt(code);
        if (codeNum >= 10000 && codeNum <= 69999) return 'surgery';
        if (codeNum >= 70000 && codeNum <= 79999) return 'radiology';
        if (codeNum >= 80000 && codeNum <= 89999) return 'pathology';
        if (codeNum >= 90000 && codeNum <= 99999) return 'medicine';
        return 'other';
    }

    getProcedureDescription(code) {
        // This would typically come from a comprehensive procedure code database
        return `Procedure ${code}`;
    }

    getDiagnosisDescription(code) {
        // This would typically come from ICD-10 database
        return `Diagnosis ${code}`;
    }

    calculateProcedureSimilarity(code1, code2) {
        // Simple similarity calculation - would be more sophisticated
        const num1 = parseInt(code1);
        const num2 = parseInt(code2);
        const diff = Math.abs(num1 - num2);
        return Math.max(0, 100 - diff / 100);
    }

    calculateCaseSimilarity(case1, case2) {
        let similarity = 0;
        
        // Service type match
        if (case1.service_type === case2.service_type) similarity += 30;
        
        // Procedure code overlap
        const procedureOverlap = case1.procedure_codes?.filter(code => 
            case2.procedure_codes?.includes(code)
        ).length || 0;
        similarity += procedureOverlap * 20;
        
        // Cost similarity
        const costDiff = Math.abs((case1.estimated_cost || 0) - (case2.estimated_cost || 0));
        if (costDiff < 1000) similarity += 20;
        else if (costDiff < 5000) similarity += 10;
        
        return Math.min(100, similarity);
    }

    getCommonDiagnosisCodesForPrefix(prefix) {
        // This would come from a comprehensive diagnosis database
        const commonCodes = {
            'M25': ['M25.50', 'M25.51', 'M25.52'],
            'I10': ['I10'],
            'E11': ['E11.9', 'E11.40', 'E11.65'],
            'R06': ['R06.02', 'R06.00']
        };
        return commonCodes[prefix] || [];
    }

    checkDiagnosisProcedureCompatibility(diagnosis, procedures) {
        // Simplified compatibility check
        return true; // Would be more sophisticated in practice
    }

    getDocumentationDescription(docType) {
        const descriptions = {
            'clinical_notes': 'Detailed clinical notes supporting medical necessity',
            'lab_results': 'Laboratory test results',
            'imaging_reports': 'Radiology or imaging reports',
            'physician_order': 'Physician order or prescription',
            'insurance_card': 'Copy of insurance card',
            'prior_auth_form': 'Completed prior authorization form'
        };
        return descriptions[docType] || `Documentation: ${docType}`;
    }

    getDocumentationUrgency(docType, authorizationData) {
        if (authorizationData.urgency_level === 'urgent') return 'high';
        if (['clinical_notes', 'physician_order'].includes(docType)) return 'high';
        return 'medium';
    }

    getDocumentationTemplates(docType) {
        // Return available templates for the document type
        return [];
    }

    async logEvaluation(authorizationData, requirements, evaluation) {
        try {
            // Log evaluation for machine learning and improvement
            const logData = {
                payer_id: authorizationData.payer_id,
                service_type: authorizationData.service_type,
                evaluation_result: evaluation,
                timestamp: new Date().toISOString()
            };
            
            // This would typically go to a ML pipeline or analytics system
            logger.info('Rules evaluation logged', logData);
        } catch (error) {
            logger.error('Failed to log evaluation:', error);
        }
    }

    async loadPayerRules() {
        try {
            const query = `
                SELECT payer_id, service_type, requirements, auto_approval_criteria, denial_criteria
                FROM payer_requirements
                WHERE is_active = true
            `;
            
            const result = await this.db.query(query);
            
            for (const row of result.rows) {
                const key = `${row.payer_id}_${row.service_type}`;
                this.rulesCache.set(key, row);
            }
            
            logger.info(`Loaded ${result.rows.length} payer rules`);
        } catch (error) {
            logger.error('Failed to load payer rules:', error);
        }
    }

    async loadAIMappings() {
        // Load AI mappings and models
        // This would typically load ML models or mapping tables
        logger.info('AI mappings loaded');
    }

    async startRulesMonitoring() {
        // Monitor for rules updates every hour
        cron.schedule('0 * * * *', async () => {
            try {
                await this.loadPayerRules();
            } catch (error) {
                logger.error('Rules monitoring error:', error);
            }
        });

        logger.info('Rules monitoring started');
    }

    getFromCache(key) {
        const cached = this.rulesCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        this.rulesCache.delete(key);
        return null;
    }

    setCache(key, data) {
        this.rulesCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.rulesCache.clear();
        logger.info('Payer rules cache cleared');
    }
}

module.exports = PayerRulesEngine;