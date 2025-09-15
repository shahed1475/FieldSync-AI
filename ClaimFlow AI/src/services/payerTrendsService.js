const { Pool } = require('pg');
const cron = require('node-cron');

class PayerTrendsService {
  constructor(pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    this.trendCategories = {
      approvalPatterns: {
        seasonalTrends: true,
        procedureSpecificTrends: true,
        providerTrends: true,
        geographicTrends: true
      },
      denialAnalysis: {
        commonReasons: true,
        appealSuccessRates: true,
        timeToDecision: true,
        documentationRequirements: true
      },
      marketIntelligence: {
        competitiveAnalysis: true,
        policyChanges: true,
        reimbursementTrends: true,
        networkChanges: true
      },
      predictiveInsights: {
        approvalLikelihood: true,
        optimalTiming: true,
        documentationStrategy: true,
        appealStrategy: true
      }
    };
    
    this.payerProfiles = {
      'Aetna': {
        avgApprovalTime: 48,
        approvalRate: 0.78,
        commonDenialReasons: ['medical_necessity', 'prior_authorization_required'],
        preferredDocumentation: ['clinical_notes', 'lab_results'],
        appealSuccessRate: 0.65
      },
      'BCBS': {
        avgApprovalTime: 36,
        approvalRate: 0.82,
        commonDenialReasons: ['insufficient_documentation', 'experimental_treatment'],
        preferredDocumentation: ['peer_reviewed_studies', 'treatment_guidelines'],
        appealSuccessRate: 0.71
      },
      'Cigna': {
        avgApprovalTime: 42,
        approvalRate: 0.75,
        commonDenialReasons: ['cost_effectiveness', 'alternative_treatment'],
        preferredDocumentation: ['cost_analysis', 'treatment_history'],
        appealSuccessRate: 0.68
      },
      'Humana': {
        avgApprovalTime: 54,
        approvalRate: 0.73,
        commonDenialReasons: ['medical_necessity', 'network_restrictions'],
        preferredDocumentation: ['specialist_referral', 'diagnostic_imaging'],
        appealSuccessRate: 0.62
      },
      'Medicare': {
        avgApprovalTime: 72,
        approvalRate: 0.85,
        commonDenialReasons: ['coverage_limitations', 'frequency_limits'],
        preferredDocumentation: ['cms_guidelines', 'medical_records'],
        appealSuccessRate: 0.58
      }
    };
  }

