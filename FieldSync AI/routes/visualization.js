const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Import visualization services
const chartRecommender = require('../services/visualization/chartRecommender');
const dashboardBuilder = require('../services/visualization/dashboardBuilder');
const autoRefresh = require('../services/visualization/autoRefresh');
const anomalyDetection = require('../services/visualization/anomalyDetection');
const insightsManager = require('../services/visualization/insightsManager');
const PredictiveAnalytics = require('../services/visualization/predictiveAnalytics');
const RealTimeAnalytics = require('../services/visualization/realTimeAnalytics');

// Rate limiting for visualization endpoints
const visualizationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many visualization requests from this IP, please try again later.'
});

// Initialize services
const predictiveAnalytics = new PredictiveAnalytics();
const realTimeAnalytics = new RealTimeAnalytics();

const buildSampleSeries = (points = 30) => {
  const series = [];
  let base = 100 + Math.random() * 50;
  for (let i = points - 1; i >= 0; i--) {
    const timestamp = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const variance = (Math.random() - 0.5) * 10;
    base = Math.max(10, base + variance);
    series.push({ timestamp, value: Math.round(base * 100) / 100 });
  }
  return series;
};

const parseTimeframeDays = (timeframe) => {
  if (!timeframe) return 30;
  if (typeof timeframe === 'number') return timeframe;
  const match = /^(\d+)(d|w|m|y)?$/i.exec(String(timeframe).trim());
  if (!match) return 30;
  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'd').toLowerCase();
  switch (unit) {
    case 'w':
      return value * 7;
    case 'm':
      return value * 30;
    case 'y':
      return value * 365;
    default:
      return value;
  }
};

// Chart Recommendation Routes
router.post('/chart-recommendations', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { queryResult, queryMetadata } = req.body;
    
    if (!queryResult || !queryResult.data) {
      return res.status(400).json({ 
        error: 'Query result data is required' 
      });
    }

    const recommendations = await chartRecommender.recommendCharts(queryResult, queryMetadata);
    
    res.json({
      success: true,
      recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chart recommendation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate chart recommendations',
      details: error.message 
    });
  }
});

// Dashboard Management Routes
router.post('/dashboards', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { name, description, layout, widgets } = req.body;
    const organizationId = req.user.orgId;
    
    if (!name) {
      return res.status(400).json({ 
        error: 'Dashboard name is required' 
      });
    }

    const dashboard = await dashboardBuilder.createDashboard({
      name,
      description,
      organizationId,
      layout,
      widgets
    });
    
    res.status(201).json({
      success: true,
      dashboard,
      message: 'Dashboard created successfully'
    });
  } catch (error) {
    console.error('Dashboard creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create dashboard',
      details: error.message 
    });
  }
});

router.get('/dashboards', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.orgId;
    const { page = 1, limit = 10, search } = req.query;
    
    const dashboards = await dashboardBuilder.getDashboards(organizationId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search
    });
    
    res.json({
      success: true,
      dashboards,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Dashboard retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve dashboards',
      details: error.message 
    });
  }
});

router.get('/dashboards/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    
    const dashboard = await dashboardBuilder.getDashboard(id, organizationId);
    
    if (!dashboard) {
      return res.status(404).json({ 
        error: 'Dashboard not found' 
      });
    }
    
    res.json({
      success: true,
      dashboard
    });
  } catch (error) {
    console.error('Dashboard retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve dashboard',
      details: error.message 
    });
  }
});

router.put('/dashboards/:id', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    const updates = req.body;
    
    const dashboard = await dashboardBuilder.updateDashboard(id, organizationId, updates);
    
    if (!dashboard) {
      return res.status(404).json({ 
        error: 'Dashboard not found' 
      });
    }
    
    res.json({
      success: true,
      dashboard,
      message: 'Dashboard updated successfully'
    });
  } catch (error) {
    console.error('Dashboard update error:', error);
    res.status(500).json({ 
      error: 'Failed to update dashboard',
      details: error.message 
    });
  }
});

router.delete('/dashboards/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    
    const success = await dashboardBuilder.deleteDashboard(id, organizationId);
    
    if (!success) {
      return res.status(404).json({ 
        error: 'Dashboard not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Dashboard deleted successfully'
    });
  } catch (error) {
    console.error('Dashboard deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete dashboard',
      details: error.message 
    });
  }
});

