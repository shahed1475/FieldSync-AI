/**
 * Predictive Analytics Service
 * Advanced forecasting, trend prediction, and anomaly detection
 * Integrates with the existing anomaly detection service
 */

const moment = require('moment');
const stats = require('simple-statistics');

class PredictiveAnalyticsService {
  constructor() {
    this.models = {
      LINEAR: 'linear',
      EXPONENTIAL: 'exponential',
      POLYNOMIAL: 'polynomial',
      MOVING_AVERAGE: 'moving_average',
      SEASONAL: 'seasonal'
    };

    this.forecastHorizons = {
      SHORT: 7,    // 7 periods ahead
      MEDIUM: 30,  // 30 periods ahead
      LONG: 90     // 90 periods ahead
    };

    this.confidenceIntervals = [0.68, 0.95, 0.99]; // 1σ, 2σ, 3σ
  }

  /**
   * Generate comprehensive predictive analysis
   * @param {Array} data - Historical data points
   * @param {Object} options - Analysis options
   * @returns {Object} Predictive analysis results
   */
  async generatePredictiveAnalysis(data, options = {}) {
    try {
      if (!data || data.length < 5) {
        return {
          success: false,
          error: 'Insufficient data for predictive analysis (minimum 5 points required)'
        };
      }

      const analysis = {
        timestamp: new Date().toISOString(),
        dataPoints: data.length,
        timeRange: this.getTimeRange(data),
        trends: {},
        forecasts: {},
        anomalyPredictions: {},
        insights: [],
        confidence: {},
        recommendations: []
      };

      // Prepare time series
      const timeSeries = this.prepareTimeSeries(data, options);
      
      if (timeSeries.length < 3) {
        return {
          success: false,
          error: 'Unable to prepare time series data'
        };
      }

      // Trend Analysis
      analysis.trends = await this.analyzeTrends(timeSeries, options);
      
      // Generate Forecasts
      analysis.forecasts = await this.generateForecasts(timeSeries, options);
      
      // Predict Anomalies
      analysis.anomalyPredictions = await this.predictAnomalies(timeSeries, options);
      
      // Calculate Confidence Metrics
      analysis.confidence = this.calculateConfidenceMetrics(timeSeries, analysis.forecasts);
      
      // Generate Insights
      analysis.insights = this.generatePredictiveInsights(analysis);
      
      // Generate Recommendations
      analysis.recommendations = this.generateRecommendations(analysis);

      return {
        success: true,
        analysis: analysis
      };
    } catch (error) {
      console.error('Predictive analysis error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze trends with predictive components
   * @param {Array} timeSeries - Time series data
   * @param {Object} options - Analysis options
   * @returns {Object} Trend analysis
   */
  async analyzeTrends(timeSeries, options = {}) {
    const trends = {
      current: null,
      predicted: null,
      changePoints: [],
      momentum: null,
      acceleration: null
    };

    try {
      // Current trend analysis
      trends.current = this.calculateCurrentTrend(timeSeries);
      
      // Predict future trend
      trends.predicted = this.predictFutureTrend(timeSeries);
      
      // Detect change points
      trends.changePoints = this.detectChangePoints(timeSeries);
      
      // Calculate momentum and acceleration
      trends.momentum = this.calculateMomentum(timeSeries);
      trends.acceleration = this.calculateAcceleration(timeSeries);

      return trends;
    } catch (error) {
      console.error('Trend analysis error:', error);
      return trends;
    }
  }

  /**
   * Generate multiple forecast models
   * @param {Array} timeSeries - Time series data
   * @param {Object} options - Forecast options
   * @returns {Object} Forecast results
   */
  async generateForecasts(timeSeries, options = {}) {
    const forecasts = {};
    const horizon = options.horizon || this.forecastHorizons.MEDIUM;

    try {
      // Linear forecast
      forecasts.linear = this.generateLinearForecast(timeSeries, horizon);
      
      // Exponential smoothing forecast
      forecasts.exponential = this.generateExponentialForecast(timeSeries, horizon);
      
      // Moving average forecast
      forecasts.movingAverage = this.generateMovingAverageForecast(timeSeries, horizon);
      
      // Seasonal forecast (if seasonal patterns detected)
      if (this.hasSeasonalPattern(timeSeries)) {
        forecasts.seasonal = this.generateSeasonalForecast(timeSeries, horizon);
      }

      // Ensemble forecast (combination of models)
      forecasts.ensemble = this.generateEnsembleForecast(forecasts, timeSeries);

      return forecasts;
    } catch (error) {
      console.error('Forecast generation error:', error);
      return {};
    }
  }

  /**
   * Predict potential anomalies in future data
   * @param {Array} timeSeries - Time series data
   * @param {Object} options - Prediction options
   * @returns {Object} Anomaly predictions
   */
  async predictAnomalies(timeSeries, options = {}) {
    const predictions = {
      likelyAnomalies: [],
      volatilityForecast: null,
      riskAssessment: null,
      alertThresholds: null
    };

    try {
      // Calculate historical volatility
      const volatility = this.calculateVolatility(timeSeries);
      
      // Predict future volatility
      predictions.volatilityForecast = this.predictVolatility(timeSeries, volatility);
      
      // Identify periods with high anomaly risk
      predictions.likelyAnomalies = this.identifyHighRiskPeriods(timeSeries, predictions.volatilityForecast);
      
      // Generate risk assessment
      predictions.riskAssessment = this.generateRiskAssessment(timeSeries, predictions);
      
      // Calculate dynamic alert thresholds
      predictions.alertThresholds = this.calculateAlertThresholds(timeSeries, volatility);

      return predictions;
    } catch (error) {
      console.error('Anomaly prediction error:', error);
      return predictions;
    }
  }

  /**
   * Generate linear forecast using regression
   * @param {Array} timeSeries - Time series data
   * @param {number} horizon - Forecast horizon
   * @returns {Object} Linear forecast
   */
  generateLinearForecast(timeSeries, horizon) {
    try {
      const x = timeSeries.map((_, index) => index);
      const y = timeSeries.map(point => point.value);

      // Simple linear regression
      const n = x.length;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
      const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Generate forecast points
      const forecast = [];
      const lastTimestamp = timeSeries[timeSeries.length - 1].timestamp;
      const timeInterval = this.calculateTimeInterval(timeSeries);

      for (let i = 1; i <= horizon; i++) {
        const futureIndex = timeSeries.length + i - 1;
        const predictedValue = slope * futureIndex + intercept;
        
        forecast.push({
          timestamp: lastTimestamp + (i * timeInterval),
          value: predictedValue,
          confidence: this.calculateLinearConfidence(timeSeries, slope, intercept, futureIndex)
        });
      }

      // Calculate model accuracy
      const accuracy = this.calculateModelAccuracy(timeSeries, slope, intercept);

      return {
        model: this.models.LINEAR,
        forecast: forecast,
        parameters: { slope, intercept },
        accuracy: accuracy,
        rmse: this.calculateRMSE(timeSeries, slope, intercept)
      };
    } catch (error) {
      console.error('Linear forecast error:', error);
      return null;
    }
  }

  /**
   * Generate exponential smoothing forecast
   * @param {Array} timeSeries - Time series data
   * @param {number} horizon - Forecast horizon
   * @returns {Object} Exponential forecast
   */
  generateExponentialForecast(timeSeries, horizon) {
    try {
      const alpha = 0.3; // Smoothing parameter
      const values = timeSeries.map(point => point.value);
      
      // Calculate exponentially smoothed values
      const smoothed = [values[0]];
      for (let i = 1; i < values.length; i++) {
        smoothed[i] = alpha * values[i] + (1 - alpha) * smoothed[i - 1];
      }

      // Generate forecast
      const forecast = [];
      const lastSmoothed = smoothed[smoothed.length - 1];
      const lastTimestamp = timeSeries[timeSeries.length - 1].timestamp;
      const timeInterval = this.calculateTimeInterval(timeSeries);

      for (let i = 1; i <= horizon; i++) {
        forecast.push({
          timestamp: lastTimestamp + (i * timeInterval),
          value: lastSmoothed, // Exponential smoothing gives flat forecast
          confidence: Math.max(0.1, 0.9 - (i * 0.05)) // Decreasing confidence
        });
      }

      const accuracy = this.calculateExponentialAccuracy(values, smoothed);

      return {
        model: this.models.EXPONENTIAL,
        forecast: forecast,
        parameters: { alpha },
        accuracy: accuracy,
        smoothed: smoothed
      };
    } catch (error) {
      console.error('Exponential forecast error:', error);
      return null;
    }
  }

  /**
   * Generate moving average forecast
   * @param {Array} timeSeries - Time series data
   * @param {number} horizon - Forecast horizon
   * @returns {Object} Moving average forecast
   */
  generateMovingAverageForecast(timeSeries, horizon) {
    try {
      const windowSize = Math.min(7, Math.floor(timeSeries.length / 3));
      const values = timeSeries.map(point => point.value);
      
      // Calculate moving averages
      const movingAverages = [];
      for (let i = windowSize - 1; i < values.length; i++) {
        const window = values.slice(i - windowSize + 1, i + 1);
        movingAverages.push(stats.mean(window));
      }

      // Generate forecast
      const forecast = [];
      const lastMA = movingAverages[movingAverages.length - 1];
      const lastTimestamp = timeSeries[timeSeries.length - 1].timestamp;
      const timeInterval = this.calculateTimeInterval(timeSeries);

      for (let i = 1; i <= horizon; i++) {
        forecast.push({
          timestamp: lastTimestamp + (i * timeInterval),
          value: lastMA,
          confidence: Math.max(0.2, 0.8 - (i * 0.03))
        });
      }

      return {
        model: this.models.MOVING_AVERAGE,
        forecast: forecast,
        parameters: { windowSize },
        movingAverages: movingAverages
      };
    } catch (error) {
      console.error('Moving average forecast error:', error);
      return null;
    }
  }

  /**
   * Generate ensemble forecast combining multiple models
   * @param {Object} forecasts - Individual model forecasts
   * @param {Array} timeSeries - Original time series
   * @returns {Object} Ensemble forecast
   */
  generateEnsembleForecast(forecasts, timeSeries) {
    try {
      if (Object.keys(forecasts).length === 0) {
        return null;
      }

      // Weight models based on their accuracy
      const weights = {};
      let totalWeight = 0;

      Object.entries(forecasts).forEach(([model, forecast]) => {
        if (forecast && forecast.accuracy) {
          weights[model] = forecast.accuracy;
          totalWeight += forecast.accuracy;
        }
      });

      // Normalize weights
      Object.keys(weights).forEach(model => {
        weights[model] = weights[model] / totalWeight;
      });

      // Combine forecasts
      const ensembleForecast = [];
      const maxLength = Math.max(...Object.values(forecasts).map(f => f?.forecast?.length || 0));

      for (let i = 0; i < maxLength; i++) {
        let weightedSum = 0;
        let weightSum = 0;
        let timestamp = null;

        Object.entries(forecasts).forEach(([model, forecast]) => {
          if (forecast && forecast.forecast && forecast.forecast[i]) {
            const weight = weights[model] || 0;
            weightedSum += forecast.forecast[i].value * weight;
            weightSum += weight;
            timestamp = forecast.forecast[i].timestamp;
          }
        });

        if (weightSum > 0) {
          ensembleForecast.push({
            timestamp: timestamp,
            value: weightedSum / weightSum,
            confidence: Math.min(0.95, weightSum) // Higher confidence with more models
          });
        }
      }

      return {
        model: 'ensemble',
        forecast: ensembleForecast,
        weights: weights,
        modelCount: Object.keys(weights).length
      };
    } catch (error) {
      console.error('Ensemble forecast error:', error);
      return null;
    }
  }

  /**
   * Calculate confidence metrics for forecasts
   * @param {Array} timeSeries - Time series data
   * @param {Object} forecasts - Generated forecasts
   * @returns {Object} Confidence metrics
   */
  calculateConfidenceMetrics(timeSeries, forecasts) {
    try {
      const metrics = {
        overall: 0,
        byModel: {},
        uncertainty: 0,
        reliability: 0
      };

      // Calculate confidence for each model
      Object.entries(forecasts).forEach(([model, forecast]) => {
        if (forecast && forecast.forecast) {
          const avgConfidence = forecast.forecast.reduce((sum, point) => sum + point.confidence, 0) / forecast.forecast.length;
          metrics.byModel[model] = avgConfidence;
        }
      });

      // Overall confidence (weighted average)
      const confidenceValues = Object.values(metrics.byModel);
      if (confidenceValues.length > 0) {
        metrics.overall = confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length;
      }

      // Calculate uncertainty based on forecast variance
      metrics.uncertainty = this.calculateForecastUncertainty(forecasts);
      
      // Calculate reliability based on historical accuracy
      metrics.reliability = this.calculateReliability(timeSeries);

      return metrics;
    } catch (error) {
      console.error('Confidence calculation error:', error);
      return { overall: 0, byModel: {}, uncertainty: 1, reliability: 0 };
    }
  }

  /**
   * Generate predictive insights
   * @param {Object} analysis - Complete analysis results
   * @returns {Array} Insights array
   */
  generatePredictiveInsights(analysis) {
    const insights = [];

    try {
      // Trend insights
      if (analysis.trends.current) {
        const trend = analysis.trends.current;
        insights.push({
          type: 'trend',
          severity: this.getTrendSeverity(trend),
          title: `${trend.direction.charAt(0).toUpperCase() + trend.direction.slice(1)} Trend Detected`,
          description: `Data shows a ${trend.direction} trend with ${(trend.confidence || 0).toFixed(1)}% confidence. ${trend.changePercent > 0 ? 'Increase' : 'Decrease'} of ${Math.abs(trend.changePercent || 0).toFixed(1)}% observed.`,
          confidence: trend.confidence || 0,
          timestamp: new Date().toISOString()
        });
      }

      // Forecast insights
      if (analysis.forecasts.ensemble) {
        const forecast = analysis.forecasts.ensemble;
        const avgForecastValue = forecast.forecast.reduce((sum, point) => sum + point.value, 0) / forecast.forecast.length;
        const currentValue = analysis.dataPoints > 0 ? analysis.forecasts.linear?.parameters?.intercept || 0 : 0;
        const forecastChange = ((avgForecastValue - currentValue) / currentValue) * 100;

        insights.push({
          type: 'forecast',
          severity: Math.abs(forecastChange) > 20 ? 'high' : Math.abs(forecastChange) > 10 ? 'medium' : 'low',
          title: 'Forecast Prediction',
          description: `Ensemble model predicts ${forecastChange > 0 ? 'an increase' : 'a decrease'} of ${Math.abs(forecastChange).toFixed(1)}% in the coming period.`,
          confidence: analysis.confidence.overall * 100,
          timestamp: new Date().toISOString()
        });
      }

      // Anomaly risk insights
      if (analysis.anomalyPredictions.riskAssessment) {
        const risk = analysis.anomalyPredictions.riskAssessment;
        insights.push({
          type: 'anomaly_risk',
          severity: risk.level || 'medium',
          title: 'Anomaly Risk Assessment',
          description: `${risk.level.charAt(0).toUpperCase() + risk.level.slice(1)} risk of anomalies detected. Volatility expected to ${risk.volatilityTrend || 'remain stable'}.`,
          confidence: risk.confidence || 70,
          timestamp: new Date().toISOString()
        });
      }

      return insights;
    } catch (error) {
      console.error('Insight generation error:', error);
      return [];
    }
  }

  /**
   * Generate actionable recommendations
   * @param {Object} analysis - Complete analysis results
   * @returns {Array} Recommendations array
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    try {
      // Trend-based recommendations
      if (analysis.trends.current) {
        const trend = analysis.trends.current;
        if (trend.direction === 'increasing' && trend.confidence > 80) {
          recommendations.push({
            type: 'opportunity',
            priority: 'high',
            title: 'Capitalize on Positive Trend',
            description: 'Strong upward trend detected. Consider increasing investment or scaling operations.',
            action: 'Scale up operations to maximize gains from positive trend',
            expectedImpact: 'high'
          });
        } else if (trend.direction === 'decreasing' && trend.confidence > 80) {
          recommendations.push({
            type: 'warning',
            priority: 'high',
            title: 'Address Declining Trend',
            description: 'Significant downward trend detected. Immediate action may be required.',
            action: 'Investigate root causes and implement corrective measures',
            expectedImpact: 'high'
          });
        }
      }

      // Forecast-based recommendations
      if (analysis.confidence.overall > 0.7) {
        recommendations.push({
          type: 'planning',
          priority: 'medium',
          title: 'Reliable Forecast Available',
          description: 'High-confidence predictions available for strategic planning.',
          action: 'Use forecast data for resource allocation and planning',
          expectedImpact: 'medium'
        });
      }

      // Anomaly prevention recommendations
      if (analysis.anomalyPredictions.riskAssessment?.level === 'high') {
        recommendations.push({
          type: 'prevention',
          priority: 'high',
          title: 'Implement Anomaly Monitoring',
          description: 'High risk of anomalies detected in upcoming period.',
          action: 'Set up enhanced monitoring and alert systems',
          expectedImpact: 'high'
        });
      }

      return recommendations;
    } catch (error) {
      console.error('Recommendation generation error:', error);
      return [];
    }
  }

  // Helper methods
  prepareTimeSeries(data, options = {}) {
    try {
      return data
        .filter(row => row.timestamp && row.value !== null && row.value !== undefined)
        .map(row => ({
          timestamp: moment(row.timestamp).valueOf(),
          value: parseFloat(row.value) || 0,
          date: moment(row.timestamp).format('YYYY-MM-DD')
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      return [];
    }
  }

  getTimeRange(data) {
    if (!data || data.length === 0) return null;
    
    const timestamps = data.map(row => moment(row.timestamp || row.date).valueOf()).filter(t => !isNaN(t));
    if (timestamps.length === 0) return null;
    
    return {
      start: new Date(Math.min(...timestamps)).toISOString(),
      end: new Date(Math.max(...timestamps)).toISOString(),
      duration: Math.max(...timestamps) - Math.min(...timestamps)
    };
  }

  calculateTimeInterval(timeSeries) {
    if (timeSeries.length < 2) return 86400000; // Default to 1 day
    
    const intervals = [];
    for (let i = 1; i < Math.min(timeSeries.length, 10); i++) {
      intervals.push(timeSeries[i].timestamp - timeSeries[i-1].timestamp);
    }
    
    return stats.median(intervals);
  }

  calculateCurrentTrend(timeSeries) {
    if (timeSeries.length < 3) return null;
    
    const recentPoints = timeSeries.slice(-Math.min(10, timeSeries.length));
    const x = recentPoints.map((_, index) => index);
    const y = recentPoints.map(point => point.value);
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const direction = slope > 0 ? 'increasing' : 'decreasing';
    const changePercent = ((recentPoints[recentPoints.length - 1].value - recentPoints[0].value) / recentPoints[0].value) * 100;
    
    return {
      direction,
      slope,
      changePercent,
      confidence: Math.min(95, Math.abs(slope) * 100)
    };
  }

  calculateVolatility(timeSeries) {
    if (timeSeries.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < timeSeries.length; i++) {
      const returnRate = (timeSeries[i].value - timeSeries[i-1].value) / timeSeries[i-1].value;
      returns.push(returnRate);
    }
    
    return stats.standardDeviation(returns);
  }

  getTrendSeverity(trend) {
    if (!trend.confidence) return 'low';
    
    if (trend.confidence > 90) return 'high';
    if (trend.confidence > 70) return 'medium';
    return 'low';
  }

  calculateModelAccuracy(timeSeries, slope, intercept) {
    try {
      const predictions = timeSeries.map((_, index) => slope * index + intercept);
      const actual = timeSeries.map(point => point.value);
      
      const mse = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - actual[i], 2), 0) / predictions.length;
      const variance = stats.variance(actual);
      
      return Math.max(0, 1 - (mse / variance));
    } catch (error) {
      return 0.5;
    }
  }

  calculateRMSE(timeSeries, slope, intercept) {
    try {
      const predictions = timeSeries.map((_, index) => slope * index + intercept);
      const actual = timeSeries.map(point => point.value);
      
      const mse = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - actual[i], 2), 0) / predictions.length;
      return Math.sqrt(mse);
    } catch (error) {
      return 0;
    }
  }

  calculateLinearConfidence(timeSeries, slope, intercept, futureIndex) {
    const baseConfidence = 0.8;
    const distancePenalty = Math.max(0, (futureIndex - timeSeries.length) * 0.05);
    return Math.max(0.1, baseConfidence - distancePenalty);
  }

  calculateExponentialAccuracy(actual, smoothed) {
    try {
      const errors = actual.slice(1).map((val, i) => Math.abs(val - smoothed[i]));
      const meanError = stats.mean(errors);
      const meanValue = stats.mean(actual);
      return Math.max(0, 1 - (meanError / meanValue));
    } catch (error) {
      return 0.5;
    }
  }

  hasSeasonalPattern(timeSeries) {
    // Simple check for seasonal patterns
    return timeSeries.length >= 14; // Need at least 2 weeks of data
  }

  calculateForecastUncertainty(forecasts) {
    try {
      const forecastValues = Object.values(forecasts)
        .filter(f => f && f.forecast)
        .map(f => f.forecast.map(point => point.value));
      
      if (forecastValues.length < 2) return 0.5;
      
      // Calculate variance across different model predictions
      const variances = [];
      const maxLength = Math.max(...forecastValues.map(fv => fv.length));
      
      for (let i = 0; i < maxLength; i++) {
        const values = forecastValues.map(fv => fv[i]).filter(v => v !== undefined);
        if (values.length > 1) {
          variances.push(stats.variance(values));
        }
      }
      
      return variances.length > 0 ? stats.mean(variances) : 0.5;
    } catch (error) {
      return 0.5;
    }
  }

  calculateReliability(timeSeries) {
    // Simple reliability metric based on data consistency
    if (timeSeries.length < 3) return 0.5;
    
    const values = timeSeries.map(point => point.value);
    const cv = stats.standardDeviation(values) / stats.mean(values); // Coefficient of variation
    
    return Math.max(0.1, Math.min(0.95, 1 - cv));
  }
}

module.exports = PredictiveAnalyticsService;