  async initialize() {
    try {

      await this.createTables();
      await this.initializePayerProfiles();
      await this.setupScheduledAnalysis();
      
      console.log('Payer Trends Service initialized');
    } catch (error) {
      console.error('Failed to initialize Payer Trends Service:', error);
      throw error;
    }
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS payer_trend_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_date DATE NOT NULL,
        payer_name VARCHAR(100) NOT NULL,
        trend_category VARCHAR(50) NOT NULL,
        trend_type VARCHAR(50) NOT NULL,
        metric_name VARCHAR(100) NOT NULL,
        current_value DECIMAL(10,4) NOT NULL,
        previous_value DECIMAL(10,4),
        change_percentage DECIMAL(5,2),
        trend_direction VARCHAR(20),
        confidence_score DECIMAL(3,2),
        sample_size INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS payer_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL UNIQUE,
        profile_data TEXT NOT NULL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS seasonal_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        procedure_category VARCHAR(100),
        month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
        approval_rate DECIMAL(5,4) NOT NULL,
        avg_processing_time DECIMAL(8,2) NOT NULL,
        volume_index DECIMAL(5,2) NOT NULL,
        denial_rate DECIMAL(5,4) NOT NULL,
        year INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS denial_pattern_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        denial_reason VARCHAR(200) NOT NULL,
        procedure_code VARCHAR(20),
        provider_specialty VARCHAR(100),
        frequency_count INTEGER NOT NULL,
        frequency_percentage DECIMAL(5,2) NOT NULL,
        appeal_success_rate DECIMAL(5,4),
        avg_appeal_time DECIMAL(8,2),
        recommended_strategy TEXT,
        analysis_period_start DATE NOT NULL,
        analysis_period_end DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS payer_policy_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        policy_type VARCHAR(50) NOT NULL,
        change_description TEXT NOT NULL,
        effective_date DATE NOT NULL,
        impact_assessment VARCHAR(20) NOT NULL,
        affected_procedures TEXT,
        estimated_impact_percentage DECIMAL(5,2),
        adaptation_strategy TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS competitive_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_date DATE NOT NULL,
        metric_name VARCHAR(100) NOT NULL,
        payer_rankings TEXT NOT NULL,
        market_insights TEXT,
        strategic_recommendations TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS predictive_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        procedure_code VARCHAR(20) NOT NULL,
        provider_specialty VARCHAR(100),
        predicted_approval_rate DECIMAL(5,4) NOT NULL,
        optimal_submission_timing VARCHAR(50),
        recommended_documentation TEXT,
        risk_factors TEXT,
        confidence_level DECIMAL(3,2) NOT NULL,
        prediction_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS market_intelligence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intelligence_type VARCHAR(50) NOT NULL,
        payer_name VARCHAR(100),
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        impact_level VARCHAR(20) NOT NULL,
        actionable_insights TEXT,
        source_type VARCHAR(50),
        confidence_score DECIMAL(3,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_payer_trend_analysis_payer_date ON payer_trend_analysis(payer_name, analysis_date)',
      'CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_payer_month ON seasonal_patterns(payer_name, month)',
      'CREATE INDEX IF NOT EXISTS idx_denial_pattern_payer_reason ON denial_pattern_analysis(payer_name, denial_reason)',
      'CREATE INDEX IF NOT EXISTS idx_predictive_insights_payer_procedure ON predictive_insights(payer_name, procedure_code)',
      'CREATE INDEX IF NOT EXISTS idx_market_intelligence_type_payer ON market_intelligence(intelligence_type, payer_name)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  async initializePayerProfiles() {
    for (const [payerName, profile] of Object.entries(this.payerProfiles)) {
      await this.pool.query(
        `INSERT OR REPLACE INTO payer_profiles (payer_name, profile_data, last_updated) 
         VALUES (?, ?, datetime('now'))`,
        [payerName, JSON.stringify(profile)]
      );
    }
  }

  async analyzeApprovalPatterns() {
    try {
      const analysisDate = new Date().toISOString().split('T')[0];
      
      // Analyze approval rates by payer
      const approvalRates = await this.pool.query(
        `SELECT 
           payer_name,
           COUNT(*) as total_submissions,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
           COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*) as approval_rate,
           AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_processing_hours
         FROM authorizations 
         WHERE submitted_at >= NOW() - INTERVAL '30 days'
           AND status IN ('approved', 'denied')
         GROUP BY payer_name
         HAVING COUNT(*) >= 10`
      );

      for (const payer of approvalRates.rows) {
        const currentRate = parseFloat(payer.approval_rate);
        const currentProcessingTime = parseFloat(payer.avg_processing_hours);
        
        // Get previous period data for comparison
        const previousData = await this.pool.query(
          `SELECT 
             COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*) as approval_rate,
             AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_processing_hours
           FROM authorizations 
           WHERE payer_name = $1
             AND submitted_at >= NOW() - INTERVAL '60 days'
             AND submitted_at < NOW() - INTERVAL '30 days'
             AND status IN ('approved', 'denied')`,
          [payer.payer_name]
        );

        let previousRate = null;
        let previousProcessingTime = null;
        let rateChange = null;
        let timeChange = null;
        
        if (previousData.rows.length > 0 && previousData.rows[0].approval_rate) {
          previousRate = parseFloat(previousData.rows[0].approval_rate);
          previousProcessingTime = parseFloat(previousData.rows[0].avg_processing_hours);
          rateChange = ((currentRate - previousRate) / previousRate) * 100;
          timeChange = ((currentProcessingTime - previousProcessingTime) / previousProcessingTime) * 100;
        }

        // Store approval rate trend
        await this.pool.query(
          `INSERT INTO payer_trend_analysis 
           (analysis_date, payer_name, trend_category, trend_type, metric_name, 
            current_value, previous_value, change_percentage, trend_direction, 
            confidence_score, sample_size) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            analysisDate,
            payer.payer_name,
            'approvalPatterns',
            'approval_rate',
            'monthly_approval_rate',
            currentRate,
            previousRate,
            rateChange,
            rateChange > 0 ? 'increasing' : rateChange < 0 ? 'decreasing' : 'stable',
            this.calculateConfidenceScore(parseInt(payer.total_submissions)),
            parseInt(payer.total_submissions)
          ]
        );

        // Store processing time trend
        await this.pool.query(
          `INSERT INTO payer_trend_analysis 
           (analysis_date, payer_name, trend_category, trend_type, metric_name, 
            current_value, previous_value, change_percentage, trend_direction, 
            confidence_score, sample_size) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            analysisDate,
            payer.payer_name,
            'approvalPatterns',
            'processing_time',
            'avg_processing_hours',
            currentProcessingTime,
            previousProcessingTime,
            timeChange,
            timeChange > 0 ? 'increasing' : timeChange < 0 ? 'decreasing' : 'stable',
            this.calculateConfidenceScore(parseInt(payer.total_submissions)),
            parseInt(payer.total_submissions)
          ]
        );
      }
      
      console.log('Approval patterns analysis completed');
    } catch (error) {
      console.error('Error analyzing approval patterns:', error);
      throw error;
    }
  }

