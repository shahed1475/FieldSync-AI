// Using native JavaScript instead of lodash for better compatibility
const ss = require('simple-statistics');

/**
 * AI-powered chart recommendation service
 * Analyzes query results and data characteristics to recommend optimal chart types
 */
class ChartRecommender {
  constructor() {
    // Chart type definitions with their characteristics
    this.chartTypes = {
      bar: {
        name: 'Bar Chart',
        description: 'Best for comparing categories or showing rankings',
        suitability: ['categorical', 'comparison', 'ranking'],
        maxCategories: 20,
        minDataPoints: 2,
        supportsTime: false,
        supportsMultipleSeries: true
      },
      line: {
        name: 'Line Chart',
        description: 'Ideal for showing trends over time',
        suitability: ['time_series', 'trend', 'continuous'],
        maxCategories: 50,
        minDataPoints: 3,
        supportsTime: true,
        supportsMultipleSeries: true
      },
      pie: {
        name: 'Pie Chart',
        description: 'Perfect for showing parts of a whole',
        suitability: ['composition', 'percentage', 'parts_whole'],
        maxCategories: 8,
        minDataPoints: 2,
        supportsTime: false,
        supportsMultipleSeries: false
      },
      donut: {
        name: 'Donut Chart',
        description: 'Modern alternative to pie chart with better readability',
        suitability: ['composition', 'percentage', 'parts_whole'],
        maxCategories: 10,
        minDataPoints: 2,
        supportsTime: false,
        supportsMultipleSeries: false
      },
      area: {
        name: 'Area Chart',
        description: 'Shows cumulative totals over time',
        suitability: ['time_series', 'cumulative', 'volume'],
        maxCategories: 30,
        minDataPoints: 4,
        supportsTime: true,
        supportsMultipleSeries: true
      },
      scatter: {
        name: 'Scatter Plot',
        description: 'Reveals correlations between two variables',
        suitability: ['correlation', 'distribution', 'relationship'],
        maxCategories: 1000,
        minDataPoints: 10,
        supportsTime: false,
        supportsMultipleSeries: true
      },
      heatmap: {
        name: 'Heatmap',
        description: 'Shows patterns in large datasets with color intensity',
        suitability: ['matrix', 'density', 'pattern'],
        maxCategories: 100,
        minDataPoints: 20,
        supportsTime: false,
        supportsMultipleSeries: false
      },
      histogram: {
        name: 'Histogram',
        description: 'Shows distribution of numerical data',
        suitability: ['distribution', 'frequency', 'statistical'],
        maxCategories: 50,
        minDataPoints: 20,
        supportsTime: false,
        supportsMultipleSeries: false
      },
      box: {
        name: 'Box Plot',
        description: 'Displays statistical distribution with quartiles',
        suitability: ['statistical', 'outliers', 'distribution'],
        maxCategories: 10,
        minDataPoints: 5,
        supportsTime: false,
        supportsMultipleSeries: true
      },
      gauge: {
        name: 'Gauge Chart',
        description: 'Shows single value against a target or range',
        suitability: ['kpi', 'single_value', 'target'],
        maxCategories: 1,
        minDataPoints: 1,
        supportsTime: false,
        supportsMultipleSeries: false
      }
    };
  }

  /**
   * Recommend chart types based on query results and data characteristics
   * @param {Array} data - Query result data
   * @param {Object} metadata - Query metadata including intent and entities
   * @returns {Object} Chart recommendations with scores and configurations
   */
  async recommendCharts(data, metadata = {}) {
    try {
      if (!data || data.length === 0) {
        return {
          recommendations: [],
          error: 'No data provided for chart recommendation'
        };
      }

      // Analyze data characteristics
      const analysis = this.analyzeData(data);
      
      // Score each chart type
      const scores = this.scoreChartTypes(analysis, metadata);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(scores, analysis, metadata);
      
      return {
        recommendations,
        dataAnalysis: analysis,
        totalDataPoints: data.length
      };
    } catch (error) {
      console.error('Chart recommendation error:', error);
      return {
        recommendations: [],
        error: error.message
      };
    }
  }

