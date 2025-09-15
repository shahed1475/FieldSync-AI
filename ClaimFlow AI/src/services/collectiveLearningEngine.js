const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class CollectiveLearningEngine {
  constructor(pool) {
    this.pool = pool || null;
    this.learningModels = {
      ocrAccuracy: new Map(),
      nlpExtraction: new Map(),
      approvalPrediction: new Map(),
      appealSuccess: new Map(),
      processingTime: new Map()
    };
    this.anonymizationSalt = process.env.ANONYMIZATION_SALT || 'default-salt';
    this.learningThreshold = 100; // Minimum samples for learning
    this.confidenceThreshold = 0.85;
  }

  async initialize() {
    try {
      if (!this.pool) {
        this.pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
      }

      await this.createTables();
      await this.loadExistingModels();
      console.log('Collective Learning Engine initialized');
    } catch (error) {
      console.error('Failed to initialize Collective Learning Engine:', error);
      throw error;
    }
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS learning_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type VARCHAR(50) NOT NULL,
        anonymized_hash VARCHAR(64) NOT NULL,
        input_features TEXT NOT NULL,
        expected_output TEXT NOT NULL,
        actual_output TEXT,
        accuracy_score DECIMAL(5,4),
        processing_time INTEGER,
        payer_type VARCHAR(50),
        document_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_type VARCHAR(50) NOT NULL,
        version VARCHAR(20) NOT NULL,
        accuracy DECIMAL(5,4) NOT NULL,
        precision_score DECIMAL(5,4),
        recall_score DECIMAL(5,4),
        f1_score DECIMAL(5,4),
        training_samples INTEGER,
        validation_samples INTEGER,
        model_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS learning_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insight_type VARCHAR(50) NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        confidence DECIMAL(5,4) NOT NULL,
        impact_score DECIMAL(5,4),
        recommendations TEXT,
        supporting_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS anonymization_mapping (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_hash VARCHAR(64) NOT NULL UNIQUE,
        anonymized_hash VARCHAR(64) NOT NULL UNIQUE,
        data_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_learning_data_type ON learning_data(data_type)',
      'CREATE INDEX IF NOT EXISTS idx_learning_data_hash ON learning_data(anonymized_hash)',
      'CREATE INDEX IF NOT EXISTS idx_model_performance_type ON model_performance(model_type)',
      'CREATE INDEX IF NOT EXISTS idx_learning_insights_type ON learning_insights(insight_type)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  async anonymizeData(originalData, dataType) {
    const dataString = JSON.stringify(originalData);
    const originalHash = crypto.createHash('sha256').update(dataString).digest('hex');
    
    // Check if already anonymized
    const existing = await this.pool.query(
      'SELECT anonymized_hash FROM anonymization_mapping WHERE original_hash = $1',
      [originalHash]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].anonymized_hash;
    }

    // Create anonymized hash
    const anonymizedHash = crypto.createHash('sha256')
      .update(originalHash + this.anonymizationSalt + dataType)
      .digest('hex');

    // Store mapping
    await this.pool.query(
      'INSERT INTO anonymization_mapping (original_hash, anonymized_hash, data_type) VALUES ($1, $2, $3)',
      [originalHash, anonymizedHash, dataType]
    );

    return anonymizedHash;
  }

  async recordLearningData(dataType, inputFeatures, expectedOutput, actualOutput = null, metadata = {}) {
    try {
      const anonymizedHash = await this.anonymizeData(inputFeatures, dataType);
      
      // Remove sensitive information from features
      const sanitizedFeatures = this.sanitizeFeatures(inputFeatures);
      const sanitizedExpected = this.sanitizeFeatures(expectedOutput);
      const sanitizedActual = actualOutput ? this.sanitizeFeatures(actualOutput) : null;

      // Calculate accuracy if both expected and actual are provided
      let accuracyScore = null;
      if (actualOutput) {
        accuracyScore = this.calculateAccuracy(expectedOutput, actualOutput, dataType);
      }

      await this.pool.query(
        `INSERT INTO learning_data 
         (data_type, anonymized_hash, input_features, expected_output, actual_output, 
          accuracy_score, processing_time, payer_type, document_type) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          dataType,
          anonymizedHash,
          JSON.stringify(sanitizedFeatures),
          JSON.stringify(sanitizedExpected),
          sanitizedActual ? JSON.stringify(sanitizedActual) : null,
          accuracyScore,
          metadata.processingTime || null,
          metadata.payerType || null,
          metadata.documentType || null
        ]
      );

      // Trigger learning if we have enough samples
      await this.checkAndTriggerLearning(dataType);

    } catch (error) {
      console.error('Error recording learning data:', error);
      throw error;
    }
  }

  sanitizeFeatures(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = {};
    const sensitiveFields = [
      'ssn', 'social_security', 'patient_id', 'member_id', 'phone', 'email',
      'address', 'name', 'first_name', 'last_name', 'dob', 'date_of_birth'
    ];

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        // Replace with anonymized placeholder
        sanitized[key] = '[ANONYMIZED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeFeatures(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  calculateAccuracy(expected, actual, dataType) {
    switch (dataType) {
      case 'ocr_extraction':
        return this.calculateTextAccuracy(expected.text || '', actual.text || '');
      
      case 'nlp_extraction':
        return this.calculateEntityAccuracy(expected.entities || [], actual.entities || []);
      
      case 'approval_prediction':
        return expected.approved === actual.approved ? 1.0 : 0.0;
      
      case 'form_mapping':
        return this.calculateMappingAccuracy(expected.fields || {}, actual.fields || {});
      
      default:
        return this.calculateGenericAccuracy(expected, actual);
    }
  }

  calculateTextAccuracy(expected, actual) {
    if (!expected || !actual) return 0.0;
    
    const expectedWords = expected.toLowerCase().split(/\s+/);
    const actualWords = actual.toLowerCase().split(/\s+/);
    
    let matches = 0;
    const maxLength = Math.max(expectedWords.length, actualWords.length);
    
    for (let i = 0; i < Math.min(expectedWords.length, actualWords.length); i++) {
      if (expectedWords[i] === actualWords[i]) {
        matches++;
      }
    }
    
    return maxLength > 0 ? matches / maxLength : 0.0;
  }

  calculateEntityAccuracy(expected, actual) {
    if (expected.length === 0 && actual.length === 0) return 1.0;
    if (expected.length === 0 || actual.length === 0) return 0.0;
    
    let matches = 0;
    for (const expectedEntity of expected) {
      const match = actual.find(actualEntity => 
        actualEntity.type === expectedEntity.type && 
        actualEntity.value === expectedEntity.value
      );
      if (match) matches++;
    }
    
    return matches / Math.max(expected.length, actual.length);
  }

  calculateMappingAccuracy(expected, actual) {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    
    if (expectedKeys.length === 0 && actualKeys.length === 0) return 1.0;
    
    let matches = 0;
    for (const key of expectedKeys) {
      if (actual[key] === expected[key]) {
        matches++;
      }
    }
    
    return matches / Math.max(expectedKeys.length, actualKeys.length);
  }

  calculateGenericAccuracy(expected, actual) {
    return JSON.stringify(expected) === JSON.stringify(actual) ? 1.0 : 0.0;
  }

  async checkAndTriggerLearning(dataType) {
    const sampleCount = await this.pool.query(
      'SELECT COUNT(*) FROM learning_data WHERE data_type = $1 AND accuracy_score IS NOT NULL',
      [dataType]
    );

    if (parseInt(sampleCount.rows[0].count) >= this.learningThreshold) {
      await this.performLearning(dataType);
    }
  }

  async performLearning(dataType) {
    try {
      console.log(`Performing learning for ${dataType}...`);
      
      // Get recent learning data
      const learningData = await this.pool.query(
        `SELECT input_features, expected_output, actual_output, accuracy_score, payer_type, document_type
         FROM learning_data 
         WHERE data_type = $1 AND accuracy_score IS NOT NULL 
         ORDER BY created_at DESC 
         LIMIT 1000`,
        [dataType]
      );

      if (learningData.rows.length < this.learningThreshold) {
        return;
      }

      // Analyze patterns and generate insights
      const insights = await this.analyzePatterns(dataType, learningData.rows);
      
      // Update model performance
      const performance = this.calculateModelPerformance(learningData.rows);
      
      await this.updateModelPerformance(dataType, performance, insights);
      
      // Generate recommendations
      await this.generateRecommendations(dataType, insights, performance);
      
      console.log(`Learning completed for ${dataType}`);
      
    } catch (error) {
      console.error(`Error performing learning for ${dataType}:`, error);
    }
  }

  async analyzePatterns(dataType, data) {
    const patterns = {
      payerPerformance: {},
      documentTypeAccuracy: {},
      commonErrors: [],
      improvementTrends: []
    };

    // Analyze by payer type
    for (const row of data) {
      if (row.payer_type) {
        if (!patterns.payerPerformance[row.payer_type]) {
          patterns.payerPerformance[row.payer_type] = {
            totalSamples: 0,
            averageAccuracy: 0,
            accuracySum: 0
          };
        }
        
        const payer = patterns.payerPerformance[row.payer_type];
        payer.totalSamples++;
        payer.accuracySum += row.accuracy_score;
        payer.averageAccuracy = payer.accuracySum / payer.totalSamples;
      }
    }

    // Analyze by document type
    for (const row of data) {
      if (row.document_type) {
        if (!patterns.documentTypeAccuracy[row.document_type]) {
          patterns.documentTypeAccuracy[row.document_type] = {
            totalSamples: 0,
            averageAccuracy: 0,
            accuracySum: 0
          };
        }
        
        const docType = patterns.documentTypeAccuracy[row.document_type];
        docType.totalSamples++;
        docType.accuracySum += row.accuracy_score;
        docType.averageAccuracy = docType.accuracySum / docType.totalSamples;
      }
    }

    // Identify common error patterns
    const lowAccuracyData = data.filter(row => row.accuracy_score < 0.7);
    patterns.commonErrors = this.identifyCommonErrors(lowAccuracyData);

    return patterns;
  }

  identifyCommonErrors(lowAccuracyData) {
    const errorPatterns = [];
    
    // Group by similar input features
    const featureGroups = {};
    
    for (const row of lowAccuracyData) {
      const features = JSON.parse(row.input_features);
      const key = this.generateFeatureKey(features);
      
      if (!featureGroups[key]) {
        featureGroups[key] = [];
      }
      featureGroups[key].push(row);
    }

    // Find patterns with multiple occurrences
    for (const [key, group] of Object.entries(featureGroups)) {
      if (group.length >= 3) {
        errorPatterns.push({
          pattern: key,
          occurrences: group.length,
          averageAccuracy: group.reduce((sum, row) => sum + row.accuracy_score, 0) / group.length,
          examples: group.slice(0, 3)
        });
      }
    }

    return errorPatterns.sort((a, b) => b.occurrences - a.occurrences);
  }

  generateFeatureKey(features) {
    // Create a simplified key for pattern matching
    const keyFeatures = [];
    
    if (features.documentType) keyFeatures.push(`doc:${features.documentType}`);
    if (features.payerType) keyFeatures.push(`payer:${features.payerType}`);
    if (features.complexity) keyFeatures.push(`complexity:${features.complexity}`);
    
    return keyFeatures.join('|');
  }

  calculateModelPerformance(data) {
    const accuracyScores = data.map(row => row.accuracy_score).filter(score => score !== null);
    
    if (accuracyScores.length === 0) {
      return {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        sampleCount: 0
      };
    }

    const accuracy = accuracyScores.reduce((sum, score) => sum + score, 0) / accuracyScores.length;
    
    // Calculate precision, recall, and F1 for binary classification tasks
    const highAccuracy = accuracyScores.filter(score => score >= this.confidenceThreshold);
    const precision = highAccuracy.length / accuracyScores.length;
    const recall = precision; // Simplified for this context
    const f1Score = precision > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      sampleCount: accuracyScores.length
    };
  }

  async updateModelPerformance(dataType, performance, insights) {
    const version = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
    
    await this.pool.query(
      `INSERT INTO model_performance 
       (model_type, version, accuracy, precision_score, recall_score, f1_score, 
        training_samples, model_data) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        dataType,
        version,
        performance.accuracy,
        performance.precision,
        performance.recall,
        performance.f1Score,
        performance.sampleCount,
        JSON.stringify(insights)
      ]
    );
  }

  async generateRecommendations(dataType, insights, performance) {
    const recommendations = [];

    // Performance-based recommendations
    if (performance.accuracy < 0.8) {
      recommendations.push({
        type: 'accuracy_improvement',
        priority: 'high',
        description: `${dataType} accuracy is below 80%. Consider retraining or adjusting parameters.`,
        actions: ['retrain_model', 'adjust_parameters', 'increase_training_data']
      });
    }

    // Payer-specific recommendations
    for (const [payer, stats] of Object.entries(insights.payerPerformance)) {
      if (stats.averageAccuracy < 0.7) {
        recommendations.push({
          type: 'payer_optimization',
          priority: 'medium',
          description: `Low accuracy for ${payer}. Consider payer-specific optimization.`,
          actions: ['create_payer_specific_model', 'adjust_payer_rules']
        });
      }
    }

    // Error pattern recommendations
    for (const error of insights.commonErrors.slice(0, 3)) {
      recommendations.push({
        type: 'error_pattern',
        priority: 'medium',
        description: `Common error pattern detected: ${error.pattern}`,
        actions: ['investigate_pattern', 'add_training_examples', 'adjust_preprocessing']
      });
    }

    // Store recommendations as insights
    for (const rec of recommendations) {
      await this.pool.query(
        `INSERT INTO learning_insights 
         (insight_type, category, description, confidence, recommendations) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          rec.type,
          dataType,
          rec.description,
          0.8, // Default confidence
          JSON.stringify(rec)
        ]
      );
    }
  }

  async getModelPerformance(dataType, limit = 10) {
    const result = await this.pool.query(
      `SELECT * FROM model_performance 
       WHERE model_type = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [dataType, limit]
    );

    return result.rows;
  }

  async getInsights(category = null, limit = 20) {
    let query = 'SELECT * FROM learning_insights';
    const params = [];
    
    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async getLearningStats() {
    const stats = {};
    
    // Get data counts by type
    const dataCounts = await this.pool.query(
      `SELECT data_type, COUNT(*) as count, 
              AVG(accuracy_score) as avg_accuracy,
              MIN(created_at) as first_sample,
              MAX(created_at) as last_sample
       FROM learning_data 
       WHERE accuracy_score IS NOT NULL
       GROUP BY data_type`
    );

    stats.dataTypes = dataCounts.rows;

    // Get recent performance trends
    const performanceTrends = await this.pool.query(
      `SELECT model_type, accuracy, created_at
       FROM model_performance 
       WHERE created_at >= NOW() - INTERVAL '30 days'
       ORDER BY model_type, created_at`
    );

    stats.performanceTrends = performanceTrends.rows;

    // Get total learning samples
    const totalSamples = await this.pool.query(
      'SELECT COUNT(*) as total FROM learning_data'
    );

    stats.totalSamples = parseInt(totalSamples.rows[0].total);

    return stats;
  }

  async loadExistingModels() {
    try {
      // Load latest model performance for each type
      const latestModels = await this.pool.query(
        `SELECT DISTINCT ON (model_type) model_type, accuracy, model_data
         FROM model_performance 
         ORDER BY model_type, created_at DESC`
      );

      for (const model of latestModels.rows) {
        if (model.model_data) {
          this.learningModels[model.model_type] = new Map(Object.entries(JSON.parse(model.model_data)));
        }
      }

      console.log(`Loaded ${latestModels.rows.length} existing models`);
    } catch (error) {
      console.error('Error loading existing models:', error);
    }
  }

  async shutdown() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = CollectiveLearningEngine;