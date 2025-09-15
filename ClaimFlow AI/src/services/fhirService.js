const axios = require('axios');
const { Pool } = require('pg');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * FHIR Service for EHR Connectivity
 * Implements FHIR R4 standards for healthcare data exchange
 */
class FHIRService {
    constructor(dbPool) {
        this.db = dbPool;
        this.fhirEndpoints = new Map();
        this.authTokens = new Map();
        this.resourceCache = new Map();
        this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
        this.isInitialized = false;
    }

    /**
     * Initialize FHIR service with EHR endpoints
     */
    async initialize() {
        try {
            await this.loadEHREndpoints();
            await this.validateFHIRConnections();
            this.isInitialized = true;
            logger.info('FHIR service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize FHIR service:', error);
            throw error;
        }
    }

    /**
     * Search for patient resources across connected EHRs
     */
    async searchPatient(searchCriteria) {
        try {
            const { identifier, name, birthDate, gender, mrn } = searchCriteria;
            const results = [];

            // Build FHIR search parameters
            const searchParams = new URLSearchParams();
            if (identifier) searchParams.append('identifier', identifier);
            if (name) searchParams.append('name', name);
            if (birthDate) searchParams.append('birthdate', birthDate);
            if (gender) searchParams.append('gender', gender);
            if (mrn) searchParams.append('identifier', `MRN|${mrn}`);

            // Search across all connected EHRs
            for (const [ehrId, endpoint] of this.fhirEndpoints) {
                try {
                    const patientData = await this.searchFHIRResource(
                        ehrId, 
                        'Patient', 
                        searchParams.toString()
                    );
                    
                    if (patientData && patientData.entry) {
                        for (const entry of patientData.entry) {
                            results.push({
                                ehrId,
                                ehrName: endpoint.name,
                                patient: this.transformPatientResource(entry.resource),
                                lastUpdated: entry.resource.meta?.lastUpdated
                            });
                        }
                    }
                } catch (error) {
                    logger.warn(`Failed to search patients in EHR ${ehrId}:`, error.message);
                }
            }

            // Remove duplicates and rank by relevance
            const uniqueResults = this.deduplicatePatients(results);
            return this.rankPatientResults(uniqueResults, searchCriteria);
        } catch (error) {
            logger.error('Patient search failed:', error);
            throw error;
        }
    }

    /**
     * Get comprehensive patient data including clinical history
     */
    async getPatientClinicalData(patientId, ehrId) {
        try {
            const clinicalData = {
                patient: null,
                conditions: [],
                procedures: [],
                medications: [],
                observations: [],
                encounters: [],
                allergies: [],
                immunizations: []
            };

            // Get patient demographics
            clinicalData.patient = await this.getFHIRResource(ehrId, 'Patient', patientId);
            if (!clinicalData.patient) {
                throw new Error(`Patient ${patientId} not found in EHR ${ehrId}`);
            }

            // Get clinical resources in parallel
            const resourcePromises = [
                this.getPatientConditions(ehrId, patientId),
                this.getPatientProcedures(ehrId, patientId),
                this.getPatientMedications(ehrId, patientId),
                this.getPatientObservations(ehrId, patientId),
                this.getPatientEncounters(ehrId, patientId),
                this.getPatientAllergies(ehrId, patientId),
                this.getPatientImmunizations(ehrId, patientId)
            ];

            const [
                conditions,
                procedures,
                medications,
                observations,
                encounters,
                allergies,
                immunizations
            ] = await Promise.allSettled(resourcePromises);

            // Process results
            if (conditions.status === 'fulfilled') clinicalData.conditions = conditions.value;
            if (procedures.status === 'fulfilled') clinicalData.procedures = procedures.value;
            if (medications.status === 'fulfilled') clinicalData.medications = medications.value;
            if (observations.status === 'fulfilled') clinicalData.observations = observations.value;
            if (encounters.status === 'fulfilled') clinicalData.encounters = encounters.value;
            if (allergies.status === 'fulfilled') clinicalData.allergies = allergies.value;
            if (immunizations.status === 'fulfilled') clinicalData.immunizations = immunizations.value;

            // Transform to standardized format
            return this.transformClinicalData(clinicalData);
        } catch (error) {
            logger.error('Failed to get patient clinical data:', error);
            throw error;
        }
    }

