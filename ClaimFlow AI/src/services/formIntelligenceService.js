const { pool } = require('../database/connection');
const fs = require('fs').promises;
const path = require('path');

class FormIntelligenceService {
  constructor(dbPool) {
    this.pool = dbPool || pool;
    
    // Payer-specific form configurations
    this.payerForms = {
      'aetna': {
        authorizationForm: 'aetna_prior_auth_v2.json',
        requiredFields: ['member_id', 'provider_npi', 'diagnosis_code', 'procedure_code', 'service_date'],
        optionalFields: ['clinical_notes', 'supporting_documentation', 'urgency_level'],
        fieldMappings: {
          'patient_name': 'member_name',
          'dob': 'member_dob',
          'policy_number': 'member_id',
          'npi': 'provider_npi'
        },
        validationRules: {
          'member_id': /^\d{9,12}$/,
          'provider_npi': /^\d{10}$/,
          'diagnosis_code': /^[A-Z]\d{2}(\.\d{1,4})?$/,
          'procedure_code': /^\d{5}$/
        }
      },
      'bcbs': {
        authorizationForm: 'bcbs_authorization_v3.json',
        requiredFields: ['subscriber_id', 'provider_id', 'icd10_code', 'cpt_code', 'dos'],
        optionalFields: ['medical_necessity', 'prior_treatments', 'expected_outcome'],
        fieldMappings: {
          'patient_name': 'subscriber_name',
          'dob': 'subscriber_dob',
          'policy_number': 'subscriber_id',
          'npi': 'provider_id'
        },
        validationRules: {
          'subscriber_id': /^[A-Z]{3}\d{9}$/,
          'provider_id': /^\d{10}$/,
          'icd10_code': /^[A-Z]\d{2}(\.\d{1,4})?$/,
          'cpt_code': /^\d{5}$/
        }
      },
      'cigna': {
        authorizationForm: 'cigna_preauth_v1.json',
        requiredFields: ['member_number', 'servicing_provider_npi', 'primary_diagnosis', 'requested_service', 'service_date'],
        optionalFields: ['secondary_diagnosis', 'clinical_rationale', 'alternative_treatments'],
        fieldMappings: {
          'patient_name': 'member_name',
          'dob': 'member_birth_date',
          'policy_number': 'member_number',
          'npi': 'servicing_provider_npi'
        },
        validationRules: {
          'member_number': /^\d{8,11}$/,
          'servicing_provider_npi': /^\d{10}$/,
          'primary_diagnosis': /^[A-Z]\d{2}(\.\d{1,4})?$/,
          'requested_service': /^\d{5}$/
        }
      },
      'humana': {
        authorizationForm: 'humana_auth_request_v2.json',
        requiredFields: ['humana_id', 'provider_npi', 'diagnosis', 'procedure', 'requested_date'],
        optionalFields: ['urgency_indicator', 'supporting_notes', 'physician_statement'],
        fieldMappings: {
          'patient_name': 'member_full_name',
          'dob': 'date_of_birth',
          'policy_number': 'humana_id',
          'npi': 'provider_npi'
        },
        validationRules: {
          'humana_id': /^H\d{8,10}$/,
          'provider_npi': /^\d{10}$/,
          'diagnosis': /^[A-Z]\d{2}(\.\d{1,4})?$/,
          'procedure': /^\d{5}$/
        }
      },
      'medicare': {
        authorizationForm: 'cms_prior_auth_v4.json',
        requiredFields: ['medicare_number', 'provider_ptan', 'hcpcs_code', 'diagnosis_code', 'service_date'],
        optionalFields: ['lcd_compliance', 'medical_necessity_documentation', 'beneficiary_signature'],
        fieldMappings: {
          'patient_name': 'beneficiary_name',
          'dob': 'beneficiary_dob',
          'policy_number': 'medicare_number',
          'npi': 'provider_ptan'
        },
        validationRules: {
          'medicare_number': /^\d{3}-\d{2}-\d{4}[A-Z]?$/,
          'provider_ptan': /^\d{10}$/,
          'hcpcs_code': /^[A-Z]\d{4}$/,
          'diagnosis_code': /^[A-Z]\d{2}(\.\d{1,4})?$/
        }
      }
    };
    
    // Common field mappings across payers
    this.commonFieldMappings = {
      'patient_first_name': ['first_name', 'fname', 'patient_fname'],
      'patient_last_name': ['last_name', 'lname', 'patient_lname'],
      'date_of_birth': ['dob', 'birth_date', 'patient_dob'],
      'gender': ['sex', 'patient_gender', 'patient_sex'],
      'address': ['patient_address', 'home_address', 'mailing_address'],
      'phone': ['patient_phone', 'contact_number', 'phone_number'],
      'diagnosis_code': ['icd10', 'primary_diagnosis', 'dx_code'],
      'procedure_code': ['cpt', 'hcpcs', 'service_code'],
      'provider_name': ['physician_name', 'doctor_name', 'attending_physician'],
      'provider_npi': ['npi', 'provider_id', 'physician_npi'],
      'service_date': ['dos', 'date_of_service', 'treatment_date']
    };
    
    // Form completion confidence thresholds
    this.confidenceThresholds = {
      high: 0.9,
      medium: 0.7,
      low: 0.5
    };
  }

