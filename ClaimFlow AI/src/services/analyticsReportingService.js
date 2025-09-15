const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class AnalyticsReportingService {
  constructor(pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    this.reportCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.metricsConfig = {
      approvalRates: {
        timeframes: ['daily', 'weekly', 'monthly', 'quarterly'],
        segments: ['payer', 'provider', 'procedure', 'urgency']
      },
      turnaroundTimes: {
        stages: ['submission', 'processing', 'review', 'decision', 'appeal'],
        benchmarks: {
          urgent: 24, // hours
          standard: 72, // hours
          routine: 168 // hours (1 week)
        }
      },
      payerPerformance: {
        metrics: ['approval_rate', 'avg_turnaround', 'appeal_success', 'requirements_clarity'],
        rankings: ['best', 'average', 'needs_improvement']
      }
    };
  }

  async initialize() {
    try {

      await this.createTables();
      await this.createViews();
      await this.setupScheduledReports();
      console.log('Analytics & Reporting Service initialized');
    } catch (error) {
      console.error('Failed to initialize Analytics & Reporting Service:', error);
      throw error;
    }
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS analytics_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type VARCHAR(50) NOT NULL,
        metric_name VARCHAR(100) NOT NULL,
        value DECIMAL(10,4) NOT NULL,
        unit VARCHAR(20),
        dimensions TEXT,
        timeframe VARCHAR(20) NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS payer_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payer_name VARCHAR(100) NOT NULL,
        payer_type VARCHAR(50),
        approval_rate DECIMAL(5,4) NOT NULL,
        avg_turnaround_hours DECIMAL(8,2) NOT NULL,
        appeal_success_rate DECIMAL(5,4),
        requirements_clarity_score DECIMAL(5,4),
        total_submissions INTEGER NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        ranking VARCHAR(20),
        trends TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS practice_efficiency (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        practice_id VARCHAR(50) NOT NULL,
        practice_name VARCHAR(200),
        total_submissions INTEGER NOT NULL,
        avg_processing_time DECIMAL(8,2) NOT NULL,
        approval_rate DECIMAL(5,4) NOT NULL,
        revenue_impact DECIMAL(12,2),
        efficiency_score DECIMAL(5,4) NOT NULL,
        bottlenecks TEXT,
        recommendations TEXT,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS trend_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trend_type VARCHAR(50) NOT NULL,
        category VARCHAR(50) NOT NULL,
        trend_direction VARCHAR(20) NOT NULL, -- 'increasing', 'decreasing', 'stable'
        magnitude DECIMAL(5,4) NOT NULL,
        confidence DECIMAL(5,4) NOT NULL,
        description TEXT,
        supporting_data TEXT,
        forecast TEXT,
        period_analyzed TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS report_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_name VARCHAR(100) NOT NULL,
        report_type VARCHAR(50) NOT NULL,
        schedule_cron VARCHAR(50) NOT NULL,
        recipients TEXT NOT NULL,
        parameters TEXT,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS generated_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_name VARCHAR(100) NOT NULL,
        report_type VARCHAR(50) NOT NULL,
        file_path VARCHAR(500),
        file_size INTEGER,
        parameters TEXT,
        generation_time DECIMAL(8,3),
        status VARCHAR(20) DEFAULT 'completed',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_analytics_metrics_type_timeframe ON analytics_metrics(metric_type, timeframe)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_metrics_period ON analytics_metrics(period_start, period_end)',
      'CREATE INDEX IF NOT EXISTS idx_payer_performance_name ON payer_performance(payer_name)',
      'CREATE INDEX IF NOT EXISTS idx_payer_performance_period ON payer_performance(period_start, period_end)',
      'CREATE INDEX IF NOT EXISTS idx_practice_efficiency_id ON practice_efficiency(practice_id)',
      'CREATE INDEX IF NOT EXISTS idx_trend_analysis_type ON trend_analysis(trend_type, category)'
    ];

    for (const index of indexes) {
      await this.pool.query(index);
    }
  }

  async createViews() {
    const views = [
      `CREATE VIEW IF NOT EXISTS v_approval_rates AS
       SELECT 
         payer_name,
         strftime('%Y-%m', created_at) as month,
         COUNT(*) as total_submissions,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
         ROUND(CAST(COUNT(CASE WHEN status = 'approved' THEN 1 END) AS REAL) / COUNT(*), 4) as approval_rate
       FROM authorizations 
       GROUP BY payer_name, strftime('%Y-%m', created_at)`,
      
      `CREATE VIEW IF NOT EXISTS v_turnaround_times AS
       SELECT 
         payer_name,
         urgency_level,
         AVG((julianday(decision_date) - julianday(submitted_at)) * 24) as avg_turnaround_hours,
         COUNT(*) as sample_size
       FROM authorizations 
       WHERE decision_date IS NOT NULL
       GROUP BY payer_name, urgency_level`,
      
      `CREATE VIEW IF NOT EXISTS v_payer_rankings AS
       SELECT 
         payer_name,
         approval_rate,
         avg_turnaround_hours,
         appeal_success_rate,
         ROW_NUMBER() OVER (ORDER BY approval_rate DESC, avg_turnaround_hours ASC) as overall_rank,
         CASE 
           WHEN ROW_NUMBER() OVER (ORDER BY approval_rate DESC, avg_turnaround_hours ASC) <= 3 THEN 'best'
           WHEN ROW_NUMBER() OVER (ORDER BY approval_rate DESC, avg_turnaround_hours ASC) > (SELECT COUNT(DISTINCT payer_name) * 0.7 FROM payer_performance) THEN 'needs_improvement'
           ELSE 'average'
         END as performance_tier
       FROM payer_performance 
       WHERE period_end = (SELECT MAX(period_end) FROM payer_performance)`
    ];

    for (const view of views) {
      await this.pool.query(view);
    }
  }

  async calculateApprovalRates(timeframe = 'monthly', segmentBy = null, startDate = null, endDate = null) {
    try {
      let dateFilter = '';
      let groupBy = '';
      let selectFields = '';
      const params = [];

      // Set up date filtering
      if (startDate && endDate) {
        dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
        params.push(startDate, endDate);
      } else {
        // Default to last 12 months
        dateFilter = 'WHERE created_at >= NOW() - INTERVAL \'12 months\'';
      }

      // Set up time grouping
      switch (timeframe) {
        case 'daily':
          groupBy = 'DATE_TRUNC(\'day\', created_at)';
          selectFields = 'DATE_TRUNC(\'day\', created_at) as period';
          break;
        case 'weekly':
          groupBy = 'DATE_TRUNC(\'week\', created_at)';
          selectFields = 'DATE_TRUNC(\'week\', created_at) as period';
          break;
        case 'monthly':
          groupBy = 'DATE_TRUNC(\'month\', created_at)';
          selectFields = 'DATE_TRUNC(\'month\', created_at) as period';
          break;
        case 'quarterly':
          groupBy = 'DATE_TRUNC(\'quarter\', created_at)';
          selectFields = 'DATE_TRUNC(\'quarter\', created_at) as period';
          break;
      }

      // Add segmentation
      if (segmentBy) {
        selectFields += `, ${segmentBy}`;
        groupBy += `, ${segmentBy}`;
      }

      const query = `
        SELECT 
          ${selectFields},
          COUNT(*) as total_submissions,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
          COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied_count,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
          ROUND(COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / NULLIF(COUNT(CASE WHEN status != 'pending' THEN 1 END), 0), 4) as approval_rate
        FROM authorizations 
        ${dateFilter}
        GROUP BY ${groupBy}
        ORDER BY period DESC
      `;

      const result = await this.pool.query(query, params);
      
      // Store metrics
      await this.storeMetrics('approval_rate', result.rows, timeframe, segmentBy);
      
      return result.rows;
    } catch (error) {
      console.error('Error calculating approval rates:', error);
      throw error;
    }
  }

  async calculateTurnaroundTimes(timeframe = 'monthly', segmentBy = null, startDate = null, endDate = null) {
    try {
      let dateFilter = '';
      let groupBy = '';
      let selectFields = '';
      const params = [];

      if (startDate && endDate) {
        dateFilter = 'AND created_at BETWEEN $1 AND $2';
        params.push(startDate, endDate);
      } else {
        dateFilter = 'AND created_at >= NOW() - INTERVAL \'12 months\'';
      }

      switch (timeframe) {
        case 'daily':
          groupBy = 'DATE_TRUNC(\'day\', created_at)';
          selectFields = 'DATE_TRUNC(\'day\', created_at) as period';
          break;
        case 'weekly':
          groupBy = 'DATE_TRUNC(\'week\', created_at)';
          selectFields = 'DATE_TRUNC(\'week\', created_at) as period';
          break;
        case 'monthly':
          groupBy = 'DATE_TRUNC(\'month\', created_at)';
          selectFields = 'DATE_TRUNC(\'month\', created_at) as period';
          break;
        case 'quarterly':
          groupBy = 'DATE_TRUNC(\'quarter\', created_at)';
          selectFields = 'DATE_TRUNC(\'quarter\', created_at) as period';
          break;
      }

      if (segmentBy) {
        selectFields += `, ${segmentBy}`;
        groupBy += `, ${segmentBy}`;
      }

      const query = `
        SELECT 
          ${selectFields},
          COUNT(*) as total_cases,
          AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_turnaround_hours,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as median_turnaround_hours,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as p90_turnaround_hours,
          MIN(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as min_turnaround_hours,
          MAX(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as max_turnaround_hours
        FROM authorizations 
        WHERE decision_date IS NOT NULL ${dateFilter}
        GROUP BY ${groupBy}
        ORDER BY period DESC
      `;

      const result = await this.pool.query(query, params);
      
      // Store metrics
      await this.storeMetrics('turnaround_time', result.rows, timeframe, segmentBy);
      
      return result.rows;
    } catch (error) {
      console.error('Error calculating turnaround times:', error);
      throw error;
    }
  }

  async calculatePayerPerformance(period = 'monthly') {
    try {
      const periodStart = new Date();
      const periodEnd = new Date();
      
      switch (period) {
        case 'weekly':
          periodStart.setDate(periodStart.getDate() - 7);
          break;
        case 'monthly':
          periodStart.setMonth(periodStart.getMonth() - 1);
          break;
        case 'quarterly':
          periodStart.setMonth(periodStart.getMonth() - 3);
          break;
      }

      const query = `
        WITH payer_stats AS (
          SELECT 
            payer_name,
            payer_type,
            COUNT(*) as total_submissions,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
            COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied_count,
            AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_turnaround_hours,
            COUNT(CASE WHEN appeal_status = 'successful' THEN 1 END) as successful_appeals,
            COUNT(CASE WHEN appeal_status IS NOT NULL THEN 1 END) as total_appeals
          FROM authorizations 
          WHERE created_at BETWEEN $1 AND $2
          GROUP BY payer_name, payer_type
        ),
        payer_metrics AS (
          SELECT 
            *,
            ROUND(approved_count::DECIMAL / NULLIF(total_submissions, 0), 4) as approval_rate,
            ROUND(successful_appeals::DECIMAL / NULLIF(total_appeals, 0), 4) as appeal_success_rate,
            -- Requirements clarity score based on denial reasons and appeal success
            ROUND(1.0 - (denied_count::DECIMAL / NULLIF(total_submissions, 0)) * 0.5 + 
                  (successful_appeals::DECIMAL / NULLIF(total_appeals, 0)) * 0.3, 4) as requirements_clarity_score
          FROM payer_stats
        )
        SELECT 
          *,
          RANK() OVER (ORDER BY approval_rate DESC, avg_turnaround_hours ASC) as performance_rank,
          CASE 
            WHEN RANK() OVER (ORDER BY approval_rate DESC, avg_turnaround_hours ASC) <= 3 THEN 'best'
            WHEN approval_rate < 0.6 OR avg_turnaround_hours > 120 THEN 'needs_improvement'
            ELSE 'average'
          END as ranking
        FROM payer_metrics
        ORDER BY performance_rank
      `;

      const result = await this.pool.query(query, [periodStart, periodEnd]);
      
      // Store payer performance data
      for (const row of result.rows) {
        await this.pool.query(
          `INSERT INTO payer_performance 
           (payer_name, payer_type, approval_rate, avg_turnaround_hours, appeal_success_rate, 
            requirements_clarity_score, total_submissions, period_start, period_end, ranking) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (payer_name, period_start, period_end) 
           DO UPDATE SET 
             approval_rate = EXCLUDED.approval_rate,
             avg_turnaround_hours = EXCLUDED.avg_turnaround_hours,
             appeal_success_rate = EXCLUDED.appeal_success_rate,
             requirements_clarity_score = EXCLUDED.requirements_clarity_score,
             total_submissions = EXCLUDED.total_submissions,
             ranking = EXCLUDED.ranking`,
          [
            row.payer_name, row.payer_type, row.approval_rate, row.avg_turnaround_hours,
            row.appeal_success_rate, row.requirements_clarity_score, row.total_submissions,
            periodStart, periodEnd, row.ranking
          ]
        );
      }
      
      return result.rows;
    } catch (error) {
      console.error('Error calculating payer performance:', error);
      throw error;
    }
  }

  async analyzePracticeEfficiency(practiceId = null) {
    try {
      let whereClause = 'WHERE created_at >= NOW() - INTERVAL \'3 months\'';
      const params = [];
      
      if (practiceId) {
        whereClause += ' AND practice_id = $1';
        params.push(practiceId);
      }

      const query = `
        WITH practice_stats AS (
          SELECT 
            practice_id,
            practice_name,
            COUNT(*) as total_submissions,
            AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_processing_time,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
            SUM(CASE WHEN status = 'approved' THEN estimated_value ELSE 0 END) as approved_revenue,
            SUM(estimated_value) as total_potential_revenue
          FROM authorizations 
          ${whereClause}
          GROUP BY practice_id, practice_name
        ),
        efficiency_metrics AS (
          SELECT 
            *,
            ROUND(approved_count::DECIMAL / total_submissions, 4) as approval_rate,
            approved_revenue / NULLIF(total_potential_revenue, 0) as revenue_capture_rate,
            -- Efficiency score based on approval rate, processing time, and revenue capture
            ROUND(
              (approved_count::DECIMAL / total_submissions) * 0.4 +
              (1.0 / (1.0 + avg_processing_time / 72.0)) * 0.3 +
              (approved_revenue / NULLIF(total_potential_revenue, 0)) * 0.3,
              4
            ) as efficiency_score
          FROM practice_stats
        )
        SELECT 
          *,
          RANK() OVER (ORDER BY efficiency_score DESC) as efficiency_rank
        FROM efficiency_metrics
        ORDER BY efficiency_score DESC
      `;

      const result = await this.pool.query(query, params);
      
      // Identify bottlenecks and generate recommendations
      for (const practice of result.rows) {
        const bottlenecks = await this.identifyBottlenecks(practice.practice_id);
        const recommendations = await this.generateEfficiencyRecommendations(practice, bottlenecks);
        
        // Store practice efficiency data
        await this.pool.query(
          `INSERT INTO practice_efficiency 
           (practice_id, practice_name, total_submissions, avg_processing_time, approval_rate, 
            revenue_impact, efficiency_score, bottlenecks, recommendations, period_start, period_end) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (practice_id, period_start, period_end) 
           DO UPDATE SET 
             total_submissions = EXCLUDED.total_submissions,
             avg_processing_time = EXCLUDED.avg_processing_time,
             approval_rate = EXCLUDED.approval_rate,
             revenue_impact = EXCLUDED.revenue_impact,
             efficiency_score = EXCLUDED.efficiency_score,
             bottlenecks = EXCLUDED.bottlenecks,
             recommendations = EXCLUDED.recommendations`,
          [
            practice.practice_id, practice.practice_name, practice.total_submissions,
            practice.avg_processing_time, practice.approval_rate, practice.approved_revenue,
            practice.efficiency_score, JSON.stringify(bottlenecks), JSON.stringify(recommendations),
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date()
          ]
        );
      }
      
      return result.rows;
    } catch (error) {
      console.error('Error analyzing practice efficiency:', error);
      throw error;
    }
  }

  async identifyBottlenecks(practiceId) {
    const bottlenecks = [];
    
    // Check for common bottlenecks
    const queries = [
      {
        name: 'high_denial_rate',
        query: `SELECT COUNT(*) as denied, COUNT(*) as total FROM authorizations 
                WHERE practice_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        threshold: 0.3
      },
      {
        name: 'slow_submission',
        query: `SELECT AVG(EXTRACT(EPOCH FROM (submitted_at - created_at))/3600) as avg_delay 
                FROM authorizations WHERE practice_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        threshold: 24
      },
      {
        name: 'incomplete_documentation',
        query: `SELECT COUNT(*) as incomplete FROM authorizations 
                WHERE practice_id = $1 AND status = 'denied' 
                AND denial_reason ILIKE '%documentation%' 
                AND created_at >= NOW() - INTERVAL '30 days'`,
        threshold: 5
      }
    ];

    for (const check of queries) {
      const result = await this.pool.query(check.query, [practiceId]);
      const value = result.rows[0];
      
      if (check.name === 'high_denial_rate' && (value.denied / value.total) > check.threshold) {
        bottlenecks.push({
          type: 'high_denial_rate',
          severity: 'high',
          value: (value.denied / value.total).toFixed(3),
          description: 'Denial rate exceeds 30%'
        });
      } else if (check.name === 'slow_submission' && value.avg_delay > check.threshold) {
        bottlenecks.push({
          type: 'slow_submission',
          severity: 'medium',
          value: value.avg_delay.toFixed(1),
          description: 'Average submission delay exceeds 24 hours'
        });
      } else if (check.name === 'incomplete_documentation' && value.incomplete > check.threshold) {
        bottlenecks.push({
          type: 'incomplete_documentation',
          severity: 'medium',
          value: value.incomplete,
          description: 'High number of documentation-related denials'
        });
      }
    }
    
    return bottlenecks;
  }

  async generateEfficiencyRecommendations(practice, bottlenecks) {
    const recommendations = [];
    
    // Generate recommendations based on bottlenecks
    for (const bottleneck of bottlenecks) {
      switch (bottleneck.type) {
        case 'high_denial_rate':
          recommendations.push({
            priority: 'high',
            category: 'quality_improvement',
            title: 'Reduce Denial Rate',
            description: 'Focus on improving submission quality and payer requirements compliance',
            actions: [
              'Review common denial reasons',
              'Implement pre-submission quality checks',
              'Provide staff training on payer requirements'
            ]
          });
          break;
          
        case 'slow_submission':
          recommendations.push({
            priority: 'medium',
            category: 'process_optimization',
            title: 'Accelerate Submission Process',
            description: 'Streamline the authorization submission workflow',
            actions: [
              'Implement automated submission workflows',
              'Set up submission deadline reminders',
              'Review and optimize internal approval processes'
            ]
          });
          break;
          
        case 'incomplete_documentation':
          recommendations.push({
            priority: 'medium',
            category: 'documentation',
            title: 'Improve Documentation Quality',
            description: 'Enhance documentation completeness and accuracy',
            actions: [
              'Create documentation checklists',
              'Implement document review processes',
              'Provide clinical documentation training'
            ]
          });
          break;
      }
    }
    
    // Add general recommendations based on performance
    if (practice.approval_rate < 0.7) {
      recommendations.push({
        priority: 'high',
        category: 'approval_optimization',
        title: 'Improve Approval Rate',
        description: 'Focus on understanding and meeting payer requirements',
        actions: [
          'Analyze successful vs. denied cases',
          'Engage with payer representatives for guidance',
          'Implement predictive approval scoring'
        ]
      });
    }
    
    if (practice.avg_processing_time > 72) {
      recommendations.push({
        priority: 'medium',
        category: 'efficiency',
        title: 'Reduce Processing Time',
        description: 'Optimize workflow to meet turnaround benchmarks',
        actions: [
          'Identify and eliminate process bottlenecks',
          'Implement parallel processing where possible',
          'Consider automation for routine tasks'
        ]
      });
    }
    
    return recommendations;
  }

  async storeMetrics(metricType, data, timeframe, segmentBy) {
    for (const row of data) {
      const dimensions = {
        timeframe,
        segment: segmentBy
      };
      
      if (segmentBy && row[segmentBy]) {
        dimensions[segmentBy] = row[segmentBy];
      }
      
      // Store multiple metrics from the row
      const metrics = [];
      
      if (metricType === 'approval_rate') {
        metrics.push(
          { name: 'total_submissions', value: row.total_submissions, unit: 'count' },
          { name: 'approval_rate', value: row.approval_rate, unit: 'percentage' },
          { name: 'approved_count', value: row.approved_count, unit: 'count' },
          { name: 'denied_count', value: row.denied_count, unit: 'count' }
        );
      } else if (metricType === 'turnaround_time') {
        metrics.push(
          { name: 'avg_turnaround_hours', value: row.avg_turnaround_hours, unit: 'hours' },
          { name: 'median_turnaround_hours', value: row.median_turnaround_hours, unit: 'hours' },
          { name: 'p90_turnaround_hours', value: row.p90_turnaround_hours, unit: 'hours' }
        );
      }
      
      for (const metric of metrics) {
        await this.pool.query(
          `INSERT INTO analytics_metrics 
           (metric_type, metric_name, value, unit, dimensions, timeframe, period_start, period_end) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (metric_type, metric_name, timeframe, period_start, period_end) 
           DO UPDATE SET value = EXCLUDED.value, dimensions = EXCLUDED.dimensions`,
          [
            metricType,
            metric.name,
            metric.value,
            metric.unit,
            JSON.stringify(dimensions),
            timeframe,
            row.period,
            row.period
          ]
        );
      }
    }
  }

  async generateDashboard(practiceId = null, timeframe = 'monthly') {
    try {
      const dashboard = {
        summary: {},
        approvalRates: {},
        turnaroundTimes: {},
        payerPerformance: {},
        practiceEfficiency: {},
        trends: {},
        recommendations: []
      };
      
      // Get summary metrics
      dashboard.summary = await this.getSummaryMetrics(practiceId, timeframe);
      
      // Get approval rates
      dashboard.approvalRates = await this.calculateApprovalRates(timeframe, 'payer_name');
      
      // Get turnaround times
      dashboard.turnaroundTimes = await this.calculateTurnaroundTimes(timeframe, 'urgency_level');
      
      // Get payer performance
      dashboard.payerPerformance = await this.calculatePayerPerformance(timeframe);
      
      // Get practice efficiency (if specific practice)
      if (practiceId) {
        dashboard.practiceEfficiency = await this.analyzePracticeEfficiency(practiceId);
      }
      
      // Get trends
      dashboard.trends = await this.analyzeTrends(timeframe);
      
      // Cache the dashboard
      const cacheKey = `dashboard_${practiceId || 'all'}_${timeframe}`;
      this.reportCache.set(cacheKey, {
        data: dashboard,
        timestamp: Date.now()
      });
      
      return dashboard;
    } catch (error) {
      console.error('Error generating dashboard:', error);
      throw error;
    }
  }

  async getSummaryMetrics(practiceId, timeframe) {
    let whereClause = 'WHERE created_at >= NOW() - INTERVAL \'30 days\'';
    const params = [];
    
    if (practiceId) {
      whereClause += ' AND practice_id = $1';
      params.push(practiceId);
    }
    
    const query = `
      SELECT 
        COUNT(*) as total_submissions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_turnaround_hours,
        SUM(CASE WHEN status = 'approved' THEN estimated_value ELSE 0 END) as approved_revenue,
        COUNT(DISTINCT payer_name) as unique_payers
      FROM authorizations 
      ${whereClause}
    `;
    
    const result = await this.pool.query(query, params);
    const summary = result.rows[0];
    
    // Calculate derived metrics
    summary.approval_rate = summary.total_submissions > 0 ? 
      (summary.approved_count / summary.total_submissions).toFixed(4) : 0;
    summary.denial_rate = summary.total_submissions > 0 ? 
      (summary.denied_count / summary.total_submissions).toFixed(4) : 0;
    
    return summary;
  }

  async analyzeTrends(timeframe = 'monthly') {
    // Analyze trends in key metrics over time
    const trends = {};
    
    // Approval rate trend
    const approvalTrend = await this.pool.query(
      `SELECT 
         DATE_TRUNC($1, created_at) as period,
         COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*) as approval_rate
       FROM authorizations 
       WHERE created_at >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC($1, created_at)
       ORDER BY period`,
      [timeframe]
    );
    
    trends.approvalRate = this.calculateTrendDirection(approvalTrend.rows.map(r => r.approval_rate));
    
    // Turnaround time trend
    const turnaroundTrend = await this.pool.query(
      `SELECT 
         DATE_TRUNC($1, created_at) as period,
         AVG(EXTRACT(EPOCH FROM (decision_date - submitted_at))/3600) as avg_turnaround
       FROM authorizations 
       WHERE created_at >= NOW() - INTERVAL '12 months' AND decision_date IS NOT NULL
       GROUP BY DATE_TRUNC($1, created_at)
       ORDER BY period`,
      [timeframe]
    );
    
    trends.turnaroundTime = this.calculateTrendDirection(turnaroundTrend.rows.map(r => r.avg_turnaround));
    
    return trends;
  }

  calculateTrendDirection(values) {
    if (values.length < 2) return { direction: 'stable', magnitude: 0, confidence: 0 };
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + parseFloat(val), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + parseFloat(val), 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    const magnitude = Math.abs(change);
    
    let direction = 'stable';
    if (change > 0.05) direction = 'increasing';
    else if (change < -0.05) direction = 'decreasing';
    
    const confidence = Math.min(magnitude * 2, 1.0); // Simple confidence calculation
    
    return {
      direction,
      magnitude: magnitude.toFixed(4),
      confidence: confidence.toFixed(4),
      change_percent: (change * 100).toFixed(2)
    };
  }

  async setupScheduledReports() {
    // Set up default scheduled reports
    const defaultReports = [
      {
        name: 'Weekly Performance Summary',
        type: 'performance_summary',
        schedule: '0 9 * * 1', // Every Monday at 9 AM
        recipients: ['admin@practice.com']
      },
      {
        name: 'Monthly Payer Analysis',
        type: 'payer_analysis',
        schedule: '0 9 1 * *', // First day of month at 9 AM
        recipients: ['admin@practice.com', 'manager@practice.com']
      },
      {
        name: 'Quarterly Efficiency Report',
        type: 'efficiency_report',
        schedule: '0 9 1 */3 *', // First day of quarter at 9 AM
        recipients: ['admin@practice.com', 'ceo@practice.com']
      }
    ];
    
    for (const report of defaultReports) {
      await this.pool.query(
        `INSERT OR IGNORE INTO report_schedules (report_name, report_type, schedule_cron, recipients) 
         VALUES (?, ?, ?, ?)`,
        [report.name, report.type, report.schedule, JSON.stringify(report.recipients)]
      );
    }
  }

  async getAnalyticsSummary() {
    const summary = {
      totalMetrics: 0,
      recentReports: [],
      cacheStatus: {
        size: this.reportCache.size,
        hitRate: 0
      },
      systemHealth: 'healthy'
    };
    
    // Get total metrics count
    const metricsCount = await this.pool.query('SELECT COUNT(*) FROM analytics_metrics');
    summary.totalMetrics = parseInt(metricsCount.rows[0].count);
    
    // Get recent reports
    const recentReports = await this.pool.query(
      'SELECT * FROM generated_reports ORDER BY created_at DESC LIMIT 10'
    );
    summary.recentReports = recentReports.rows;
    
    return summary;
  }

  async shutdown() {
    if (this.pool) {
      await this.pool.end();
    }
    this.reportCache.clear();
  }
}

module.exports = AnalyticsReportingService;