    /**
     * Create or update FHIR resources
     */
    async createFHIRResource(ehrId, resourceType, resourceData) {
        try {
            const endpoint = this.fhirEndpoints.get(ehrId);
            if (!endpoint) {
                throw new Error(`EHR endpoint ${ehrId} not found`);
            }

            const headers = await this.getAuthHeaders(ehrId);
            const response = await axios.post(
                `${endpoint.baseUrl}/${resourceType}`,
                resourceData,
                { headers }
            );

            logger.info(`Created ${resourceType} resource in EHR ${ehrId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to create ${resourceType} resource:`, error);
            throw error;
        }
    }

    /**
     * Update existing FHIR resource
     */
    async updateFHIRResource(ehrId, resourceType, resourceId, resourceData) {
        try {
            const endpoint = this.fhirEndpoints.get(ehrId);
            if (!endpoint) {
                throw new Error(`EHR endpoint ${ehrId} not found`);
            }

            const headers = await this.getAuthHeaders(ehrId);
            const response = await axios.put(
                `${endpoint.baseUrl}/${resourceType}/${resourceId}`,
                resourceData,
                { headers }
            );

            logger.info(`Updated ${resourceType}/${resourceId} in EHR ${ehrId}`);
            return response.data;
        } catch (error) {
            logger.error(`Failed to update ${resourceType}/${resourceId}:`, error);
            throw error;
        }
    }

    /**
     * Get FHIR resource by ID
     */
    async getFHIRResource(ehrId, resourceType, resourceId) {
        try {
            const cacheKey = `${ehrId}_${resourceType}_${resourceId}`;
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;

            const endpoint = this.fhirEndpoints.get(ehrId);
            if (!endpoint) {
                throw new Error(`EHR endpoint ${ehrId} not found`);
            }

            const headers = await this.getAuthHeaders(ehrId);
            const response = await axios.get(
                `${endpoint.baseUrl}/${resourceType}/${resourceId}`,
                { headers }
            );

            this.setCache(cacheKey, response.data);
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            logger.error(`Failed to get ${resourceType}/${resourceId}:`, error);
            throw error;
        }
    }

    /**
     * Search FHIR resources
     */
    async searchFHIRResource(ehrId, resourceType, searchParams) {
        try {
            const endpoint = this.fhirEndpoints.get(ehrId);
            if (!endpoint) {
                throw new Error(`EHR endpoint ${ehrId} not found`);
            }

            const headers = await this.getAuthHeaders(ehrId);
            const url = `${endpoint.baseUrl}/${resourceType}${searchParams ? '?' + searchParams : ''}`;
            
            const response = await axios.get(url, { headers });
            return response.data;
        } catch (error) {
            logger.error(`Failed to search ${resourceType} resources:`, error);
            throw error;
        }
    }

    /**
     * Get patient conditions (diagnoses)
     */
    async getPatientConditions(ehrId, patientId) {
        try {
            const searchParams = new URLSearchParams({
                patient: patientId,
                _sort: '-onset-date',
                _count: '50'
            });

            const bundle = await this.searchFHIRResource(ehrId, 'Condition', searchParams.toString());
            
            if (!bundle || !bundle.entry) return [];

            return bundle.entry.map(entry => this.transformConditionResource(entry.resource));
        } catch (error) {
            logger.error('Failed to get patient conditions:', error);
            return [];
        }
    }