  async analyzeSeasonalPatterns() {
    try {
      const currentYear = new Date().getFullYear();
      
      // Analyze seasonal patterns for each payer
      const seasonalData = await this.pool.query(
        `SELECT 
           payer_name,
           EXTRACT(MONTH FROM submitted_at) as month,
           COUNT(*) as total_submissions,
           COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*) as approval_rate,
           AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_processing_hours,
           COUNT(CASE WHEN status = 'denied' THEN 1 END)::DECIMAL / COUNT(*) as denial_rate
         FROM authorizations 
         WHERE EXTRACT(YEAR FROM submitted_at) = $1
           AND status IN ('approved', 'denied')
         GROUP BY payer_name, EXTRACT(MONTH FROM submitted_at)
         HAVING COUNT(*) >= 5
         ORDER BY payer_name, month`,
        [currentYear]
      );

      // Calculate volume index (relative to annual average)
      const annualAverages = await this.pool.query(
        `SELECT 
           payer_name,
           COUNT(*)::DECIMAL / 12 as avg_monthly_volume
         FROM authorizations 
         WHERE EXTRACT(YEAR FROM submitted_at) = $1
           AND status IN ('approved', 'denied')
         GROUP BY payer_name`,
        [currentYear]
      );

      const avgVolumeMap = new Map();
      annualAverages.rows.forEach(row => {
        avgVolumeMap.set(row.payer_name, parseFloat(row.avg_monthly_volume));
      });

      for (const data of seasonalData.rows) {
        const avgVolume = avgVolumeMap.get(data.payer_name) || 1;
        const volumeIndex = parseInt(data.total_submissions) / avgVolume;

        await this.pool.query(
          `INSERT INTO seasonal_patterns 
           (payer_name, month, approval_rate, avg_processing_time, volume_index, denial_rate, year) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (payer_name, month, year) 
           DO UPDATE SET 
             approval_rate = $3,
             avg_processing_time = $4,
             volume_index = $5,
             denial_rate = $6`,
          [
            data.payer_name,
            parseInt(data.month),
            parseFloat(data.approval_rate),
            parseFloat(data.avg_processing_hours),
            volumeIndex,
            parseFloat(data.denial_rate),
            currentYear
          ]
        );
      }
      
      console.log('Seasonal patterns analysis completed');
    } catch (error) {
      console.error('Error analyzing seasonal patterns:', error);
      throw error;
    }
  }