  /**
   * Analyze query result data to understand patterns and characteristics
   * @param {Array} data - Query result data
   * @returns {Object} Analysis results
   */
  analyzeData(data) {
    if (!data || data.length === 0) {
      return { columns: {}, patterns: [], rowCount: 0 };
    }

    const analysis = {
      columns: {},
      patterns: [],
      rowCount: data.length,
      correlations: {}
    };

    // Analyze each column
    const columns = Object.keys(data[0] || {});
    columns.forEach(column => {
      const values = data.map(row => row[column]).filter(v => v !== null && v !== undefined);
      
      analysis.columns[column] = {
        type: this.detectDataType(values),
        uniqueCount: new Set(values).size,
        nullCount: data.length - values.length,
        isTime: this.isTimeColumn(column, values)
      };

      // Add statistics for numeric columns
      if (analysis.columns[column].type === 'numeric') {
        const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
        if (numericValues.length > 0) {
          analysis.columns[column].statistics = {
            min: Math.min(...numericValues),
            max: Math.max(...numericValues),
            mean: ss.mean(numericValues),
            median: ss.median(numericValues),
            standardDeviation: ss.standardDeviation(numericValues),
            variance: ss.variance(numericValues)
          };
        }
      }
    });

    // Detect patterns
    if (this.detectTimeSeriesPattern(analysis)) analysis.patterns.push('time_series');
    if (this.detectCategoricalPattern(analysis)) analysis.patterns.push('categorical');
    if (this.detectCorrelationPattern(data, analysis)) analysis.patterns.push('correlation');
    if (this.detectCompositionPattern(analysis)) analysis.patterns.push('composition');
    if (this.detectDistributionPattern(analysis)) analysis.patterns.push('distribution');

    return analysis;
  }

  /**
   * Detect data type of column values
   * @param {Array} values - Column values
   * @returns {string} Data type
   */
  detectDataType(values) {
    if (values.length === 0) return 'unknown';

    const sample = values.slice(0, 100); // Sample for performance
    let numericCount = 0;
    let dateCount = 0;
    let stringCount = 0;

    sample.forEach(value => {
      if (!isNaN(value) && !isNaN(parseFloat(value))) {
        numericCount++;
      } else if (this.isDateString(value)) {
        dateCount++;
      } else {
        stringCount++;
      }
    });

    const total = sample.length;
    if (numericCount / total > 0.8) return 'numeric';
    if (dateCount / total > 0.8) return 'date';
    return 'categorical';
  }

  /**
   * Check if column contains time/date data
   * @param {string} column - Column name
   * @param {Array} values - Column values
   * @returns {boolean} Is time column
   */
  isTimeColumn(column, values) {
    const timeKeywords = ['date', 'time', 'created', 'updated', 'timestamp', 'year', 'month', 'day'];
    const columnLower = column.toLowerCase();
    
    // Check column name
    if (timeKeywords.some(keyword => columnLower.includes(keyword))) {
      return true;
    }

    // Check values
    const sample = values.slice(0, 10);
    const dateCount = sample.filter(v => this.isDateString(v)).length;
    return dateCount / sample.length > 0.7;
  }

  /**
   * Check if string represents a date
   * @param {*} value - Value to check
   * @returns {boolean} Is date string
   */
  isDateString(value) {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.length > 4;
  }

  /**
   * Detect time series patterns
   * @param {Object} analysis - Data analysis
   * @returns {boolean} Has time series pattern
   */
  detectTimeSeriesPattern(analysis) {
    return Object.keys(analysis.columns).some(col => analysis.columns[col].isTime);
  }

  /**
   * Detect categorical data patterns
   * @param {Object} analysis - Data analysis
   * @returns {boolean} Has categorical pattern
   */
  detectCategoricalPattern(analysis) {
    const categoricalColumns = Object.keys(analysis.columns).filter(
      col => analysis.columns[col].type === 'categorical'
    );
    return categoricalColumns.length > 0;
  }

  /**
   * Detect correlation patterns between numeric columns
   * @param {Array} data - Original data
   * @param {Object} analysis - Data analysis
   * @returns {boolean} Has correlation pattern
   */
  detectCorrelationPattern(data, analysis) {
    const numericColumns = Object.keys(analysis.columns).filter(
      col => analysis.columns[col].type === 'numeric'
    );
    
    // Calculate correlation if we have multiple numeric fields
    if (numericColumns.length >= 2) {
      const correlations = {};
      for (let i = 0; i < numericColumns.length; i++) {
        for (let j = i + 1; j < numericColumns.length; j++) {
          const field1 = numericColumns[i];
          const field2 = numericColumns[j];
          const values1 = data.map(row => parseFloat(row[field1])).filter(v => !isNaN(v));
          const values2 = data.map(row => parseFloat(row[field2])).filter(v => !isNaN(v));
          
          if (values1.length === values2.length && values1.length > 1) {
            try {
              correlations[`${field1}_${field2}`] = ss.sampleCorrelation(values1, values2);
            } catch (error) {
              correlations[`${field1}_${field2}`] = 0;
            }
          }
        }
      }
      analysis.correlations = correlations;
    }
    
    return numericColumns.length >= 2;
  }

