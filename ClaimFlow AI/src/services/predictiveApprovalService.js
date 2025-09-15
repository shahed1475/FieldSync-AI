const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class PredictiveApprovalService {
  constructor(pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    // Scoring models for different payers
    this.scoringModels = {
      'aetna': {
        weights: {
          diagnosis_specificity: 0.25,
          procedure_appropriateness: 0.20,
          medical_necessity: 0.20,
          provider_history: 0.15,
          patient_history: 0.10,
          documentation_quality: 0.10
        },
        thresholds: {
          high_approval: 0.85,
          medium_approval: 0.65,
          low_approval: 0.45
        },
        commonDenialReasons: [
          'insufficient_medical_necessity',
          'experimental_procedure',
          'lack_of_prior_authorization',
          'incomplete_documentation'
        ]
      },
      'bcbs': {
        weights: {
          diagnosis_specificity: 0.30,
          procedure_appropriateness: 0.25,
          medical_necessity: 0.20,
          provider_history: 0.10,
          patient_history: 0.10,
          documentation_quality: 0.05
        },
        thresholds: {
          high_approval: 0.80,
          medium_approval: 0.60,
          low_approval: 0.40
        },
        commonDenialReasons: [
          'not_medically_necessary',
          'alternative_treatment_available',
          'insufficient_conservative_treatment',
          'duplicate_service'
        ]
      },
      'cigna': {
        weights: {
          diagnosis_specificity: 0.20,
          procedure_appropriateness: 0.25,
          medical_necessity: 0.25,
          provider_history: 0.15,
          patient_history: 0.10,
          documentation_quality: 0.05
        },
        thresholds: {
          high_approval: 0.82,
          medium_approval: 0.62,
          low_approval: 0.42
        },
        commonDenialReasons: [
          'investigational_treatment',
          'lack_of_medical_necessity',
          'provider_not_contracted',
          'service_not_covered'
        ]
      },
      'humana': {
        weights: {
          diagnosis_specificity: 0.22,
          procedure_appropriateness: 0.23,
          medical_necessity: 0.25,
          provider_history: 0.12,
          patient_history: 0.13,
          documentation_quality: 0.05
        },
        thresholds: {
          high_approval: 0.83,
          medium_approval: 0.63,
          low_approval: 0.43
        },
        commonDenialReasons: [
          'not_covered_benefit',
          'experimental_investigational',
          'medical_necessity_not_established',
          'prior_authorization_required'
        ]
      },
      'medicare': {
        weights: {
          diagnosis_specificity: 0.35,
          procedure_appropriateness: 0.30,
          medical_necessity: 0.20,
          provider_history: 0.05,
          patient_history: 0.05,
          documentation_quality: 0.05
        },
        thresholds: {
          high_approval: 0.88,
          medium_approval: 0.68,
          low_approval: 0.48
        },
        commonDenialReasons: [
          'not_reasonable_necessary',
          'frequency_limitation_exceeded',
          'lcd_ncd_not_met',
          'insufficient_documentation'
        ]
      }
    };
    
    // Clinical decision support rules
    this.clinicalRules = {
      diagnosisProcedureMapping: {
        // Common diagnosis-procedure combinations and their typical approval rates
        'M25.511': { // Pain in right shoulder
          '20610': 0.85, // Arthrocentesis
          '73030': 0.95, // Shoulder X-ray
          '73221': 0.75  // MRI shoulder
        },
        'M79.3': { // Panniculitis
          '11042': 0.70, // Debridement
          '11043': 0.65  // Debridement, deeper
        },
        'E11.9': { // Type 2 diabetes
          '99213': 0.90, // Office visit
          '82947': 0.95, // Glucose test
          '83036': 0.90  // HbA1c
        }
      },
      
      ageBasedRules: {
        pediatric: {
          ageRange: [0, 17],
          commonProcedures: ['99213', '99214', '90834', '90837'],
          approvalModifier: 1.1
        },
        adult: {
          ageRange: [18, 64],
          commonProcedures: ['99213', '99214', '99215'],
          approvalModifier: 1.0
        },
        geriatric: {
          ageRange: [65, 120],
          commonProcedures: ['99213', '99214', '99215', '99495'],
          approvalModifier: 1.05
        }
      },
      
      frequencyRules: {
        '99213': { maxPerMonth: 4, maxPerYear: 48 }, // Office visits
        '90834': { maxPerWeek: 2, maxPerMonth: 8 },  // Psychotherapy
        '73221': { maxPerYear: 2 },                  // MRI shoulder
        '72148': { maxPerYear: 1 }                   // MRI lumbar spine
      }
    };
    
    // Risk factors that affect approval probability
    this.riskFactors = {
      high_risk: {
        factors: [
          'experimental_procedure',
          'high_cost_procedure',
          'cosmetic_indication',
          'investigational_drug'
        ],
        modifier: 0.7
      },
      medium_risk: {
        factors: [
          'alternative_available',
          'frequency_concern',
          'incomplete_conservative_treatment'
        ],
        modifier: 0.85
      },
      low_risk: {
        factors: [
          'standard_of_care',
          'well_documented',
          'clear_medical_necessity'
        ],
        modifier: 1.15
      }
    };
  }

  // Initialize Predictive Approval service
  async initialize() {
    try {
      await this.createPredictionTables();
      await this.loadHistoricalData();
      console.log('Predictive Approval service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Predictive Approval service:', error);
      throw error;
    }
  }

  // Create necessary database tables
  async createPredictionTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS approval_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        authorization_id INTEGER,
        payer_name VARCHAR(100) NOT NULL,
        diagnosis_code VARCHAR(20),
        procedure_code VARCHAR(20),
        patient_age INTEGER,
        provider_npi VARCHAR(20),
        prediction_score DECIMAL(5,4),
        confidence_level VARCHAR(20),
        risk_factors TEXT,
        contributing_factors TEXT,
        recommendations TEXT,
        model_version VARCHAR(20),
        actual_outcome VARCHAR(50),
        prediction_accuracy DECIMAL(5,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS historical_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        diagnosis_code VARCHAR(20),
        procedure_code VARCHAR(20),
        patient_age_group VARCHAR(20),
        provider_npi VARCHAR(20),
        outcome VARCHAR(50) NOT NULL,
        denial_reason VARCHAR(200),
        appeal_outcome VARCHAR(50),
        processing_time_days INTEGER,
        cost_amount DECIMAL(10,2),
        submission_date DATE,
        decision_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS payer_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        pattern_type VARCHAR(50) NOT NULL,
        pattern_data TEXT NOT NULL,
        approval_rate DECIMAL(5,4),
        sample_size INTEGER,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS provider_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_npi VARCHAR(20) NOT NULL,
        payer_name VARCHAR(100) NOT NULL,
        total_submissions INTEGER DEFAULT 0,
        approved_submissions INTEGER DEFAULT 0,
        approval_rate DECIMAL(5,4),
        avg_processing_time DECIMAL(5,2),
        common_denial_reasons TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS prediction_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_id INTEGER REFERENCES approval_predictions(id),
        actual_outcome VARCHAR(50) NOT NULL,
        outcome_date DATE,
        feedback_notes TEXT,
        model_accuracy DECIMAL(5,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_approval_predictions_payer ON approval_predictions(payer_name)',
      'CREATE INDEX IF NOT EXISTS idx_approval_predictions_codes ON approval_predictions(diagnosis_code, procedure_code)',
      'CREATE INDEX IF NOT EXISTS idx_historical_outcomes_payer ON historical_outcomes(payer_name)',
      'CREATE INDEX IF NOT EXISTS idx_historical_outcomes_codes ON historical_outcomes(diagnosis_code, procedure_code)',
      'CREATE INDEX IF NOT EXISTS idx_provider_performance_npi ON provider_performance(provider_npi)',
      'CREATE INDEX IF NOT EXISTS idx_payer_patterns_type ON payer_patterns(payer_name, pattern_type)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  // Load historical data for model training
  async loadHistoricalData() {
    try {
      // This would typically load from existing authorization data
      // For now, we'll create some sample patterns
      await this.createSamplePatterns();
    } catch (error) {
      console.error('Failed to load historical data:', error);
    }
  }

  // Create sample patterns for demonstration
  async createSamplePatterns() {
    const samplePatterns = [
      {
        payer_name: 'aetna',
        pattern_type: 'diagnosis_approval_rate',
        pattern_data: {
          'E11.9': 0.92, // Type 2 diabetes
          'M25.511': 0.78, // Shoulder pain
          'F32.9': 0.85 // Depression
        },
        approval_rate: 0.85,
        sample_size: 1000
      },
      {
        payer_name: 'bcbs',
        pattern_type: 'procedure_approval_rate',
        pattern_data: {
          '99213': 0.95, // Office visit
          '73221': 0.72, // MRI shoulder
          '90834': 0.88 // Psychotherapy
        },
        approval_rate: 0.85,
        sample_size: 800
      }
    ];

    for (const pattern of samplePatterns) {
      await this.pool.query(`
        INSERT OR REPLACE INTO payer_patterns (payer_name, pattern_type, pattern_data, approval_rate, sample_size, last_updated)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `, [
        pattern.payer_name,
        pattern.pattern_type,
        JSON.stringify(pattern.pattern_data),
        pattern.approval_rate,
        pattern.sample_size
      ]);
    }
  }

  // Predict approval probability for authorization request
  async predictApproval(authorizationData, options = {}) {
    try {
      const startTime = Date.now();
      
      // Extract key features from authorization data
      const features = await this.extractFeatures(authorizationData);
      
      // Get payer-specific model
      const payerModel = this.scoringModels[authorizationData.payer.toLowerCase()];
      if (!payerModel) {
        throw new Error(`No prediction model available for payer: ${authorizationData.payer}`);
      }
      
      // Calculate component scores
      const componentScores = await this.calculateComponentScores(features, payerModel);
      
      // Calculate overall prediction score
      const predictionScore = this.calculateOverallScore(componentScores, payerModel.weights);
      
      // Determine confidence level
      const confidenceLevel = this.determineConfidenceLevel(predictionScore, payerModel.thresholds);
      
      // Identify risk factors
      const riskFactors = this.identifyRiskFactors(features, authorizationData);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(features, componentScores, riskFactors, payerModel);
      
      // Store prediction
      const predictionId = await this.storePrediction({
        authorizationId: authorizationData.id,
        payerName: authorizationData.payer,
        diagnosisCode: features.diagnosisCode,
        procedureCode: features.procedureCode,
        patientAge: features.patientAge,
        providerNpi: features.providerNpi,
        predictionScore,
        confidenceLevel,
        riskFactors,
        contributingFactors: componentScores,
        recommendations
      });
      
      const processingTime = Date.now() - startTime;
      
      return {
        predictionId,
        approvalProbability: predictionScore,
        confidenceLevel,
        riskLevel: this.determineRiskLevel(predictionScore, payerModel.thresholds),
        componentScores,
        riskFactors,
        recommendations,
        processingTime,
        modelVersion: '1.0'
      };
    } catch (error) {
      console.error('Approval prediction failed:', error);
      throw error;
    }
  }

  // Extract features from authorization data
  async extractFeatures(authorizationData) {
    const features = {
      diagnosisCode: authorizationData.diagnosis_code || authorizationData.icd10_code,
      procedureCode: authorizationData.procedure_code || authorizationData.cpt_code,
      patientAge: this.calculateAge(authorizationData.patient_dob),
      providerNpi: authorizationData.provider_npi,
      payerName: authorizationData.payer.toLowerCase(),
      serviceDate: authorizationData.service_date,
      urgencyLevel: authorizationData.urgency || 'routine',
      clinicalNotes: authorizationData.clinical_notes || '',
      priorAuthorizations: authorizationData.prior_authorizations || [],
      patientHistory: authorizationData.patient_history || {},
      providerHistory: await this.getProviderHistory(authorizationData.provider_npi, authorizationData.payer)
    };
    
    // Extract additional features from clinical notes
    if (features.clinicalNotes) {
      features.documentationQuality = this.assessDocumentationQuality(features.clinicalNotes);
      features.medicalNecessityIndicators = this.extractMedicalNecessityIndicators(features.clinicalNotes);
    }
    
    return features;
  }

  // Calculate age from date of birth
  calculateAge(dob) {
    if (!dob) return null;
    
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  // Get provider history and performance
  async getProviderHistory(providerNpi, payerName) {
    if (!providerNpi) return { approvalRate: 0.5, totalSubmissions: 0 };
    
    const result = await this.pool.query(`
      SELECT approval_rate, total_submissions, avg_processing_time
      FROM provider_performance
      WHERE provider_npi = $1 AND payer_name = $2
    `, [providerNpi, payerName.toLowerCase()]);
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Default values for new providers
    return {
      approvalRate: 0.75, // Neutral starting point
      totalSubmissions: 0,
      avgProcessingTime: 5
    };
  }

  // Assess documentation quality
  assessDocumentationQuality(clinicalNotes) {
    let qualityScore = 0;
    
    // Check for key documentation elements
    const qualityIndicators = [
      { pattern: /medical\s+necessity/i, weight: 0.2 },
      { pattern: /diagnosis/i, weight: 0.15 },
      { pattern: /treatment\s+plan/i, weight: 0.15 },
      { pattern: /conservative\s+treatment/i, weight: 0.1 },
      { pattern: /symptoms?/i, weight: 0.1 },
      { pattern: /examination/i, weight: 0.1 },
      { pattern: /history/i, weight: 0.1 },
      { pattern: /prognosis/i, weight: 0.1 }
    ];
    
    for (const indicator of qualityIndicators) {
      if (indicator.pattern.test(clinicalNotes)) {
        qualityScore += indicator.weight;
      }
    }
    
    // Bonus for length (more detailed documentation)
    if (clinicalNotes.length > 500) qualityScore += 0.1;
    if (clinicalNotes.length > 1000) qualityScore += 0.1;
    
    return Math.min(1, qualityScore);
  }

  // Extract medical necessity indicators
  extractMedicalNecessityIndicators(clinicalNotes) {
    const indicators = [];
    
    const necessityPatterns = [
      { pattern: /medically\s+necessary/i, indicator: 'explicit_necessity' },
      { pattern: /conservative\s+treatment\s+failed/i, indicator: 'failed_conservative' },
      { pattern: /significant\s+improvement/i, indicator: 'expected_improvement' },
      { pattern: /prevent\s+deterioration/i, indicator: 'prevent_deterioration' },
      { pattern: /standard\s+of\s+care/i, indicator: 'standard_care' },
      { pattern: /evidence\s+based/i, indicator: 'evidence_based' }
    ];
    
    for (const pattern of necessityPatterns) {
      if (pattern.pattern.test(clinicalNotes)) {
        indicators.push(pattern.indicator);
      }
    }
    
    return indicators;
  }

  // Calculate component scores
  async calculateComponentScores(features, payerModel) {
    const scores = {};
    
    // Diagnosis specificity score
    scores.diagnosis_specificity = await this.calculateDiagnosisScore(features);
    
    // Procedure appropriateness score
    scores.procedure_appropriateness = await this.calculateProcedureScore(features);
    
    // Medical necessity score
    scores.medical_necessity = this.calculateMedicalNecessityScore(features);
    
    // Provider history score
    scores.provider_history = this.calculateProviderScore(features.providerHistory);
    
    // Patient history score
    scores.patient_history = this.calculatePatientHistoryScore(features);
    
    // Documentation quality score
    scores.documentation_quality = features.documentationQuality || 0.5;
    
    return scores;
  }

  // Calculate diagnosis-specific score
  async calculateDiagnosisScore(features) {
    if (!features.diagnosisCode) return 0.5;
    
    // Get historical approval rate for this diagnosis
    const result = await this.pool.query(`
      SELECT approval_rate FROM payer_patterns
      WHERE payer_name = $1 AND pattern_type = 'diagnosis_approval_rate'
      AND pattern_data ? $2
    `, [features.payerName, features.diagnosisCode]);
    
    if (result.rows.length > 0) {
      const patternData = result.rows[0].pattern_data || {};
      return patternData[features.diagnosisCode] || 0.5;
    }
    
    // Default score based on diagnosis specificity
    const diagnosisLength = features.diagnosisCode.length;
    if (diagnosisLength >= 6) return 0.8; // Highly specific
    if (diagnosisLength >= 4) return 0.7; // Moderately specific
    return 0.6; // Less specific
  }

  // Calculate procedure appropriateness score
  async calculateProcedureScore(features) {
    if (!features.procedureCode || !features.diagnosisCode) return 0.5;
    
    // Check diagnosis-procedure mapping
    const mapping = this.clinicalRules.diagnosisProcedureMapping[features.diagnosisCode];
    if (mapping && mapping[features.procedureCode]) {
      return mapping[features.procedureCode];
    }
    
    // Check age-based appropriateness
    if (features.patientAge) {
      const ageGroup = this.getAgeGroup(features.patientAge);
      const ageRule = this.clinicalRules.ageBasedRules[ageGroup];
      
      if (ageRule && ageRule.commonProcedures.includes(features.procedureCode)) {
        return 0.8 * ageRule.approvalModifier;
      }
    }
    
    return 0.6; // Default moderate score
  }

  // Get age group classification
  getAgeGroup(age) {
    if (age < 18) return 'pediatric';
    if (age >= 65) return 'geriatric';
    return 'adult';
  }

  // Calculate medical necessity score
  calculateMedicalNecessityScore(features) {
    let score = 0.5; // Base score
    
    // Boost score based on medical necessity indicators
    if (features.medicalNecessityIndicators) {
      const indicatorBonus = {
        'explicit_necessity': 0.2,
        'failed_conservative': 0.15,
        'expected_improvement': 0.1,
        'prevent_deterioration': 0.1,
        'standard_care': 0.1,
        'evidence_based': 0.1
      };
      
      for (const indicator of features.medicalNecessityIndicators) {
        score += indicatorBonus[indicator] || 0;
      }
    }
    
    // Consider urgency level
    const urgencyBonus = {
      'emergency': 0.2,
      'urgent': 0.1,
      'routine': 0
    };
    
    score += urgencyBonus[features.urgencyLevel] || 0;
    
    return Math.min(1, score);
  }

  // Calculate provider performance score
  calculateProviderScore(providerHistory) {
    if (!providerHistory || providerHistory.totalSubmissions === 0) {
      return 0.75; // Neutral score for new providers
    }
    
    let score = providerHistory.approvalRate || 0.5;
    
    // Adjust based on submission volume (more experience = slight bonus)
    if (providerHistory.totalSubmissions > 100) score += 0.05;
    if (providerHistory.totalSubmissions > 500) score += 0.05;
    
    // Adjust based on processing time (faster = slight bonus)
    if (providerHistory.avgProcessingTime < 3) score += 0.05;
    
    return Math.min(1, score);
  }

  // Calculate patient history score
  calculatePatientHistoryScore(features) {
    let score = 0.7; // Base score
    
    // Consider prior authorizations
    if (features.priorAuthorizations && features.priorAuthorizations.length > 0) {
      const recentApprovals = features.priorAuthorizations.filter(
        auth => auth.status === 'approved' && this.isRecent(auth.date, 365)
      ).length;
      
      if (recentApprovals > 0) score += 0.1;
      if (recentApprovals > 2) score += 0.1;
    }
    
    // Consider patient age
    if (features.patientAge) {
      const ageGroup = this.getAgeGroup(features.patientAge);
      const ageRule = this.clinicalRules.ageBasedRules[ageGroup];
      score *= ageRule.approvalModifier;
    }
    
    return Math.min(1, score);
  }

  // Check if date is recent (within specified days)
  isRecent(date, days) {
    const checkDate = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now - checkDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= days;
  }

  // Calculate overall prediction score
  calculateOverallScore(componentScores, weights) {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const [component, weight] of Object.entries(weights)) {
      if (componentScores[component] !== undefined) {
        totalScore += componentScores[component] * weight;
        totalWeight += weight;
      }
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0.5;
  }

  // Determine confidence level
  determineConfidenceLevel(score, thresholds) {
    if (score >= thresholds.high_approval) return 'high';
    if (score >= thresholds.medium_approval) return 'medium';
    if (score >= thresholds.low_approval) return 'low';
    return 'very_low';
  }

  // Determine risk level
  determineRiskLevel(score, thresholds) {
    if (score >= thresholds.high_approval) return 'low';
    if (score >= thresholds.medium_approval) return 'medium';
    return 'high';
  }

  // Identify risk factors
  identifyRiskFactors(features, authorizationData) {
    const riskFactors = [];
    
    // Check for high-risk procedures
    const highRiskProcedures = ['19318', '15877', '27447']; // Example cosmetic/elective procedures
    if (highRiskProcedures.includes(features.procedureCode)) {
      riskFactors.push({
        type: 'high_risk_procedure',
        description: 'Procedure may be considered elective or cosmetic',
        impact: 'high'
      });
    }
    
    // Check frequency limitations
    const frequencyRule = this.clinicalRules.frequencyRules[features.procedureCode];
    if (frequencyRule) {
      // This would require checking patient's recent procedure history
      riskFactors.push({
        type: 'frequency_limitation',
        description: `Procedure has frequency limitations: ${JSON.stringify(frequencyRule)}`,
        impact: 'medium'
      });
    }
    
    // Check for incomplete documentation
    if (features.documentationQuality < 0.6) {
      riskFactors.push({
        type: 'documentation_quality',
        description: 'Clinical documentation may be insufficient',
        impact: 'medium'
      });
    }
    
    // Check for experimental procedures
    if (features.clinicalNotes && /experimental|investigational/i.test(features.clinicalNotes)) {
      riskFactors.push({
        type: 'experimental_treatment',
        description: 'Treatment may be considered experimental',
        impact: 'high'
      });
    }
    
    return riskFactors;
  }

  // Generate recommendations to improve approval probability
  async generateRecommendations(features, componentScores, riskFactors, payerModel) {
    const recommendations = [];
    
    // Documentation recommendations
    if (componentScores.documentation_quality < 0.7) {
      recommendations.push({
        category: 'documentation',
        priority: 'high',
        recommendation: 'Enhance clinical documentation with detailed medical necessity justification',
        expectedImpact: 0.15
      });
    }
    
    // Medical necessity recommendations
    if (componentScores.medical_necessity < 0.7) {
      recommendations.push({
        category: 'medical_necessity',
        priority: 'high',
        recommendation: 'Include evidence of failed conservative treatments and expected outcomes',
        expectedImpact: 0.12
      });
    }
    
    // Procedure-specific recommendations
    if (componentScores.procedure_appropriateness < 0.7) {
      recommendations.push({
        category: 'procedure_appropriateness',
        priority: 'medium',
        recommendation: 'Provide additional justification for procedure selection and timing',
        expectedImpact: 0.10
      });
    }
    
    // Risk factor mitigation
    for (const riskFactor of riskFactors) {
      if (riskFactor.impact === 'high') {
        recommendations.push({
          category: 'risk_mitigation',
          priority: 'high',
          recommendation: `Address ${riskFactor.type}: ${riskFactor.description}`,
          expectedImpact: 0.08
        });
      }
    }
    
    // Payer-specific recommendations
    const commonDenialReasons = payerModel.commonDenialReasons;
    for (const reason of commonDenialReasons) {
      recommendations.push({
        category: 'payer_specific',
        priority: 'medium',
        recommendation: `Ensure documentation addresses common denial reason: ${reason}`,
        expectedImpact: 0.05
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Store prediction in database
  async storePrediction(predictionData) {
    const result = await this.pool.query(`
      INSERT INTO approval_predictions (
        authorization_id, payer_name, diagnosis_code, procedure_code,
        patient_age, provider_npi, prediction_score, confidence_level,
        risk_factors, contributing_factors, recommendations, model_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      predictionData.authorizationId,
      predictionData.payerName,
      predictionData.diagnosisCode,
      predictionData.procedureCode,
      predictionData.patientAge,
      predictionData.providerNpi,
      predictionData.predictionScore,
      predictionData.confidenceLevel,
      JSON.stringify(predictionData.riskFactors),
      JSON.stringify(predictionData.contributingFactors),
      JSON.stringify(predictionData.recommendations),
      '1.0'
    ]);
    
    return result.rows[0].id;
  }

  // Update prediction with actual outcome
  async updatePredictionOutcome(predictionId, actualOutcome, outcomeDate) {
    // Calculate prediction accuracy
    const prediction = await this.pool.query(
      'SELECT prediction_score FROM approval_predictions WHERE id = $1',
      [predictionId]
    );
    
    if (prediction.rows.length === 0) {
      throw new Error('Prediction not found');
    }
    
    const predictionScore = prediction.rows[0].prediction_score;
    const actualScore = actualOutcome === 'approved' ? 1 : 0;
    const accuracy = 1 - Math.abs(predictionScore - actualScore);
    
    await this.pool.query(`
      UPDATE approval_predictions
      SET actual_outcome = $1, prediction_accuracy = $2, updated_at = NOW()
      WHERE id = $3
    `, [actualOutcome, accuracy, predictionId]);
    
    // Store feedback
    await this.pool.query(`
      INSERT INTO prediction_feedback (prediction_id, actual_outcome, outcome_date, model_accuracy)
      VALUES ($1, $2, $3, $4)
    `, [predictionId, actualOutcome, outcomeDate, accuracy]);
    
    return accuracy;
  }

  // Get prediction by ID
  async getPrediction(predictionId) {
    const result = await this.pool.query(
      'SELECT * FROM approval_predictions WHERE id = $1',
      [predictionId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Prediction not found');
    }
    
    return result.rows[0];
  }

  // Get model performance statistics
  async getModelPerformance(payerName, startDate, endDate) {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_predictions,
        AVG(prediction_accuracy) as avg_accuracy,
        AVG(prediction_score) as avg_prediction_score,
        COUNT(CASE WHEN actual_outcome = 'approved' THEN 1 END) as actual_approvals,
        COUNT(CASE WHEN prediction_score > 0.7 AND actual_outcome = 'approved' THEN 1 END) as correct_high_confidence
      FROM approval_predictions
      WHERE payer_name = $1 AND created_at BETWEEN $2 AND $3
        AND actual_outcome IS NOT NULL
    `, [payerName, startDate, endDate]);
    
    return result.rows[0];
  }

  // Batch predict multiple authorizations
  async batchPredict(authorizationList) {
    const results = [];
    
    for (const authorization of authorizationList) {
      try {
        const prediction = await this.predictApproval(authorization);
        results.push(prediction);
      } catch (error) {
        results.push({ error: error.message, authorization });
      }
    }
    
    return results;
  }
}

module.exports = PredictiveApprovalService;