  async analyzeDenialPatterns() {
    try {
      const analysisStart = new Date();
      analysisStart.setDate(analysisStart.getDate() - 90); // Last 90 days
      const analysisEnd = new Date();
      
      // Analyze denial reasons by payer
      const denialPatterns = await this.pool.query(
        `SELECT 
           a.payer_name,
           a.denial_reason,
           a.procedure_code,
           p.specialty as provider_specialty,
           COUNT(*) as frequency_count,
           COUNT(*)::DECIMAL / SUM(COUNT(*)) OVER (PARTITION BY a.payer_name) as frequency_percentage
         FROM authorizations a
         LEFT JOIN providers p ON a.provider_npi = p.npi
         WHERE a.status = 'denied'
           AND a.submitted_at >= $1
           AND a.submitted_at <= $2
           AND a.denial_reason IS NOT NULL
         GROUP BY a.payer_name, a.denial_reason, a.procedure_code, p.specialty
         HAVING COUNT(*) >= 3
         ORDER BY a.payer_name, frequency_count DESC`,
        [analysisStart, analysisEnd]
      );

      for (const pattern of denialPatterns.rows) {
        // Calculate appeal success rate for this denial reason
        const appealData = await this.pool.query(
          `SELECT 
             COUNT(*) as total_appeals,
             COUNT(CASE WHEN appeal_outcome = 'approved' THEN 1 END) as successful_appeals,
             AVG(EXTRACT(EPOCH FROM (appeal_decision_date - appeal_submitted_date))/3600) as avg_appeal_hours
           FROM appeals 
           WHERE original_authorization_id IN (
             SELECT id FROM authorizations 
             WHERE payer_name = $1 AND denial_reason = $2
               AND submitted_at >= $3 AND submitted_at <= $4
           )`,
          [pattern.payer_name, pattern.denial_reason, analysisStart, analysisEnd]
        );

        let appealSuccessRate = null;
        let avgAppealTime = null;
        
        if (appealData.rows.length > 0 && appealData.rows[0].total_appeals > 0) {
          appealSuccessRate = parseFloat(appealData.rows[0].successful_appeals) / parseFloat(appealData.rows[0].total_appeals);
          avgAppealTime = parseFloat(appealData.rows[0].avg_appeal_hours);
        }

        // Generate recommended strategy
        const recommendedStrategy = this.generateDenialStrategy(
          pattern.denial_reason,
          appealSuccessRate,
          pattern.payer_name
        );

        await this.pool.query(
          `INSERT INTO denial_pattern_analysis 
           (payer_name, denial_reason, procedure_code, provider_specialty, 
            frequency_count, frequency_percentage, appeal_success_rate, avg_appeal_time, 
            recommended_strategy, analysis_period_start, analysis_period_end) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (payer_name, denial_reason, procedure_code, provider_specialty, analysis_period_start) 
           DO UPDATE SET 
             frequency_count = $5,
             frequency_percentage = $6,
             appeal_success_rate = $7,
             avg_appeal_time = $8,
             recommended_strategy = $9`,
          [
            pattern.payer_name,
            pattern.denial_reason,
            pattern.procedure_code,
            pattern.provider_specialty,
            parseInt(pattern.frequency_count),
            parseFloat(pattern.frequency_percentage) * 100,
            appealSuccessRate,
            avgAppealTime,
            recommendedStrategy,
            analysisStart.toISOString().split('T')[0],
            analysisEnd.toISOString().split('T')[0]
          ]
        );
      }
      
      console.log('Denial patterns analysis completed');
    } catch (error) {
      console.error('Error analyzing denial patterns:', error);
      throw error;
    }
  }

  generateDenialStrategy(denialReason, appealSuccessRate, payerName) {
    const strategies = {
      'medical_necessity': {
        high_appeal: 'Focus on clinical evidence and peer-reviewed studies. Include detailed treatment history and failed alternatives.',
        low_appeal: 'Strengthen initial documentation with comprehensive clinical justification and specialist recommendations.',
        general: 'Provide detailed medical necessity documentation with supporting clinical evidence.'
      },
      'insufficient_documentation': {
        high_appeal: 'Submit complete documentation package with all required forms and supporting materials.',
        low_appeal: 'Implement documentation checklist and pre-submission review process.',
        general: 'Ensure all required documentation is complete and properly formatted before submission.'
      },
      'prior_authorization_required': {
        high_appeal: 'Verify PA requirements and submit retroactive authorization with clinical urgency justification.',
        low_appeal: 'Implement PA verification process in workflow to prevent future denials.',
        general: 'Always verify prior authorization requirements before treatment or service delivery.'
      },
      'experimental_treatment': {
        high_appeal: 'Provide extensive clinical literature, FDA approvals, and medical society guidelines.',
        low_appeal: 'Consider alternative established treatments or seek coverage determination.',
        general: 'Document treatment as medically necessary with supporting clinical evidence.'
      }
    };

    const strategy = strategies[denialReason] || {
      general: 'Review denial reason carefully and provide appropriate supporting documentation.'
    };

    if (appealSuccessRate !== null) {
      if (appealSuccessRate > 0.7) {
        return strategy.high_appeal || strategy.general;
      } else if (appealSuccessRate < 0.3) {
        return strategy.low_appeal || strategy.general;
      }
    }

    return strategy.general;
  }

