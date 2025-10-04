const { Op } = require('sequelize');

/**
 * Query optimization utilities for better performance
 */
class QueryOptimizer {
  /**
   * Add pagination to a query
   * @param {Object} options - Query options
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Items per page
   * @returns {Object} Paginated query options
   */
  static paginate(options = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    return {
      ...options,
      limit: Math.min(limit, 100), // Cap at 100 items per page
      offset: Math.max(offset, 0)
    };
  }

  /**
   * Build optimized where clause with proper indexing
   * @param {Object} filters - Filter conditions
   * @param {Array} indexedFields - Fields that have database indexes
   * @returns {Object} Optimized where clause
   */
  static buildWhereClause(filters = {}, indexedFields = []) {
    const where = {};
    
    // Process indexed fields first for better performance
    indexedFields.forEach(field => {
      if (filters[field] !== undefined) {
        where[field] = filters[field];
      }
    });
    
    // Process other filters
    Object.keys(filters).forEach(key => {
      if (!indexedFields.includes(key) && filters[key] !== undefined) {
        where[key] = filters[key];
      }
    });
    
    return where;
  }

  /**
   * Optimize search queries with proper indexing
   * @param {string} searchTerm - Search term
   * @param {Array} searchFields - Fields to search in
   * @param {Array} indexedFields - Fields with text indexes
   * @returns {Object} Optimized search clause
   */
  static buildSearchClause(searchTerm, searchFields = [], indexedFields = []) {
    if (!searchTerm || !searchFields.length) {
      return {};
    }

    const searchConditions = [];
    
    // Use indexed fields first for better performance
    const indexedSearchFields = searchFields.filter(field => indexedFields.includes(field));
    const nonIndexedFields = searchFields.filter(field => !indexedFields.includes(field));
    
    // Process indexed fields with ILIKE for PostgreSQL
    indexedSearchFields.forEach(field => {
      searchConditions.push({
        [field]: {
          [Op.iLike]: `%${searchTerm}%`
        }
      });
    });
    
    // Process non-indexed fields
    nonIndexedFields.forEach(field => {
      searchConditions.push({
        [field]: {
          [Op.iLike]: `%${searchTerm}%`
        }
      });
    });
    
    return searchConditions.length > 0 ? { [Op.or]: searchConditions } : {};
  }

  /**
   * Build date range filters with proper indexing
   * @param {string} dateField - Date field name
   * @param {string} startDate - Start date (ISO string)
   * @param {string} endDate - End date (ISO string)
   * @returns {Object} Date range filter
   */
  static buildDateRangeFilter(dateField, startDate, endDate) {
    const dateFilter = {};
    
    if (startDate || endDate) {
      dateFilter[dateField] = {};
      
      if (startDate) {
        dateFilter[dateField][Op.gte] = new Date(startDate);
      }
      
      if (endDate) {
        dateFilter[dateField][Op.lte] = new Date(endDate);
      }
    }
    
    return dateFilter;
  }

  /**
   * Optimize includes for eager loading
   * @param {Array} includes - Include options
   * @param {Object} options - Additional options
   * @returns {Array} Optimized includes
   */
  static optimizeIncludes(includes = [], options = {}) {
    return includes.map(include => {
      const optimizedInclude = { ...include };
      
      // Add attributes selection to reduce data transfer
      if (!optimizedInclude.attributes && options.selectFields) {
        optimizedInclude.attributes = options.selectFields[include.model?.name] || 
                                    options.selectFields[include.as] || 
                                    ['id', 'name', 'created_at'];
      }
      
      // Optimize nested includes
      if (optimizedInclude.include) {
        optimizedInclude.include = this.optimizeIncludes(optimizedInclude.include, options);
      }
      
      return optimizedInclude;
    });
  }

  /**
   * Build sorting options with index optimization
   * @param {string} sortBy - Field to sort by
   * @param {string} sortOrder - Sort order (ASC/DESC)
   * @param {Array} indexedFields - Fields with indexes
   * @returns {Array} Sequelize order array
   */
  static buildSortOptions(sortBy = 'created_at', sortOrder = 'DESC', indexedFields = []) {
    // Default to indexed field if available
    if (!indexedFields.includes(sortBy) && indexedFields.length > 0) {
      console.warn(`Sorting by non-indexed field: ${sortBy}. Consider adding an index.`);
    }
    
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return [[sortBy, order]];
  }

  /**
   * Create prepared statement options for complex queries
   * @param {string} queryName - Name for the prepared statement
   * @param {Object} options - Query options
   * @returns {Object} Prepared statement options
   */
  static createPreparedStatement(queryName, options = {}) {
    return {
      ...options,
      benchmark: true,
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      raw: false,
      nest: true
    };
  }

  /**
   * Optimize bulk operations
   * @param {Array} data - Data to process
   * @param {number} batchSize - Batch size for processing
   * @returns {Array} Batched data
   */
  static batchData(data, batchSize = 100) {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Build aggregation queries with proper grouping
   * @param {Object} options - Aggregation options
   * @returns {Object} Optimized aggregation query
   */
  static buildAggregationQuery(options = {}) {
    const {
      groupBy = [],
      having = {},
      attributes = [],
      where = {}
    } = options;

    return {
      attributes,
      where,
      group: groupBy,
      having: Object.keys(having).length > 0 ? having : undefined,
      raw: true,
      nest: false
    };
  }

  /**
   * Optimize count queries
   * @param {Object} where - Where conditions
   * @param {Object} options - Additional options
   * @returns {Object} Optimized count query
   */
  static buildCountQuery(where = {}, options = {}) {
    return {
      where,
      distinct: options.distinct || false,
      col: options.countField || 'id',
      logging: false
    };
  }

  /**
   * Create index recommendations based on query patterns
   * @param {Object} queryStats - Query statistics
   * @returns {Array} Index recommendations
   */
  static getIndexRecommendations(queryStats = {}) {
    const recommendations = [];
    
    // Analyze frequent WHERE conditions
    if (queryStats.frequentFilters) {
      queryStats.frequentFilters.forEach(field => {
        recommendations.push({
          type: 'single_column',
          field,
          reason: 'Frequently used in WHERE clauses'
        });
      });
    }
    
    // Analyze frequent ORDER BY fields
    if (queryStats.frequentSorts) {
      queryStats.frequentSorts.forEach(field => {
        recommendations.push({
          type: 'single_column',
          field,
          reason: 'Frequently used in ORDER BY clauses'
        });
      });
    }
    
    // Analyze frequent JOIN conditions
    if (queryStats.frequentJoins) {
      queryStats.frequentJoins.forEach(join => {
        recommendations.push({
          type: 'foreign_key',
          field: join.field,
          reason: 'Frequently used in JOIN operations'
        });
      });
    }
    
    return recommendations;
  }

  /**
   * Monitor query performance
   * @param {Function} queryFn - Query function to monitor
   * @param {string} queryName - Name of the query
   * @returns {Function} Wrapped query function
   */
  static monitorQuery(queryFn, queryName) {
    return async (...args) => {
      const startTime = Date.now();
      
      try {
        const result = await queryFn(...args);
        const duration = Date.now() - startTime;
        
        if (duration > 1000) { // Log slow queries (>1s)
          console.warn(`Slow query detected: ${queryName} took ${duration}ms`);
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`Query failed: ${queryName} after ${duration}ms`, error.message);
        throw error;
      }
    };
  }
}

module.exports = QueryOptimizer;