  /**
   * Detect composition patterns (parts of whole)
   * @param {Object} analysis - Data analysis
   * @returns {boolean} Has composition pattern
   */
  detectCompositionPattern(analysis) {
    const numericColumns = Object.keys(analysis.columns).filter(
      col => analysis.columns[col].type === 'numeric'
    );
    
    if (numericColumns.length === 1) {
      const categoricalColumns = Object.keys(analysis.columns).filter(
        col => analysis.columns[col].type === 'categorical'
      );
      return categoricalColumns.length === 1 && analysis.rowCount <= 10;
    }
    return false;
  }

  /**
   * Detect distribution patterns
   * @param {Object} analysis - Data analysis
   * @returns {boolean} Has distribution pattern
   */
  detectDistributionPattern(analysis) {
    const numericColumns = Object.keys(analysis.columns).filter(
      col => analysis.columns[col].type === 'numeric'
    );
    return numericColumns.length === 1 && analysis.rowCount > 20;
  }

  /**
   * Score each chart type based on data analysis and metadata
   * @param {Object} analysis - Data analysis
   * @param {Object} metadata - Query metadata
   * @returns {Object} Chart type scores
   */
  scoreChartTypes(analysis, metadata) {
    const scores = {};

    Object.keys(this.chartTypes).forEach(chartType => {
      scores[chartType] = this.calculateChartScore(chartType, analysis, metadata);
    });

    return scores;
  }