// Widget Management Routes
router.post('/dashboards/:id/widgets', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    const widgetConfig = req.body;
    
    const widget = await dashboardBuilder.addWidget(id, organizationId, widgetConfig);
    
    res.status(201).json({
      success: true,
      widget,
      message: 'Widget added successfully'
    });
  } catch (error) {
    console.error('Widget creation error:', error);
    res.status(500).json({ 
      error: 'Failed to add widget',
      details: error.message 
    });
  }
});

router.put('/dashboards/:dashboardId/widgets/:widgetId', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { dashboardId, widgetId } = req.params;
    const organizationId = req.user.orgId;
    const updates = req.body;
    
    const widget = await dashboardBuilder.updateWidget(dashboardId, widgetId, organizationId, updates);
    
    if (!widget) {
      return res.status(404).json({ 
        error: 'Widget not found' 
      });
    }
    
    res.json({
      success: true,
      widget,
      message: 'Widget updated successfully'
    });
  } catch (error) {
    console.error('Widget update error:', error);
    res.status(500).json({ 
      error: 'Failed to update widget',
      details: error.message 
    });
  }
});

router.delete('/dashboards/:dashboardId/widgets/:widgetId', authenticateToken, async (req, res) => {
  try {
    const { dashboardId, widgetId } = req.params;
    const organizationId = req.user.orgId;
    
    const success = await dashboardBuilder.removeWidget(dashboardId, widgetId, organizationId);
    
    if (!success) {
      return res.status(404).json({ 
        error: 'Widget not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Widget removed successfully'
    });
  } catch (error) {
    console.error('Widget deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to remove widget',
      details: error.message 
    });
  }
});

// Auto-refresh Routes
router.post('/dashboards/:id/refresh', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    
    const result = await autoRefresh.refreshDashboard(id, organizationId);
    
    res.json({
      success: true,
      result,
      message: 'Dashboard refreshed successfully'
    });
  } catch (error) {
    console.error('Dashboard refresh error:', error);
    res.status(500).json({ 
      error: 'Failed to refresh dashboard',
      details: error.message 
    });
  }
});

router.get('/dashboards/:id/refresh-status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    
    const status = await autoRefresh.getRefreshStatus(id, organizationId);
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Refresh status error:', error);
    res.status(500).json({ 
      error: 'Failed to get refresh status',
      details: error.message 
    });
  }
});

router.put('/dashboards/:id/refresh-schedule', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    const { schedule } = req.body;
    
    if (!schedule) {
      return res.status(400).json({ 
        error: 'Refresh schedule is required' 
      });
    }
    
    const result = await autoRefresh.updateRefreshSchedule(id, organizationId, schedule);
    
    res.json({
      success: true,
      result,
      message: 'Refresh schedule updated successfully'
    });
  } catch (error) {
    console.error('Refresh schedule update error:', error);
    res.status(500).json({ 
      error: 'Failed to update refresh schedule',
      details: error.message 
    });
  }
});

// Anomaly Detection Routes
router.post('/analyze-anomalies', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { data, options } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ 
        error: 'Data array is required for anomaly analysis' 
      });
    }

    const analysis = await anomalyDetection.analyzeData(data, options);
    
    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze anomalies',
      details: error.message 
    });
  }
});

// Insights Management Routes
router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.orgId;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      severity, 
      status = 'active',
      startDate,
      endDate 
    } = req.query;
    
    const insightsResult = await insightsManager.getInsights(organizationId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      severity,
      status,
      startDate,
      endDate
    });
    
    res.json({
      success: true,
      insights: insightsResult.insights || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Insights retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve insights',
      details: error.message 
    });
  }
});

router.post('/insights', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const organizationId = req.user.orgId;
    const insightData = { ...req.body };
    
    const insight = await insightsManager.storeInsight(insightData, organizationId);
    
    res.status(201).json({
      success: true,
      insight,
      message: 'Insight stored successfully'
    });
  } catch (error) {
    console.error('Insight storage error:', error);
    res.status(500).json({ 
      error: 'Failed to store insight',
      details: error.message 
    });
  }
});

