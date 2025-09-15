const OCRService = require('./ocrService');
const NLPService = require('./nlpService');
const FormIntelligenceService = require('./formIntelligenceService');
const PredictiveApprovalService = require('./predictiveApprovalService');
const SmartAppealsService = require('./smartAppealsService');
const ComplianceMonitoringService = require('./complianceMonitoringService');
const { pool } = require('../database/connection');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

class AIProcessingPipeline extends EventEmitter {
  constructor(dbPool) {
    super();
    
    this.pool = dbPool || pool;
    
    // Initialize AI services
    this.ocrService = new OCRService(this.pool);
    this.nlpService = new NLPService(this.pool);
    this.formIntelligenceService = new FormIntelligenceService(this.pool);
    this.predictiveApprovalService = new PredictiveApprovalService(this.pool);
    this.smartAppealsService = new SmartAppealsService(this.pool);
    this.complianceMonitoringService = new ComplianceMonitoringService(this.pool);
    
    // Pipeline configuration
    this.pipelineConfig = {
      stages: [
        {
          name: 'document_processing',
          services: ['ocr', 'nlp'],
          parallel: true,
          timeout: 300000, // 5 minutes
          retries: 2
        },
        {
          name: 'data_extraction',
          services: ['form_intelligence'],
          parallel: false,
          timeout: 180000, // 3 minutes
          retries: 1
        },
        {
          name: 'compliance_validation',
          services: ['compliance_monitoring'],
          parallel: false,
          timeout: 120000, // 2 minutes
          retries: 1
        },
        {
          name: 'approval_prediction',
          services: ['predictive_approval'],
          parallel: false,
          timeout: 60000, // 1 minute
          retries: 1
        },
        {
          name: 'submission_preparation',
          services: ['final_validation'],
          parallel: false,
          timeout: 30000, // 30 seconds
          retries: 0
        }
      ],
      
      quality_gates: {
        document_processing: {
          min_ocr_confidence: 0.85,
          min_nlp_entities: 5,
          required_fields: ['patient_name', 'diagnosis', 'procedure']
        },
        data_extraction: {
          min_form_completion: 0.90,
          required_sections: ['patient_info', 'clinical_info', 'provider_info']
        },
        compliance_validation: {
          max_critical_violations: 0,
          max_high_risk_score: 70
        },
        approval_prediction: {
          min_confidence: 0.70,
          required_factors: ['clinical_appropriateness', 'policy_compliance']
        }
      },
      
      error_handling: {
        retry_delays: [1000, 5000, 15000], // Progressive delays
        fallback_strategies: {
          ocr_failure: 'manual_review',
          nlp_failure: 'basic_extraction',
          compliance_failure: 'escalate_review',
          prediction_failure: 'standard_processing'
        }
      }
    };
    
    // Processing metrics
    this.metrics = {
      total_processed: 0,
      successful_completions: 0,
      failed_processing: 0,
      average_processing_time: 0,
      stage_performance: {},
      error_rates: {}
    };
    
    // Active processing jobs
    this.activeJobs = new Map();
    
    // Processing queue
    this.processingQueue = [];
    this.maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_AI_JOBS) || 5;
    this.currentJobs = 0;
  }

  // Initialize AI Processing Pipeline
  async initialize() {
    try {
      await this.createPipelineTables();
      await this.initializeAIServices();
      await this.loadPipelineConfiguration();
      await this.startProcessingMonitor();
      
      console.log('AI Processing Pipeline initialized successfully');
      this.emit('pipeline_initialized');
    } catch (error) {
      console.error('Failed to initialize AI Processing Pipeline:', error);
      throw error;
    }
  }

  // Create pipeline database tables
  async createPipelineTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS ai_processing_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id VARCHAR(100) UNIQUE NOT NULL,
        submission_id VARCHAR(100) NOT NULL,
        job_type VARCHAR(50) NOT NULL,
        job_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        priority INTEGER DEFAULT 5,
        input_data TEXT NOT NULL,
        processing_stages TEXT DEFAULT '[]',
        current_stage VARCHAR(100),
        stage_results TEXT DEFAULT '{}',
        final_results TEXT,
        error_details TEXT,
        quality_scores TEXT DEFAULT '{}',
        processing_metrics TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        processing_time INTEGER,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 2
      )`,
      
      `CREATE TABLE IF NOT EXISTS pipeline_stage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id VARCHAR(100) NOT NULL,
        stage_name VARCHAR(100) NOT NULL,
        service_name VARCHAR(100) NOT NULL,
        stage_status VARCHAR(50) NOT NULL,
        input_data TEXT,
        output_data TEXT,
        processing_time INTEGER,
        confidence_score DECIMAL(5,4),
        quality_metrics TEXT,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        retry_attempt INTEGER DEFAULT 0
      )`,
      
      `CREATE TABLE IF NOT EXISTS pipeline_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        total_jobs INTEGER DEFAULT 0,
        successful_jobs INTEGER DEFAULT 0,
        failed_jobs INTEGER DEFAULT 0,
        average_processing_time INTEGER,
        stage_performance TEXT DEFAULT '{}',
        error_breakdown TEXT DEFAULT '{}',
        throughput_metrics TEXT DEFAULT '{}',
        quality_metrics TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS ai_model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name VARCHAR(100) NOT NULL,
        model_version VARCHAR(50) NOT NULL,
        performance_date DATE NOT NULL,
        accuracy_score DECIMAL(5,4),
        precision_score DECIMAL(5,4),
        recall_score DECIMAL(5,4),
        f1_score DECIMAL(5,4),
        processing_speed INTEGER,
        error_rate DECIMAL(5,4),
        confidence_distribution TEXT,
        performance_metrics TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS pipeline_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        job_id VARCHAR(100),
        stage_name VARCHAR(100),
        service_name VARCHAR(100),
        alert_message TEXT NOT NULL,
        alert_data TEXT,
        alert_status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        acknowledged_at TIMESTAMP,
        acknowledged_by VARCHAR(100),
        resolved_at TIMESTAMP,
        resolution_notes TEXT
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_processing_jobs(job_status, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_ai_jobs_submission ON ai_processing_jobs(submission_id)',
      'CREATE INDEX IF NOT EXISTS idx_stage_logs_job ON pipeline_stage_logs(job_id, stage_name)',
      'CREATE INDEX IF NOT EXISTS idx_stage_logs_service ON pipeline_stage_logs(service_name, completed_at)',
      'CREATE INDEX IF NOT EXISTS idx_performance_date ON pipeline_performance(date)',
      'CREATE INDEX IF NOT EXISTS idx_model_performance ON ai_model_performance(model_name, performance_date)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_status ON pipeline_alerts(alert_status, severity, created_at)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  // Initialize AI services
  async initializeAIServices() {
    const services = [
      { name: 'OCR', service: this.ocrService },
      { name: 'NLP', service: this.nlpService },
      { name: 'Form Intelligence', service: this.formIntelligenceService },
      { name: 'Predictive Approval', service: this.predictiveApprovalService },
      { name: 'Smart Appeals', service: this.smartAppealsService },
      { name: 'Compliance Monitoring', service: this.complianceMonitoringService }
    ];

    for (const { name, service } of services) {
      try {
        await service.initialize();
        console.log(`${name} service initialized successfully`);
      } catch (error) {
        console.error(`Failed to initialize ${name} service:`, error);
        throw error;
      }
    }
  }

  // Load pipeline configuration
  async loadPipelineConfiguration() {
    // Load configuration from database or environment
    const configPath = process.env.PIPELINE_CONFIG_PATH;
    if (configPath) {
      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const customConfig = JSON.parse(configData);
        this.pipelineConfig = { ...this.pipelineConfig, ...customConfig };
      } catch (error) {
        console.warn('Could not load custom pipeline configuration:', error.message);
      }
    }
  }

  // Start processing monitor
  async startProcessingMonitor() {
    // Monitor processing queue every 5 seconds
    setInterval(async () => {
      await this.processQueue();
      await this.monitorActiveJobs();
      await this.updateMetrics();
    }, 5000);
    
    // Generate performance reports every hour
    setInterval(async () => {
      await this.generatePerformanceReport();
    }, 3600000);
  }

  // Process authorization submission through AI pipeline
  async processSubmission(submissionData, options = {}) {
    try {
      const jobId = this.generateJobId();
      
      // Create processing job
      const job = {
        jobId,
        submissionId: submissionData.id || submissionData.submission_id,
        jobType: options.jobType || 'full_processing',
        priority: options.priority || 5,
        inputData: submissionData,
        processingStages: [...this.pipelineConfig.stages],
        currentStage: null,
        stageResults: {},
        qualityScores: {},
        processingMetrics: {
          startTime: Date.now(),
          stageTimings: {}
        },
        retryCount: 0,
        maxRetries: options.maxRetries || 2
      };
      
      // Store job in database
      await this.storeProcessingJob(job);
      
      // Add to processing queue
      this.processingQueue.push(job);
      
      // Emit job created event
      this.emit('job_created', { jobId, submissionId: job.submissionId });
      
      return {
        jobId,
        status: 'queued',
        estimatedProcessingTime: this.estimateProcessingTime(job),
        queuePosition: this.processingQueue.length
      };
    } catch (error) {
      console.error('Failed to create processing job:', error);
      throw error;
    }
  }

  // Generate unique job ID
  generateJobId() {
    return `AI_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  // Store processing job
  async storeProcessingJob(job) {
    await this.pool.query(`
      INSERT INTO ai_processing_jobs (
        job_id, submission_id, job_type, job_status, priority,
        input_data, processing_stages, stage_results, processing_metrics,
        max_retries
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      job.jobId,
      job.submissionId,
      job.jobType,
      'pending',
      job.priority,
      JSON.stringify(job.inputData),
      JSON.stringify(job.processingStages),
      JSON.stringify(job.stageResults),
      JSON.stringify(job.processingMetrics),
      job.maxRetries
    ]);
  }

  // Process queue
  async processQueue() {
    if (this.currentJobs >= this.maxConcurrentJobs || this.processingQueue.length === 0) {
      return;
    }
    
    // Sort queue by priority (lower number = higher priority)
    this.processingQueue.sort((a, b) => a.priority - b.priority);
    
    // Process next job
    const job = this.processingQueue.shift();
    if (job) {
      this.currentJobs++;
      this.activeJobs.set(job.jobId, job);
      
      // Process job asynchronously
      this.executeJob(job).finally(() => {
        this.currentJobs--;
        this.activeJobs.delete(job.jobId);
      });
    }
  }

  // Execute processing job
  async executeJob(job) {
    try {
      // Update job status
      await this.updateJobStatus(job.jobId, 'processing', { started_at: new Date() });
      
      job.processingMetrics.actualStartTime = Date.now();
      
      // Execute pipeline stages
      for (const stage of job.processingStages) {
        try {
          job.currentStage = stage.name;
          await this.updateJobStatus(job.jobId, 'processing', { current_stage: stage.name });
          
          const stageStartTime = Date.now();
          
          // Execute stage
          const stageResult = await this.executeStage(job, stage);
          
          const stageEndTime = Date.now();
          const stageProcessingTime = stageEndTime - stageStartTime;
          
          // Store stage results
          job.stageResults[stage.name] = stageResult;
          job.processingMetrics.stageTimings[stage.name] = stageProcessingTime;
          
          // Log stage completion
          await this.logStageCompletion(job.jobId, stage.name, stageResult, stageProcessingTime);
          
          // Check quality gates
          const qualityCheck = await this.checkQualityGate(job, stage.name, stageResult);
          if (!qualityCheck.passed) {
            throw new Error(`Quality gate failed for stage ${stage.name}: ${qualityCheck.reason}`);
          }
          
          // Emit stage completed event
          this.emit('stage_completed', {
            jobId: job.jobId,
            stageName: stage.name,
            result: stageResult,
            processingTime: stageProcessingTime
          });
          
        } catch (stageError) {
          console.error(`Stage ${stage.name} failed for job ${job.jobId}:`, stageError);
          
          // Handle stage failure
          const shouldRetry = await this.handleStageFailure(job, stage, stageError);
          if (!shouldRetry) {
            throw stageError;
          }
        }
      }
      
      // Calculate final results
      const finalResults = await this.calculateFinalResults(job);
      
      // Update job completion
      const totalProcessingTime = Date.now() - job.processingMetrics.actualStartTime;
      await this.updateJobStatus(job.jobId, 'completed', {
        completed_at: new Date(),
        processing_time: totalProcessingTime,
        final_results: JSON.stringify(finalResults)
      });
      
      // Update metrics
      this.metrics.successful_completions++;
      this.updateAverageProcessingTime(totalProcessingTime);
      
      // Emit job completed event
      this.emit('job_completed', {
        jobId: job.jobId,
        submissionId: job.submissionId,
        results: finalResults,
        processingTime: totalProcessingTime
      });
      
      return finalResults;
      
    } catch (error) {
      console.error(`Job ${job.jobId} failed:`, error);
      
      // Handle job failure
      await this.handleJobFailure(job, error);
      
      // Update metrics
      this.metrics.failed_processing++;
      
      // Emit job failed event
      this.emit('job_failed', {
        jobId: job.jobId,
        submissionId: job.submissionId,
        error: error.message
      });
      
      throw error;
    }
  }

  // Execute pipeline stage
  async executeStage(job, stage) {
    const stageResults = {};
    
    if (stage.parallel) {
      // Execute services in parallel
      const servicePromises = stage.services.map(serviceName => 
        this.executeService(job, serviceName, stage)
      );
      
      const results = await Promise.allSettled(servicePromises);
      
      for (let i = 0; i < stage.services.length; i++) {
        const serviceName = stage.services[i];
        const result = results[i];
        
        if (result.status === 'fulfilled') {
          stageResults[serviceName] = result.value;
        } else {
          console.error(`Service ${serviceName} failed:`, result.reason);
          stageResults[serviceName] = { error: result.reason.message };
        }
      }
    } else {
      // Execute services sequentially
      for (const serviceName of stage.services) {
        try {
          const result = await this.executeService(job, serviceName, stage);
          stageResults[serviceName] = result;
        } catch (error) {
          console.error(`Service ${serviceName} failed:`, error);
          stageResults[serviceName] = { error: error.message };
          
          // For sequential processing, stop on first failure
          throw error;
        }
      }
    }
    
    return stageResults;
  }

  // Execute individual service
  async executeService(job, serviceName, stage) {
    const serviceStartTime = Date.now();
    
    try {
      let result;
      const inputData = this.prepareServiceInput(job, serviceName);
      
      switch (serviceName) {
        case 'ocr':
          result = await this.ocrService.processDocument(inputData);
          break;
          
        case 'nlp':
          result = await this.nlpService.processClinicalText(inputData);
          break;
          
        case 'form_intelligence':
          result = await this.formIntelligenceService.mapDataToForm(inputData);
          break;
          
        case 'compliance_monitoring':
          result = await this.complianceMonitoringService.performComplianceCheck(inputData);
          break;
          
        case 'predictive_approval':
          result = await this.predictiveApprovalService.processAuthorizationData(inputData);
          break;
          
        case 'smart_appeals':
          result = await this.smartAppealsService.generateAppealLetter(inputData);
          break;
          
        case 'final_validation':
          result = await this.performFinalValidation(inputData);
          break;
          
        default:
          throw new Error(`Unknown service: ${serviceName}`);
      }
      
      const serviceEndTime = Date.now();
      const processingTime = serviceEndTime - serviceStartTime;
      
      // Log service execution
      await this.logServiceExecution(job.jobId, stage.name, serviceName, result, processingTime);
      
      return {
        ...result,
        processingTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const serviceEndTime = Date.now();
      const processingTime = serviceEndTime - serviceStartTime;
      
      // Log service failure
      await this.logServiceFailure(job.jobId, stage.name, serviceName, error, processingTime);
      
      throw error;
    }
  }

  // Prepare service input
  prepareServiceInput(job, serviceName) {
    let inputData = { ...job.inputData };
    
    // Add results from previous stages
    for (const [stageName, stageResult] of Object.entries(job.stageResults)) {
      inputData[`${stageName}_results`] = stageResult;
    }
    
    // Service-specific input preparation
    switch (serviceName) {
      case 'ocr':
        return {
          documents: inputData.documents || [],
          document_type: inputData.document_type || 'authorization_request'
        };
        
      case 'nlp':
        return {
          clinical_text: inputData.clinical_notes || inputData.medical_records || '',
          document_type: inputData.document_type || 'clinical_notes'
        };
        
      case 'form_intelligence':
        const ocrResults = job.stageResults.document_processing?.ocr;
        const nlpResults = job.stageResults.document_processing?.nlp;
        
        return {
          extracted_data: {
            ...inputData,
            ocr_data: ocrResults,
            nlp_data: nlpResults
          },
          payer_type: inputData.payer_type || 'commercial',
          form_type: inputData.form_type || 'prior_authorization'
        };
        
      case 'compliance_monitoring':
        return {
          ...inputData,
          extracted_data: job.stageResults.data_extraction?.form_intelligence
        };
        
      case 'predictive_approval':
        return {
          ...inputData,
          compliance_results: job.stageResults.compliance_validation?.compliance_monitoring
        };
        
      default:
        return inputData;
    }
  }

  // Check quality gate
  async checkQualityGate(job, stageName, stageResult) {
    const qualityGate = this.pipelineConfig.quality_gates[stageName];
    if (!qualityGate) {
      return { passed: true };
    }
    
    const checks = [];
    
    // Check OCR confidence
    if (qualityGate.min_ocr_confidence && stageResult.ocr) {
      const ocrConfidence = stageResult.ocr.confidence || 0;
      if (ocrConfidence < qualityGate.min_ocr_confidence) {
        checks.push(`OCR confidence ${ocrConfidence} below minimum ${qualityGate.min_ocr_confidence}`);
      }
    }
    
    // Check NLP entities
    if (qualityGate.min_nlp_entities && stageResult.nlp) {
      const entityCount = stageResult.nlp.entities?.length || 0;
      if (entityCount < qualityGate.min_nlp_entities) {
        checks.push(`NLP entities ${entityCount} below minimum ${qualityGate.min_nlp_entities}`);
      }
    }
    
    // Check form completion
    if (qualityGate.min_form_completion && stageResult.form_intelligence) {
      const completion = stageResult.form_intelligence.completion_confidence || 0;
      if (completion < qualityGate.min_form_completion) {
        checks.push(`Form completion ${completion} below minimum ${qualityGate.min_form_completion}`);
      }
    }
    
    // Check compliance violations
    if (qualityGate.max_critical_violations !== undefined && stageResult.compliance_monitoring) {
      const criticalViolations = stageResult.compliance_monitoring.violations?.filter(
        v => v.severity === 'critical'
      ).length || 0;
      
      if (criticalViolations > qualityGate.max_critical_violations) {
        checks.push(`Critical violations ${criticalViolations} exceeds maximum ${qualityGate.max_critical_violations}`);
      }
    }
    
    // Check risk score
    if (qualityGate.max_high_risk_score && stageResult.compliance_monitoring) {
      const riskScore = stageResult.compliance_monitoring.risk_score || 0;
      if (riskScore > qualityGate.max_high_risk_score) {
        checks.push(`Risk score ${riskScore} exceeds maximum ${qualityGate.max_high_risk_score}`);
      }
    }
    
    // Check prediction confidence
    if (qualityGate.min_confidence && stageResult.predictive_approval) {
      const confidence = stageResult.predictive_approval.confidence || 0;
      if (confidence < qualityGate.min_confidence) {
        checks.push(`Prediction confidence ${confidence} below minimum ${qualityGate.min_confidence}`);
      }
    }
    
    if (checks.length > 0) {
      return {
        passed: false,
        reason: checks.join('; ')
      };
    }
    
    return { passed: true };
  }

  // Perform final validation
  async performFinalValidation(inputData) {
    const validationResults = {
      overall_status: 'passed',
      validation_checks: [],
      data_completeness: 0,
      processing_quality: 0,
      submission_readiness: false
    };
    
    // Check data completeness
    const requiredFields = [
      'patient_name', 'patient_dob', 'member_id', 'diagnosis_code',
      'procedure_code', 'provider_npi', 'service_date'
    ];
    
    let completedFields = 0;
    for (const field of requiredFields) {
      if (this.getNestedValue(inputData, field)) {
        completedFields++;
      } else {
        validationResults.validation_checks.push({
          type: 'missing_field',
          field: field,
          severity: 'high',
          message: `Required field ${field} is missing`
        });
      }
    }
    
    validationResults.data_completeness = completedFields / requiredFields.length;
    
    // Check processing quality
    const qualityFactors = [];
    
    if (inputData.document_processing_results?.ocr?.confidence) {
      qualityFactors.push(inputData.document_processing_results.ocr.confidence);
    }
    
    if (inputData.data_extraction_results?.form_intelligence?.completion_confidence) {
      qualityFactors.push(inputData.data_extraction_results.form_intelligence.completion_confidence);
    }
    
    if (inputData.approval_prediction_results?.predictive_approval?.confidence) {
      qualityFactors.push(inputData.approval_prediction_results.predictive_approval.confidence);
    }
    
    if (qualityFactors.length > 0) {
      validationResults.processing_quality = qualityFactors.reduce((a, b) => a + b, 0) / qualityFactors.length;
    }
    
    // Determine submission readiness
    validationResults.submission_readiness = 
      validationResults.data_completeness >= 0.90 &&
      validationResults.processing_quality >= 0.80 &&
      validationResults.validation_checks.filter(c => c.severity === 'high').length === 0;
    
    if (!validationResults.submission_readiness) {
      validationResults.overall_status = 'requires_review';
    }
    
    return validationResults;
  }

  // Get nested value from object
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  // Calculate final results
  async calculateFinalResults(job) {
    const finalResults = {
      submission_id: job.submissionId,
      processing_status: 'completed',
      overall_confidence: 0,
      recommendation: 'submit',
      stage_results: job.stageResults,
      quality_scores: {},
      processing_summary: {},
      next_actions: []
    };
    
    // Calculate overall confidence
    const confidenceScores = [];
    
    for (const [stageName, stageResult] of Object.entries(job.stageResults)) {
      for (const [serviceName, serviceResult] of Object.entries(stageResult)) {
        if (serviceResult.confidence) {
          confidenceScores.push(serviceResult.confidence);
        }
      }
    }
    
    if (confidenceScores.length > 0) {
      finalResults.overall_confidence = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
    }
    
    // Determine recommendation
    const complianceResults = job.stageResults.compliance_validation?.compliance_monitoring;
    const predictionResults = job.stageResults.approval_prediction?.predictive_approval;
    const validationResults = job.stageResults.submission_preparation?.final_validation;
    
    if (complianceResults?.risk_level === 'critical') {
      finalResults.recommendation = 'reject';
      finalResults.next_actions.push('resolve_compliance_violations');
    } else if (predictionResults?.approval_likelihood < 0.3) {
      finalResults.recommendation = 'review_required';
      finalResults.next_actions.push('clinical_review', 'additional_documentation');
    } else if (!validationResults?.submission_readiness) {
      finalResults.recommendation = 'complete_data';
      finalResults.next_actions.push('data_completion', 'quality_review');
    } else {
      finalResults.recommendation = 'submit';
      finalResults.next_actions.push('submit_authorization');
    }
    
    // Generate processing summary
    finalResults.processing_summary = {
      total_processing_time: Date.now() - job.processingMetrics.actualStartTime,
      stages_completed: Object.keys(job.stageResults).length,
      services_executed: this.countExecutedServices(job.stageResults),
      quality_gates_passed: await this.countPassedQualityGates(job),
      data_completeness: validationResults?.data_completeness || 0,
      processing_quality: validationResults?.processing_quality || 0
    };
    
    return finalResults;
  }

  // Count executed services
  countExecutedServices(stageResults) {
    let count = 0;
    for (const stageResult of Object.values(stageResults)) {
      count += Object.keys(stageResult).length;
    }
    return count;
  }

  // Count passed quality gates
  async countPassedQualityGates(job) {
    let passed = 0;
    for (const [stageName, stageResult] of Object.entries(job.stageResults)) {
      const qualityCheck = await this.checkQualityGate(job, stageName, stageResult);
      if (qualityCheck.passed) {
        passed++;
      }
    }
    return passed;
  }

  // Handle stage failure
  async handleStageFailure(job, stage, error) {
    const fallbackStrategy = this.pipelineConfig.error_handling.fallback_strategies[`${stage.name}_failure`];
    
    if (job.retryCount < stage.retries) {
      job.retryCount++;
      
      // Wait before retry
      const delay = this.pipelineConfig.error_handling.retry_delays[job.retryCount - 1] || 5000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.log(`Retrying stage ${stage.name} for job ${job.jobId} (attempt ${job.retryCount})`);
      return true; // Retry
    }
    
    // Apply fallback strategy
    if (fallbackStrategy) {
      await this.applyFallbackStrategy(job, stage, fallbackStrategy, error);
    }
    
    return false; // Don't retry
  }

  // Apply fallback strategy
  async applyFallbackStrategy(job, stage, strategy, error) {
    console.log(`Applying fallback strategy '${strategy}' for stage ${stage.name}`);
    
    switch (strategy) {
      case 'manual_review':
        await this.createAlert({
          alert_type: 'manual_review_required',
          severity: 'high',
          job_id: job.jobId,
          stage_name: stage.name,
          alert_message: `Manual review required due to ${stage.name} failure`,
          alert_data: { error: error.message }
        });
        break;
        
      case 'basic_extraction':
        // Use basic extraction methods
        job.stageResults[stage.name] = {
          fallback_result: {
            method: 'basic_extraction',
            confidence: 0.5,
            data: this.performBasicExtraction(job.inputData)
          }
        };
        break;
        
      case 'escalate_review':
        await this.createAlert({
          alert_type: 'compliance_escalation',
          severity: 'critical',
          job_id: job.jobId,
          stage_name: stage.name,
          alert_message: `Compliance issue requires immediate escalation`,
          alert_data: { error: error.message }
        });
        break;
        
      case 'standard_processing':
        // Continue with standard processing
        job.stageResults[stage.name] = {
          standard_result: {
            method: 'standard_processing',
            confidence: 0.7,
            status: 'completed_with_fallback'
          }
        };
        break;
    }
  }

  // Perform basic extraction
  performBasicExtraction(inputData) {
    // Basic field extraction using simple patterns
    const extractedData = {};
    
    // Extract basic patient information
    if (inputData.patient_name) {
      extractedData.patient_name = inputData.patient_name;
    }
    
    if (inputData.member_id) {
      extractedData.member_id = inputData.member_id;
    }
    
    // Extract basic clinical information
    if (inputData.diagnosis_code) {
      extractedData.diagnosis_code = inputData.diagnosis_code;
    }
    
    if (inputData.procedure_code) {
      extractedData.procedure_code = inputData.procedure_code;
    }
    
    return extractedData;
  }

  // Handle job failure
  async handleJobFailure(job, error) {
    await this.updateJobStatus(job.jobId, 'failed', {
      completed_at: new Date(),
      error_details: JSON.stringify({
        message: error.message,
        stack: error.stack,
        stage: job.currentStage,
        retry_count: job.retryCount
      })
    });
    
    // Create alert for job failure
    await this.createAlert({
      alert_type: 'job_failure',
      severity: 'high',
      job_id: job.jobId,
      alert_message: `Processing job failed: ${error.message}`,
      alert_data: {
        submission_id: job.submissionId,
        failed_stage: job.currentStage,
        error: error.message
      }
    });
  }

  // Update job status
  async updateJobStatus(jobId, status, additionalData = {}) {
    const updateFields = ['job_status = $2'];
    const values = [jobId, status];
    let paramIndex = 3;
    
    for (const [field, value] of Object.entries(additionalData)) {
      updateFields.push(`${field} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    
    const query = `
      UPDATE ai_processing_jobs 
      SET ${updateFields.join(', ')}
      WHERE job_id = $1
    `;
    
    await this.pool.query(query, values);
  }

  // Log stage completion
  async logStageCompletion(jobId, stageName, stageResult, processingTime) {
    for (const [serviceName, serviceResult] of Object.entries(stageResult)) {
      await this.pool.query(`
        INSERT INTO pipeline_stage_logs (
          job_id, stage_name, service_name, stage_status,
          output_data, processing_time, confidence_score, completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        jobId,
        stageName,
        serviceName,
        'completed',
        JSON.stringify(serviceResult),
        processingTime,
        serviceResult.confidence || null,
        new Date()
      ]);
    }
  }

  // Log service execution
  async logServiceExecution(jobId, stageName, serviceName, result, processingTime) {
    await this.pool.query(`
      INSERT INTO pipeline_stage_logs (
        job_id, stage_name, service_name, stage_status,
        output_data, processing_time, confidence_score, completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      jobId,
      stageName,
      serviceName,
      'completed',
      JSON.stringify(result),
      processingTime,
      result.confidence || null,
      new Date()
    ]);
  }

  // Log service failure
  async logServiceFailure(jobId, stageName, serviceName, error, processingTime) {
    await this.pool.query(`
      INSERT INTO pipeline_stage_logs (
        job_id, stage_name, service_name, stage_status,
        error_message, processing_time, completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      jobId,
      stageName,
      serviceName,
      'failed',
      error.message,
      processingTime,
      new Date()
    ]);
  }

  // Create alert
  async createAlert(alertData) {
    await this.pool.query(`
      INSERT INTO pipeline_alerts (
        alert_type, severity, job_id, stage_name, service_name,
        alert_message, alert_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      alertData.alert_type,
      alertData.severity,
      alertData.job_id,
      alertData.stage_name,
      alertData.service_name,
      alertData.alert_message,
      JSON.stringify(alertData.alert_data)
    ]);
  }

  // Monitor active jobs
  async monitorActiveJobs() {
    for (const [jobId, job] of this.activeJobs) {
      const currentTime = Date.now();
      const processingTime = currentTime - job.processingMetrics.actualStartTime;
      
      // Check for timeout
      const currentStageConfig = job.processingStages.find(s => s.name === job.currentStage);
      if (currentStageConfig && processingTime > currentStageConfig.timeout) {
        console.warn(`Job ${jobId} timed out in stage ${job.currentStage}`);
        
        await this.createAlert({
          alert_type: 'job_timeout',
          severity: 'high',
          job_id: jobId,
          stage_name: job.currentStage,
          alert_message: `Job timed out after ${processingTime}ms in stage ${job.currentStage}`,
          alert_data: { timeout_threshold: currentStageConfig.timeout }
        });
      }
    }
  }

  // Update metrics
  async updateMetrics() {
    this.metrics.total_processed = this.metrics.successful_completions + this.metrics.failed_processing;
    
    // Update error rates
    for (const [stageName] of Object.entries(this.pipelineConfig.stages)) {
      const stageStats = await this.pool.query(`
        SELECT 
          COUNT(*) as total_executions,
          COUNT(CASE WHEN stage_status = 'failed' THEN 1 END) as failed_executions
        FROM pipeline_stage_logs
        WHERE stage_name = $1 AND completed_at > NOW() - INTERVAL '1 hour'
      `, [stageName]);
      
      const stats = stageStats.rows[0];
      if (stats && stats.total_executions > 0) {
        this.metrics.error_rates[stageName] = stats.failed_executions / stats.total_executions;
      }
    }
  }

  // Update average processing time
  updateAverageProcessingTime(newTime) {
    if (this.metrics.average_processing_time === 0) {
      this.metrics.average_processing_time = newTime;
    } else {
      this.metrics.average_processing_time = 
        (this.metrics.average_processing_time + newTime) / 2;
    }
  }

  // Estimate processing time
  estimateProcessingTime(job) {
    // Base estimate on historical averages and job complexity
    let estimatedTime = this.metrics.average_processing_time || 300000; // 5 minutes default
    
    // Adjust based on job type
    const complexityFactors = {
      'full_processing': 1.0,
      'document_only': 0.6,
      'compliance_only': 0.4,
      'prediction_only': 0.3
    };
    
    const factor = complexityFactors[job.jobType] || 1.0;
    estimatedTime *= factor;
    
    // Adjust based on input data size
    const inputSize = JSON.stringify(job.inputData).length;
    if (inputSize > 100000) {
      estimatedTime *= 1.5;
    } else if (inputSize > 50000) {
      estimatedTime *= 1.2;
    }
    
    return Math.round(estimatedTime);
  }

  // Generate performance report
  async generatePerformanceReport() {
    const today = new Date().toISOString().split('T')[0];
    
    // Get daily statistics
    const dailyStats = await this.pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as successful_jobs,
        COUNT(CASE WHEN job_status = 'failed' THEN 1 END) as failed_jobs,
        AVG(processing_time) as avg_processing_time
      FROM ai_processing_jobs
      WHERE DATE(created_at) = $1
    `, [today]);
    
    const stats = dailyStats.rows[0];
    
    // Get stage performance
    const stagePerformance = await this.pool.query(`
      SELECT 
        stage_name,
        service_name,
        COUNT(*) as executions,
        AVG(processing_time) as avg_time,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN stage_status = 'failed' THEN 1 END) as failures
      FROM pipeline_stage_logs
      WHERE DATE(completed_at) = $1
      GROUP BY stage_name, service_name
    `, [today]);
    
    // Store performance report
    await this.pool.query(`
      INSERT INTO pipeline_performance (
        date, total_jobs, successful_jobs, failed_jobs,
        average_processing_time, stage_performance
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (date) DO UPDATE SET
        total_jobs = EXCLUDED.total_jobs,
        successful_jobs = EXCLUDED.successful_jobs,
        failed_jobs = EXCLUDED.failed_jobs,
        average_processing_time = EXCLUDED.average_processing_time,
        stage_performance = EXCLUDED.stage_performance
    `, [
      today,
      stats.total_jobs,
      stats.successful_jobs,
      stats.failed_jobs,
      stats.avg_processing_time,
      JSON.stringify(stagePerformance.rows)
    ]);
  }

  // Get job status
  async getJobStatus(jobId) {
    const result = await this.pool.query(`
      SELECT *
      FROM ai_processing_jobs
      WHERE job_id = $1
    `, [jobId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    return result.rows[0];
  }

  // Get processing metrics
  getProcessingMetrics() {
    return {
      ...this.metrics,
      active_jobs: this.activeJobs.size,
      queued_jobs: this.processingQueue.length,
      max_concurrent_jobs: this.maxConcurrentJobs
    };
  }

  // Get pipeline health
  async getPipelineHealth() {
    const health = {
      status: 'healthy',
      services: {},
      alerts: [],
      performance: {}
    };
    
    // Check service health
    const services = [
      { name: 'OCR', service: this.ocrService },
      { name: 'NLP', service: this.nlpService },
      { name: 'Form Intelligence', service: this.formIntelligenceService },
      { name: 'Predictive Approval', service: this.predictiveApprovalService },
      { name: 'Smart Appeals', service: this.smartAppealsService },
      { name: 'Compliance Monitoring', service: this.complianceMonitoringService }
    ];
    
    for (const { name, service } of services) {
      try {
        // Check if service has health check method
        if (typeof service.healthCheck === 'function') {
          health.services[name] = await service.healthCheck();
        } else {
          health.services[name] = { status: 'unknown' };
        }
      } catch (error) {
        health.services[name] = { status: 'error', error: error.message };
        health.status = 'degraded';
      }
    }
    
    // Get active alerts
    const alertsResult = await this.pool.query(`
      SELECT *
      FROM pipeline_alerts
      WHERE alert_status = 'active'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    health.alerts = alertsResult.rows;
    
    if (health.alerts.some(alert => alert.severity === 'critical')) {
      health.status = 'critical';
    } else if (health.alerts.some(alert => alert.severity === 'high')) {
      health.status = 'degraded';
    }
    
    // Get performance metrics
    health.performance = this.getProcessingMetrics();
    
    return health;
  }
}

module.exports = AIProcessingPipeline;