  /**
   * Calculate score for a specific chart type
   * @param {string} chartType - Chart type to score
   * @param {Object} analysis - Data analysis
   * @param {Object} metadata - Query metadata
   * @returns {number} Score (0-100)
   */
  calculateChartScore(chartType, analysis, metadata) {
    const chart = this.chartTypes[chartType];
    let score = 0;

    // Base compatibility score
    if (analysis.rowCount >= chart.minDataPoints && analysis.rowCount <= chart.maxCategories) {
      score += 30;
    } else if (analysis.rowCount < chart.minDataPoints) {
      return 0; // Not suitable
    }

    // Pattern matching score
    if (analysis.patterns.timeSeries && chart.supportsTime) {
      score += 25;
    }
    if (analysis.patterns.categorical && chart.suitability.includes('categorical')) {
      score += 20;
    }
    if (analysis.patterns.numerical && chart.suitability.includes('comparison')) {
      score += 20;
    }
    if (analysis.patterns.composition && chart.suitability.includes('composition')) {
      score += 30;
    }
    if (analysis.patterns.correlation && chart.suitability.includes('correlation')) {
      score += 25;
    }
    if (analysis.patterns.distribution && chart.suitability.includes('distribution')) {
      score += 25;
    }

    // Intent-based scoring
    if (metadata.intent) {
      const intent = metadata.intent.toLowerCase();
      if (intent.includes('trend') && chart.suitability.includes('trend')) {
        score += 15;
      }
      if (intent.includes('compare') && chart.suitability.includes('comparison')) {
        score += 15;
      }
      if (intent.includes('distribution') && chart.suitability.includes('distribution')) {
        score += 15;
      }
    }

    // Data size penalties
    if (analysis.rowCount > chart.maxCategories) {
      score -= 20;
    }

    // Multiple series bonus
    if (analysis.columnCount > 2 && chart.supportsMultipleSeries) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate final chart recommendations
   * @param {Object} scores - Chart type scores
   * @param {Object} analysis - Data analysis
   * @param {Object} metadata - Query metadata
   * @returns {Array} Sorted recommendations
   */
  generateRecommendations(scores, analysis, metadata) {
    const recommendations = Object.keys(scores)
      .filter(chartType => scores[chartType] > 0)
      .map(chartType => ({
        type: chartType,
        name: this.chartTypes[chartType].name,
        description: this.chartTypes[chartType].description,
        score: scores[chartType],
        confidence: this.calculateConfidence(scores[chartType]),
        configuration: this.generateChartConfiguration(chartType, analysis, metadata),
        reasoning: this.generateReasoning(chartType, analysis, metadata)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 recommendations

    return recommendations;
  }

  /**
   * Calculate confidence level based on score
   * @param {number} score - Chart score
   * @returns {string} Confidence level
   */
  calculateConfidence(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'low';
    return 'very_low';
  }

  /**
   * Generate chart configuration based on data analysis
   * @param {string} chartType - Chart type
   * @param {Object} analysis - Data analysis
   * @param {Object} metadata - Query metadata
   * @returns {Object} Chart configuration
   */
  generateChartConfiguration(chartType, analysis, metadata) {
    const config = {
      type: chartType,
      responsive: true,
      maintainAspectRatio: false
    };

    // Determine axes
    const columns = Object.keys(analysis.columns);
    const categoricalColumns = columns.filter(col => analysis.columns[col].type === 'categorical');
    const numericColumns = columns.filter(col => analysis.columns[col].type === 'numeric');
    const timeColumns = columns.filter(col => analysis.columns[col].type === 'date');

    // X-axis configuration
    if (analysis.patterns.timeSeries && timeColumns.length > 0) {
      config.xAxis = timeColumns[0];
      config.xAxisType = 'time';
    } else if (categoricalColumns.length > 0) {
      config.xAxis = categoricalColumns[0];
      config.xAxisType = 'category';
    }

    // Y-axis configuration
    if (numericColumns.length > 0) {
      config.yAxis = numericColumns[0];
      config.yAxisType = 'linear';
    }

    // Series configuration
    if (chartType === 'scatter' && numericColumns.length >= 2) {
      config.xAxis = numericColumns[0];
      config.yAxis = numericColumns[1];
    }

    // Color scheme
    config.colorScheme = this.selectColorScheme(chartType, analysis.rowCount);

    // Chart-specific configurations
    switch (chartType) {
      case 'pie':
      case 'donut':
        config.showLabels = analysis.rowCount <= 8;
        config.showPercentages = true;
        break;
      case 'line':
      case 'area':
        config.smooth = true;
        config.showPoints = analysis.rowCount <= 50;
        break;
      case 'bar':
        config.orientation = analysis.rowCount > 10 ? 'horizontal' : 'vertical';
        break;
    }

    return config;
  }

  /**
   * Select appropriate color scheme
   * @param {string} chartType - Chart type
   * @param {number} dataPoints - Number of data points
   * @returns {string} Color scheme name
   */
  selectColorScheme(chartType, dataPoints) {
    if (dataPoints <= 3) return 'primary';
    if (dataPoints <= 8) return 'categorical';
    if (chartType === 'heatmap') return 'sequential';
    return 'diverse';
  }

  /**
   * Generate reasoning for chart recommendation
   * @param {string} chartType - Chart type
   * @param {Object} analysis - Data analysis
   * @param {Object} metadata - Query metadata
   * @returns {Array} Reasoning points
   */
  generateReasoning(chartType, analysis, metadata) {
    const reasoning = [];
    const chart = this.chartTypes[chartType];

    // Data structure reasoning
    if (analysis.patterns.timeSeries && chart.supportsTime) {
      reasoning.push('Data contains time series information, perfect for trend visualization');
    }
    if (analysis.patterns.categorical && chart.suitability.includes('categorical')) {
      reasoning.push('Categorical data is well-suited for comparison visualization');
    }
    if (analysis.patterns.composition && chart.suitability.includes('composition')) {
      reasoning.push('Data represents parts of a whole, ideal for composition charts');
    }

    // Data size reasoning
    if (analysis.rowCount <= chart.maxCategories) {
      reasoning.push(`Data size (${analysis.rowCount} points) is optimal for this chart type`);
    }

    // Intent reasoning
    if (metadata.intent) {
      const intent = metadata.intent.toLowerCase();
      if (intent.includes('trend') && chart.suitability.includes('trend')) {
        reasoning.push('Query intent focuses on trends, matching chart capabilities');
      }
      if (intent.includes('compare') && chart.suitability.includes('comparison')) {
        reasoning.push('Query intent involves comparison, suitable for this chart type');
      }
    }

    return reasoning.length > 0 ? reasoning : ['General suitability based on data characteristics'];
  }
}

module.exports = new ChartRecommender();