  // Initialize Form Intelligence service
  async initialize() {
    try {
      await this.createFormTables();
      await this.loadFormTemplates();
      console.log('Form Intelligence service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Form Intelligence service:', error);
      throw error;
    }
  }

  // Create necessary database tables
  async createFormTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS form_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        form_name VARCHAR(200) NOT NULL,
        form_version VARCHAR(50),
        template_data TEXT NOT NULL,
        field_mappings TEXT,
        validation_rules TEXT,
        required_fields TEXT,
        optional_fields TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
      )`,
      
      `CREATE TABLE IF NOT EXISTS form_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER REFERENCES form_templates(id),
        authorization_id INTEGER,
        payer_name VARCHAR(100) NOT NULL,
        extracted_data TEXT,
        mapped_data TEXT,
        form_data TEXT,
        completion_status VARCHAR(50) DEFAULT 'pending',
        confidence_score DECIMAL(3,2),
        validation_errors TEXT,
        missing_fields TEXT,
        submission_attempts INTEGER DEFAULT 0,
        last_submission_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS field_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_field VARCHAR(100) NOT NULL,
        target_field VARCHAR(100) NOT NULL,
        payer_name VARCHAR(100),
        mapping_confidence DECIMAL(3,2),
        transformation_rule TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS form_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        form_type VARCHAR(100) NOT NULL,
        completion_rate DECIMAL(5,2),
        avg_confidence_score DECIMAL(3,2),
        common_missing_fields TEXT,
        processing_time_avg INTEGER,
        success_rate DECIMAL(5,2),
        analysis_date DATE DEFAULT CURRENT_DATE
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_form_templates_payer ON form_templates(payer_name)',
      'CREATE INDEX IF NOT EXISTS idx_form_submissions_payer ON form_submissions(payer_name)',
      'CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(completion_status)',
      'CREATE INDEX IF NOT EXISTS idx_field_mappings_source ON field_mappings(source_field)',
      'CREATE INDEX IF NOT EXISTS idx_field_mappings_payer ON field_mappings(payer_name)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  // Load form templates into database
  async loadFormTemplates() {
    try {
      for (const [payerName, config] of Object.entries(this.payerForms)) {
        await this.pool.query(`
          INSERT OR REPLACE INTO form_templates (
            payer_name, form_name, template_data, field_mappings, 
            validation_rules, required_fields, optional_fields, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          payerName,
          config.authorizationForm,
          JSON.stringify(config),
          JSON.stringify(config.fieldMappings),
          JSON.stringify(config.validationRules),
          config.requiredFields,
          config.optionalFields
        ]);
      }
    } catch (error) {
      console.error('Failed to load form templates:', error);
    }
  }

  // Map extracted data to payer-specific form
  async mapDataToForm(extractedData, payerName, authorizationId) {
    try {
      const startTime = Date.now();
      
      // Get payer configuration
      const payerConfig = this.payerForms[payerName.toLowerCase()];
      if (!payerConfig) {
        throw new Error(`Unsupported payer: ${payerName}`);
      }
      
      // Create form submission record
      const submissionId = await this.createFormSubmission(payerName, authorizationId, extractedData);
      
      // Map extracted data to form fields
      const mappedData = await this.performFieldMapping(extractedData, payerConfig);
      
      // Validate mapped data
      const validationResult = await this.validateFormData(mappedData, payerConfig);
      
      // Calculate completion confidence
      const confidenceScore = this.calculateCompletionConfidence(mappedData, payerConfig, validationResult);
      
      // Generate final form data
      const formData = await this.generateFormData(mappedData, payerConfig);
      
      // Update submission record
      await this.updateFormSubmission(submissionId, {
        mappedData,
        formData,
        confidenceScore,
        validationErrors: validationResult.errors,
        missingFields: validationResult.missingFields,
        completionStatus: this.determineCompletionStatus(confidenceScore, validationResult)
      });
      
      const processingTime = Date.now() - startTime;
      
      return {
        submissionId,
        formData,
        mappedData,
        confidenceScore,
        validationResult,
        processingTime,
        status: this.determineCompletionStatus(confidenceScore, validationResult)
      };
    } catch (error) {
      console.error('Form mapping failed:', error);
      throw error;
    }
  }

  // Create form submission record
  async createFormSubmission(payerName, authorizationId, extractedData) {
    const result = await this.pool.query(`
      INSERT INTO form_submissions (payer_name, authorization_id, extracted_data)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [payerName, authorizationId, JSON.stringify(extractedData)]);
    
    return result.rows[0].id;
  }

  // Perform field mapping from extracted data to form fields
  async performFieldMapping(extractedData, payerConfig) {
    const mappedData = {};
    
    // Apply payer-specific field mappings
    for (const [sourceField, targetField] of Object.entries(payerConfig.fieldMappings)) {
      const value = this.extractFieldValue(extractedData, sourceField);
      if (value) {
        mappedData[targetField] = value;
      }
    }
    
    // Apply common field mappings
    for (const [commonField, variants] of Object.entries(this.commonFieldMappings)) {
      if (!mappedData[commonField]) {
        for (const variant of variants) {
          const value = this.extractFieldValue(extractedData, variant);
          if (value) {
            mappedData[commonField] = value;
            break;
          }
        }
      }
    }
    
    // Extract structured clinical data
    if (extractedData.clinicalData) {
      this.mapClinicalData(extractedData.clinicalData, mappedData, payerConfig);
    }
    
    // Extract entities
    if (extractedData.entities) {
      this.mapEntityData(extractedData.entities, mappedData, payerConfig);
    }
    
    // Apply data transformations
    this.applyDataTransformations(mappedData, payerConfig);
    
    return mappedData;
  }

  // Extract field value from nested data structure
  extractFieldValue(data, fieldPath) {
    const keys = fieldPath.split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return value;
  }

  // Map clinical data to form fields
  mapClinicalData(clinicalData, mappedData, payerConfig) {
    // Map chief complaint
    if (clinicalData.chiefComplaint) {
      mappedData.chief_complaint = clinicalData.chiefComplaint;
    }
    
    // Map diagnosis
    if (clinicalData.assessment) {
      mappedData.primary_diagnosis_description = clinicalData.assessment;
    }
    
    // Map medications
    if (clinicalData.medications && clinicalData.medications.length > 0) {
      mappedData.current_medications = clinicalData.medications.join(', ');
    }
    
    // Map allergies
    if (clinicalData.allergies && clinicalData.allergies.length > 0) {
      mappedData.known_allergies = clinicalData.allergies.join(', ');
    }
    
    // Map vital signs
    if (clinicalData.vitals) {
      Object.entries(clinicalData.vitals).forEach(([vital, value]) => {
        mappedData[`vital_${vital}`] = value;
      });
    }
    
    // Map treatment plan
    if (clinicalData.plan) {
      mappedData.treatment_plan = clinicalData.plan;
    }
  }

  // Map entity data to form fields
  mapEntityData(entities, mappedData, payerConfig) {
    // Map symptoms
    if (entities.symptoms && entities.symptoms.length > 0) {
      const symptoms = entities.symptoms
        .filter(s => !s.isNegated)
        .map(s => s.text)
        .join(', ');
      if (symptoms) {
        mappedData.presenting_symptoms = symptoms;
      }
    }
    
    // Map procedures
    if (entities.procedures && entities.procedures.length > 0) {
      const procedures = entities.procedures
        .filter(p => !p.isNegated)
        .map(p => p.text)
        .join(', ');
      if (procedures) {
        mappedData.requested_procedures = procedures;
      }
    }
    
    // Map conditions
    if (entities.conditions && entities.conditions.length > 0) {
      const conditions = entities.conditions
        .filter(c => !c.isNegated)
        .map(c => c.text)
        .join(', ');
      if (conditions) {
        mappedData.medical_conditions = conditions;
      }
    }
  }

  // Apply data transformations
  applyDataTransformations(mappedData, payerConfig) {
    // Format dates
    for (const [field, value] of Object.entries(mappedData)) {
      if (field.includes('date') || field.includes('dob')) {
        mappedData[field] = this.formatDate(value);
      }
    }
    
    // Format phone numbers
    if (mappedData.phone) {
      mappedData.phone = this.formatPhoneNumber(mappedData.phone);
    }
    
    // Normalize medical codes
    if (mappedData.diagnosis_code) {
      mappedData.diagnosis_code = this.normalizeMedicalCode(mappedData.diagnosis_code, 'ICD10');
    }
    
    if (mappedData.procedure_code) {
      mappedData.procedure_code = this.normalizeMedicalCode(mappedData.procedure_code, 'CPT');
    }
  }

  // Format date string
  formatDate(dateString) {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      
      // Return in MM/DD/YYYY format
      return date.toLocaleDateString('en-US');
    } catch (error) {
      return dateString;
    }
  }

  // Format phone number
  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    
    return phone;
  }

  // Normalize medical codes
  normalizeMedicalCode(code, codeType) {
    if (!code) return null;
    
    const cleanCode = code.trim().toUpperCase();
    
    if (codeType === 'ICD10') {
      // Ensure proper ICD-10 format
      if (/^[A-Z]\d{2}$/.test(cleanCode)) {
        return cleanCode;
      }
      if (/^[A-Z]\d{2}\.\d{1,4}$/.test(cleanCode)) {
        return cleanCode;
      }
    }
    
    if (codeType === 'CPT') {
      // Ensure proper CPT format
      if (/^\d{5}$/.test(cleanCode)) {
        return cleanCode;
      }
    }
    
    return code;
  }

  // Validate form data against payer requirements
  async validateFormData(mappedData, payerConfig) {
    const errors = [];
    const warnings = [];
    const missingFields = [];
    
    // Check required fields
    for (const requiredField of payerConfig.requiredFields) {
      if (!mappedData[requiredField] || mappedData[requiredField] === '') {
        missingFields.push(requiredField);
        errors.push(`Required field missing: ${requiredField}`);
      }
    }
    
    // Validate field formats
    for (const [field, pattern] of Object.entries(payerConfig.validationRules)) {
      if (mappedData[field]) {
        if (!pattern.test(mappedData[field])) {
          errors.push(`Invalid format for field ${field}: ${mappedData[field]}`);
        }
      }
    }
    
    // Check for data consistency
    const consistencyErrors = this.checkDataConsistency(mappedData);
    errors.push(...consistencyErrors);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingFields,
      completeness: this.calculateCompleteness(mappedData, payerConfig)
    };
  }

  // Check data consistency
  checkDataConsistency(mappedData) {
    const errors = [];
    
    // Check date consistency
    if (mappedData.date_of_birth && mappedData.service_date) {
      const dob = new Date(mappedData.date_of_birth);
      const serviceDate = new Date(mappedData.service_date);
      
      if (dob > serviceDate) {
        errors.push('Service date cannot be before date of birth');
      }
    }
    
    // Check age consistency for certain procedures
    if (mappedData.date_of_birth && mappedData.procedure_code) {
      const age = this.calculateAge(mappedData.date_of_birth);
      const ageRestrictedProcedures = {
        '99401': { minAge: 18, description: 'Adult counseling' },
        '90834': { minAge: 0, maxAge: 17, description: 'Child psychotherapy' }
      };
      
      const restriction = ageRestrictedProcedures[mappedData.procedure_code];
      if (restriction) {
        if (restriction.minAge && age < restriction.minAge) {
          errors.push(`Patient too young for procedure ${mappedData.procedure_code}`);
        }
        if (restriction.maxAge && age > restriction.maxAge) {
          errors.push(`Patient too old for procedure ${mappedData.procedure_code}`);
        }
      }
    }
    
    return errors;
  }

  // Calculate age from date of birth
  calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  // Calculate form completeness percentage
  calculateCompleteness(mappedData, payerConfig) {
    const totalFields = payerConfig.requiredFields.length + payerConfig.optionalFields.length;
    const completedFields = [...payerConfig.requiredFields, ...payerConfig.optionalFields]
      .filter(field => mappedData[field] && mappedData[field] !== '').length;
    
    return totalFields > 0 ? (completedFields / totalFields) * 100 : 0;
  }

  // Calculate completion confidence score
  calculateCompletionConfidence(mappedData, payerConfig, validationResult) {
    let confidence = 0;
    
    // Base confidence from completeness
    const completeness = validationResult.completeness / 100;
    confidence += completeness * 0.4;
    
    // Confidence from required fields
    const requiredFieldsComplete = payerConfig.requiredFields.filter(
      field => mappedData[field] && mappedData[field] !== ''
    ).length;
    const requiredFieldsRatio = requiredFieldsComplete / payerConfig.requiredFields.length;
    confidence += requiredFieldsRatio * 0.4;
    
    // Confidence from validation
    const validationPenalty = validationResult.errors.length * 0.1;
    confidence -= validationPenalty;
    
    // Confidence from data quality
    const dataQualityScore = this.assessDataQuality(mappedData);
    confidence += dataQualityScore * 0.2;
    
    return Math.max(0, Math.min(1, confidence));
  }

  // Assess data quality
  assessDataQuality(mappedData) {
    let qualityScore = 0;
    let assessedFields = 0;
    
    for (const [field, value] of Object.entries(mappedData)) {
      if (value && value !== '') {
        assessedFields++;
        
        // Check for placeholder or generic values
        if (this.isGenericValue(value)) {
          qualityScore += 0.3;
        } else if (this.isWellFormatted(field, value)) {
          qualityScore += 1;
        } else {
          qualityScore += 0.7;
        }
      }
    }
    
    return assessedFields > 0 ? qualityScore / assessedFields : 0;
  }

  // Check if value is generic/placeholder
  isGenericValue(value) {
    const genericPatterns = [
      /^(unknown|n\/a|not applicable|tbd|pending)$/i,
      /^(xxx|000|111|999)$/,
      /^test|sample|example/i
    ];
    
    return genericPatterns.some(pattern => pattern.test(value.toString()));
  }

  // Check if value is well formatted for the field type
  isWellFormatted(field, value) {
    const fieldPatterns = {
      phone: /^\(\d{3}\) \d{3}-\d{4}$/,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      date: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
      ssn: /^\d{3}-\d{2}-\d{4}$/,
      zip: /^\d{5}(-\d{4})?$/
    };
    
    for (const [type, pattern] of Object.entries(fieldPatterns)) {
      if (field.toLowerCase().includes(type)) {
        return pattern.test(value.toString());
      }
    }
    
    return true; // Default to well-formatted if no specific pattern
  }

  // Determine completion status
  determineCompletionStatus(confidenceScore, validationResult) {
    if (!validationResult.isValid) {
      return 'validation_failed';
    }
    
    if (confidenceScore >= this.confidenceThresholds.high) {
      return 'ready_for_submission';
    } else if (confidenceScore >= this.confidenceThresholds.medium) {
      return 'needs_review';
    } else {
      return 'incomplete';
    }
  }

  // Generate final form data
  async generateFormData(mappedData, payerConfig) {
    const formData = {
      payer: payerConfig.authorizationForm.replace('.json', ''),
      version: '1.0',
      timestamp: new Date().toISOString(),
      fields: {},
      metadata: {
        generatedBy: 'FormIntelligenceService',
        confidence: 'calculated_separately'
      }
    };
    
    // Copy all mapped data to form fields
    formData.fields = { ...mappedData };
    
    // Add any payer-specific formatting
    this.applyPayerSpecificFormatting(formData, payerConfig);
    
    return formData;
  }

  // Apply payer-specific formatting
  applyPayerSpecificFormatting(formData, payerConfig) {
    // This can be extended for payer-specific requirements
    // For now, just ensure consistent formatting
    
    // Ensure all required fields are present (even if empty)
    for (const field of payerConfig.requiredFields) {
      if (!(field in formData.fields)) {
        formData.fields[field] = '';
      }
    }
  }

  // Update form submission record
  async updateFormSubmission(submissionId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    Object.entries(updates).forEach(([key, value]) => {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramIndex}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      paramIndex++;
    });
    
    fields.push('updated_at = NOW()');
    values.push(submissionId);
    
    await this.pool.query(`
      UPDATE form_submissions SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
    `, values);
  }

  // Get form submission by ID
  async getFormSubmission(submissionId) {
    const result = await this.pool.query(
      'SELECT * FROM form_submissions WHERE id = $1',
      [submissionId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Form submission not found');
    }
    
    return result.rows[0];
  }

  // Get supported payers
  getSupportedPayers() {
    return Object.keys(this.payerForms);
  }

  // Get payer requirements
  getPayerRequirements(payerName) {
    const config = this.payerForms[payerName.toLowerCase()];
    if (!config) {
      throw new Error(`Unsupported payer: ${payerName}`);
    }
    
    return {
      requiredFields: config.requiredFields,
      optionalFields: config.optionalFields,
      fieldMappings: config.fieldMappings,
      validationRules: config.validationRules
    };
  }

  // Batch process multiple forms
  async batchProcessForms(extractedDataList, payerName) {
    const results = [];
    
    for (const extractedData of extractedDataList) {
      try {
        const result = await this.mapDataToForm(extractedData, payerName);
        results.push(result);
      } catch (error) {
        results.push({ error: error.message, extractedData });
      }
    }
    
    return results;
  }

  // Get form analytics
  async getFormAnalytics(payerName, startDate, endDate) {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_submissions,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN completion_status = 'ready_for_submission' THEN 1 END) as ready_submissions,
        COUNT(CASE WHEN completion_status = 'validation_failed' THEN 1 END) as failed_submissions,
        array_agg(DISTINCT unnest(missing_fields)) as common_missing_fields
      FROM form_submissions
      WHERE payer_name = $1 AND created_at BETWEEN $2 AND $3
    `, [payerName, startDate, endDate]);
    
    return result.rows[0];
  }
}

module.exports = FormIntelligenceService;