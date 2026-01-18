const cron = require('node-cron');
const moment = require('moment');
const { Dashboard, Query } = require('../../models');
const queryManager = require('../ai/queryManager');
const sqlExecutor = require('../ai/sqlExecutor');

/**
 * Auto-refresh service for dashboard real-time updates
 * Manages scheduled refreshes and data synchronization
 */
class AutoRefreshService {
  constructor() {
    this.scheduledJobs = new Map();
    this.refreshHistory = new Map();
    this.isInitialized = false;
    
    // Refresh schedule patterns
    this.schedulePatterns = {
      '1min': '* * * * *',           // Every minute
      '5min': '*/5 * * * *',         // Every 5 minutes
      '15min': '*/15 * * * *',       // Every 15 minutes
      '30min': '*/30 * * * *',       // Every 30 minutes
      '1hour': '0 * * * *',          // Every hour
      '2hour': '0 */2 * * *',        // Every 2 hours
      '6hour': '0 */6 * * *',        // Every 6 hours
      '12hour': '0 */12 * * *',      // Every 12 hours
      '1day': '0 0 * * *',           // Daily at midnight
      '1week': '0 0 * * 0',          // Weekly on Sunday
      '1month': '0 0 1 * *'          // Monthly on 1st
    };

    // Refresh status tracking
    this.refreshStatus = {
      active: 0,
      completed: 0,
      failed: 0,
      lastRefresh: null
    };
  }