  async generatePredictiveInsights() {
    try {
      const predictionDate = new Date().toISOString().split('T')[0];
      
      // Generate predictions for common procedure-payer combinations
      const procedurePayers = await this.pool.query(
        `SELECT 
           payer_name,
           procedure_code,
           p.specialty as provider_specialty,
           COUNT(*) as historical_count,
           COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*) as approval_rate,
           AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_processing_hours
         FROM authorizations a
         LEFT JOIN providers p ON a.provider_npi = p.npi
         WHERE a.submitted_at >= NOW() - INTERVAL '180 days'
           AND a.status IN ('approved', 'denied')
         GROUP BY payer_name, procedure_code, p.specialty
         HAVING COUNT(*) >= 10
         ORDER BY historical_count DESC`
      );

      for (const combo of procedurePayers.rows) {
        const approvalRate = parseFloat(combo.approval_rate);
        const processingHours = parseFloat(combo.avg_processing_hours);
        const sampleSize = parseInt(combo.historical_count);
        
        // Calculate confidence level based on sample size
        const confidenceLevel = this.calculateConfidenceScore(sampleSize);
        
        // Determine optimal submission timing
        const optimalTiming = this.determineOptimalTiming(
          combo.payer_name,
          processingHours,
          approvalRate
        );
        
        // Get recommended documentation
        const recommendedDocs = this.getRecommendedDocumentation(
          combo.payer_name,
          combo.procedure_code,
          approvalRate
        );
        
        // Identify risk factors
        const riskFactors = await this.identifyRiskFactors(
          combo.payer_name,
          combo.procedure_code,
          combo.provider_specialty
        );

        await this.pool.query(
          `INSERT INTO predictive_insights 
           (payer_name, procedure_code, provider_specialty, predicted_approval_rate, 
            optimal_submission_timing, recommended_documentation, risk_factors, 
            confidence_level, prediction_date) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (payer_name, procedure_code, provider_specialty, prediction_date) 
           DO UPDATE SET 
             predicted_approval_rate = $4,
             optimal_submission_timing = $5,
             recommended_documentation = $6,
             risk_factors = $7,
             confidence_level = $8`,
          [
            combo.payer_name,
            combo.procedure_code,
            combo.provider_specialty,
            approvalRate,
            optimalTiming,
            JSON.stringify(recommendedDocs),
            JSON.stringify(riskFactors),
            confidenceLevel,
            predictionDate
          ]
        );
      }
      
      console.log('Predictive insights generation completed');
    } catch (error) {
      console.error('Error generating predictive insights:', error);
      throw error;
    }
  }

  calculateConfidenceScore(sampleSize) {
    if (sampleSize >= 100) return 0.95;
    if (sampleSize >= 50) return 0.85;
    if (sampleSize >= 25) return 0.75;
    if (sampleSize >= 10) return 0.65;
    return 0.50;
  }

  determineOptimalTiming(payerName, avgProcessingHours, approvalRate) {
    const payerProfile = this.payerProfiles[payerName];
    
    if (!payerProfile) {
      return 'business_hours';
    }
    
    // Consider payer-specific patterns
    if (avgProcessingHours < 24) {
      return 'any_time';
    } else if (avgProcessingHours < 48) {
      return 'early_week';
    } else {
      return 'monday_tuesday';
    }
  }

  getRecommendedDocumentation(payerName, procedureCode, approvalRate) {
    const payerProfile = this.payerProfiles[payerName];
    const baseDocs = ['authorization_form', 'clinical_notes'];
    
    if (payerProfile && payerProfile.preferredDocumentation) {
      baseDocs.push(...payerProfile.preferredDocumentation);
    }
    
    // Add additional docs for low approval rate procedures
    if (approvalRate < 0.7) {
      baseDocs.push('peer_reviewed_studies', 'treatment_guidelines', 'specialist_consultation');
    }
    
    return [...new Set(baseDocs)]; // Remove duplicates
  }

  async identifyRiskFactors(payerName, procedureCode, providerSpecialty) {
    const riskFactors = [];
    
    // Check for high denial rate
    const denialRate = await this.pool.query(
      `SELECT 
         COUNT(CASE WHEN status = 'denied' THEN 1 END)::DECIMAL / COUNT(*) as denial_rate
       FROM authorizations 
       WHERE payer_name = $1 AND procedure_code = $2
         AND submitted_at >= NOW() - INTERVAL '90 days'`,
      [payerName, procedureCode]
    );
    
    if (denialRate.rows.length > 0 && parseFloat(denialRate.rows[0].denial_rate) > 0.3) {
      riskFactors.push({
        type: 'high_denial_rate',
        description: 'This procedure has a high denial rate with this payer',
        mitigation: 'Ensure comprehensive documentation and consider pre-authorization'
      });
    }
    
    // Check for seasonal variations
    const seasonalRisk = await this.pool.query(
      `SELECT month, approval_rate
       FROM seasonal_patterns 
       WHERE payer_name = $1 AND year = EXTRACT(YEAR FROM CURRENT_DATE)
       ORDER BY approval_rate ASC
       LIMIT 1`,
      [payerName]
    );
    
    if (seasonalRisk.rows.length > 0) {
      const currentMonth = new Date().getMonth() + 1;
      const worstMonth = parseInt(seasonalRisk.rows[0].month);
      
      if (Math.abs(currentMonth - worstMonth) <= 1) {
        riskFactors.push({
          type: 'seasonal_risk',
          description: 'Current month shows historically lower approval rates',
          mitigation: 'Consider delaying non-urgent submissions or strengthening documentation'
        });
      }
    }
    
    return riskFactors;
  }

