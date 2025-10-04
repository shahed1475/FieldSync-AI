// Simple test script for visualization services without external dependencies
console.log('🧪 Testing AI-Powered Visualization and Insights Layer (Simple Mode)\n');

// Mock simple-statistics module
const mockStats = {
  mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  median: (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },
  standardDeviation: (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  },
  variance: (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  },
  sampleCorrelation: (x, y) => {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }
};

// Mock moment module
const mockMoment = (date) => ({
  format: (format) => new Date(date).toISOString(),
  valueOf: () => new Date(date).getTime(),
  diff: (other) => new Date(date).getTime() - new Date(other).getTime(),
  add: (amount, unit) => mockMoment(new Date(date).getTime() + amount * 1000),
  subtract: (amount, unit) => mockMoment(new Date(date).getTime() - amount * 1000),
  isValid: () => !isNaN(new Date(date).getTime())
});

// Mock ml-regression module
const mockRegression = {
  LinearRegression: class {
    constructor(x, y) {
      this.slope = 1;
      this.intercept = 0;
    }
    predict(x) {
      return Array.isArray(x) ? x.map(val => this.slope * val + this.intercept) : this.slope * x + this.intercept;
    }
  },
  PolynomialRegression: class {
    constructor(x, y, degree = 2) {
      this.coefficients = [0, 1, 0];
    }
    predict(x) {
      return Array.isArray(x) ? x.map(val => val * val + val) : x * x + x;
    }
  }
};

// Mock node-cron module
const mockCron = {
  schedule: (pattern, callback) => {
    console.log(`   📅 Scheduled job with pattern: ${pattern}`);
    return { id: Math.random().toString(36).substr(2, 9) };
  }
};

// Override require for our mocks
const originalRequire = require;
require = function(moduleName) {
  switch(moduleName) {
    case 'simple-statistics':
      return mockStats;
    case 'moment':
      return mockMoment;
    case 'ml-regression':
      return mockRegression;
    case 'node-cron':
      return mockCron;
    case '../../models':
      return {
        Insight: { findAll: () => [], create: (data) => ({ id: 'mock-id', ...data }) },
        Query: { findAll: () => [] },
        Dashboard: { findAll: () => [] },
        DataSource: { findAll: () => [] }
      };
    case 'sequelize':
      return { Op: {} };
    default:
      return originalRequire(moduleName);
  }
};

// Mock data for testing
const mockQueryResult = {
  data: [
    { month: 'Jan', sales: 1000, profit: 200 },
    { month: 'Feb', sales: 1200, profit: 250 },
    { month: 'Mar', sales: 900, profit: 180 },
    { month: 'Apr', sales: 1500, profit: 300 },
    { month: 'May', sales: 1800, profit: 360 }
  ],
  metadata: {
    columns: ['month', 'sales', 'profit'],
    types: { month: 'string', sales: 'number', profit: 'number' },
    rowCount: 5
  }
};

// Test the visualization services
async function testVisualizationServices() {
  try {
    // Test Chart Recommender
    console.log('📊 Testing Chart Recommender...');
    const ChartRecommender = require('./services/visualization/chartRecommender');
    
    const recommendations = await ChartRecommender.recommendCharts(mockQueryResult.data, {
      intent: 'trend_analysis',
      userPreferences: { preferredCharts: ['line', 'bar'] }
    });
    
    console.log('✅ Chart recommendations generated:');
    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec.type} (confidence: ${rec.confidence})`);
    });
    console.log();

    // Test Dashboard Builder
    console.log('🏗️  Testing Dashboard Builder...');
    const DashboardBuilder = require('./services/visualization/dashboardBuilder');
    const dashboardBuilder = new DashboardBuilder();
    
    const dashboard = dashboardBuilder.createDashboard({
      name: 'Sales Analytics',
      description: 'Monthly sales and profit analysis'
    });
    
    const widget = dashboardBuilder.addWidget(dashboard.id, {
      type: 'chart',
      title: 'Sales Trend',
      chartType: 'line',
      dataSource: 'sales_data'
    });
    
    console.log('✅ Dashboard created with ID:', dashboard.id);
    console.log('✅ Widget added with ID:', widget.id);
    console.log();

    // Test Auto Refresh
    console.log('🔄 Testing Auto Refresh...');
    const AutoRefresh = require('./services/visualization/autoRefresh');
    const autoRefresh = new AutoRefresh();
    
    await autoRefresh.initialize();
    const schedule = autoRefresh.scheduleRefresh(dashboard.id, { interval: 300000 }); // 5 minutes
    
    console.log('✅ Auto refresh scheduled for dashboard:', dashboard.id);
    console.log('✅ Schedule ID:', schedule.id);
    console.log();

    // Test Anomaly Detection
    console.log('🔍 Testing Anomaly Detection...');
    const AnomalyDetectionService = require('./services/visualization/anomalyDetection');
    const anomalyService = new AnomalyDetectionService();
    
    const analysis = await anomalyService.analyzeData(mockQueryResult.data, {
      timeField: 'month',
      valueFields: ['sales', 'profit']
    });
    
    console.log('✅ Anomaly analysis completed:');
    console.log(`   - Trends detected: ${analysis.trends.length}`);
    console.log(`   - Anomalies found: ${analysis.anomalies.length}`);
    console.log(`   - Forecast points: ${analysis.forecast.length}`);
    console.log();

    // Test Insights Manager
    console.log('💡 Testing Insights Manager...');
    const InsightsManager = require('./services/visualization/insightsManager');
    const insightsManager = new InsightsManager();
    
    const insight = await insightsManager.storeInsight({
      type: 'trend',
      title: 'Sales Growth Trend',
      description: 'Sales showing consistent upward trend',
      severity: 'medium',
      data: { growth_rate: 0.15 },
      source: 'anomaly_detection'
    });
    
    console.log('✅ Insight stored with ID:', insight.id);
    console.log();

    // Test Scheduler
    console.log('⏰ Testing Visualization Scheduler...');
    const VisualizationScheduler = require('./services/visualization/scheduler');
    const scheduler = new VisualizationScheduler();
    
    await scheduler.initialize();
    console.log('✅ Scheduler initialized successfully');
    console.log();

    console.log('🎉 All visualization services tested successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Chart Recommender - AI-powered chart suggestions');
    console.log('   ✅ Dashboard Builder - Drag-and-drop dashboard management');
    console.log('   ✅ Auto Refresh - Real-time data synchronization');
    console.log('   ✅ Anomaly Detection - Pattern and anomaly identification');
    console.log('   ✅ Insights Manager - AI findings storage and retrieval');
    console.log('   ✅ Visualization Scheduler - Background job management');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the tests
testVisualizationServices();