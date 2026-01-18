const { Insight, Query, Dashboard, DataSource } = require('../../models');
const { Op } = require('sequelize');
// Using native JavaScript instead of lodash for better compatibility
const moment = require('moment');
const anomalyDetection = require('./anomalyDetection');

/**
 * Insights Manager Service
 * Manages AI-detected findings, patterns, and anomalies
 */
class InsightsManager {
  constructor() {
    // Insight types
    this.insightTypes = {
      TREND: 'trend',
      SEASONAL: 'seasonal',
      OUTLIER: 'outlier',
      SPIKE: 'spike',
      DROP: 'drop',
      VOLATILITY: 'volatility',
      CORRELATION: 'correlation',
      FORECAST: 'forecast',
      ANOMALY: 'anomaly',
      PATTERN: 'pattern'
    };

    // Severity levels
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    // Insight status
    this.insightStatus = {
      NEW: 'new',
      ACKNOWLEDGED: 'acknowledged',
      INVESTIGATING: 'investigating',
      RESOLVED: 'resolved',
      DISMISSED: 'dismissed'
    };

    // Auto-cleanup settings
    this.cleanupSettings = {
      maxInsightsPerOrg: 1000,
      retentionDays: 90,
      cleanupInterval: 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  /**
   * Store AI-detected insight
   * @param {Object} insightData - Insight data
   * @param {string} organizationId - Organization ID
   * @returns {Object} Storage result
   */
  async storeInsight(insightData, organizationId) {
    try {
      // Validate insight data
      const validationResult = this.validateInsightData(insightData);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error
        };
      }

      // Check for duplicate insights
      const existingInsight = await this.findSimilarInsight(insightData, organizationId);
      if (existingInsight) {
        // Update existing insight instead of creating duplicate
        return await this.updateInsight(existingInsight.id, organizationId, {
          confidence: Math.max(existingInsight.confidence, insightData.confidence || 0),
          last_detected: new Date(),
          detection_count: (existingInsight.detection_count || 1) + 1
        });
      }

      // Prepare insight metadata
      const metadata = {
        ...insightData.metadata,
        detection_timestamp: new Date(),
        detection_method: insightData.detection_method || 'automated',
        data_source_info: insightData.data_source_info,
        query_info: insightData.query_info,
        statistical_measures: insightData.statistical_measures
      };

      // Create new insight
      const insight = await Insight.create({
        org_id: organizationId,
        query_id: insightData.query_id,
        dashboard_id: insightData.dashboard_id,
        data_source_id: insightData.data_source_id,
        type: insightData.type,
        severity: insightData.severity || this.severityLevels.LOW,
        status: this.insightStatus.NEW,
        title: insightData.title,
        description: insightData.description,
        confidence: insightData.confidence || 0,
        actionable: insightData.actionable || false,
        recommendation: insightData.recommendation,
        metadata: metadata,
        detected_at: new Date(),
        last_detected: new Date(),
        detection_count: 1
      });

      console.log(`Stored new insight: ${insight.id} (${insight.type}, ${insight.severity})`);

      return {
        success: true,
        insight: insight,
        isNew: true
      };
    } catch (error) {
      console.error('Insight storage error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Store multiple insights from analysis results
   * @param {Object} analysisResults - Analysis results from anomaly detection
   * @param {string} organizationId - Organization ID
   * @param {Object} context - Context information (query, dashboard, etc.)
   * @returns {Object} Storage results
   */
  async storeAnalysisInsights(analysisResults, organizationId, context = {}) {
    try {
      const storedInsights = [];
      const errors = [];

      // Store pattern insights
      for (const pattern of analysisResults.patterns || []) {
        try {
          const insightData = this.convertPatternToInsight(pattern, context);
          const result = await this.storeInsight(insightData, organizationId);
          
          if (result.success) {
            storedInsights.push(result.insight);
          } else {
            errors.push(`Pattern insight error: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Pattern processing error: ${error.message}`);
        }
      }

      // Store anomaly insights
      for (const anomaly of analysisResults.anomalies || []) {
        try {
          const insightData = this.convertAnomalyToInsight(anomaly, context);
          const result = await this.storeInsight(insightData, organizationId);
          
          if (result.success) {
            storedInsights.push(result.insight);
          } else {
            errors.push(`Anomaly insight error: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Anomaly processing error: ${error.message}`);
        }
      }

      // Store general insights
      for (const insight of analysisResults.insights || []) {
        try {
          const insightData = this.convertGeneralInsight(insight, context);
          const result = await this.storeInsight(insightData, organizationId);
          
          if (result.success) {
            storedInsights.push(result.insight);
          } else {
            errors.push(`General insight error: ${result.error}`);
          }
        } catch (error) {
          errors.push(`General insight processing error: ${error.message}`);
        }
      }

      // Store forecast insights
      if (analysisResults.forecast) {
        try {
          const insightData = this.convertForecastToInsight(analysisResults.forecast, context);
          const result = await this.storeInsight(insightData, organizationId);
          
          if (result.success) {
            storedInsights.push(result.insight);
          } else {
            errors.push(`Forecast insight error: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Forecast processing error: ${error.message}`);
        }
      }

      return {
        success: true,
        storedInsights: storedInsights.length,
        insights: storedInsights,
        errors: errors
      };
    } catch (error) {
      console.error('Analysis insights storage error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retrieve insights for organization
   * @param {string} organizationId - Organization ID
   * @param {Object} filters - Filter options
   * @returns {Object} Insights list
   */
  async getInsights(organizationId, filters = {}) {
    try {
      const whereClause = {
        org_id: organizationId
      };

      // Apply filters
      if (filters.type) {
        whereClause.type = filters.type;
      }

      if (filters.severity) {
        if (Array.isArray(filters.severity)) {
          whereClause.severity = { [Op.in]: filters.severity };
        } else {
          whereClause.severity = filters.severity;
        }
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          whereClause.status = { [Op.in]: filters.status };
        } else {
          whereClause.status = filters.status;
        }
      }

      if (filters.actionable !== undefined) {
        whereClause.actionable = filters.actionable;
      }

      if (filters.dateRange) {
        whereClause.detected_at = {
          [Op.between]: [
            moment(filters.dateRange.start).toDate(),
            moment(filters.dateRange.end).toDate()
          ]
        };
      }

      if (filters.queryId) {
        whereClause.query_id = filters.queryId;
      }

      if (filters.dashboardId) {
        whereClause.dashboard_id = filters.dashboardId;
      }

      // Query insights
      const insights = await Insight.findAll({
        where: whereClause,
        include: [
          {
            model: Query,
            as: 'query',
            attributes: ['id', 'natural_language', 'sql_generated']
          },
          {
            model: Dashboard,
            as: 'dashboard',
            attributes: ['id', 'name']
          },
          {
            model: DataSource,
            as: 'dataSource',
            attributes: ['id', 'name', 'type']
          }
        ],
        order: [
          ['severity', 'DESC'],
          ['detected_at', 'DESC']
        ],
        limit: filters.limit || 100,
        offset: filters.offset || 0
      });

      // Parse metadata for each insight
      const processedInsights = insights.map(insight => {
        const insightData = insight.toJSON();
        insightData.metadata = typeof insightData.metadata === 'string'
          ? JSON.parse(insightData.metadata || '{}')
          : (insightData.metadata || {});
        return insightData;
      });

      return {
        success: true,
        insights: processedInsights,
        total: processedInsights.length
      };
    } catch (error) {
      console.error('Insights retrieval error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get insight by ID
   * @param {string} insightId - Insight ID
   * @param {string} organizationId - Organization ID
   * @returns {Object} Insight details
   */
  async getInsightById(insightId, organizationId) {
    try {
      const insight = await Insight.findOne({
        where: {
          id: insightId,
          org_id: organizationId
        },
        include: [
          {
            model: Query,
            as: 'query',
            attributes: ['id', 'natural_language', 'sql_generated']
          },
          {
            model: Dashboard,
            as: 'dashboard',
            attributes: ['id', 'name']
          },
          {
            model: DataSource,
            as: 'dataSource',
            attributes: ['id', 'name', 'type']
          }
        ]
      });

      if (!insight) {
        return {
          success: false,
          error: 'Insight not found'
        };
      }

        const insightData = insight.toJSON();
        insightData.metadata = typeof insightData.metadata === 'string'
          ? JSON.parse(insightData.metadata || '{}')
          : (insightData.metadata || {});

      return {
        success: true,
        insight: insightData
      };
    } catch (error) {
      console.error('Insight retrieval error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update insight status or properties
   * @param {string} insightId - Insight ID
   * @param {Object} updates - Update data
   * @returns {Object} Update result
   */
  async updateInsight(insightId, organizationId, updates) {
    try {
      const insight = await Insight.findOne({
        where: {
          id: insightId,
          org_id: organizationId
        }
      });
      if (!insight) {
        return {
          success: false,
          error: 'Insight not found'
        };
      }

      // Prepare update data
      const updateData = {};
      
      if (updates.status && Object.values(this.insightStatus).includes(updates.status)) {
        updateData.status = updates.status;
      }

      if (updates.confidence !== undefined) {
        updateData.confidence = Math.max(0, Math.min(100, updates.confidence));
      }

      if (updates.last_detected) {
        updateData.last_detected = updates.last_detected;
      }

      if (updates.detection_count !== undefined) {
        updateData.detection_count = updates.detection_count;
      }

      if (updates.notes) {
        updateData.notes = updates.notes;
      }

      // Update insight
      await insight.update(updateData);

      return {
        success: true,
        insight: insight
      };
    } catch (error) {
      console.error('Insight update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete insight
   * @param {string} insightId - Insight ID
   * @param {string} organizationId - Organization ID
   * @returns {Object} Delete result
   */
  async deleteInsight(insightId, organizationId) {
    try {
      const result = await Insight.destroy({
        where: {
          id: insightId,
          org_id: organizationId
        }
      });

      if (result === 0) {
        return {
          success: false,
          error: 'Insight not found'
        };
      }

      return {
        success: true,
        deleted: true
      };
    } catch (error) {
      console.error('Insight deletion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get insights summary for organization
   * @param {string} organizationId - Organization ID
   * @param {Object} timeRange - Time range filter
   * @returns {Object} Insights summary
   */
  async getInsightsSummary(organizationId, timeRange = {}) {
    try {
      const whereClause = {
        org_id: organizationId
      };

      if (timeRange.start && timeRange.end) {
        whereClause.detected_at = {
          [Op.between]: [
            moment(timeRange.start).toDate(),
            moment(timeRange.end).toDate()
          ]
        };
      }

      // Get insights with aggregation
      const insights = await Insight.findAll({
        where: whereClause,
        attributes: [
          'type',
          'severity',
          'status',
          'actionable',
          [require('sequelize').fn('COUNT', '*'), 'count']
        ],
        group: ['type', 'severity', 'status', 'actionable'],
        raw: true
      });

      // Process summary data
      const summary = {
        total: 0,
        byType: {},
        bySeverity: {},
        byStatus: {},
        actionable: 0,
        recentTrends: {}
      };

      insights.forEach(insight => {
        const count = parseInt(insight.count);
        summary.total += count;

        // By type
        if (!summary.byType[insight.type]) {
          summary.byType[insight.type] = 0;
        }
        summary.byType[insight.type] += count;

        // By severity
        if (!summary.bySeverity[insight.severity]) {
          summary.bySeverity[insight.severity] = 0;
        }
        summary.bySeverity[insight.severity] += count;

        // By status
        if (!summary.byStatus[insight.status]) {
          summary.byStatus[insight.status] = 0;
        }
        summary.byStatus[insight.status] += count;

        // Actionable count
        if (insight.actionable) {
          summary.actionable += count;
        }
      });

      // Get recent trends (last 7 days vs previous 7 days)
      const recentTrends = await this.getInsightsTrends(organizationId, 7);
      summary.recentTrends = recentTrends;

      return {
        success: true,
        summary: summary
      };
    } catch (error) {
      console.error('Insights summary error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get insights trends over time
   * @param {string} organizationId - Organization ID
   * @param {number} days - Number of days to analyze
   * @returns {Object} Trends data
   */
  async getInsightsTrends(organizationId, days = 30) {
    try {
      const endDate = moment();
      const startDate = moment().subtract(days, 'days');
      const midDate = moment().subtract(days / 2, 'days');

      // Get recent period insights
      const recentInsights = await Insight.count({
        where: {
          org_id: organizationId,
          detected_at: {
            [Op.between]: [midDate.toDate(), endDate.toDate()]
          }
        }
      });

      // Get previous period insights
      const previousInsights = await Insight.count({
        where: {
          org_id: organizationId,
          detected_at: {
            [Op.between]: [startDate.toDate(), midDate.toDate()]
          }
        }
      });

      // Calculate trend
      const change = recentInsights - previousInsights;
      const changePercent = previousInsights > 0 ? (change / previousInsights) * 100 : 0;

      return {
        recent: recentInsights,
        previous: previousInsights,
        change: change,
        changePercent: changePercent,
        trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable'
      };
    } catch (error) {
      console.error('Insights trends error:', error);
      return {
        recent: 0,
        previous: 0,
        change: 0,
        changePercent: 0,
        trend: 'stable'
      };
    }
  }

  /**
   * Clean up old insights
   * @param {string} organizationId - Organization ID (optional)
   * @returns {Object} Cleanup result
   */
  async cleanupOldInsights(organizationId = null) {
    try {
      const whereClause = {
        detected_at: {
          [Op.lt]: moment().subtract(this.cleanupSettings.retentionDays, 'days').toDate()
        }
      };

      if (organizationId) {
        whereClause.org_id = organizationId;
      }

      const deletedCount = await Insight.destroy({
        where: whereClause
      });

      console.log(`Cleaned up ${deletedCount} old insights`);

      return {
        success: true,
        deletedCount: deletedCount
      };
    } catch (error) {
      console.error('Insights cleanup error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods for converting analysis results to insights

  convertPatternToInsight(pattern, context) {
    return {
      type: pattern.type,
      severity: pattern.severity || this.severityLevels.MEDIUM,
      title: this.generatePatternTitle(pattern),
      description: pattern.description,
      confidence: pattern.confidence || 0,
      actionable: true,
      recommendation: this.generatePatternRecommendation(pattern),
      query_id: context.queryId,
      dashboard_id: context.dashboardId,
      data_source_id: context.dataSourceId,
      metadata: {
        pattern_data: pattern,
        detection_method: 'statistical_analysis',
        context: context
      }
    };
  }

  convertAnomalyToInsight(anomaly, context) {
    return {
      type: anomaly.type,
      severity: anomaly.severity || this.severityLevels.HIGH,
      title: this.generateAnomalyTitle(anomaly),
      description: anomaly.description,
      confidence: 85, // Anomalies typically have high confidence
      actionable: true,
      recommendation: this.generateAnomalyRecommendation(anomaly),
      query_id: context.queryId,
      dashboard_id: context.dashboardId,
      data_source_id: context.dataSourceId,
      metadata: {
        anomaly_data: anomaly,
        detection_method: 'anomaly_detection',
        context: context
      }
    };
  }

  convertGeneralInsight(insight, context) {
    return {
      type: insight.type || this.insightTypes.PATTERN,
      severity: insight.severity || this.severityLevels.MEDIUM,
      title: insight.title,
      description: insight.description,
      confidence: insight.confidence || 0,
      actionable: insight.actionable || false,
      recommendation: insight.recommendation,
      query_id: context.queryId,
      dashboard_id: context.dashboardId,
      data_source_id: context.dataSourceId,
      metadata: {
        insight_data: insight,
        detection_method: 'general_analysis',
        context: context
      }
    };
  }

  convertForecastToInsight(forecast, context) {
    return {
      type: this.insightTypes.FORECAST,
      severity: this.determineForecastSeverity(forecast),
      title: 'Forecast Analysis Available',
      description: forecast.description,
      confidence: forecast.confidence || 0,
      actionable: true,
      recommendation: this.generateForecastRecommendation(forecast),
      query_id: context.queryId,
      dashboard_id: context.dashboardId,
      data_source_id: context.dataSourceId,
      metadata: {
        forecast_data: forecast,
        detection_method: 'predictive_analysis',
        context: context
      }
    };
  }

  // Helper methods for validation and similarity checking

  validateInsightData(insightData) {
    if (!insightData.type || !Object.values(this.insightTypes).includes(insightData.type)) {
      return { valid: false, error: 'Invalid insight type' };
    }

    if (!insightData.title || !insightData.description) {
      return { valid: false, error: 'Title and description are required' };
    }

    if (insightData.severity && !Object.values(this.severityLevels).includes(insightData.severity)) {
      return { valid: false, error: 'Invalid severity level' };
    }

    return { valid: true };
  }

  async findSimilarInsight(insightData, organizationId) {
    try {
      // Look for similar insights within the last 24 hours
      const similarInsight = await Insight.findOne({
        where: {
          org_id: organizationId,
          type: insightData.type,
          title: insightData.title,
          query_id: insightData.query_id,
          detected_at: {
            [Op.gte]: moment().subtract(24, 'hours').toDate()
          }
        },
        order: [['detected_at', 'DESC']]
      });

      return similarInsight;
    } catch (error) {
      console.error('Similar insight search error:', error);
      return null;
    }
  }

  // Title and recommendation generators

  generatePatternTitle(pattern) {
    switch (pattern.type) {
      case this.insightTypes.TREND:
        return `${pattern.direction.charAt(0).toUpperCase() + pattern.direction.slice(1)} Trend Detected`;
      case this.insightTypes.SEASONAL:
        return `Seasonal Pattern Identified`;
      default:
        return `${pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1)} Pattern Detected`;
    }
  }

  generateAnomalyTitle(anomaly) {
    switch (anomaly.type) {
      case this.insightTypes.SPIKE:
        return 'Data Spike Detected';
      case this.insightTypes.DROP:
        return 'Data Drop Detected';
      case this.insightTypes.OUTLIER:
        return 'Outlier Values Found';
      case this.insightTypes.VOLATILITY:
        return 'Volatility Anomaly Detected';
      default:
        return 'Data Anomaly Detected';
    }
  }

  generatePatternRecommendation(pattern) {
    // This would contain more sophisticated recommendation logic
    return pattern.recommendation || 'Monitor this pattern and consider its implications for your business strategy.';
  }

  generateAnomalyRecommendation(anomaly) {
    switch (anomaly.type) {
      case this.insightTypes.SPIKE:
        return 'Investigate the cause of this spike and determine if it represents a genuine opportunity or data error.';
      case this.insightTypes.DROP:
        return 'Immediate attention required to understand and address the cause of this drop.';
      case this.insightTypes.OUTLIER:
        return 'Review these outlier values to ensure data quality and identify potential issues.';
      default:
        return 'Investigate this anomaly to understand its cause and potential impact.';
    }
  }

  generateForecastRecommendation(forecast) {
    return 'Review the forecast data and adjust your planning and resource allocation accordingly.';
  }

  determineForecastSeverity(forecast) {
    if (forecast.confidence > 80) {
      return this.severityLevels.HIGH;
    } else if (forecast.confidence > 60) {
      return this.severityLevels.MEDIUM;
    }
    return this.severityLevels.LOW;
  }
}

module.exports = new InsightsManager();
