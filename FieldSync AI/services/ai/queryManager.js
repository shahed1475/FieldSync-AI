const { Query, QueryCache, DataSource } = require('../../models');
const { Op } = require('sequelize');
const crypto = require('crypto');
const queryOptimizer = require('./queryOptimizer');

class QueryManager {
  constructor() {
    this.cacheExpiryTime = 3600000; // 1 hour in milliseconds
    this.maxCacheSize = 1000; // Maximum number of cached queries
  }

  async saveQuery(queryData, organizationId, userId = null) {
    try {
      // Analyze query performance if SQL is available
      let optimizationAnalysis = null;
      if (queryData.sql && queryData.sql !== 'CACHED' && queryData.success) {
        optimizationAnalysis = queryOptimizer.analyzeQuery(
          queryData.sql,
          queryData.executionTime,
          queryData.rowCount,
          queryData.dataSourceType || 'unknown'
        );
      }

      const metadata = {
        entities: queryData.entities,
        timeframe: queryData.timeframe,
        metrics: queryData.metrics,
        dimensions: queryData.dimensions,
        columns: queryData.columns,
        optimizations: queryData.optimizations,
        optimization_analysis: optimizationAnalysis
      };

      const query = await Query.create({
        org_id: organizationId,
        user_id: userId,
        data_source_id: queryData.dataSourceId,
        natural_language: queryData.naturalLanguage,
        sql_generated: queryData.sql,
        intent: queryData.intent,
        confidence: queryData.confidence,
        results: queryData.success ? { data: queryData.data, columns: queryData.columns } : null,
        execution_time_ms: queryData.executionTime,
        row_count: queryData.rowCount,
        status: queryData.success ? 'completed' : 'failed',
        error_message: queryData.error || null,
        metadata
      });

      // Store results in cache if successful
      if (queryData.success && queryData.data) {
        const queryHash = this.generateCacheKey(queryData.naturalLanguage, organizationId, queryData.dataSourceId);
        await this.cacheQueryResult(queryHash, { data: queryData.data, columns: queryData.columns });
      }

      return query;
    } catch (error) {
      console.error('Error saving query:', error);
      throw new Error(`Failed to save query: ${error.message}`);
    }
  }

  async getQuery(queryId, organizationId) {
    try {
      const query = await Query.findOne({
        where: { 
          id: queryId, 
          org_id: organizationId 
        },
        include: [
          {
            model: DataSource,
            attributes: ['id', 'name', 'type']
          }
        ]
      });

      if (!query) {
        throw new Error('Query not found');
      }

      // Parse metadata
      const metadata = query.metadata || {};

      return {
        ...query.toJSON(),
        metadata
      };
    } catch (error) {
      console.error('Error retrieving query:', error);
      throw new Error(`Failed to retrieve query: ${error.message}`);
    }
  }

  async getQueryHistory(organizationId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        dataSourceId,
        status,
        intent,
        startDate,
        endDate,
        search
      } = options;

      const whereClause = { org_id: organizationId };

      if (dataSourceId) {
        whereClause.data_source_id = dataSourceId;
      }

      if (status) {
        whereClause.status = status;
      }

