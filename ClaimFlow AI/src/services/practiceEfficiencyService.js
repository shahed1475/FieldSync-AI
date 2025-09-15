const { Pool } = require('pg');
const cron = require('node-cron');

class PracticeEfficiencyService {
  constructor(pool) {
    this.pool = pool;
    this.efficiencyMetrics = {
      workflowOptimization: {
        bottleneckDetection: true,
        processAutomation: true,
        resourceAllocation: true,
        timeTracking: true
      },
      performanceIndicators: {
        authorizationTurnaround: true,
        staffProductivity: true,
        errorReduction: true,
        costEfficiency: true
      },
      benchmarking: {
        industryComparison: true,
        peerAnalysis: true,
        historicalTrends: true,
        goalTracking: true
      }
    };
    
    this.workflowStages = [
      'document_receipt',
      'initial_review',
      'data_extraction',
      'form_completion',
      'clinical_review',
      'submission',
      'follow_up',
      'resolution'
    ];
    
    this.efficiencyThresholds = {
      turnaroundTime: {
        excellent: 24, // hours
        good: 48,
        acceptable: 72,
        poor: 96
      },
      automationRate: {
        excellent: 0.8, // 80%
        good: 0.6,
        acceptable: 0.4,
        poor: 0.2
      },
      errorRate: {
        excellent: 0.02, // 2%
        good: 0.05,
        acceptable: 0.1,
        poor: 0.15
      },
      staffUtilization: {
        excellent: 0.85, // 85%
        good: 0.75,
        acceptable: 0.65,
        poor: 0.55
      }
    };
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
      await this.setupScheduledAnalysis();
      
      console.log('Practice Efficiency Service initialized');
    } catch (error) {
      console.error('Failed to initialize Practice Efficiency Service:', error);
      throw error;
    }
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS workflow_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        authorization_id INTEGER REFERENCES authorizations(id),
        stage_name VARCHAR(50) NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        duration_minutes INTEGER,
        staff_member VARCHAR(100),
        automated INTEGER DEFAULT 0,
        errors_detected INTEGER DEFAULT 0,
        rework_required INTEGER DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS efficiency_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_date DATE NOT NULL,
        metric_type VARCHAR(50) NOT NULL,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DECIMAL(10,4) NOT NULL,
        target_value DECIMAL(10,4),
        performance_rating VARCHAR(20),
        department VARCHAR(50),
        staff_member VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS bottleneck_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_date DATE NOT NULL,
        stage_name VARCHAR(50) NOT NULL,
        avg_duration_minutes DECIMAL(10,2) NOT NULL,
        max_duration_minutes DECIMAL(10,2) NOT NULL,
        bottleneck_severity VARCHAR(20) NOT NULL,
        affected_authorizations INTEGER NOT NULL,
        impact_score DECIMAL(5,2) NOT NULL,
        recommendations TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS staff_productivity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_member VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        hours_worked DECIMAL(4,2) NOT NULL,
        authorizations_processed INTEGER DEFAULT 0,
        stages_completed INTEGER DEFAULT 0,
        errors_made INTEGER DEFAULT 0,
        rework_instances INTEGER DEFAULT 0,
        productivity_score DECIMAL(5,2),
        efficiency_rating VARCHAR(20),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS process_automation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_name VARCHAR(100) NOT NULL,
        automation_level DECIMAL(3,2) NOT NULL,
        manual_steps INTEGER NOT NULL,
        automated_steps INTEGER NOT NULL,
        time_saved_minutes DECIMAL(10,2),
        error_reduction_percentage DECIMAL(5,2),
        implementation_date DATE,
        roi_percentage DECIMAL(5,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS efficiency_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insight_type VARCHAR(50) NOT NULL,
        insight_category VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        impact_level VARCHAR(20) NOT NULL,
        implementation_effort VARCHAR(20) NOT NULL,
        estimated_savings DECIMAL(10,2),
        priority_score INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'identified',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        implemented_at DATETIME
      )`,
      `CREATE TABLE IF NOT EXISTS benchmark_comparisons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comparison_date DATE NOT NULL,
        metric_name VARCHAR(100) NOT NULL,
        practice_value DECIMAL(10,4) NOT NULL,
        industry_average DECIMAL(10,4),
        top_quartile DECIMAL(10,4),
        percentile_rank INTEGER,
        performance_gap DECIMAL(10,4),
        improvement_potential DECIMAL(10,4),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_workflow_stages_auth_stage ON workflow_stages(authorization_id, stage_name)',
      'CREATE INDEX IF NOT EXISTS idx_efficiency_metrics_date_type ON efficiency_metrics(metric_date, metric_type)',
      'CREATE INDEX IF NOT EXISTS idx_staff_productivity_member_date ON staff_productivity(staff_member, date)',
      'CREATE INDEX IF NOT EXISTS idx_bottleneck_analysis_date ON bottleneck_analysis(analysis_date)',
      'CREATE INDEX IF NOT EXISTS idx_efficiency_insights_priority ON efficiency_insights(priority_score DESC)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  async trackWorkflowStage(authorizationId, stageName, staffMember = null, automated = false) {
    try {
      // Check if stage is already in progress
      const existingStage = await this.pool.query(
        'SELECT id, start_time FROM workflow_stages WHERE authorization_id = $1 AND stage_name = $2 AND end_time IS NULL',
        [authorizationId, stageName]
      );

      if (existingStage.rows.length > 0) {
        // Complete the existing stage
        const startTime = new Date(existingStage.rows[0].start_time);
        const endTime = new Date();
        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

        await this.pool.query(
          'UPDATE workflow_stages SET end_time = $1, duration_minutes = $2 WHERE id = $3',
          [endTime, durationMinutes, existingStage.rows[0].id]
        );

        return existingStage.rows[0].id;
      } else {
        // Start new stage
        const result = await this.pool.query(
          `INSERT INTO workflow_stages 
           (authorization_id, stage_name, start_time, staff_member, automated) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [authorizationId, stageName, new Date(), staffMember, automated]
        );

        return result.rows[0].id;
      }
    } catch (error) {
      console.error('Error tracking workflow stage:', error);
      throw error;
    }
  }

  async completeWorkflowStage(stageId, errorsDetected = 0, reworkRequired = false, notes = null) {
    try {
      const endTime = new Date();
      
      // Get stage start time to calculate duration
      const stage = await this.pool.query(
        'SELECT start_time FROM workflow_stages WHERE id = $1',
        [stageId]
      );

      if (stage.rows.length === 0) {
        throw new Error('Workflow stage not found');
      }

      const startTime = new Date(stage.rows[0].start_time);
      const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

      await this.pool.query(
        `UPDATE workflow_stages SET 
         end_time = $1, duration_minutes = $2, errors_detected = $3, 
         rework_required = $4, notes = $5 
         WHERE id = $6`,
        [endTime, durationMinutes, errorsDetected, reworkRequired, notes, stageId]
      );

      // Update staff productivity metrics
      await this.updateStaffProductivity(stage.rows[0].staff_member, errorsDetected, reworkRequired);
      
    } catch (error) {
      console.error('Error completing workflow stage:', error);
      throw error;
    }
  }

  async updateStaffProductivity(staffMember, errorsDetected = 0, reworkRequired = false) {
    if (!staffMember) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if record exists for today
      const existing = await this.pool.query(
        'SELECT id FROM staff_productivity WHERE staff_member = $1 AND date = $2',
        [staffMember, today]
      );

      if (existing.rows.length > 0) {
        // Update existing record
        await this.pool.query(
          `UPDATE staff_productivity SET 
           stages_completed = stages_completed + 1,
           errors_made = errors_made + $1,
           rework_instances = rework_instances + $2
           WHERE id = $3`,
          [errorsDetected, reworkRequired ? 1 : 0, existing.rows[0].id]
        );
      } else {
        // Create new record
        await this.pool.query(
          `INSERT INTO staff_productivity 
           (staff_member, date, hours_worked, stages_completed, errors_made, rework_instances) 
           VALUES ($1, $2, 8, 1, $3, $4)`,
          [staffMember, today, errorsDetected, reworkRequired ? 1 : 0]
        );
      }

      // Calculate productivity score
      await this.calculateProductivityScore(staffMember, today);
      
    } catch (error) {
      console.error('Error updating staff productivity:', error);
    }
  }

  async calculateProductivityScore(staffMember, date) {
    try {
      const productivity = await this.pool.query(
        `SELECT stages_completed, errors_made, rework_instances, hours_worked 
         FROM staff_productivity 
         WHERE staff_member = $1 AND date = $2`,
        [staffMember, date]
      );

      if (productivity.rows.length === 0) return;

      const data = productivity.rows[0];
      const stagesPerHour = data.stages_completed / data.hours_worked;
      const errorRate = data.errors_made / Math.max(data.stages_completed, 1);
      const reworkRate = data.rework_instances / Math.max(data.stages_completed, 1);

      // Calculate productivity score (0-100)
      let score = 50; // Base score
      score += Math.min(stagesPerHour * 10, 30); // Up to 30 points for speed
      score -= errorRate * 100; // Penalty for errors
      score -= reworkRate * 50; // Penalty for rework
      score = Math.max(0, Math.min(100, score)); // Clamp to 0-100

      // Determine efficiency rating
      let rating = 'poor';
      if (score >= 85) rating = 'excellent';
      else if (score >= 75) rating = 'good';
      else if (score >= 65) rating = 'acceptable';

      await this.pool.query(
        'UPDATE staff_productivity SET productivity_score = $1, efficiency_rating = $2 WHERE staff_member = $3 AND date = $4',
        [score, rating, staffMember, date]
      );
      
    } catch (error) {
      console.error('Error calculating productivity score:', error);
    }
  }

  async analyzeBottlenecks() {
    try {
      const analysisDate = new Date().toISOString().split('T')[0];
      
      // Analyze each workflow stage for bottlenecks
      for (const stage of this.workflowStages) {
        const stageStats = await this.pool.query(
          `SELECT 
             AVG(duration_minutes) as avg_duration,
             MAX(duration_minutes) as max_duration,
             COUNT(*) as total_count,
             COUNT(CASE WHEN rework_required THEN 1 END) as rework_count
           FROM workflow_stages 
           WHERE stage_name = $1 
             AND created_at >= NOW() - INTERVAL '7 days'
             AND duration_minutes IS NOT NULL`,
          [stage]
        );

        if (stageStats.rows.length === 0 || stageStats.rows[0].total_count === 0) {
          continue;
        }

        const stats = stageStats.rows[0];
        const avgDuration = parseFloat(stats.avg_duration);
        const maxDuration = parseFloat(stats.max_duration);
        const totalCount = parseInt(stats.total_count);
        const reworkRate = parseFloat(stats.rework_count) / totalCount;

        // Determine bottleneck severity
        let severity = 'low';
        let impactScore = 0;

        // Calculate impact based on duration and frequency
        const durationImpact = avgDuration > 60 ? (avgDuration / 60) * 2 : avgDuration / 30;
        const frequencyImpact = totalCount / 100;
        const reworkImpact = reworkRate * 5;
        
        impactScore = durationImpact + frequencyImpact + reworkImpact;

        if (impactScore >= 8) severity = 'critical';
        else if (impactScore >= 5) severity = 'high';
        else if (impactScore >= 3) severity = 'medium';

        // Generate recommendations
        const recommendations = this.generateBottleneckRecommendations(stage, avgDuration, reworkRate, severity);

        // Store bottleneck analysis
        await this.pool.query(
          `INSERT INTO bottleneck_analysis 
           (analysis_date, stage_name, avg_duration_minutes, max_duration_minutes, 
            bottleneck_severity, affected_authorizations, impact_score, recommendations) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (analysis_date, stage_name) 
           DO UPDATE SET 
             avg_duration_minutes = $3,
             max_duration_minutes = $4,
             bottleneck_severity = $5,
             affected_authorizations = $6,
             impact_score = $7,
             recommendations = $8`,
          [
            analysisDate,
            stage,
            avgDuration,
            maxDuration,
            severity,
            totalCount,
            impactScore,
            JSON.stringify(recommendations)
          ]
        );
      }
      
      console.log('Bottleneck analysis completed');
    } catch (error) {
      console.error('Error analyzing bottlenecks:', error);
      throw error;
    }
  }

  generateBottleneckRecommendations(stage, avgDuration, reworkRate, severity) {
    const recommendations = [];

    // Duration-based recommendations
    if (avgDuration > 120) { // 2 hours
      recommendations.push({
        type: 'automation',
        priority: 'high',
        description: `Consider automating ${stage} stage to reduce processing time`,
        estimatedImpact: 'Reduce processing time by 60-80%'
      });
    } else if (avgDuration > 60) { // 1 hour
      recommendations.push({
        type: 'process_optimization',
        priority: 'medium',
        description: `Optimize ${stage} workflow to improve efficiency`,
        estimatedImpact: 'Reduce processing time by 30-50%'
      });
    }

    // Rework-based recommendations
    if (reworkRate > 0.2) { // 20% rework rate
      recommendations.push({
        type: 'quality_improvement',
        priority: 'high',
        description: `Implement quality checks in ${stage} to reduce rework`,
        estimatedImpact: 'Reduce rework by 50-70%'
      });
    }

    // Severity-based recommendations
    if (severity === 'critical') {
      recommendations.push({
        type: 'resource_allocation',
        priority: 'critical',
        description: `Allocate additional resources to ${stage} immediately`,
        estimatedImpact: 'Immediate throughput improvement'
      });
    }

    // Stage-specific recommendations
    const stageSpecificRecs = {
      'document_receipt': [
        {
          type: 'automation',
          priority: 'medium',
          description: 'Implement automated document intake system',
          estimatedImpact: 'Reduce manual processing by 80%'
        }
      ],
      'data_extraction': [
        {
          type: 'ai_enhancement',
          priority: 'high',
          description: 'Enhance OCR and NLP capabilities for better accuracy',
          estimatedImpact: 'Improve extraction accuracy by 15-25%'
        }
      ],
      'clinical_review': [
        {
          type: 'decision_support',
          priority: 'medium',
          description: 'Implement clinical decision support tools',
          estimatedImpact: 'Reduce review time by 40%'
        }
      ]
    };

    if (stageSpecificRecs[stage]) {
      recommendations.push(...stageSpecificRecs[stage]);
    }

    return recommendations;
  }

  async generateEfficiencyInsights() {
    try {
      const insights = [];
      
      // Analyze workflow efficiency
      const workflowInsights = await this.analyzeWorkflowEfficiency();
      insights.push(...workflowInsights);
      
      // Analyze staff productivity
      const productivityInsights = await this.analyzeStaffProductivityTrends();
      insights.push(...productivityInsights);
      
      // Analyze automation opportunities
      const automationInsights = await this.identifyAutomationOpportunities();
      insights.push(...automationInsights);
      
      // Store insights
      for (const insight of insights) {
        await this.pool.query(
          `INSERT INTO efficiency_insights 
           (insight_type, insight_category, title, description, impact_level, 
            implementation_effort, estimated_savings, priority_score) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            insight.type,
            insight.category,
            insight.title,
            insight.description,
            insight.impactLevel,
            insight.implementationEffort,
            insight.estimatedSavings,
            insight.priorityScore
          ]
        );
      }
      