    /**
     * Get patient procedures
     */
    async getPatientProcedures(ehrId, patientId) {
        try {
            const searchParams = new URLSearchParams({
                patient: patientId,
                _sort: '-date',
                _count: '50'
            });

            const bundle = await this.searchFHIRResource(ehrId, 'Procedure', searchParams.toString());
            
            if (!bundle || !bundle.entry) return [];

            return bundle.entry.map(entry => this.transformProcedureResource(entry.resource));
        } catch (error) {
            logger.error('Failed to get patient procedures:', error);
            return [];
        }
    }

    /**
     * Get patient medications
     */
    async getPatientMedications(ehrId, patientId) {
        try {
            const searchParams = new URLSearchParams({
                patient: patientId,
                status: 'active',
                _count: '50'
            });

            const bundle = await this.searchFHIRResource(ehrId, 'MedicationRequest', searchParams.toString());
            
            if (!bundle || !bundle.entry) return [];

            return bundle.entry.map(entry => this.transformMedicationResource(entry.resource));
        } catch (error) {
            logger.error('Failed to get patient medications:', error);
            return [];
        }
    }

    /**
     * Get patient observations (lab results, vitals)
     */
    async getPatientObservations(ehrId, patientId) {
        try {
            const searchParams = new URLSearchParams({
                patient: patientId,
                _sort: '-date',
                _count: '100'
            });

            const bundle = await this.searchFHIRResource(ehrId, 'Observation', searchParams.toString());
            
            if (!bundle || !bundle.entry) return [];

            return bundle.entry.map(entry => this.transformObservationResource(entry.resource));
        } catch (error) {
            logger.error('Failed to get patient observations:', error);
            return [];
        }
    }

    /**
     * Get patient encounters
     */
    async getPatientEncounters(ehrId, patientId) {
        try {
            const searchParams = new URLSearchParams({
                patient: patientId,
                _sort: '-date',
                _count: '20'
            });

            const bundle = await this.searchFHIRResource(ehrId, 'Encounter', searchParams.toString());
            
            if (!bundle || !bundle.entry) return [];

            return bundle.entry.map(entry => this.transformEncounterResource(entry.resource));
        } catch (error) {
            logger.error('Failed to get patient encounters:', error);
            return [];
        }
    }

    /**
     * Get patient allergies
     */
    async getPatientAllergies(ehrId, patientId) {
        try {
            const searchParams = new URLSearchParams({
                patient: patientId,
                _count: '50'
            });

            const bundle = await this.searchFHIRResource(ehrId, 'AllergyIntolerance', searchParams.toString());
            
            if (!bundle || !bundle.entry) return [];

            return bundle.entry.map(entry => this.transformAllergyResource(entry.resource));
        } catch (error) {
            logger.error('Failed to get patient allergies:', error);
            return [];
        }
    }

    /**
     * Get patient immunizations
     */
    async getPatientImmunizations(ehrId, patientId) {
        try {
            const searchParams = new URLSearchParams({
                patient: patientId,
                _sort: '-date',
                _count: '50'
            });

            const bundle = await this.searchFHIRResource(ehrId, 'Immunization', searchParams.toString());
            
            if (!bundle || !bundle.entry) return [];

            return bundle.entry.map(entry => this.transformImmunizationResource(entry.resource));
        } catch (error) {
            logger.error('Failed to get patient immunizations:', error);
            return [];
        }
    }

    /**
     * Transform FHIR Patient resource to standardized format
     */
    transformPatientResource(patient) {
        return {
            id: patient.id,
            identifiers: patient.identifier?.map(id => ({
                system: id.system,
                value: id.value,
                type: id.type?.coding?.[0]?.code
            })) || [],
            name: this.extractHumanName(patient.name),
            gender: patient.gender,
            birthDate: patient.birthDate,
            address: this.extractAddress(patient.address),
            telecom: this.extractTelecom(patient.telecom),
            maritalStatus: patient.maritalStatus?.coding?.[0]?.code,
            communication: patient.communication?.map(comm => ({
                language: comm.language?.coding?.[0]?.code,
                preferred: comm.preferred
            })) || [],
            active: patient.active,
            lastUpdated: patient.meta?.lastUpdated
        };
    }