  async generateCompetitiveAnalysis() {
    try {
      const analysisDate = new Date().toISOString().split('T')[0];
      
      // Analyze key metrics across payers
      const metrics = [
        'approval_rate',
        'avg_processing_time',
        'appeal_success_rate',
        'documentation_requirements'
      ];
      
      for (const metric of metrics) {
        let rankings = [];
        
        if (metric === 'approval_rate') {
          const data = await this.pool.query(
            `SELECT 
               payer_name,
               COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*) as value
             FROM authorizations 
             WHERE submitted_at >= NOW() - INTERVAL '90 days'
               AND status IN ('approved', 'denied')
             GROUP BY payer_name
             HAVING COUNT(*) >= 20
             ORDER BY value DESC`
          );
          rankings = data.rows.map((row, index) => ({
            rank: index + 1,
            payer: row.payer_name,
            value: parseFloat(row.value),
            percentile: ((data.rows.length - index) / data.rows.length) * 100
          }));
        }
        
        if (metric === 'avg_processing_time') {
          const data = await this.pool.query(
            `SELECT 
               payer_name,
               AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as value
             FROM authorizations 
             WHERE submitted_at >= NOW() - INTERVAL '90 days'
               AND status IN ('approved', 'denied')
             GROUP BY payer_name
             HAVING COUNT(*) >= 20
             ORDER BY value ASC`
          );
          rankings = data.rows.map((row, index) => ({
            rank: index + 1,
            payer: row.payer_name,
            value: parseFloat(row.value),
            percentile: ((data.rows.length - index) / data.rows.length) * 100
          }));
        }
        
        // Generate market insights
        const insights = this.generateMarketInsights(metric, rankings);
        
        // Generate strategic recommendations
        const recommendations = this.generateStrategicRecommendations(metric, rankings);
        
        await this.pool.query(
          `INSERT INTO competitive_analysis 
           (analysis_date, metric_name, payer_rankings, market_insights, strategic_recommendations) 
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (analysis_date, metric_name) 
           DO UPDATE SET 
             payer_rankings = $3,
             market_insights = $4,
             strategic_recommendations = $5`,
          [
            analysisDate,
            metric,
            JSON.stringify(rankings),
            insights,
            JSON.stringify(recommendations)
          ]
        );
      }
      
      console.log('Competitive analysis completed');
    } catch (error) {
      console.error('Error generating competitive analysis:', error);
      throw error;
    }
  }

  generateMarketInsights(metric, rankings) {
    if (rankings.length === 0) return 'Insufficient data for analysis';
    
    const topPerformer = rankings[0];
    const bottomPerformer = rankings[rankings.length - 1];
    const average = rankings.reduce((sum, r) => sum + r.value, 0) / rankings.length;
    
    let insights = `Market Analysis for ${metric}:\n`;
    insights += `• Top Performer: ${topPerformer.payer} (${topPerformer.value.toFixed(3)})\n`;
    insights += `• Market Average: ${average.toFixed(3)}\n`;
    insights += `• Performance Gap: ${((topPerformer.value - bottomPerformer.value) / bottomPerformer.value * 100).toFixed(1)}%\n`;
    
    if (metric === 'approval_rate') {
      insights += `• Market shows ${average > 0.8 ? 'favorable' : 'challenging'} approval environment\n`;
    } else if (metric === 'avg_processing_time') {
      insights += `• Average processing time is ${average > 48 ? 'slow' : 'reasonable'} at ${average.toFixed(1)} hours\n`;
    }
    
    return insights;
  }