      if (intent) {
        whereClause.intent = intent;
      }

      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
        if (endDate) whereClause.created_at[Op.lte] = new Date(endDate);
      }

      if (search) {
        whereClause[Op.or] = [
          { natural_language: { [Op.iLike]: `%${search}%` } },
          { sql_generated: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const queries = await Query.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: DataSource,
            attributes: ['id', 'name', 'type']
          }
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      return {
        queries: queries.rows.map(query => ({
          ...query.toJSON(),
          metadata: query.metadata || {}
        })),
        total: queries.count,
        limit,
        offset
      };
    } catch (error) {
      console.error('Error retrieving query history:', error);
      throw new Error(`Failed to retrieve query history: ${error.message}`);
    }
  }

  async cacheQueryResult(queryHash, results) {
    try {
      // Clean up old cache entries if we're at the limit
      await this.cleanupCache();

      await QueryCache.setCache(queryHash, results, Math.floor(this.cacheExpiryTime / 60000));

      return queryHash;
    } catch (error) {
      console.error('Error caching query result:', error);
      // Don't throw error for caching failures
      return null;
    }
  }

  async getCachedResult(queryIdOrHash, organizationId = null) {
    try {
      let cacheKey = queryIdOrHash;
      if (organizationId) {
        const query = await Query.findOne({
          where: { id: queryIdOrHash, org_id: organizationId }
        });
        if (!query) return null;
        cacheKey = this.generateCacheKey(query.natural_language, organizationId, query.data_source_id);
      }

      const cached = await QueryCache.getCached(cacheKey);
      if (!cached) return null;

      return {
        data: cached.data || cached.results || cached,
        columns: cached.columns || [],
        cached_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error retrieving cached result:', error);
      return null;
    }
  }

  async findSimilarQueries(naturalLanguageQuery, organizationId, dataSourceId, limit = 5) {
    try {
      // Simple similarity search based on keywords
      const keywords = this.extractKeywords(naturalLanguageQuery);
      const keywordPattern = keywords.join('|');

      const similarQueries = await Query.findAll({
        where: {
          org_id: organizationId,
          data_source_id: dataSourceId,
          status: 'completed',
          natural_language: {
            [Op.iLike]: `%${keywords[0] || naturalLanguageQuery}%`
          }
        },
        order: [['created_at', 'DESC']],
        limit
      });

      return similarQueries.map(query => ({
        ...query.toJSON(),
        metadata: query.metadata || {}
      }));
    } catch (error) {
      console.error('Error finding similar queries:', error);
      return [];
    }
  }

  async getQueryAnalytics(organizationId, timeframe = '30d') {
    try {
      const startDate = this.getStartDateForTimeframe(timeframe);
      
      const analytics = await Query.findAll({
        where: {
          org_id: organizationId,
          created_at: { [Op.gte]: startDate }
        },
        attributes: [
          'status',
          'intent',
          'data_source_id',
          'execution_time_ms',
          'row_count',
          'created_at'
        ],
        include: [
          {
            model: DataSource,
            attributes: ['name', 'type']
          }
        ]
      });

      return this.processAnalytics(analytics);
    } catch (error) {
      console.error('Error retrieving query analytics:', error);
      throw new Error(`Failed to retrieve query analytics: ${error.message}`);
    }
  }

  async updateQueryFeedback(queryId, organizationId, feedback) {
    try {
      const query = await Query.findOne({
        where: { id: queryId, org_id: organizationId }
      });

      if (!query) {
        throw new Error('Query not found');
      }

      const metadata = query.metadata || {};

      metadata.feedback = {
        ...metadata.feedback,
        ...feedback,
        updated_at: new Date()
      };

      await query.update({ metadata });

      return query;
    } catch (error) {
      console.error('Error updating query feedback:', error);
      throw new Error(`Failed to update query feedback: ${error.message}`);
    }
  }

  generateCacheKey(queryText, organizationId, dataSourceId) {
    const basis = `${organizationId || 'org'}:${dataSourceId || 'ds'}:${queryText || ''}`.toLowerCase();
    return crypto.createHash('sha256').update(basis).digest('hex');
  }

  async cleanupCache() {
    try {
      const cacheCount = await QueryCache.count();
      
      if (cacheCount >= this.maxCacheSize) {
        // Remove oldest 10% of cache entries
        const removeCount = Math.floor(this.maxCacheSize * 0.1);
        
        const oldestEntries = await QueryCache.findAll({
          order: [['created_at', 'ASC']],
          limit: removeCount,
          attributes: ['query_hash']
        });

        const hashesToRemove = oldestEntries.map(entry => entry.query_hash);
        
        await QueryCache.destroy({
          where: { query_hash: { [Op.in]: hashesToRemove } }
        });
      }

      // Also remove expired entries
      await QueryCache.destroy({
        where: {
          expiry: { [Op.lt]: new Date() }
        }
      });
    } catch (error) {
      console.error('Error cleaning up cache:', error);
    }
  }

  extractKeywords(text) {
    // Simple keyword extraction
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['show', 'give', 'tell', 'what', 'when', 'where', 'how'].includes(word));
  }

  getStartDateForTimeframe(timeframe) {
    const now = new Date();
    
    switch (timeframe) {
      case '1d':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '1y':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  processAnalytics(queries) {
    const analytics = {
      total_queries: queries.length,
      successful_queries: 0,
      failed_queries: 0,
      avg_execution_time: 0,
      avg_row_count: 0,
      intents: {},
      data_sources: {},
      daily_counts: {},
      performance_metrics: {
        fast_queries: 0, // < 1s
        medium_queries: 0, // 1-5s
        slow_queries: 0 // > 5s
      }
    };

    let totalExecutionTime = 0;
    let totalRowCount = 0;
    let validExecutionTimes = 0;
    let validRowCounts = 0;

    queries.forEach(query => {
      // Status counts
      if (query.status === 'completed') {
        analytics.successful_queries++;
      } else {
        analytics.failed_queries++;
      }

      // Intent counts
      if (query.intent) {
        analytics.intents[query.intent] = (analytics.intents[query.intent] || 0) + 1;
      }

      // Data source counts
      if (query.DataSource) {
        const dsKey = `${query.DataSource.name} (${query.DataSource.type})`;
        analytics.data_sources[dsKey] = (analytics.data_sources[dsKey] || 0) + 1;
      }

      // Daily counts
      const date = query.created_at.toISOString().split('T')[0];
      analytics.daily_counts[date] = (analytics.daily_counts[date] || 0) + 1;

      // Execution time metrics
      if (query.execution_time_ms && query.execution_time_ms > 0) {
        totalExecutionTime += query.execution_time_ms;
        validExecutionTimes++;

        if (query.execution_time_ms < 1000) {
          analytics.performance_metrics.fast_queries++;
        } else if (query.execution_time_ms < 5000) {
          analytics.performance_metrics.medium_queries++;
        } else {
          analytics.performance_metrics.slow_queries++;
        }
      }

      // Row count metrics
      if (query.row_count && query.row_count > 0) {
        totalRowCount += query.row_count;
        validRowCounts++;
      }
    });

    // Calculate averages
    analytics.avg_execution_time = validExecutionTimes > 0 
      ? Math.round(totalExecutionTime / validExecutionTimes) 
      : 0;
    
    analytics.avg_row_count = validRowCounts > 0 
      ? Math.round(totalRowCount / validRowCounts) 
      : 0;

    // Success rate
    analytics.success_rate = analytics.total_queries > 0 
      ? Math.round((analytics.successful_queries / analytics.total_queries) * 100) 
      : 0;

    return analytics;
  }

  async getOptimizationReport(organizationId, timeframe = '30d') {
    try {
      const startDate = this.getStartDateForTimeframe(timeframe);
      
      const queries = await Query.findAll({
        where: {
          org_id: organizationId,
          created_at: { [Op.gte]: startDate },
          status: 'completed',
          sql_generated: { [Op.ne]: null }
        },
        attributes: ['metadata', 'execution_time_ms', 'row_count']
      });

      const analyses = queries.map(query => {
        const metadata = query.metadata || {};
        return metadata.optimization_analysis;
      }).filter(analysis => analysis !== null);

      return queryOptimizer.generateOptimizationReport(analyses);
    } catch (error) {
      console.error('Error generating optimization report:', error);
      throw new Error(`Failed to generate optimization report: ${error.message}`);
    }
  }

  async deleteQuery(queryId, organizationId) {
    try {
      const query = await Query.findOne({
        where: { id: queryId, org_id: organizationId }
      });

      if (!query) {
        throw new Error('Query not found');
      }

      // Delete associated cache entries
      const cacheKey = this.generateCacheKey(query.natural_language, organizationId, query.data_source_id);
      await QueryCache.destroy({ where: { query_hash: cacheKey } });

      // Delete the query
      await query.destroy();

      return true;
    } catch (error) {
      console.error('Error deleting query:', error);
      throw new Error(`Failed to delete query: ${error.message}`);
    }
  }
}

module.exports = new QueryManager();