    /**
     * Transform FHIR Condition resource
     */
    transformConditionResource(condition) {
        return {
            id: condition.id,
            code: condition.code?.coding?.[0]?.code,
            display: condition.code?.coding?.[0]?.display || condition.code?.text,
            system: condition.code?.coding?.[0]?.system,
            clinicalStatus: condition.clinicalStatus?.coding?.[0]?.code,
            verificationStatus: condition.verificationStatus?.coding?.[0]?.code,
            severity: condition.severity?.coding?.[0]?.display,
            onsetDate: condition.onsetDateTime || condition.onsetPeriod?.start,
            recordedDate: condition.recordedDate,
            category: condition.category?.[0]?.coding?.[0]?.code,
            lastUpdated: condition.meta?.lastUpdated
        };
    }

    /**
     * Transform FHIR Procedure resource
     */
    transformProcedureResource(procedure) {
        return {
            id: procedure.id,
            code: procedure.code?.coding?.[0]?.code,
            display: procedure.code?.coding?.[0]?.display || procedure.code?.text,
            system: procedure.code?.coding?.[0]?.system,
            status: procedure.status,
            category: procedure.category?.coding?.[0]?.code,
            performedDate: procedure.performedDateTime || procedure.performedPeriod?.start,
            performer: procedure.performer?.map(p => ({
                name: p.actor?.display,
                role: p.function?.coding?.[0]?.display
            })) || [],
            outcome: procedure.outcome?.coding?.[0]?.display,
            bodySite: procedure.bodySite?.map(site => site.coding?.[0]?.display) || [],
            lastUpdated: procedure.meta?.lastUpdated
        };
    }

    /**
     * Transform FHIR MedicationRequest resource
     */
    transformMedicationResource(medication) {
        return {
            id: medication.id,
            medication: {
                code: medication.medicationCodeableConcept?.coding?.[0]?.code,
                display: medication.medicationCodeableConcept?.coding?.[0]?.display || medication.medicationCodeableConcept?.text,
                system: medication.medicationCodeableConcept?.coding?.[0]?.system
            },
            status: medication.status,
            intent: medication.intent,
            authoredOn: medication.authoredOn,
            dosageInstruction: medication.dosageInstruction?.map(dosage => ({
                text: dosage.text,
                timing: dosage.timing?.repeat,
                route: dosage.route?.coding?.[0]?.display,
                doseQuantity: dosage.doseAndRate?.[0]?.doseQuantity
            })) || [],
            dispenseRequest: {
                quantity: medication.dispenseRequest?.quantity,
                expectedSupplyDuration: medication.dispenseRequest?.expectedSupplyDuration
            },
            lastUpdated: medication.meta?.lastUpdated
        };
    }

    /**
     * Transform FHIR Observation resource
     */
    transformObservationResource(observation) {
        return {
            id: observation.id,
            code: observation.code?.coding?.[0]?.code,
            display: observation.code?.coding?.[0]?.display || observation.code?.text,
            system: observation.code?.coding?.[0]?.system,
            status: observation.status,
            category: observation.category?.[0]?.coding?.[0]?.code,
            effectiveDate: observation.effectiveDateTime || observation.effectivePeriod?.start,
            value: this.extractObservationValue(observation),
            interpretation: observation.interpretation?.[0]?.coding?.[0]?.display,
            referenceRange: observation.referenceRange?.map(range => ({
                low: range.low,
                high: range.high,
                text: range.text
            })) || [],
            lastUpdated: observation.meta?.lastUpdated
        };
    }