  /**
   * Initialize auto-refresh service
   * Load existing schedules and start monitoring
   */
  async initialize() {
    try {
      console.log('Initializing auto-refresh service...');
      
      // Load all dashboards with refresh schedules
      const dashboards = await Dashboard.findAll({
        where: {
          refresh_schedule: {
            [require('sequelize').Op.ne]: null
          }
        }
      });

      // Schedule refresh jobs for each dashboard
      for (const dashboard of dashboards) {
        await this.scheduleDashboardRefresh(dashboard);
      }

      this.isInitialized = true;
      console.log(`Auto-refresh service initialized with ${dashboards.length} scheduled dashboards`);
      
      return {
        success: true,
        scheduledDashboards: dashboards.length
      };
    } catch (error) {
      console.error('Auto-refresh initialization error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Schedule dashboard refresh
   * @param {Object} dashboard - Dashboard instance
   * @returns {Object} Schedule result
   */
  async scheduleDashboardRefresh(dashboard) {
    try {
      const scheduleConfig = JSON.parse(dashboard.refresh_schedule || '{}');
      
      if (!scheduleConfig.enabled || !scheduleConfig.interval) {
        return {
          success: false,
          error: 'Invalid refresh schedule configuration'
        };
      }

      // Get cron pattern
      const cronPattern = this.schedulePatterns[scheduleConfig.interval];
      if (!cronPattern) {
        return {
          success: false,
          error: `Unsupported refresh interval: ${scheduleConfig.interval}`
        };
      }

      // Cancel existing job if any
      if (this.scheduledJobs.has(dashboard.id)) {
        this.scheduledJobs.get(dashboard.id).destroy();
      }

      // Create new scheduled job
      const job = cron.schedule(cronPattern, async () => {
        await this.executeDashboardRefresh(dashboard.id);
      }, {
        scheduled: true,
        timezone: scheduleConfig.timezone || 'UTC'
      });

      // Store job reference
      this.scheduledJobs.set(dashboard.id, job);

      // Initialize refresh history
      this.refreshHistory.set(dashboard.id, {
        lastRefresh: null,
        refreshCount: 0,
        successCount: 0,
        failureCount: 0,
        averageExecutionTime: 0,
        lastError: null
      });

      console.log(`Scheduled refresh for dashboard ${dashboard.id} with interval ${scheduleConfig.interval}`);
      
      return {
        success: true,
        dashboardId: dashboard.id,
        interval: scheduleConfig.interval,
        cronPattern
      };
    } catch (error) {
      console.error('Dashboard scheduling error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute dashboard refresh
   * @param {string} dashboardId - Dashboard ID
   * @returns {Object} Refresh result
   */
  async executeDashboardRefresh(dashboardId) {
    const startTime = Date.now();
    this.refreshStatus.active++;

    try {
      console.log(`Starting refresh for dashboard ${dashboardId}`);

      // Get dashboard with layout
      const dashboard = await Dashboard.findByPk(dashboardId);
      if (!dashboard) {
        throw new Error('Dashboard not found');
      }

      const layout = typeof dashboard.layout === 'string' ? JSON.parse(dashboard.layout) : dashboard.layout;
      const refreshResults = [];

      // Refresh each widget that has a data source
      for (const widget of layout.widgets) {
        if (widget.dataSource && widget.dataSource.queryId) {
          try {
            const widgetResult = await this.refreshWidget(widget, dashboard.org_id);
            refreshResults.push({
              widgetId: widget.id,
              success: true,
              executionTime: widgetResult.executionTime,
              dataPoints: widgetResult.dataPoints
            });
          } catch (widgetError) {
            console.error(`Widget refresh error for ${widget.id}:`, widgetError);
            refreshResults.push({
              widgetId: widget.id,
              success: false,
              error: widgetError.message
            });
          }
        }
      }

      // Update refresh history
      const executionTime = Date.now() - startTime;
      this.updateRefreshHistory(dashboardId, true, executionTime, refreshResults);

      // Update dashboard last refresh timestamp
      await dashboard.update({
        updated_at: new Date()
      });

      this.refreshStatus.active--;
      this.refreshStatus.completed++;
      this.refreshStatus.lastRefresh = new Date();

      console.log(`Dashboard ${dashboardId} refresh completed in ${executionTime}ms`);

      return {
        success: true,
        dashboardId,
        executionTime,
        refreshResults,
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Dashboard refresh error for ${dashboardId}:`, error);
      
      this.refreshStatus.active--;
      this.refreshStatus.failed++;
      this.updateRefreshHistory(dashboardId, false, Date.now() - startTime, null, error.message);

      return {
        success: false,
        dashboardId,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Refresh individual widget data
   * @param {Object} widget - Widget configuration
   * @param {string} organizationId - Organization ID
   * @returns {Object} Widget refresh result
   */
  async refreshWidget(widget, organizationId) {
    const startTime = Date.now();

    try {
      // Get the original query
      const query = await Query.findOne({
        where: {
          id: widget.dataSource.queryId,
          org_id: organizationId
        }
      });

      if (!query) {
        throw new Error('Query not found for widget');
      }

      // Check if we have cached results that are still fresh
      const cacheKey = `widget_${widget.id}_${query.id}`;
      const cachedResult = await queryManager.getCachedResult(cacheKey);
      
      if (cachedResult && this.isCacheFresh(cachedResult, widget.dataSource.cacheTimeout)) {
        return {
          data: cachedResult.data,
          executionTime: 0,
          dataPoints: cachedResult.data.length,
          fromCache: true
        };
      }

      // Execute query to get fresh data
      const executionResult = await sqlExecutor.executeSQL(
        query.sql,
        query.data_source_id,
        organizationId
      );

      if (!executionResult.success) {
        throw new Error(executionResult.error);
      }

      // Cache the result
      await queryManager.cacheResult(cacheKey, {
        data: executionResult.data,
        metadata: executionResult.metadata,
        timestamp: new Date()
      });

      return {
        data: executionResult.data,
        executionTime: Date.now() - startTime,
        dataPoints: executionResult.data.length,
        fromCache: false
      };
    } catch (error) {
      throw new Error(`Widget refresh failed: ${error.message}`);
    }
  }

  /**
   * Check if cached result is still fresh
   * @param {Object} cachedResult - Cached result
   * @param {number} cacheTimeout - Cache timeout in seconds
   * @returns {boolean} Is cache fresh
   */
  isCacheFresh(cachedResult, cacheTimeout = 300) {
    if (!cachedResult.timestamp) return false;
    
    const cacheAge = (Date.now() - new Date(cachedResult.timestamp).getTime()) / 1000;
    return cacheAge < cacheTimeout;
  }

  /**
   * Update refresh history for dashboard
   * @param {string} dashboardId - Dashboard ID
   * @param {boolean} success - Refresh success status
   * @param {number} executionTime - Execution time in ms
   * @param {Array} results - Refresh results
   * @param {string} error - Error message if failed
   */
  updateRefreshHistory(dashboardId, success, executionTime, results, error = null) {
    const history = this.refreshHistory.get(dashboardId) || {
      lastRefresh: null,
      refreshCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastError: null
    };

    history.lastRefresh = new Date();
    history.refreshCount++;
    
    if (success) {
      history.successCount++;
    } else {
      history.failureCount++;
      history.lastError = error;
    }

    // Update average execution time
    history.averageExecutionTime = (
      (history.averageExecutionTime * (history.refreshCount - 1) + executionTime) / 
      history.refreshCount
    );

    this.refreshHistory.set(dashboardId, history);
  }

  /**
   * Update dashboard refresh schedule
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} scheduleConfig - New schedule configuration
   * @returns {Object} Update result
   */
  async updateRefreshSchedule(dashboardId, scheduleConfig) {
    try {
      const dashboard = await Dashboard.findByPk(dashboardId);
      if (!dashboard) {
        return {
          success: false,
          error: 'Dashboard not found'
        };
      }

      // Update database
      await dashboard.update({
        refresh_schedule: JSON.stringify(scheduleConfig)
      });

      // Reschedule the job
      if (scheduleConfig.enabled) {
        await this.scheduleDashboardRefresh(dashboard);
      } else {
        // Cancel existing job
        if (this.scheduledJobs.has(dashboardId)) {
          this.scheduledJobs.get(dashboardId).destroy();
          this.scheduledJobs.delete(dashboardId);
        }
      }

      return {
        success: true,
        dashboardId,
        scheduleConfig
      };
    } catch (error) {
      console.error('Schedule update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Manually trigger dashboard refresh
   * @param {string} dashboardId - Dashboard ID
   * @param {string} organizationId - Organization ID
   * @returns {Object} Refresh result
   */
  async triggerManualRefresh(dashboardId, organizationId) {
    try {
      // Verify dashboard ownership
      const dashboard = await Dashboard.findOne({
        where: {
          id: dashboardId,
          org_id: organizationId
        }
      });

      if (!dashboard) {
        return {
          success: false,
          error: 'Dashboard not found'
        };
      }

      // Execute refresh
      const result = await this.executeDashboardRefresh(dashboardId);
      
      return result;
    } catch (error) {
      console.error('Manual refresh error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get refresh status for dashboard
   * @param {string} dashboardId - Dashboard ID
   * @returns {Object} Refresh status
   */
  getRefreshStatus(dashboardId) {
    const history = this.refreshHistory.get(dashboardId);
    const isScheduled = this.scheduledJobs.has(dashboardId);

    return {
      isScheduled,
      history: history || null,
      nextRefresh: isScheduled ? this.getNextRefreshTime(dashboardId) : null
    };
  }

  /**
   * Get next refresh time for dashboard
   * @param {string} dashboardId - Dashboard ID
   * @returns {Date|null} Next refresh time
   */
  getNextRefreshTime(dashboardId) {
    // This is a simplified implementation
    // In a real scenario, you'd calculate based on the cron pattern
    const history = this.refreshHistory.get(dashboardId);
    if (!history || !history.lastRefresh) return null;

    // Estimate next refresh (simplified)
    return new Date(history.lastRefresh.getTime() + 5 * 60 * 1000); // +5 minutes
  }

  /**
   * Get overall refresh statistics
   * @returns {Object} Refresh statistics
   */
  getRefreshStatistics() {
    const dashboardStats = Array.from(this.refreshHistory.entries()).map(([dashboardId, history]) => ({
      dashboardId,
      ...history,
      successRate: history.refreshCount > 0 ? (history.successCount / history.refreshCount) * 100 : 0
    }));

    return {
      global: this.refreshStatus,
      dashboards: dashboardStats,
      activeDashboards: this.scheduledJobs.size,
      totalRefreshes: dashboardStats.reduce((sum, d) => sum + d.refreshCount, 0)
    };
  }

  /**
   * Stop all scheduled refreshes
   */
  stopAllRefreshes() {
    console.log('Stopping all scheduled refreshes...');
    
    this.scheduledJobs.forEach((job, dashboardId) => {
      job.destroy();
      console.log(`Stopped refresh for dashboard ${dashboardId}`);
    });
    
    this.scheduledJobs.clear();
    this.isInitialized = false;
  }

  /**
   * Get available refresh intervals
   * @returns {Object} Available intervals
   */
  getAvailableIntervals() {
    return Object.keys(this.schedulePatterns).map(interval => ({
      value: interval,
      label: this.getIntervalLabel(interval),
      cronPattern: this.schedulePatterns[interval]
    }));
  }

  /**
   * Get human-readable label for interval
   * @param {string} interval - Interval key
   * @returns {string} Human-readable label
   */
  getIntervalLabel(interval) {
    const labels = {
      '1min': 'Every minute',
      '5min': 'Every 5 minutes',
      '15min': 'Every 15 minutes',
      '30min': 'Every 30 minutes',
      '1hour': 'Every hour',
      '2hour': 'Every 2 hours',
      '6hour': 'Every 6 hours',
      '12hour': 'Every 12 hours',
      '1day': 'Daily',
      '1week': 'Weekly',
      '1month': 'Monthly'
    };
    return labels[interval] || interval;
  }
}

module.exports = new AutoRefreshService();
