const cron = require('node-cron');
const { Op } = require('sequelize');
const moment = require('moment');

// Import services
const AutoRefresh = require('./autoRefresh');
const AnomalyDetectionService = require('./anomalyDetection');
const InsightsManager = require('./insightsManager');

// Import models
const { Dashboard, DataSource, Query } = require('../../models');

class VisualizationScheduler {
  constructor() {
    this.autoRefresh = new AutoRefresh();
    this.anomalyDetection = new AnomalyDetectionService();
    this.insightsManager = new InsightsManager();
    this.scheduledJobs = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize the scheduler and start background jobs
   */
  async initialize() {
    if (this.isRunning) {
      console.log('Visualization scheduler is already running');
      return;
    }

    console.log('Initializing visualization scheduler...');
    
    try {
      // Start the auto-refresh service
      await this.autoRefresh.initialize();
      
      // Schedule dashboard refresh jobs
      this.scheduleDashboardRefresh();
      
      // Schedule insight generation jobs
      this.scheduleInsightGeneration();
      
      // Schedule cleanup jobs
      this.scheduleCleanupJobs();
      
      this.isRunning = true;
      console.log('Visualization scheduler initialized successfully');
    } catch (error) {
      console.error('Failed to initialize visualization scheduler:', error);
      throw error;
    }
  }

  /**
   * Schedule dashboard refresh jobs
   */
  scheduleDashboardRefresh() {
    // Every 5 minutes - check for dashboards that need refreshing
    const refreshJob = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.processDashboardRefreshes();
      } catch (error) {
        console.error('Dashboard refresh job error:', error);
      }
    }, {
      scheduled: false
    });

    this.scheduledJobs.set('dashboard-refresh', refreshJob);
    refreshJob.start();
    console.log('Dashboard refresh scheduler started (every 5 minutes)');
  }

  /**
   * Schedule insight generation jobs
   */
  scheduleInsightGeneration() {
    // Every 30 minutes - generate insights from recent data
    const insightJob = cron.schedule('*/30 * * * *', async () => {
      try {
        await this.generateInsights();
      } catch (error) {
        console.error('Insight generation job error:', error);
      }
    }, {
      scheduled: false
    });

    this.scheduledJobs.set('insight-generation', insightJob);
    insightJob.start();
    console.log('Insight generation scheduler started (every 30 minutes)');

    // Daily at 2 AM - comprehensive anomaly detection
    const dailyAnalysisJob = cron.schedule('0 2 * * *', async () => {
      try {
        await this.performDailyAnalysis();
      } catch (error) {
        console.error('Daily analysis job error:', error);
      }
    }, {
      scheduled: false
    });

    this.scheduledJobs.set('daily-analysis', dailyAnalysisJob);
    dailyAnalysisJob.start();
    console.log('Daily analysis scheduler started (2 AM daily)');
  }

  /**
   * Schedule cleanup jobs
   */
  scheduleCleanupJobs() {
    // Daily at 3 AM - cleanup old insights and refresh history
    const cleanupJob = cron.schedule('0 3 * * *', async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        console.error('Cleanup job error:', error);
      }
    }, {
      scheduled: false
    });

    this.scheduledJobs.set('cleanup', cleanupJob);
    cleanupJob.start();
    console.log('Cleanup scheduler started (3 AM daily)');
  }

  /**
   * Process dashboard refreshes based on schedules
   */
  async processDashboardRefreshes() {
    try {
      const now = new Date();
      
      // Get dashboards with active refresh schedules
      const dashboards = await Dashboard.findAll({
        where: {
          refresh_schedule: {
            [Op.ne]: null
          },
          is_active: true
        },
        include: [{
          model: DataSource,
          as: 'dataSources',
          where: { is_active: true },
          required: false
        }]
      });

      let refreshCount = 0;
      
      for (const dashboard of dashboards) {
        try {
          const schedule = dashboard.refresh_schedule;
          
          if (this.shouldRefreshDashboard(dashboard, now)) {
            await this.autoRefresh.refreshDashboard(dashboard.id, dashboard.org_id);
            refreshCount++;
            
            console.log(`Refreshed dashboard ${dashboard.id} (${dashboard.name})`);
          }
        } catch (error) {
          console.error(`Failed to refresh dashboard ${dashboard.id}:`, error);
        }
      }

      if (refreshCount > 0) {
        console.log(`Processed ${refreshCount} dashboard refreshes`);
      }
    } catch (error) {
      console.error('Error processing dashboard refreshes:', error);
    }
  }

  /**
   * Check if a dashboard should be refreshed based on its schedule
   */
  shouldRefreshDashboard(dashboard, currentTime) {
    const schedule = dashboard.refresh_schedule;
    const lastRefresh = dashboard.last_refresh_at || dashboard.updated_at;
    
    if (!schedule || !schedule.enabled) {
      return false;
    }

    const timeSinceLastRefresh = currentTime - new Date(lastRefresh);
    const intervalMs = this.parseRefreshInterval(schedule.interval);
    
    return timeSinceLastRefresh >= intervalMs;
  }

  /**
   * Parse refresh interval string to milliseconds
   */
  parseRefreshInterval(interval) {
    const intervals = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };
    
    return intervals[interval] || 5 * 60 * 1000; // Default to 5 minutes
  }

  /**
   * Generate insights from recent query data
   */
  async generateInsights() {
    try {
      const cutoffTime = moment().subtract(1, 'hour').toDate();
      
      // Get recent successful queries with data
      const recentQueries = await Query.findAll({
        where: {
          created_at: {
            [Op.gte]: cutoffTime
          },
          status: 'completed',
          result_data: {
            [Op.ne]: null
          }
        },
        include: [{
          model: DataSource,
          as: 'dataSource',
          where: { is_active: true }
        }],
        limit: 50,
        order: [['created_at', 'DESC']]
      });

      let insightCount = 0;

      for (const query of recentQueries) {
        try {
          if (query.result_data && query.result_data.data) {
            const analysis = await this.anomalyDetection.analyzeData(
              query.result_data.data,
              {
                context: {
                  queryId: query.id,
                  dataSourceType: query.dataSource.type,
                  organizationId: query.org_id
                }
              }
            );

            // Store insights from the analysis
            if (analysis.insights && analysis.insights.length > 0) {
              for (const insight of analysis.insights) {
                await this.insightsManager.storeInsight({
                  ...insight,
                  organizationId: query.org_id,
                  queryId: query.id,
                  dataSourceId: query.data_source_id,
                  metadata: {
                    ...insight.metadata,
                    generatedBy: 'scheduler',
                    analysisTimestamp: new Date().toISOString()
                  }
                });
                insightCount++;
              }
            }
          }
        } catch (error) {
          console.error(`Failed to generate insights for query ${query.id}:`, error);
        }
      }

      if (insightCount > 0) {
        console.log(`Generated ${insightCount} new insights from recent queries`);
      }
    } catch (error) {
      console.error('Error generating insights:', error);
    }
  }

  /**
   * Perform comprehensive daily analysis
   */
  async performDailyAnalysis() {
    try {
      console.log('Starting daily comprehensive analysis...');
      
      const yesterday = moment().subtract(1, 'day').toDate();
      const weekAgo = moment().subtract(7, 'days').toDate();
      
      // Get all active organizations
      const organizations = await Dashboard.findAll({
        attributes: ['org_id'],
        group: ['org_id'],
        where: {
          is_active: true,
          created_at: {
            [Op.gte]: weekAgo
          }
        }
      });

      for (const org of organizations) {
        try {
          await this.performOrganizationAnalysis(org.org_id, yesterday);
        } catch (error) {
          console.error(`Failed daily analysis for organization ${org.org_id}:`, error);
        }
      }
      
      console.log('Daily comprehensive analysis completed');
    } catch (error) {
      console.error('Error in daily analysis:', error);
    }
  }

  /**
   * Perform analysis for a specific organization
   */
  async performOrganizationAnalysis(organizationId, analysisDate) {
    // Get queries from the past 24 hours
    const queries = await Query.findAll({
      where: {
        org_id: organizationId,
        created_at: {
          [Op.gte]: analysisDate
        },
        status: 'completed',
        result_data: {
          [Op.ne]: null
        }
      },
      include: [{
        model: DataSource,
        as: 'dataSource'
      }],
      order: [['created_at', 'DESC']]
    });

    if (queries.length === 0) {
      return;
    }

    // Aggregate data for comprehensive analysis
    const aggregatedData = this.aggregateQueryData(queries);
    
    if (aggregatedData.length > 0) {
      const analysis = await this.anomalyDetection.analyzeData(aggregatedData, {
        context: {
          organizationId,
          analysisType: 'daily_comprehensive',
          dateRange: {
            start: analysisDate,
            end: new Date()
          }
        }
      });

      // Store high-priority insights
      if (analysis.insights) {
        for (const insight of analysis.insights) {
          if (insight.severity === 'high' || insight.severity === 'critical') {
            await this.insightsManager.storeInsight({
              ...insight,
              organizationId,
              metadata: {
                ...insight.metadata,
                generatedBy: 'daily_analysis',
                analysisDate: analysisDate.toISOString()
              }
            });
          }
        }
      }
    }
  }

  /**
   * Aggregate query data for comprehensive analysis
   */
  aggregateQueryData(queries) {
    const aggregated = [];
    
    for (const query of queries) {
      if (query.result_data && query.result_data.data) {
        const data = query.result_data.data;
        
        // Extract numerical data points
        for (const row of data) {
          const timestamp = this.extractTimestamp(row) || query.created_at;
          const numericalValues = this.extractNumericalValues(row);
          
          if (numericalValues.length > 0) {
            aggregated.push({
              timestamp,
              values: numericalValues,
              queryId: query.id,
              dataSourceType: query.dataSource?.type
            });
          }
        }
      }
    }
    
    return aggregated;
  }

  /**
   * Extract timestamp from data row
   */
  extractTimestamp(row) {
    const timeFields = ['timestamp', 'created_at', 'updated_at', 'date', 'time'];
    
    for (const field of timeFields) {
      if (row[field]) {
        const date = new Date(row[field]);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract numerical values from data row
   */
  extractNumericalValues(row) {
    const values = [];
    
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number' && !isNaN(value)) {
        values.push({ field: key, value });
      }
    }
    
    return values;
  }

  /**
   * Perform cleanup of old data
   */
  async performCleanup() {
    try {
      console.log('Starting cleanup process...');
      
      // Clean up old insights (older than 90 days)
      const oldInsightsCutoff = moment().subtract(90, 'days').toDate();
      await this.insightsManager.cleanupOldInsights(oldInsightsCutoff);
      
      // Clean up old refresh history (older than 30 days)
      await this.autoRefresh.cleanupOldHistory(30);
      
      console.log('Cleanup process completed');
    } catch (error) {
      console.error('Error in cleanup process:', error);
    }
  }

  /**
   * Stop the scheduler and all jobs
   */
  stop() {
    if (!this.isRunning) {
      console.log('Visualization scheduler is not running');
      return;
    }

    console.log('Stopping visualization scheduler...');
    
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      console.log(`Stopped ${name} job`);
    }
    
    this.scheduledJobs.clear();
    this.isRunning = false;
    
    console.log('Visualization scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.scheduledJobs.keys()),
      uptime: this.isRunning ? process.uptime() : 0
    };
  }

  /**
   * Manually trigger insight generation
   */
  async triggerInsightGeneration() {
    console.log('Manually triggering insight generation...');
    await this.generateInsights();
  }

  /**
   * Manually trigger daily analysis
   */
  async triggerDailyAnalysis() {
    console.log('Manually triggering daily analysis...');
    await this.performDailyAnalysis();
  }
}

module.exports = VisualizationScheduler;
