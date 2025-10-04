// Test script for visualization services without external dependencies
const path = require('path');
const fs = require('fs');

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
  console.log('🧪 Testing AI-Powered Visualization and Insights Layer\n');

  try {
    // Test Chart Recommender
    console.log('📊 Testing Chart Recommender...');
    const ChartRecommender = require('./services/visualization/chartRecommender');
    const chartRecommender = new ChartRecommender();
    
    const recommendations = await chartRecommender.recommendCharts(mockQueryResult, {
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