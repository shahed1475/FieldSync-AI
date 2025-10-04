/**
 * Visualization and Insights Services
 * Centralized exports for all visualization and insights functionality
 */

const ChartRecommender = require('./chartRecommender');
const DashboardBuilder = require('./dashboardBuilder');
const AutoRefresh = require('./autoRefresh');
const AnomalyDetection = require('./anomalyDetection');
const InsightsManager = require('./insightsManager');
const VisualizationScheduler = require('./scheduler');
const PredictiveAnalytics = require('./predictiveAnalytics');
const RealTimeAnalytics = require('./realTimeAnalytics');
const InsightsStorage = require('./insightsStorage');

module.exports = {
  ChartRecommender,
  DashboardBuilder,
  AutoRefresh,
  AnomalyDetection,
  InsightsManager,
  VisualizationScheduler,
  PredictiveAnalytics,
  RealTimeAnalytics,
  InsightsStorage
};