router.get('/insights/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    
    const insightResult = await insightsManager.getInsightById(id, organizationId);
    
    if (!insightResult.success) {
      return res.status(404).json({ 
        error: 'Insight not found' 
      });
    }
    
    res.json({
      success: true,
      insight: insightResult.insight
    });
  } catch (error) {
    console.error('Insight retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve insight',
      details: error.message 
    });
  }
});

router.put('/insights/:id', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    const updates = req.body;
    
    const insightResult = await insightsManager.updateInsight(id, organizationId, updates);
    
    if (!insightResult.success) {
      return res.status(404).json({ 
        error: 'Insight not found' 
      });
    }
    
    res.json({
      success: true,
      insight: insightResult.insight,
      message: 'Insight updated successfully'
    });
  } catch (error) {
    console.error('Insight update error:', error);
    res.status(500).json({ 
      error: 'Failed to update insight',
      details: error.message 
    });
  }
});

router.delete('/insights/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.orgId;
    
    const result = await insightsManager.deleteInsight(id, organizationId);
    
    if (!result.success) {
      return res.status(404).json({ 
        error: 'Insight not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Insight deleted successfully'
    });
  } catch (error) {
    console.error('Insight deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete insight',
      details: error.message 
    });
  }
});

router.get('/insights-summary', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.orgId;
    const { timeframe = '30d' } = req.query;
    const days = parseTimeframeDays(timeframe);
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const summaryResult = await insightsManager.getInsightsSummary(organizationId, { start, end });
    
    res.json({
      success: true,
      summary: summaryResult.summary,
      timeframe
    });
  } catch (error) {
    console.error('Insights summary error:', error);
    res.status(500).json({ 
      error: 'Failed to generate insights summary',
      details: error.message 
    });
  }
});

router.get('/insights-trends', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.orgId;
    const { timeframe = '30d', groupBy = 'day' } = req.query;
    const days = parseTimeframeDays(timeframe);
    const trends = await insightsManager.getInsightsTrends(organizationId, days, groupBy);
    
    res.json({
      success: true,
      trends,
      timeframe,
      groupBy
    });
  } catch (error) {
    console.error('Insights trends error:', error);
    res.status(500).json({ 
      error: 'Failed to generate insights trends',
      details: error.message 
    });
  }
});

// Predictive Analytics Routes
router.post('/predictive-analysis', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    let { data, options = {} } = req.body;

    if (!data || !Array.isArray(data)) {
      data = buildSampleSeries(options.points || 30);
    }

    const analysis = await predictiveAnalytics.generatePredictiveAnalysis(data, options);
    
    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Predictive analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to generate predictive analysis',
      details: error.message 
    });
  }
});

router.post('/trend-analysis', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    let { data, options = {} } = req.body;

    if (!data || !Array.isArray(data)) {
      data = buildSampleSeries(options.points || 30);
    }

    const trends = await predictiveAnalytics.analyzeTrends(data, options);
    
    res.json({
      success: true,
      trends,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Trend analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze trends',
      details: error.message 
    });
  }
});

router.post('/forecast', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    let { data, horizon = 'short', options = {} } = req.body;

    if (!data || !Array.isArray(data)) {
      data = buildSampleSeries(options.points || 30);
    }

    const forecast = await predictiveAnalytics.generateForecasts(data, horizon, options);
    
    res.json({
      success: true,
      forecast,
      horizon,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Forecasting error:', error);
    res.status(500).json({ 
      error: 'Failed to generate forecast',
      details: error.message 
    });
  }
});

// Real-time Analytics Routes
router.get('/realtime/metrics', authenticateToken, async (req, res) => {
  try {
    const metrics = realTimeAnalytics.getMetrics();
    
    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Real-time metrics error:', error);
    res.status(500).json({ 
      error: 'Failed to get real-time metrics',
      details: error.message 
    });
  }
});

router.post('/realtime/data/:streamId', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const { streamId } = req.params;
    const { dataPoint } = req.body;
    
    if (!dataPoint) {
      return res.status(400).json({ 
        error: 'Data point is required' 
      });
    }

    const success = realTimeAnalytics.addDataPoint(streamId, dataPoint);
    
    res.json({
      success,
      message: success ? 'Data point added successfully' : 'Failed to add data point'
    });
  } catch (error) {
    console.error('Real-time data error:', error);
    res.status(500).json({ 
      error: 'Failed to add real-time data',
      details: error.message 
    });
  }
});

module.exports = router;
