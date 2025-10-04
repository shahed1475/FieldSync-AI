const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Import visualization services
const ChartRecommender = require('../services/visualization/chartRecommender');
const DashboardBuilder = require('../services/visualization/dashboardBuilder');
const AutoRefresh = require('../services/visualization/autoRefresh');
const AnomalyDetectionService = require('../services/visualization/anomalyDetection');
const InsightsManager = require('../services/visualization/insightsManager');
const PredictiveAnalytics = require('../services/visualization/predictiveAnalytics');
const RealTimeAnalytics = require('../services/visualization/realTimeAnalytics');
const InsightsStorage = require('../services/visualization/insightsStorage');

// Rate limiting for visualization endpoints
const visualizationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many visualization requests from this IP, please try again later.'
});

// Initialize services
const chartRecommender = new ChartRecommender();
const dashboardBuilder = new DashboardBuilder();
const autoRefresh = new AutoRefresh();
const anomalyDetection = new AnomalyDetectionService();
const insightsManager = new InsightsManager();
const predictiveAnalytics = new PredictiveAnalytics();
const realTimeAnalytics = new RealTimeAnalytics();
const insightsStorage = new InsightsStorage();

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
    const organizationId = req.user.organizationId;
    
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
    const organizationId = req.user.organizationId;
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
    const organizationId = req.user.organizationId;
    
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
    const organizationId = req.user.organizationId;
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
    const organizationId = req.user.organizationId;
    
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
    const organizationId = req.user.organizationId;
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
    const organizationId = req.user.organizationId;
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
    const organizationId = req.user.organizationId;
    
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
    const organizationId = req.user.organizationId;
    
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
    const organizationId = req.user.organizationId;
    
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
    const organizationId = req.user.organizationId;
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
    const organizationId = req.user.organizationId;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      severity, 
      status = 'active',
      startDate,
      endDate 
    } = req.query;
    
    const insights = await insightsManager.getInsights(organizationId, {
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
      insights,
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
    const organizationId = req.user.organizationId;
    const insightData = { ...req.body, organizationId };
    
    const insight = await insightsManager.storeInsight(insightData);
    
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
    const organizationId = req.user.organizationId;
    
    const insight = await insightsManager.getInsight(id, organizationId);
    
    if (!insight) {
      return res.status(404).json({ 
        error: 'Insight not found' 
      });
    }
    
    res.json({
      success: true,
      insight
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
    const organizationId = req.user.organizationId;
    const updates = req.body;
    
    const insight = await insightsManager.updateInsight(id, organizationId, updates);
    
    if (!insight) {
      return res.status(404).json({ 
        error: 'Insight not found' 
      });
    }
    
    res.json({
      success: true,
      insight,
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
    const organizationId = req.user.organizationId;
    
    const success = await insightsManager.deleteInsight(id, organizationId);
    
    if (!success) {
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
    const organizationId = req.user.organizationId;
    const { timeframe = '30d' } = req.query;
    
    const summary = await insightsManager.getInsightsSummary(organizationId, timeframe);
    
    res.json({
      success: true,
      summary,
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
    const organizationId = req.user.organizationId;
    const { timeframe = '30d', groupBy = 'day' } = req.query;
    
    const trends = await insightsManager.getInsightsTrends(organizationId, timeframe, groupBy);
    
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
    const { data, options = {} } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ 
        error: 'Data array is required for predictive analysis' 
      });
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
    const { data, options = {} } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ 
        error: 'Data array is required for trend analysis' 
      });
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
    const { data, horizon = 'short', options = {} } = req.body;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ 
        error: 'Data array is required for forecasting' 
      });
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

// Insights Storage Routes
router.post('/insights/store', authenticateToken, visualizationLimiter, async (req, res) => {
  try {
    const insight = req.body;
    
    if (!insight.title || !insight.description || !insight.type || !insight.severity) {
      return res.status(400).json({ 
        error: 'Title, description, type, and severity are required' 
      });
    }

    // Add organization context
    insight.dataSource = insight.dataSource || req.user.organizationId;
    
    const insightId = await insightsStorage.storeInsight(insight);
    
    res.status(201).json({
      success: true,
      insightId,
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

router.get('/insights/stored', authenticateToken, async (req, res) => {
  try {
    const filters = {
      ...req.query,
      dataSource: req.user.organizationId // Filter by organization
    };
    
    const insights = await insightsStorage.getInsights(filters);
    
    res.json({
      success: true,
      insights,
      count: insights.length
    });
  } catch (error) {
    console.error('Insights retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve insights',
      details: error.message 
    });
  }
});

router.get('/insights/stored/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const insight = await insightsStorage.getInsightById(parseInt(id));
    
    if (!insight) {
      return res.status(404).json({ 
        error: 'Insight not found' 
      });
    }

    // Check if user has access to this insight
    if (insight.data_source !== req.user.organizationId) {
      return res.status(403).json({ 
        error: 'Access denied' 
      });
    }
    
    res.json({
      success: true,
      insight
    });
  } catch (error) {
    console.error('Insight retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve insight',
      details: error.message 
    });
  }
});

router.put('/insights/stored/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const changedBy = req.user.username || req.user.email;
    
    if (!status) {
      return res.status(400).json({ 
        error: 'Status is required' 
      });
    }

    const success = await insightsStorage.updateInsightStatus(parseInt(id), status, changedBy);
    
    if (!success) {
      return res.status(404).json({ 
        error: 'Insight not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Insight status updated successfully'
    });
  } catch (error) {
    console.error('Insight status update error:', error);
    res.status(500).json({ 
      error: 'Failed to update insight status',
      details: error.message 
    });
  }
});

router.get('/insights/summary', authenticateToken, async (req, res) => {
  try {
    const filters = {
      ...req.query,
      dataSource: req.user.organizationId // Filter by organization
    };
    
    const summary = await insightsStorage.getInsightsSummary(filters);
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Insights summary error:', error);
    res.status(500).json({ 
      error: 'Failed to generate insights summary',
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