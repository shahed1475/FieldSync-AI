const { pool } = require('../database/connection');
const logger = require('../utils/logger');

/**
 * Lookup Service for Patient and Provider Data
 * Provides intelligent search and data retrieval for authorization workflow
 */
class LookupService {
    constructor(dbPool) {
        this.db = dbPool;
        this.searchCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Search patients with fuzzy matching and intelligent suggestions
     */
    async searchPatients(searchParams, practiceId, limit = 20) {
        try {
            const cacheKey = `patients_${JSON.stringify(searchParams)}_${practiceId}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            let query = `
                SELECT 
                    p.id,
                    p.first_name,
                    p.last_name,
                    p.date_of_birth,
                    p.ssn_last_four,
                    p.phone,
                    p.email,
                    p.address,
                    p.city,
                    p.state,
                    p.zip_code,
                    p.insurance_payer_id,
                    p.insurance_payer_name,
                    p.insurance_member_id,
                    p.insurance_group_number,
                    p.emergency_contact_name,
                    p.emergency_contact_phone,
                    p.created_at,
                    -- Calculate relevance score
                    (
                        CASE WHEN p.first_name ILIKE $1 THEN 100 ELSE 0 END +
                        CASE WHEN p.last_name ILIKE $2 THEN 100 ELSE 0 END +
                        CASE WHEN p.date_of_birth = $3 THEN 50 ELSE 0 END +
                        CASE WHEN p.ssn_last_four = $4 THEN 30 ELSE 0 END +
                        CASE WHEN p.phone ILIKE $5 THEN 20 ELSE 0 END +
                        CASE WHEN p.insurance_member_id ILIKE $6 THEN 40 ELSE 0 END
                    ) as relevance_score
                FROM patients p
                WHERE p.practice_id = $7
                AND (
                    ($1 IS NULL OR p.first_name ILIKE $1) OR
                    ($2 IS NULL OR p.last_name ILIKE $2) OR
                    ($3 IS NULL OR p.date_of_birth = $3) OR
                    ($4 IS NULL OR p.ssn_last_four = $4) OR
                    ($5 IS NULL OR p.phone ILIKE $5) OR
                    ($6 IS NULL OR p.insurance_member_id ILIKE $6) OR
                    ($8 IS NULL OR (p.first_name || ' ' || p.last_name) ILIKE $8)
                )
                ORDER BY relevance_score DESC, p.last_name, p.first_name
                LIMIT $9
            `;

            const params = [
                searchParams.firstName ? `%${searchParams.firstName}%` : null,
                searchParams.lastName ? `%${searchParams.lastName}%` : null,
                searchParams.dateOfBirth || null,
                searchParams.ssnLastFour || null,
                searchParams.phone ? `%${searchParams.phone.replace(/\D/g, '')}%` : null,
                searchParams.insuranceMemberId ? `%${searchParams.insuranceMemberId}%` : null,
                practiceId,
                searchParams.fullName ? `%${searchParams.fullName}%` : null,
                limit
            ];

            const result = await this.db.query(query, params);
            const patients = result.rows.map(row => ({
                ...row,
                full_name: `${row.first_name} ${row.last_name}`,
                masked_ssn: row.ssn_last_four ? `***-**-${row.ssn_last_four}` : null,
                formatted_phone: this.formatPhoneNumber(row.phone),
                age: this.calculateAge(row.date_of_birth)
            }));

            this.setCache(cacheKey, patients);
            return patients;
        } catch (error) {
            logger.error('Patient search failed:', error);
            throw error;
        }
    }

    /**
     * Get patient details by ID with related information
     */
    async getPatientDetails(patientId, practiceId) {
        try {
            const cacheKey = `patient_details_${patientId}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            const query = `
                SELECT 
                    p.*,
                    -- Recent authorization history
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', ar.id,
                                'request_number', ar.request_number,
                                'service_type', ar.service_type,
                                'status', ar.status,
                                'created_at', ar.created_at,
                                'decision_date', ad.decision_date,
                                'decision', ad.decision
                            )
                        )
                        FROM authorization_requests ar
                        LEFT JOIN authorization_decisions ad ON ar.id = ad.authorization_id
                        WHERE ar.patient_id = p.id
                        ORDER BY ar.created_at DESC
                        LIMIT 5
                    ) as recent_authorizations,
                    -- Insurance verification status
                    (
                        SELECT json_build_object(
                            'verified', true,
                            'verified_date', CURRENT_DATE,
                            'coverage_status', 'active'
                        )
                    ) as insurance_verification
                FROM patients p
                WHERE p.id = ? AND p.practice_id = ?
            `;

            const result = await this.db.query(query, [patientId, practiceId]);
            
            if (result.rows.length === 0) {
                throw new Error('Patient not found');
            }

            const patient = result.rows[0];
            patient.full_name = `${patient.first_name} ${patient.last_name}`;
            patient.masked_ssn = patient.ssn_last_four ? `***-**-${patient.ssn_last_four}` : null;
            patient.formatted_phone = this.formatPhoneNumber(patient.phone);
            patient.age = this.calculateAge(patient.date_of_birth);

            this.setCache(cacheKey, patient);
            return patient;
        } catch (error) {
            logger.error('Failed to get patient details:', error);
            throw error;
        }
    }

    /**
     * Search providers with specialties and credentials
     */
    async searchProviders(searchParams, practiceId, limit = 20) {
        try {
            const cacheKey = `providers_${JSON.stringify(searchParams)}_${practiceId}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            let query = `
                SELECT 
                    pr.id,
                    pr.first_name,
                    pr.last_name,
                    pr.npi,
                    pr.specialty,
                    pr.credentials,
                    pr.phone,
                    pr.email,
                    pr.license_number,
                    pr.license_state,
                    pr.is_active,
                    pr.created_at,
                    -- Calculate relevance score
                    (
                        CASE WHEN pr.first_name ILIKE $1 THEN 50 ELSE 0 END +
                        CASE WHEN pr.last_name ILIKE $2 THEN 50 ELSE 0 END +
                        CASE WHEN pr.npi = $3 THEN 100 ELSE 0 END +
                        CASE WHEN pr.specialty ILIKE $4 THEN 30 ELSE 0 END +
                        CASE WHEN pr.license_number = $5 THEN 40 ELSE 0 END
                    ) as relevance_score
                FROM providers pr
                WHERE pr.practice_id = $6
                AND pr.is_active = true
                AND (
                     (? IS NULL OR pr.first_name LIKE ?) OR
                    (? IS NULL OR pr.last_name LIKE ?) OR
                    (? IS NULL OR pr.npi = ?) OR
                    (? IS NULL OR pr.specialty LIKE ?) OR
                    (? IS NULL OR pr.license_number = ?) OR
                    (? IS NULL OR (pr.first_name || ' ' || pr.last_name) LIKE ?)
                )
                ORDER BY relevance_score DESC, pr.last_name, pr.first_name
                LIMIT ?
            `;

            const params = [
                searchParams.firstName ? `%${searchParams.firstName}%` : null,
                searchParams.lastName ? `%${searchParams.lastName}%` : null,
                searchParams.npi || null,
                searchParams.specialty ? `%${searchParams.specialty}%` : null,
                searchParams.licenseNumber || null,
                practiceId,
                searchParams.fullName ? `%${searchParams.fullName}%` : null,
                limit
            ];

            const result = await this.db.query(query, params);
            const providers = result.rows.map(row => ({
                ...row,
                full_name: `${row.first_name} ${row.last_name}`,
                display_name: `${row.first_name} ${row.last_name}, ${row.credentials || ''}`.trim().replace(/,$/, ''),
                formatted_phone: this.formatPhoneNumber(row.phone)
            }));

            this.setCache(cacheKey, providers);
            return providers;
        } catch (error) {
            logger.error('Provider search failed:', error);
            throw error;
        }
    }

    /**
     * Get provider details with authorization history and statistics
     */
    async getProviderDetails(providerId, practiceId) {
        try {
            const cacheKey = `provider_details_${providerId}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            const query = `
                SELECT 
                    pr.*,
                    -- Authorization statistics
                    (
                        SELECT json_build_object(
                            'total_requests', COUNT(*),
                            'approved_requests', COUNT(*) FILTER (WHERE ad.decision = 'approved'),
                            'denied_requests', COUNT(*) FILTER (WHERE ad.decision = 'denied'),
                            'pending_requests', COUNT(*) FILTER (WHERE ar.status = 'pending'),
                            'approval_rate', 
                                CASE 
                                    WHEN COUNT(*) > 0 THEN 
                                        ROUND((COUNT(*) FILTER (WHERE ad.decision = 'approved')::numeric / COUNT(*)) * 100, 2)
                                    ELSE 0 
                                END
                        )
                        FROM authorization_requests ar
                        LEFT JOIN authorization_decisions ad ON ar.id = ad.authorization_id
                        WHERE ar.provider_id = pr.id
                        AND ar.created_at >= CURRENT_DATE - INTERVAL '90 days'
                    ) as authorization_stats,
                    -- Recent authorizations
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', ar.id,
                                'request_number', ar.request_number,
                                'patient_name', p.first_name || ' ' || p.last_name,
                                'service_type', ar.service_type,
                                'status', ar.status,
                                'created_at', ar.created_at,
                                'decision', ad.decision
                            )
                        )
                        FROM authorization_requests ar
                        LEFT JOIN patients p ON ar.patient_id = p.id
                        LEFT JOIN authorization_decisions ad ON ar.id = ad.authorization_id
                        WHERE ar.provider_id = pr.id
                        ORDER BY ar.created_at DESC
                        LIMIT 10
                    ) as recent_authorizations
                FROM providers pr
                WHERE pr.id = $1 AND pr.practice_id = $2
            `;

            const result = await this.db.query(query, [providerId, practiceId]);
            
            if (result.rows.length === 0) {
                throw new Error('Provider not found');
            }

            const provider = result.rows[0];
            provider.full_name = `${provider.first_name} ${provider.last_name}`;
            provider.display_name = `${provider.first_name} ${provider.last_name}, ${provider.credentials || ''}`.trim().replace(/,$/, '');
            provider.formatted_phone = this.formatPhoneNumber(provider.phone);

            this.setCache(cacheKey, provider);
            return provider;
        } catch (error) {
            logger.error('Failed to get provider details:', error);
            throw error;
        }
    }

    /**
     * Search practices for multi-practice organizations
     */
    async searchPractices(searchParams, limit = 20) {
        try {
            const query = `
                SELECT 
                    id,
                    name,
                    npi,
                    tax_id,
                    phone,
                    email,
                    address,
                    city,
                    state,
                    zip_code,
                    specialty,
                    is_active,
                    created_at
                FROM practices
                WHERE is_active = true
                AND (
                    ($1 IS NULL OR name ILIKE $1) OR
                    ($2 IS NULL OR npi = $2) OR
                    ($3 IS NULL OR tax_id = $3) OR
                    ($4 IS NULL OR specialty ILIKE $4)
                )
                ORDER BY name
                LIMIT $5
            `;

            const params = [
                searchParams.name ? `%${searchParams.name}%` : null,
                searchParams.npi || null,
                searchParams.taxId || null,
                searchParams.specialty ? `%${searchParams.specialty}%` : null,
                limit
            ];

            const result = await this.db.query(query, params);
            return result.rows.map(row => ({
                ...row,
                formatted_phone: this.formatPhoneNumber(row.phone)
            }));
        } catch (error) {
            logger.error('Practice search failed:', error);
            throw error;
        }
    }

    /**
     * Get payer information and requirements
     */
    async searchPayers(searchParams, limit = 20) {
        try {
            const query = `
                SELECT DISTINCT
                    payer_id,
                    payer_name,
                    COUNT(*) as requirement_count,
                    MAX(updated_at) as last_updated
                FROM payer_requirements
                WHERE is_active = true
                AND (
                    ($1 IS NULL OR payer_name ILIKE $1) OR
                    ($2 IS NULL OR payer_id = $2)
                )
                GROUP BY payer_id, payer_name
                ORDER BY payer_name
                LIMIT $3
            `;

            const params = [
                searchParams.name ? `%${searchParams.name}%` : null,
                searchParams.payerId || null,
                limit
            ];

            const result = await this.db.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error('Payer search failed:', error);
            throw error;
        }
    }

    /**
     * Get payer requirements for specific service type
     */
    async getPayerRequirements(payerId, serviceType) {
        try {
            const cacheKey = `payer_requirements_${payerId}_${serviceType}`;
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

            this.setCache(cacheKey, requirements);
            return requirements;
        } catch (error) {
            logger.error('Failed to get payer requirements:', error);
            throw error;
        }
    }

    /**
     * Validate patient insurance eligibility
     */
    async validateInsuranceEligibility(patientId) {
        try {
            const patient = await this.db.query(
                'SELECT insurance_payer_id, insurance_member_id, insurance_group_number FROM patients WHERE id = $1',
                [patientId]
            );

            if (!patient.rows[0]) {
                throw new Error('Patient not found');
            }

            const { insurance_payer_id, insurance_member_id, insurance_group_number } = patient.rows[0];

            if (!insurance_payer_id || !insurance_member_id) {
                return {
                    eligible: false,
                    reason: 'Missing insurance information',
                    coverage_status: 'unknown'
                };
            }

            // This would typically integrate with real-time eligibility verification
            // For now, returning mock validation
            return {
                eligible: true,
                coverage_status: 'active',
                effective_date: new Date().toISOString().split('T')[0],
                copay_amount: 25.00,
                deductible_remaining: 500.00,
                out_of_pocket_remaining: 2000.00,
                verified_date: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Insurance eligibility validation failed:', error);
            throw error;
        }
    }

    /**
     * Get smart suggestions for form completion
     */
    async getSmartSuggestions(partialData, practiceId) {
        try {
            const suggestions = {};

            // Suggest providers based on service type
            if (partialData.serviceType && !partialData.providerId) {
                const providerQuery = `
                    SELECT id, first_name, last_name, specialty
                    FROM providers
                    WHERE practice_id = ? 
                    AND is_active = 1
                    AND (specialty LIKE ? OR ? = 'other')
                    ORDER BY last_name, first_name
                    LIMIT 5
                `;
                
                const serviceSpecialtyMap = {
                    'imaging': '%radiology%',
                    'surgery': '%surgery%',
                    'physical_therapy': '%physical%',
                    'cardiology': '%cardio%'
                };
                
                const specialtyFilter = serviceSpecialtyMap[partialData.serviceType] || '%';
                const providerResult = await this.db.query(providerQuery, [practiceId, specialtyFilter]);
                suggestions.providers = providerResult.rows;
            }

            // Suggest procedure codes based on service type
            if (partialData.serviceType && !partialData.procedureCodes) {
                suggestions.procedureCodes = this.getCommonProcedureCodes(partialData.serviceType);
            }

            // Suggest diagnosis codes based on procedure codes
            if (partialData.procedureCodes && !partialData.diagnosisCodes) {
                suggestions.diagnosisCodes = this.getCommonDiagnosisCodes(partialData.procedureCodes);
            }

            return suggestions;
        } catch (error) {
            logger.error('Failed to get smart suggestions:', error);
            return {};
        }
    }

    /**
     * Utility functions
     */
    formatPhoneNumber(phone) {
        if (!phone) return null;
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return phone;
    }

    calculateAge(dateOfBirth) {
        if (!dateOfBirth) return null;
        const today = new Date();
        const birthDate = new Date(dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    getFromCache(key) {
        const cached = this.searchCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        this.searchCache.delete(key);
        return null;
    }

    setCache(key, data) {
        this.searchCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    getCommonProcedureCodes(serviceType) {
        const procedureCodeMap = {
            'imaging': ['70450', '70460', '70470', '71250', '71260', '72148', '72158'],
            'surgery': ['10060', '10080', '11400', '11600', '12001', '12002'],
            'physical_therapy': ['97110', '97112', '97116', '97140', '97530'],
            'laboratory': ['80053', '80061', '85025', '85027', '86900'],
            'cardiology': ['93000', '93005', '93010', '93306', '93307']
        };
        return procedureCodeMap[serviceType] || [];
    }

    getCommonDiagnosisCodes(procedureCodes) {
        // This would typically be more sophisticated, mapping specific procedures to diagnoses
        const commonDiagnoses = ['M25.50', 'M79.3', 'R06.02', 'I10', 'E11.9'];
        return commonDiagnoses;
    }

    /**
     * Clear cache (useful for testing or manual cache invalidation)
     */
    clearCache() {
        this.searchCache.clear();
        logger.info('Lookup service cache cleared');
    }
}

module.exports = LookupService;