    /**
     * Transform FHIR Encounter resource
     */
    transformEncounterResource(encounter) {
        return {
            id: encounter.id,
            status: encounter.status,
            class: encounter.class?.code,
            type: encounter.type?.map(t => ({
                code: t.coding?.[0]?.code,
                display: t.coding?.[0]?.display
            })) || [],
            period: {
                start: encounter.period?.start,
                end: encounter.period?.end
            },
            reasonCode: encounter.reasonCode?.map(reason => ({
                code: reason.coding?.[0]?.code,
                display: reason.coding?.[0]?.display
            })) || [],
            participant: encounter.participant?.map(p => ({
                type: p.type?.[0]?.coding?.[0]?.display,
                individual: p.individual?.display
            })) || [],
            location: encounter.location?.map(loc => loc.location?.display) || [],
            lastUpdated: encounter.meta?.lastUpdated
        };
    }

    /**
     * Transform FHIR AllergyIntolerance resource
     */
    transformAllergyResource(allergy) {
        return {
            id: allergy.id,
            code: allergy.code?.coding?.[0]?.code,
            display: allergy.code?.coding?.[0]?.display || allergy.code?.text,
            system: allergy.code?.coding?.[0]?.system,
            clinicalStatus: allergy.clinicalStatus?.coding?.[0]?.code,
            verificationStatus: allergy.verificationStatus?.coding?.[0]?.code,
            type: allergy.type,
            category: allergy.category,
            criticality: allergy.criticality,
            onsetDate: allergy.onsetDateTime,
            recordedDate: allergy.recordedDate,
            reaction: allergy.reaction?.map(r => ({
                substance: r.substance?.coding?.[0]?.display,
                manifestation: r.manifestation?.map(m => m.coding?.[0]?.display) || [],
                severity: r.severity
            })) || [],
            lastUpdated: allergy.meta?.lastUpdated
        };
    }

    /**
     * Transform FHIR Immunization resource
     */
    transformImmunizationResource(immunization) {
        return {
            id: immunization.id,
            vaccineCode: {
                code: immunization.vaccineCode?.coding?.[0]?.code,
                display: immunization.vaccineCode?.coding?.[0]?.display,
                system: immunization.vaccineCode?.coding?.[0]?.system
            },
            status: immunization.status,
            occurrenceDate: immunization.occurrenceDateTime,
            primarySource: immunization.primarySource,
            manufacturer: immunization.manufacturer?.display,
            lotNumber: immunization.lotNumber,
            expirationDate: immunization.expirationDate,
            site: immunization.site?.coding?.[0]?.display,
            route: immunization.route?.coding?.[0]?.display,
            doseQuantity: immunization.doseQuantity,
            performer: immunization.performer?.map(p => ({
                function: p.function?.coding?.[0]?.display,
                actor: p.actor?.display
            })) || [],
            lastUpdated: immunization.meta?.lastUpdated
        };
    }