  generateStrategicRecommendations(metric, rankings) {
    const recommendations = [];
    
    if (rankings.length === 0) return recommendations;
    
    const topPerformers = rankings.slice(0, Math.ceil(rankings.length * 0.3));
    const bottomPerformers = rankings.slice(-Math.ceil(rankings.length * 0.3));
    
    if (metric === 'approval_rate') {
      recommendations.push({
        category: 'payer_prioritization',
        priority: 'high',
        action: `Prioritize submissions to top-performing payers: ${topPerformers.map(p => p.payer).join(', ')}`,
        expectedImpact: 'Increase overall approval rate by 10-15%'
      });
      
      recommendations.push({
        category: 'documentation_strategy',
        priority: 'medium',
        action: `Strengthen documentation for challenging payers: ${bottomPerformers.map(p => p.payer).join(', ')}`,
        expectedImpact: 'Improve approval rates for difficult payers'
      });
    }
    
    if (metric === 'avg_processing_time') {
      recommendations.push({
        category: 'workflow_optimization',
        priority: 'medium',
        action: `Adjust follow-up schedules based on payer processing times`,
        expectedImpact: 'Reduce unnecessary follow-up calls and improve efficiency'
      });
    }
    
    return recommendations;
  }

  async getTrendsReport(payerName = null, timeframe = '30_days') {
    try {
      const report = {
        summary: await this.getTrendsSummary(payerName, timeframe),
        approvalPatterns: await this.getApprovalTrends(payerName, timeframe),
        seasonalInsights: await this.getSeasonalInsights(payerName),
        denialAnalysis: await this.getDenialTrends(payerName, timeframe),
        predictiveInsights: await this.getPredictiveInsights(payerName),
        competitivePosition: await this.getCompetitivePosition(payerName),
        recommendations: await this.getStrategicRecommendations(payerName)
      };
      
      return report;
    } catch (error) {
      console.error('Error generating trends report:', error);
      throw error;
    }
  }

  async getTrendsSummary(payerName, timeframe) {
    const whereClause = payerName ? 'WHERE payer_name = $1' : '';
    const params = payerName ? [payerName] : [];
    
    const interval = timeframe === '90_days' ? '90 days' : '30 days';
    
    const summary = await this.pool.query(
      `SELECT 
         ${payerName ? '$1 as payer_name,' : 'payer_name,'}
         COUNT(*) as total_trends,
         COUNT(CASE WHEN trend_direction = 'increasing' THEN 1 END) as improving_trends,
         COUNT(CASE WHEN trend_direction = 'decreasing' THEN 1 END) as declining_trends,
         AVG(confidence_score) as avg_confidence
       FROM payer_trend_analysis 
       ${whereClause}
       ${payerName ? 'AND' : 'WHERE'} analysis_date >= CURRENT_DATE - INTERVAL '${interval}'
       ${payerName ? '' : 'GROUP BY payer_name'}`,
      params
    );
    
    return summary.rows;
  }

  async getApprovalTrends(payerName, timeframe) {
    const whereClause = payerName ? 'WHERE payer_name = $1' : '';
    const params = payerName ? [payerName] : [];
    
    const trends = await this.pool.query(
      `SELECT 
         payer_name,
         metric_name,
         current_value,
         previous_value,
         change_percentage,
         trend_direction,
         confidence_score
       FROM payer_trend_analysis 
       ${whereClause}
       ${payerName ? 'AND' : 'WHERE'} trend_category = 'approvalPatterns'
         AND analysis_date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY analysis_date DESC`,
      params
    );
    
    return trends.rows;
  }

  async getSeasonalInsights(payerName) {
    const whereClause = payerName ? 'WHERE payer_name = $1' : '';
    const params = payerName ? [payerName] : [];
    
    const seasonal = await this.pool.query(
      `SELECT 
         payer_name,
         month,
         approval_rate,
         avg_processing_time,
         volume_index,
         denial_rate
       FROM seasonal_patterns 
       ${whereClause}
       ${payerName ? 'AND' : 'WHERE'} year = EXTRACT(YEAR FROM CURRENT_DATE)
       ORDER BY payer_name, month`,
      params
    );
    
    return seasonal.rows;
  }

  async getDenialTrends(payerName, timeframe) {
    const whereClause = payerName ? 'WHERE payer_name = $1' : '';
    const params = payerName ? [payerName] : [];
    
    const denials = await this.pool.query(
      `SELECT 
         payer_name,
         denial_reason,
         frequency_count,
         frequency_percentage,
         appeal_success_rate,
         recommended_strategy
       FROM denial_pattern_analysis 
       ${whereClause}
       ${payerName ? 'AND' : 'WHERE'} analysis_period_end >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY frequency_count DESC
       LIMIT 10`,
      params
    );
    
    return denials.rows;
  }

