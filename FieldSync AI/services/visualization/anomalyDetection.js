const stats = require('simple-statistics');
const moment = require('moment');
const { LinearRegression, PolynomialRegression } = require('ml-regression');
// Using native JavaScript instead of lodash for better compatibility

/**
 * Anomaly Detection Service
 * Identifies patterns, trends, and anomalies in data using statistical analysis
 */
class AnomalyDetectionService {
  constructor() {
    // Anomaly detection thresholds
    this.thresholds = {
      outlier: 2.5,        // Standard deviations for outlier detection
      trend: 0.1,          // Minimum R² for trend significance
      seasonality: 0.3,    // Minimum correlation for seasonal patterns
      spike: 3.0,          // Standard deviations for spike detection
      drop: -3.0,          // Standard deviations for drop detection
      volatility: 2.0      // Volatility threshold multiplier
    };

    // Severity levels
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    // Pattern types
    this.patternTypes = {
      TREND: 'trend',
      SEASONAL: 'seasonal',
      OUTLIER: 'outlier',
      SPIKE: 'spike',
      DROP: 'drop',
      VOLATILITY: 'volatility',
      CORRELATION: 'correlation',
      FORECAST: 'forecast'
    };
  }

  /**
   * Analyze data for anomalies and patterns
   * @param {Array} data - Data array with timestamp and value fields
   * @param {Object} options - Analysis options
   * @returns {Object} Analysis results
   */
  async analyzeData(data, options = {}) {
    try {
      if (!data || data.length < 3) {
        return {
          success: false,
          error: 'Insufficient data for analysis'
        };
      }

      const analysisResults = {
        dataPoints: data.length,
        timeRange: this.getTimeRange(data),
        patterns: [],
        anomalies: [],
        insights: [],
        statistics: this.calculateBasicStatistics(data),
        forecast: null
      };

      // Prepare time series data
      const timeSeries = this.prepareTimeSeries(data, options);
      
      if (timeSeries.length > 0) {
        // Detect trends
        const trendAnalysis = this.detectTrends(timeSeries);
        if (trendAnalysis.significant) {
          analysisResults.patterns.push(trendAnalysis);
        }

        // Detect seasonal patterns
        const seasonalAnalysis = this.detectSeasonality(timeSeries);
        if (seasonalAnalysis.significant) {
          analysisResults.patterns.push(seasonalAnalysis);
        }

        // Generate forecast
        if (options.includeForecast && timeSeries.length >= 10) {
          analysisResults.forecast = this.generateForecast(timeSeries);
        }
      }

      // Detect outliers and anomalies
      const outliers = this.detectOutliers(data);
      analysisResults.anomalies.push(...outliers);

      // Detect spikes and drops
      const spikesAndDrops = this.detectSpikesAndDrops(data);
      analysisResults.anomalies.push(...spikesAndDrops);

      // Detect volatility anomalies
      const volatilityAnomalies = this.detectVolatilityAnomalies(data);
      analysisResults.anomalies.push(...volatilityAnomalies);

      // Generate insights
      analysisResults.insights = this.generateInsights(analysisResults);

      return {
        success: true,
        analysis: analysisResults
      };
    } catch (error) {
      console.error('Anomaly detection error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Prepare time series data from raw data
   * @param {Array} data - Raw data
   * @param {Object} options - Preparation options
   * @returns {Array} Time series data
   */
  prepareTimeSeries(data, options = {}) {
    try {
      // Identify timestamp and value fields
      const timestampField = options.timestampField || this.identifyTimestampField(data);
      const valueField = options.valueField || this.identifyValueField(data);

      if (!timestampField || !valueField) {
        return [];
      }

      // Convert to time series format
      const timeSeries = data
        .filter(row => row[timestampField] && row[valueField] !== null && row[valueField] !== undefined)
        .map(row => ({
          timestamp: moment(row[timestampField]).valueOf(),
          value: parseFloat(row[valueField]) || 0,
          date: moment(row[timestampField]).format('YYYY-MM-DD'),
          originalRow: row
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      return timeSeries;
    } catch (error) {
      console.error('Time series preparation error:', error);
      return [];
    }
  }

  /**
   * Detect trends in time series data
   * @param {Array} timeSeries - Time series data
   * @returns {Object} Trend analysis
   */
  detectTrends(timeSeries) {
    try {
      if (timeSeries.length < 3) {
        return { significant: false };
      }

      // Prepare data for regression
      const x = timeSeries.map((_, index) => index);
      const y = timeSeries.map(point => point.value);

      // Linear regression
      const linearRegression = new LinearRegression(x, y);
      const rSquared = this.calculateRSquared(x, y, linearRegression);

      // Determine trend direction and strength
      const slope = linearRegression.slope;
      const isSignificant = rSquared >= this.thresholds.trend;

      if (!isSignificant) {
        return { significant: false };
      }

      const trendDirection = slope > 0 ? 'increasing' : 'decreasing';
      const trendStrength = Math.abs(slope);
      
      // Calculate trend severity
      const severity = this.calculateTrendSeverity(rSquared, trendStrength, timeSeries);

      return {
        significant: true,
        type: this.patternTypes.TREND,
        direction: trendDirection,
        slope: slope,
        rSquared: rSquared,
        strength: trendStrength,
        severity: severity,
        confidence: rSquared * 100,
        description: `${trendDirection.charAt(0).toUpperCase() + trendDirection.slice(1)} trend detected with ${(rSquared * 100).toFixed(1)}% confidence`,
        startValue: timeSeries[0].value,
        endValue: timeSeries[timeSeries.length - 1].value,
        changePercent: ((timeSeries[timeSeries.length - 1].value - timeSeries[0].value) / timeSeries[0].value) * 100
      };
    } catch (error) {
      console.error('Trend detection error:', error);
      return { significant: false };
    }
  }

  /**
   * Detect seasonal patterns in time series data
   * @param {Array} timeSeries - Time series data
   * @returns {Object} Seasonality analysis
   */
  detectSeasonality(timeSeries) {
    try {
      if (timeSeries.length < 14) { // Need at least 2 weeks of data
        return { significant: false };
      }

      // Group data by day of week, hour, etc.
      const patterns = {
        dayOfWeek: this.analyzeSeasonalPattern(timeSeries, 'day'),
        hourOfDay: this.analyzeSeasonalPattern(timeSeries, 'hour'),
        dayOfMonth: this.analyzeSeasonalPattern(timeSeries, 'date')
      };

      // Find the most significant pattern
      let bestPattern = null;
      let maxCorrelation = 0;

      Object.entries(patterns).forEach(([patternName, pattern]) => {
        if (pattern.correlation > maxCorrelation && pattern.correlation >= this.thresholds.seasonality) {
          maxCorrelation = pattern.correlation;
          bestPattern = { name: patternName, ...pattern };
        }
      });

      if (!bestPattern) {
        return { significant: false };
      }

      return {
        significant: true,
        type: this.patternTypes.SEASONAL,
        pattern: bestPattern.name,
        correlation: bestPattern.correlation,
        peaks: bestPattern.peaks,
        valleys: bestPattern.valleys,
        severity: this.calculateSeasonalSeverity(bestPattern.correlation),
        confidence: bestPattern.correlation * 100,
        description: `Seasonal pattern detected in ${bestPattern.name} with ${(bestPattern.correlation * 100).toFixed(1)}% correlation`
      };
    } catch (error) {
      console.error('Seasonality detection error:', error);
      return { significant: false };
    }
  }

  /**
   * Analyze seasonal pattern for specific time unit
   * @param {Array} timeSeries - Time series data
   * @param {string} unit - Time unit (day, hour, date)
   * @returns {Object} Pattern analysis
   */
  analyzeSeasonalPattern(timeSeries, unit) {
    try {
      // Group data by time unit
      const groups = {};
      
      timeSeries.forEach(point => {
        const date = moment(point.timestamp);
        let key;
        
        switch (unit) {
          case 'day':
            key = date.format('dddd'); // Monday, Tuesday, etc.
            break;
          case 'hour':
            key = date.hour();
            break;
          case 'date':
            key = date.date(); // 1-31
            break;
          default:
            return;
        }

        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(point.value);
      });

      // Calculate averages for each group
      const averages = {};
      Object.entries(groups).forEach(([key, values]) => {
        averages[key] = stats.mean(values);
      });

      // Calculate correlation with expected pattern
      const values = Object.values(averages);
      if (values.length < 3) {
        return { correlation: 0 };
      }

      const correlation = this.calculatePatternCorrelation(values);
      
      // Find peaks and valleys
      const sortedEntries = Object.entries(averages).sort((a, b) => b[1] - a[1]);
      const peaks = sortedEntries.slice(0, Math.ceil(sortedEntries.length / 3)).map(([key]) => key);
      const valleys = sortedEntries.slice(-Math.ceil(sortedEntries.length / 3)).map(([key]) => key);

      return {
        correlation,
        averages,
        peaks,
        valleys
      };
    } catch (error) {
      console.error('Seasonal pattern analysis error:', error);
      return { correlation: 0 };
    }
  }

  /**
   * Detect outliers in data
   * @param {Array} data - Data array
   * @returns {Array} Outlier anomalies
   */
  detectOutliers(data) {
    try {
      const outliers = [];
      const numericFields = this.identifyNumericFields(data);

      numericFields.forEach(field => {
        const values = data
          .map(row => parseFloat(row[field]))
          .filter(val => !isNaN(val));

        if (values.length < 3) return;

        const mean = stats.mean(values);
        const stdDev = stats.standardDeviation(values);
        const threshold = this.thresholds.outlier;

        data.forEach((row, index) => {
          const value = parseFloat(row[field]);
          if (isNaN(value)) return;

          const zScore = Math.abs((value - mean) / stdDev);
          
          if (zScore > threshold) {
            outliers.push({
              type: this.patternTypes.OUTLIER,
              field: field,
              value: value,
              expectedRange: [mean - threshold * stdDev, mean + threshold * stdDev],
              zScore: zScore,
              severity: this.calculateOutlierSeverity(zScore),
              rowIndex: index,
              description: `Outlier detected in ${field}: ${value} (${zScore.toFixed(2)} standard deviations from mean)`
            });
          }
        });
      });

      return outliers;
    } catch (error) {
      console.error('Outlier detection error:', error);
      return [];
    }
  }

  /**
   * Detect spikes and drops in data
   * @param {Array} data - Data array
   * @returns {Array} Spike and drop anomalies
   */
  detectSpikesAndDrops(data) {
    try {
      const anomalies = [];
      const timeSeries = this.prepareTimeSeries(data);

      if (timeSeries.length < 3) return anomalies;

      // Calculate moving average and standard deviation
      const windowSize = Math.min(7, Math.floor(timeSeries.length / 3));
      
      for (let i = windowSize; i < timeSeries.length; i++) {
        const window = timeSeries.slice(i - windowSize, i);
        const windowValues = window.map(point => point.value);
        
        const mean = stats.mean(windowValues);
        const stdDev = stats.standardDeviation(windowValues);
        
        const currentValue = timeSeries[i].value;
        const zScore = (currentValue - mean) / stdDev;

        // Detect spikes
        if (zScore > this.thresholds.spike) {
          anomalies.push({
            type: this.patternTypes.SPIKE,
            timestamp: timeSeries[i].timestamp,
            value: currentValue,
            expectedValue: mean,
            zScore: zScore,
            severity: this.calculateSpikeSeverity(zScore),
            description: `Spike detected: ${currentValue.toFixed(2)} (expected ~${mean.toFixed(2)})`
          });
        }

        // Detect drops
        if (zScore < this.thresholds.drop) {
          anomalies.push({
            type: this.patternTypes.DROP,
            timestamp: timeSeries[i].timestamp,
            value: currentValue,
            expectedValue: mean,
            zScore: zScore,
            severity: this.calculateDropSeverity(zScore),
            description: `Drop detected: ${currentValue.toFixed(2)} (expected ~${mean.toFixed(2)})`
          });
        }
      }

      return anomalies;
    } catch (error) {
      console.error('Spike/drop detection error:', error);
      return [];
    }
  }

  /**
   * Detect volatility anomalies
   * @param {Array} data - Data array
   * @returns {Array} Volatility anomalies
   */
  detectVolatilityAnomalies(data) {
    try {
      const anomalies = [];
      const timeSeries = this.prepareTimeSeries(data);

      if (timeSeries.length < 10) return anomalies;

      // Calculate rolling volatility
      const windowSize = Math.min(7, Math.floor(timeSeries.length / 4));
      const volatilities = [];

      for (let i = windowSize; i < timeSeries.length; i++) {
        const window = timeSeries.slice(i - windowSize, i);
        const returns = [];
        
        for (let j = 1; j < window.length; j++) {
          const returnRate = (window[j].value - window[j-1].value) / window[j-1].value;
          returns.push(returnRate);
        }

        const volatility = stats.standardDeviation(returns);
        volatilities.push({
          timestamp: timeSeries[i].timestamp,
          volatility: volatility
        });
      }

      // Detect volatility anomalies
      const volatilityValues = volatilities.map(v => v.volatility);
      const meanVolatility = stats.mean(volatilityValues);
      const stdVolatility = stats.standardDeviation(volatilityValues);

      volatilities.forEach(vol => {
        const zScore = (vol.volatility - meanVolatility) / stdVolatility;
        
        if (Math.abs(zScore) > this.thresholds.volatility) {
          anomalies.push({
            type: this.patternTypes.VOLATILITY,
            timestamp: vol.timestamp,
            volatility: vol.volatility,
            expectedVolatility: meanVolatility,
            zScore: zScore,
            severity: this.calculateVolatilitySeverity(Math.abs(zScore)),
            description: `${zScore > 0 ? 'High' : 'Low'} volatility detected: ${(vol.volatility * 100).toFixed(2)}%`
          });
        }
      });

      return anomalies;
    } catch (error) {
      console.error('Volatility detection error:', error);
      return [];
    }
  }

  /**
   * Generate forecast for time series data
   * @param {Array} timeSeries - Time series data
   * @returns {Object} Forecast results
   */
  generateForecast(timeSeries) {
    try {
      if (timeSeries.length < 10) {
        return null;
      }

      // Prepare data for forecasting
      const x = timeSeries.map((_, index) => index);
      const y = timeSeries.map(point => point.value);

      // Try different regression models
      const models = {
        linear: new LinearRegression(x, y),
        polynomial: new PolynomialRegression(x, y, 2)
      };

      // Select best model based on R²
      let bestModel = null;
      let bestRSquared = 0;
      let bestModelType = null;

      Object.entries(models).forEach(([type, model]) => {
        const rSquared = this.calculateRSquared(x, y, model);
        if (rSquared > bestRSquared) {
          bestRSquared = rSquared;
          bestModel = model;
          bestModelType = type;
        }
      });

      if (!bestModel || bestRSquared < 0.3) {
        return null;
      }

      // Generate forecast points
      const forecastPeriods = Math.min(5, Math.floor(timeSeries.length / 4));
      const forecast = [];
      const lastTimestamp = timeSeries[timeSeries.length - 1].timestamp;
      const timeInterval = this.calculateAverageTimeInterval(timeSeries);

      for (let i = 1; i <= forecastPeriods; i++) {
        const futureIndex = timeSeries.length + i - 1;
        const predictedValue = bestModel.predict(futureIndex);
        const futureTimestamp = lastTimestamp + (timeInterval * i);

        forecast.push({
          timestamp: futureTimestamp,
          value: predictedValue,
          confidence: bestRSquared
        });
      }

      return {
        type: this.patternTypes.FORECAST,
        model: bestModelType,
        rSquared: bestRSquared,
        confidence: bestRSquared * 100,
        forecast: forecast,
        description: `${forecastPeriods}-period forecast using ${bestModelType} regression (${(bestRSquared * 100).toFixed(1)}% confidence)`
      };
    } catch (error) {
      console.error('Forecast generation error:', error);
      return null;
    }
  }

  /**
   * Generate insights from analysis results
   * @param {Object} analysisResults - Analysis results
   * @returns {Array} Generated insights
   */
  generateInsights(analysisResults) {
    const insights = [];

    // Trend insights
    const trendPattern = analysisResults.patterns.find(p => p.type === this.patternTypes.TREND);
    if (trendPattern) {
      insights.push({
        type: 'trend',
        severity: trendPattern.severity,
        title: `${trendPattern.direction.charAt(0).toUpperCase() + trendPattern.direction.slice(1)} Trend Detected`,
        description: `Data shows a ${trendPattern.direction} trend with ${trendPattern.changePercent.toFixed(1)}% change over the period`,
        confidence: trendPattern.confidence,
        actionable: true,
        recommendation: this.getTrendRecommendation(trendPattern)
      });
    }

    // Anomaly insights
    const criticalAnomalies = analysisResults.anomalies.filter(a => 
      a.severity === this.severityLevels.HIGH || a.severity === this.severityLevels.CRITICAL
    );

    if (criticalAnomalies.length > 0) {
      insights.push({
        type: 'anomaly',
        severity: this.severityLevels.HIGH,
        title: `${criticalAnomalies.length} Critical Anomalies Detected`,
        description: `Found ${criticalAnomalies.length} significant anomalies that require attention`,
        confidence: 90,
        actionable: true,
        recommendation: 'Review the identified anomalies and investigate potential causes'
      });
    }

    // Forecast insights
    if (analysisResults.forecast && analysisResults.forecast.confidence > 70) {
      const forecastTrend = this.analyzeForecastTrend(analysisResults.forecast);
      insights.push({
        type: 'forecast',
        severity: forecastTrend.severity,
        title: 'Forecast Analysis',
        description: forecastTrend.description,
        confidence: analysisResults.forecast.confidence,
        actionable: true,
        recommendation: forecastTrend.recommendation
      });
    }

    return insights;
  }

  // Helper methods for calculations and analysis

  calculateBasicStatistics(data) {
    const numericFields = this.identifyNumericFields(data);
    const statistics = {};

    numericFields.forEach(field => {
      const values = data
        .map(row => parseFloat(row[field]))
        .filter(val => !isNaN(val));

      if (values.length > 0) {
        statistics[field] = {
          count: values.length,
          mean: stats.mean(values),
          median: stats.median(values),
          min: stats.min(values),
          max: stats.max(values),
          standardDeviation: stats.standardDeviation(values),
          variance: stats.variance(values)
        };
      }
    });

    return statistics;
  }

  calculateRSquared(x, y, model) {
    const predictions = x.map(xi => model.predict(xi));
    const yMean = stats.mean(y);
    
    const totalSumSquares = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const residualSumSquares = y.reduce((sum, yi, i) => sum + Math.pow(yi - predictions[i], 2), 0);
    
    return 1 - (residualSumSquares / totalSumSquares);
  }

  calculatePatternCorrelation(values) {
    // Simple correlation calculation for seasonal patterns
    const mean = stats.mean(values);
    const variance = stats.variance(values);
    return Math.min(variance / (mean * mean), 1);
  }

  calculateAverageTimeInterval(timeSeries) {
    if (timeSeries.length < 2) return 0;
    
    const intervals = [];
    for (let i = 1; i < timeSeries.length; i++) {
      intervals.push(timeSeries[i].timestamp - timeSeries[i-1].timestamp);
    }
    
    return stats.mean(intervals);
  }

  // Severity calculation methods
  calculateTrendSeverity(rSquared, strength, timeSeries) {
    const changePercent = Math.abs(((timeSeries[timeSeries.length - 1].value - timeSeries[0].value) / timeSeries[0].value) * 100);
    
    if (rSquared > 0.8 && changePercent > 50) return this.severityLevels.CRITICAL;
    if (rSquared > 0.6 && changePercent > 25) return this.severityLevels.HIGH;
    if (rSquared > 0.4 && changePercent > 10) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  calculateSeasonalSeverity(correlation) {
    if (correlation > 0.8) return this.severityLevels.HIGH;
    if (correlation > 0.6) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  calculateOutlierSeverity(zScore) {
    if (Math.abs(zScore) > 4) return this.severityLevels.CRITICAL;
    if (Math.abs(zScore) > 3.5) return this.severityLevels.HIGH;
    if (Math.abs(zScore) > 3) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  calculateSpikeSeverity(zScore) {
    if (zScore > 5) return this.severityLevels.CRITICAL;
    if (zScore > 4) return this.severityLevels.HIGH;
    if (zScore > 3.5) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  calculateDropSeverity(zScore) {
    if (zScore < -5) return this.severityLevels.CRITICAL;
    if (zScore < -4) return this.severityLevels.HIGH;
    if (zScore < -3.5) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  calculateVolatilitySeverity(absZScore) {
    if (absZScore > 4) return this.severityLevels.HIGH;
    if (absZScore > 3) return this.severityLevels.MEDIUM;
    return this.severityLevels.LOW;
  }

  // Field identification methods
  identifyTimestampField(data) {
    if (!data || data.length === 0) return null;
    
    const sampleRow = data[0];
    const timestampFields = ['timestamp', 'date', 'created_at', 'updated_at', 'time'];
    
    for (const field of timestampFields) {
      if (sampleRow.hasOwnProperty(field)) {
        return field;
      }
    }
    
    // Look for date-like values
    for (const [key, value] of Object.entries(sampleRow)) {
      if (moment(value).isValid()) {
        return key;
      }
    }
    
    return null;
  }

  identifyValueField(data) {
    if (!data || data.length === 0) return null;
    
    const sampleRow = data[0];
    const numericFields = this.identifyNumericFields(data);
    
    // Prefer common value field names
    const valueFields = ['value', 'amount', 'total', 'count', 'revenue', 'sales'];
    for (const field of valueFields) {
      if (numericFields.includes(field)) {
        return field;
      }
    }
    
    // Return first numeric field
    return numericFields[0] || null;
  }

  identifyNumericFields(data) {
    if (!data || data.length === 0) return [];
    
    const sampleRow = data[0];
    const numericFields = [];
    
    Object.entries(sampleRow).forEach(([key, value]) => {
      if (typeof value === 'number' || (!isNaN(parseFloat(value)) && isFinite(value))) {
        numericFields.push(key);
      }
    });
    
    return numericFields;
  }

  getTimeRange(data) {
    const timestampField = this.identifyTimestampField(data);
    if (!timestampField) return null;
    
    const timestamps = data
      .map(row => moment(row[timestampField]))
      .filter(m => m.isValid())
      .sort((a, b) => a.valueOf() - b.valueOf());
    
    if (timestamps.length === 0) return null;
    
    return {
      start: timestamps[0].toISOString(),
      end: timestamps[timestamps.length - 1].toISOString(),
      duration: timestamps[timestamps.length - 1].diff(timestamps[0], 'days')
    };
  }

  getTrendRecommendation(trendPattern) {
    if (trendPattern.direction === 'increasing') {
      if (trendPattern.severity === this.severityLevels.HIGH) {
        return 'Monitor for sustainability and potential market saturation';
      }
      return 'Continue current strategies to maintain positive growth';
    } else {
      if (trendPattern.severity === this.severityLevels.HIGH) {
        return 'Immediate action required to address declining trend';
      }
      return 'Investigate causes and implement corrective measures';
    }
  }

  analyzeForecastTrend(forecast) {
    const values = forecast.forecast.map(f => f.value);
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const changePercent = ((lastValue - firstValue) / firstValue) * 100;
    
    let severity = this.severityLevels.LOW;
    let description = '';
    let recommendation = '';
    
    if (Math.abs(changePercent) > 25) {
      severity = this.severityLevels.HIGH;
      if (changePercent > 0) {
        description = `Forecast shows strong growth of ${changePercent.toFixed(1)}%`;
        recommendation = 'Prepare for increased demand and scale resources accordingly';
      } else {
        description = `Forecast shows significant decline of ${Math.abs(changePercent).toFixed(1)}%`;
        recommendation = 'Develop contingency plans to address projected decline';
      }
    } else if (Math.abs(changePercent) > 10) {
      severity = this.severityLevels.MEDIUM;
      description = `Forecast shows moderate ${changePercent > 0 ? 'growth' : 'decline'} of ${Math.abs(changePercent).toFixed(1)}%`;
      recommendation = 'Monitor trends closely and adjust strategies as needed';
    } else {
      description = 'Forecast shows stable trend with minimal change';
      recommendation = 'Maintain current strategies and monitor for changes';
    }
    
    return { severity, description, recommendation };
  }
}

module.exports = new AnomalyDetectionService();