      return insights;
    } catch (error) {
      console.error('Error generating efficiency insights:', error);
      throw error;
    }
  }

  async analyzeWorkflowEfficiency() {
    const insights = [];
    
    // Analyze average turnaround times
    const turnaroundStats = await this.pool.query(
      `SELECT 
         AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_turnaround_hours,
         COUNT(*) as total_authorizations
       FROM authorizations 
       WHERE created_at >= NOW() - INTERVAL '30 days'
         AND status IN ('approved', 'denied')`
    );
    
    if (turnaroundStats.rows.length > 0) {
      const avgTurnaround = parseFloat(turnaroundStats.rows[0].avg_turnaround_hours);
      
      if (avgTurnaround > this.efficiencyThresholds.turnaroundTime.acceptable) {
        insights.push({
          type: 'workflow_optimization',
          category: 'turnaround_time',
          title: 'High Authorization Turnaround Time',
          description: `Average turnaround time is ${avgTurnaround.toFixed(1)} hours, exceeding acceptable threshold of ${this.efficiencyThresholds.turnaroundTime.acceptable} hours`,
          impactLevel: avgTurnaround > this.efficiencyThresholds.turnaroundTime.poor ? 'high' : 'medium',
          implementationEffort: 'medium',
          estimatedSavings: (avgTurnaround - this.efficiencyThresholds.turnaroundTime.good) * 50, // $50 per hour saved
          priorityScore: Math.min(10, Math.floor(avgTurnaround / 12))
        });
      }
    }
    
    return insights;
  }

  async analyzeStaffProductivityTrends() {
    const insights = [];
    
    // Analyze staff productivity variations
    const productivityStats = await this.pool.query(
      `SELECT 
         staff_member,
         AVG(productivity_score) as avg_score,
         COUNT(*) as days_tracked,
         AVG(stages_completed / hours_worked) as avg_stages_per_hour
       FROM staff_productivity 
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY staff_member
       HAVING COUNT(*) >= 10`
    );
    
    for (const staff of productivityStats.rows) {
      const avgScore = parseFloat(staff.avg_score);
      const stagesPerHour = parseFloat(staff.avg_stages_per_hour);
      
      if (avgScore < 65) {
        insights.push({
          type: 'staff_development',
          category: 'productivity',
          title: `Low Productivity Score for ${staff.staff_member}`,
          description: `${staff.staff_member} has an average productivity score of ${avgScore.toFixed(1)}, indicating need for additional training or support`,
          impactLevel: 'medium',
          implementationEffort: 'low',
          estimatedSavings: (75 - avgScore) * 10, // Estimated savings from improvement
          priorityScore: Math.floor((75 - avgScore) / 10)
        });
      }
      
      if (stagesPerHour > 2.0) {
        insights.push({
          type: 'best_practice',
          category: 'productivity',
          title: `High Performer: ${staff.staff_member}`,
          description: `${staff.staff_member} processes ${stagesPerHour.toFixed(1)} stages per hour, consider sharing their best practices`,
          impactLevel: 'medium',
          implementationEffort: 'low',
          estimatedSavings: 0,
          priorityScore: 7
        });
      }
    }
    
    return insights;
  }

  async identifyAutomationOpportunities() {
    const insights = [];
    
    // Analyze manual stages with high volume
    const manualStages = await this.pool.query(
      `SELECT 
         stage_name,
         COUNT(*) as total_instances,
         AVG(duration_minutes) as avg_duration,
         SUM(duration_minutes) as total_minutes
       FROM workflow_stages 
       WHERE automated = false 
         AND created_at >= NOW() - INTERVAL '30 days'
         AND duration_minutes IS NOT NULL
       GROUP BY stage_name
       HAVING COUNT(*) > 50
       ORDER BY SUM(duration_minutes) DESC`
    );
    
    for (const stage of manualStages.rows) {
      const totalHours = parseFloat(stage.total_minutes) / 60;
      const avgDuration = parseFloat(stage.avg_duration);
      
      if (totalHours > 100 && avgDuration > 30) { // High impact automation opportunity
        const estimatedSavings = totalHours * 0.7 * 50; // 70% time savings at $50/hour
        
        insights.push({
          type: 'automation_opportunity',
          category: 'process_automation',
          title: `Automate ${stage.stage_name} Stage`,
          description: `${stage.stage_name} consumes ${totalHours.toFixed(1)} hours monthly with ${stage.total_instances} instances. Automation could save significant time.`,
          impactLevel: estimatedSavings > 5000 ? 'high' : 'medium',
          implementationEffort: this.getAutomationEffort(stage.stage_name),
          estimatedSavings: estimatedSavings,
          priorityScore: Math.min(10, Math.floor(estimatedSavings / 1000))
        });
      }
    }
    
    return insights;
  }

  getAutomationEffort(stageName) {
    const effortMap = {
      'document_receipt': 'low',
      'data_extraction': 'medium',
      'form_completion': 'medium',
      'initial_review': 'high',
      'clinical_review': 'high',
      'submission': 'low',
      'follow_up': 'medium',
      'resolution': 'high'
    };
    
    return effortMap[stageName] || 'medium';
  }

  async getDashboardData() {
    try {
      const dashboard = {
        overview: await this.getOverviewMetrics(),
        bottlenecks: await this.getCurrentBottlenecks(),
        productivity: await this.getProductivityMetrics(),
        automation: await this.getAutomationMetrics(),
        insights: await this.getTopInsights(),
        trends: await this.getTrendData()
      };
      
      return dashboard;
    } catch (error) {
      console.error('Error generating dashboard data:', error);
      throw error;
    }
  }

  async getOverviewMetrics() {
    const metrics = {};
    
    // Average turnaround time
    const turnaroundResult = await this.pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_hours
       FROM authorizations 
       WHERE created_at >= NOW() - INTERVAL '30 days'
         AND status IN ('approved', 'denied')`
    );
    metrics.avgTurnaroundHours = parseFloat(turnaroundResult.rows[0]?.avg_hours || 0);
    
    // Automation rate
    const automationResult = await this.pool.query(
      `SELECT 
         COUNT(CASE WHEN automated THEN 1 END)::DECIMAL / COUNT(*) as automation_rate
       FROM workflow_stages 
       WHERE created_at >= NOW() - INTERVAL '30 days'`
    );
    metrics.automationRate = parseFloat(automationResult.rows[0]?.automation_rate || 0);
    
    // Error rate
    const errorResult = await this.pool.query(
      `SELECT 
         SUM(errors_detected)::DECIMAL / COUNT(*) as error_rate
       FROM workflow_stages 
       WHERE created_at >= NOW() - INTERVAL '30 days'
         AND duration_minutes IS NOT NULL`
    );
    metrics.errorRate = parseFloat(errorResult.rows[0]?.error_rate || 0);
    
    // Staff utilization
    const utilizationResult = await this.pool.query(
      `SELECT AVG(productivity_score) as avg_productivity
       FROM staff_productivity 
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'`
    );
    metrics.staffUtilization = parseFloat(utilizationResult.rows[0]?.avg_productivity || 0) / 100;
    
    return metrics;
  }

  async getCurrentBottlenecks() {
    const result = await this.pool.query(
      `SELECT stage_name, bottleneck_severity, impact_score, recommendations
       FROM bottleneck_analysis 
       WHERE analysis_date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY impact_score DESC
       LIMIT 5`
    );
    
    return result.rows.map(row => ({
      stage: row.stage_name,
      severity: row.bottleneck_severity,
      impact: parseFloat(row.impact_score),
      recommendations: JSON.parse(row.recommendations || '[]')
    }));
  }

  async getProductivityMetrics() {
    const result = await this.pool.query(
      `SELECT 
         staff_member,
         AVG(productivity_score) as avg_score,
         efficiency_rating,
         AVG(stages_completed / hours_worked) as stages_per_hour
       FROM staff_productivity 
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY staff_member, efficiency_rating
       ORDER BY AVG(productivity_score) DESC`
    );
    
    return result.rows.map(row => ({
      staffMember: row.staff_member,
      avgScore: parseFloat(row.avg_score),
      rating: row.efficiency_rating,
      stagesPerHour: parseFloat(row.stages_per_hour)
    }));
  }

  async getAutomationMetrics() {
    const result = await this.pool.query(
      `SELECT 
         process_name,
         automation_level,
         time_saved_minutes,
         error_reduction_percentage,
         roi_percentage
       FROM process_automation 
       ORDER BY roi_percentage DESC NULLS LAST`
    );
    
    return result.rows.map(row => ({
      process: row.process_name,
      automationLevel: parseFloat(row.automation_level),
      timeSaved: parseFloat(row.time_saved_minutes || 0),
      errorReduction: parseFloat(row.error_reduction_percentage || 0),
      roi: parseFloat(row.roi_percentage || 0)
    }));
  }

  async getTopInsights() {
    const result = await this.pool.query(
      `SELECT title, description, impact_level, estimated_savings, priority_score
       FROM efficiency_insights 
       WHERE status = 'identified'
       ORDER BY priority_score DESC
       LIMIT 10`
    );
    
    return result.rows.map(row => ({
      title: row.title,
      description: row.description,
      impact: row.impact_level,
      savings: parseFloat(row.estimated_savings || 0),
      priority: parseInt(row.priority_score)
    }));
  }

  async getTrendData() {
    const trends = {};
    
    // Turnaround time trend (last 12 weeks)
    const turnaroundTrend = await this.pool.query(
      `SELECT 
         DATE_TRUNC('week', created_at) as week,
         AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_hours
       FROM authorizations 
       WHERE created_at >= NOW() - INTERVAL '12 weeks'
         AND status IN ('approved', 'denied')
       GROUP BY DATE_TRUNC('week', created_at)
       ORDER BY week`
    );
    trends.turnaroundTime = turnaroundTrend.rows;
    
    // Productivity trend
    const productivityTrend = await this.pool.query(
      `SELECT 
         DATE_TRUNC('week', date) as week,
         AVG(productivity_score) as avg_score
       FROM staff_productivity 
       WHERE date >= CURRENT_DATE - INTERVAL '12 weeks'
       GROUP BY DATE_TRUNC('week', date)
       ORDER BY week`
    );
    trends.productivity = productivityTrend.rows;
    
    return trends;
  }

  async setupScheduledAnalysis() {
    // Run bottleneck analysis daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        console.log('Running scheduled bottleneck analysis...');
        await this.analyzeBottlenecks();
      } catch (error) {
        console.error('Scheduled bottleneck analysis failed:', error);
      }
    });
    
    // Generate efficiency insights weekly on Sundays at 3 AM
    cron.schedule('0 3 * * 0', async () => {
      try {
        console.log('Generating weekly efficiency insights...');
        await this.generateEfficiencyInsights();
      } catch (error) {
        console.error('Weekly insights generation failed:', error);
      }
    });
    
    console.log('Scheduled analysis tasks configured');
  }

  async shutdown() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = PracticeEfficiencyService;