  async getPredictiveInsights(payerName) {
    const whereClause = payerName ? 'WHERE payer_name = $1' : '';
    const params = payerName ? [payerName] : [];
    
    const predictions = await this.pool.query(
      `SELECT 
         payer_name,
         procedure_code,
         provider_specialty,
         predicted_approval_rate,
         optimal_submission_timing,
         recommended_documentation,
         risk_factors,
         confidence_level
       FROM predictive_insights 
       ${whereClause}
       ${payerName ? 'AND' : 'WHERE'} prediction_date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY confidence_level DESC, predicted_approval_rate DESC
       LIMIT 20`,
      params
    );
    
    return predictions.rows.map(row => ({
      ...row,
      recommended_documentation: JSON.parse(row.recommended_documentation || '[]'),
      risk_factors: JSON.parse(row.risk_factors || '[]')
    }));
  }

  async getCompetitivePosition(payerName) {
    if (!payerName) {
      const latest = await this.pool.query(
        `SELECT metric_name, payer_rankings, market_insights
         FROM competitive_analysis 
         WHERE analysis_date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY analysis_date DESC
         LIMIT 5`
      );
      
      return latest.rows.map(row => ({
        ...row,
        payer_rankings: JSON.parse(row.payer_rankings || '[]')
      }));
    }
    
    const position = await this.pool.query(
      `SELECT 
         metric_name,
         payer_rankings,
         market_insights
       FROM competitive_analysis 
       WHERE analysis_date >= CURRENT_DATE - INTERVAL '7 days'
         AND payer_rankings::text LIKE '%"payer":"' || $1 || '"%'
       ORDER BY analysis_date DESC`,
      [payerName]
    );
    
    return position.rows.map(row => {
      const rankings = JSON.parse(row.payer_rankings || '[]');
      const payerRank = rankings.find(r => r.payer === payerName);
      
      return {
        metric_name: row.metric_name,
        payer_position: payerRank,
        market_insights: row.market_insights,
        total_competitors: rankings.length
      };
    });
  }

  async getStrategicRecommendations(payerName) {
    const whereClause = payerName ? 'WHERE payer_name = $1' : '';
    const params = payerName ? [payerName] : [];
    
    const recommendations = await this.pool.query(
      `SELECT 
         intelligence_type,
         title,
         description,
         impact_level,
         actionable_insights,
         confidence_score
       FROM market_intelligence 
       ${whereClause}
       ${payerName ? 'AND' : 'WHERE'} created_at >= NOW() - INTERVAL '30 days'
       ORDER BY confidence_score DESC, impact_level DESC
       LIMIT 10`,
      params
    );
    
    return recommendations.rows.map(row => ({
      ...row,
      actionable_insights: JSON.parse(row.actionable_insights || '[]')
    }));
  }

  async setupScheduledAnalysis() {
    // Run approval patterns analysis daily at 1 AM
    cron.schedule('0 1 * * *', async () => {
      try {
        console.log('Running scheduled approval patterns analysis...');
        await this.analyzeApprovalPatterns();
      } catch (error) {
        console.error('Scheduled approval patterns analysis failed:', error);
      }
    });
    
    // Run seasonal analysis weekly on Mondays at 2 AM
    cron.schedule('0 2 * * 1', async () => {
      try {
        console.log('Running scheduled seasonal patterns analysis...');
        await this.analyzeSeasonalPatterns();
      } catch (error) {
        console.error('Scheduled seasonal analysis failed:', error);
      }
    });
    
    // Run denial analysis daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
      try {
        console.log('Running scheduled denial patterns analysis...');
        await this.analyzeDenialPatterns();
      } catch (error) {
        console.error('Scheduled denial analysis failed:', error);
      }
    });
    
    // Generate predictive insights weekly on Sundays at 4 AM
    cron.schedule('0 4 * * 0', async () => {
      try {
        console.log('Generating scheduled predictive insights...');
        await this.generatePredictiveInsights();
      } catch (error) {
        console.error('Scheduled predictive insights generation failed:', error);
      }
    });
    
    // Run competitive analysis weekly on Fridays at 5 AM
    cron.schedule('0 5 * * 5', async () => {
      try {
        console.log('Running scheduled competitive analysis...');
        await this.generateCompetitiveAnalysis();
      } catch (error) {
        console.error('Scheduled competitive analysis failed:', error);
      }
    });
    
    console.log('Scheduled payer trends analysis tasks configured');
  }

  async shutdown() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = PayerTrendsService;