    /**
     * Transform complete clinical data to standardized format
     */
    transformClinicalData(clinicalData) {
        return {
            patient: this.transformPatientResource(clinicalData.patient),
            summary: {
                activeConditions: clinicalData.conditions.filter(c => c.clinicalStatus === 'active').length,
                recentProcedures: clinicalData.procedures.filter(p => 
                    new Date(p.performedDate) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                ).length,
                activeMedications: clinicalData.medications.filter(m => m.status === 'active').length,
                recentEncounters: clinicalData.encounters.filter(e => 
                    new Date(e.period.start) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                ).length,
                knownAllergies: clinicalData.allergies.filter(a => a.clinicalStatus === 'active').length
            },
            conditions: clinicalData.conditions,
            procedures: clinicalData.procedures,
            medications: clinicalData.medications,
            observations: clinicalData.observations,
            encounters: clinicalData.encounters,
            allergies: clinicalData.allergies,
            immunizations: clinicalData.immunizations,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Utility functions
     */
    extractHumanName(names) {
        if (!names || names.length === 0) return null;
        
        const officialName = names.find(n => n.use === 'official') || names[0];
        return {
            use: officialName.use,
            family: officialName.family,
            given: officialName.given || [],
            prefix: officialName.prefix || [],
            suffix: officialName.suffix || [],
            text: officialName.text
        };
    }

    extractAddress(addresses) {
        if (!addresses || addresses.length === 0) return null;
        
        const homeAddress = addresses.find(a => a.use === 'home') || addresses[0];
        return {
            use: homeAddress.use,
            line: homeAddress.line || [],
            city: homeAddress.city,
            state: homeAddress.state,
            postalCode: homeAddress.postalCode,
            country: homeAddress.country,
            text: homeAddress.text
        };
    }

    extractTelecom(telecoms) {
        if (!telecoms || telecoms.length === 0) return [];
        
        return telecoms.map(t => ({
            system: t.system,
            value: t.value,
            use: t.use,
            rank: t.rank
        }));
    }

    extractObservationValue(observation) {
        if (observation.valueQuantity) {
            return {
                type: 'quantity',
                value: observation.valueQuantity.value,
                unit: observation.valueQuantity.unit,
                code: observation.valueQuantity.code
            };
        }
        
        if (observation.valueCodeableConcept) {
            return {
                type: 'codeable',
                code: observation.valueCodeableConcept.coding?.[0]?.code,
                display: observation.valueCodeableConcept.coding?.[0]?.display,
                text: observation.valueCodeableConcept.text
            };
        }
        
        if (observation.valueString) {
            return {
                type: 'string',
                value: observation.valueString
            };
        }
        
        if (observation.valueBoolean !== undefined) {
            return {
                type: 'boolean',
                value: observation.valueBoolean
            };
        }
        
        return null;
    }

    deduplicatePatients(patients) {
        const seen = new Set();
        const unique = [];
        
        for (const patient of patients) {
            // Create a key based on identifiers and demographics
            const key = this.createPatientKey(patient.patient);
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(patient);
            }
        }
        
        return unique;
    }

    createPatientKey(patient) {
        const identifiers = patient.identifiers
            .filter(id => id.system && id.value)
            .map(id => `${id.system}|${id.value}`)
            .sort()
            .join(',');
        
        const demographics = `${patient.name?.family || ''}|${patient.name?.given?.join(' ') || ''}|${patient.birthDate || ''}`;
        
        return crypto.createHash('md5').update(`${identifiers}|${demographics}`).digest('hex');
    }

    rankPatientResults(patients, searchCriteria) {
        return patients.map(patient => ({
            ...patient,
            relevanceScore: this.calculatePatientRelevance(patient.patient, searchCriteria)
        })).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    calculatePatientRelevance(patient, criteria) {
        let score = 0;
        
        // Exact identifier match
        if (criteria.identifier) {
            const hasExactIdentifier = patient.identifiers.some(id => 
                id.value === criteria.identifier
            );
            if (hasExactIdentifier) score += 100;
        }
        
        // Name similarity
        if (criteria.name && patient.name) {
            const nameMatch = this.calculateNameSimilarity(patient.name, criteria.name);
            score += nameMatch * 50;
        }
        
        // Birth date match
        if (criteria.birthDate && patient.birthDate === criteria.birthDate) {
            score += 75;
        }
        
        // Gender match
        if (criteria.gender && patient.gender === criteria.gender) {
            score += 25;
        }
        
        return score;
    }

    calculateNameSimilarity(patientName, searchName) {
        const patientFullName = `${patientName.given?.join(' ') || ''} ${patientName.family || ''}`.toLowerCase().trim();
        const searchFullName = searchName.toLowerCase().trim();
        
        if (patientFullName === searchFullName) return 1.0;
        
        // Simple substring matching - could be enhanced with fuzzy matching
        const words = searchFullName.split(' ');
        const matchedWords = words.filter(word => patientFullName.includes(word));
        
        return matchedWords.length / words.length;
    }

    async loadEHREndpoints() {
        try {
            const query = `
                SELECT 
                    id,
                    name,
                    base_url,
                    auth_type,
                    client_id,
                    client_secret,
                    token_url,
                    scope,
                    is_active
                FROM fhir_endpoints
                WHERE is_active = true
            `;
            
            const result = await this.db.query(query);
            
            for (const row of result.rows) {
                this.fhirEndpoints.set(row.id, {
                    name: row.name,
                    baseUrl: row.base_url,
                    authType: row.auth_type,
                    clientId: row.client_id,
                    clientSecret: row.client_secret,
                    tokenUrl: row.token_url,
                    scope: row.scope
                });
            }
            
            logger.info(`Loaded ${result.rows.length} FHIR endpoints`);
        } catch (error) {
            logger.error('Failed to load EHR endpoints:', error);
            throw error;
        }
    }

    async validateFHIRConnections() {
        const validationPromises = [];
        
        for (const [ehrId, endpoint] of this.fhirEndpoints) {
            validationPromises.push(this.validateConnection(ehrId, endpoint));
        }
        
        const results = await Promise.allSettled(validationPromises);
        
        let validConnections = 0;
        results.forEach((result, index) => {
            const ehrId = Array.from(this.fhirEndpoints.keys())[index];
            if (result.status === 'fulfilled') {
                validConnections++;
                logger.info(`FHIR connection validated for EHR ${ehrId}`);
            } else {
                logger.warn(`FHIR connection failed for EHR ${ehrId}:`, result.reason.message);
            }
        });
        
        logger.info(`${validConnections}/${this.fhirEndpoints.size} FHIR connections validated`);
    }

    async validateConnection(ehrId, endpoint) {
        try {
            const headers = await this.getAuthHeaders(ehrId);
            const response = await axios.get(
                `${endpoint.baseUrl}/metadata`,
                { headers, timeout: 10000 }
            );
            
            return response.status === 200;
        } catch (error) {
            throw new Error(`Connection validation failed: ${error.message}`);
        }
    }

    async getAuthHeaders(ehrId) {
        const endpoint = this.fhirEndpoints.get(ehrId);
        if (!endpoint) {
            throw new Error(`EHR endpoint ${ehrId} not found`);
        }

        const headers = {
            'Content-Type': 'application/fhir+json',
            'Accept': 'application/fhir+json'
        };

        if (endpoint.authType === 'oauth2') {
            const token = await this.getOAuth2Token(ehrId, endpoint);
            headers['Authorization'] = `Bearer ${token}`;
        } else if (endpoint.authType === 'basic') {
            const credentials = Buffer.from(`${endpoint.clientId}:${endpoint.clientSecret}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        }

        return headers;
    }

    async getOAuth2Token(ehrId, endpoint) {
        try {
            // Check if we have a valid cached token
            const cachedToken = this.authTokens.get(ehrId);
            if (cachedToken && cachedToken.expiresAt > Date.now()) {
                return cachedToken.accessToken;
            }

            // Request new token
            const tokenResponse = await axios.post(endpoint.tokenUrl, {
                grant_type: 'client_credentials',
                client_id: endpoint.clientId,
                client_secret: endpoint.clientSecret,
                scope: endpoint.scope || 'system/*.read'
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const { access_token, expires_in } = tokenResponse.data;
            
            // Cache the token
            this.authTokens.set(ehrId, {
                accessToken: access_token,
                expiresAt: Date.now() + (expires_in * 1000) - 60000 // 1 minute buffer
            });

            return access_token;
        } catch (error) {
            logger.error(`Failed to get OAuth2 token for EHR ${ehrId}:`, error);
            throw error;
        }
    }

    getFromCache(key) {
        const cached = this.resourceCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        this.resourceCache.delete(key);
        return null;
    }

    setCache(key, data) {
        this.resourceCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.resourceCache.clear();
        logger.info('FHIR resource cache cleared');
    }
}

module.exports = FHIRService;