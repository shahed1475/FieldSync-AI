/**
 * Insights Storage Service
 * Manages AI-detected findings, stores them with severity levels, and provides retrieval methods
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class InsightsStorageService {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '../../data/insights.db');
    this.db = null;
    
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    this.insightTypes = {
      ANOMALY: 'anomaly',
      TREND: 'trend',
      PATTERN: 'pattern',
      FORECAST: 'forecast',
      CORRELATION: 'correlation',
      PERFORMANCE: 'performance',
      ALERT: 'alert'
    };

    this.actionStatuses = {
      NEW: 'new',
      ACKNOWLEDGED: 'acknowledged',
      IN_PROGRESS: 'in_progress',
      RESOLVED: 'resolved',
      DISMISSED: 'dismissed'
    };
  }

  /**
   * Initialize the database and create tables
   */
  async initialize() {
    try {
      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('Error opening insights database:', err);
            reject(err);
            return;
          }

          console.log('Connected to insights database');
          this.createTables()
            .then(() => resolve(true))
            .catch(reject);
        });
      });
    } catch (error) {
      console.error('Failed to initialize insights storage:', error);
      throw error;
    }
  }

  /**
   * Create necessary database tables
   */
  async createTables() {
    try {
      const tables = [
        // Main insights table
        `CREATE TABLE IF NOT EXISTS insights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('anomaly', 'trend', 'pattern', 'forecast', 'correlation', 'performance', 'alert')),
          severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
          confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
          data_source TEXT NOT NULL,
          query_hash TEXT,
          dashboard_id TEXT,
          widget_id TEXT,
          metadata TEXT, -- JSON string
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          status TEXT DEFAULT 'new' CHECK(status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'dismissed')),
          assigned_to TEXT,
          tags TEXT -- JSON array as string
        )`,

        // Insight metrics and measurements
        `CREATE TABLE IF NOT EXISTS insight_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          insight_id INTEGER NOT NULL,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          metric_unit TEXT,
          baseline_value REAL,
          threshold_value REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (insight_id) REFERENCES insights (id) ON DELETE CASCADE
        )`,

        // Insight actions and recommendations
        `CREATE TABLE IF NOT EXISTS insight_actions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          insight_id INTEGER NOT NULL,
          action_type TEXT NOT NULL,
          action_description TEXT NOT NULL,
          priority INTEGER DEFAULT 1,
          estimated_impact TEXT,
          required_resources TEXT,
          deadline DATETIME,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          FOREIGN KEY (insight_id) REFERENCES insights (id) ON DELETE CASCADE
        )`,

        // Insight history for tracking changes
        `CREATE TABLE IF NOT EXISTS insight_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          insight_id INTEGER NOT NULL,
          field_name TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_by TEXT,
          changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (insight_id) REFERENCES insights (id) ON DELETE CASCADE
        )`,

        // Insight relationships (e.g., related insights)
        `CREATE TABLE IF NOT EXISTS insight_relationships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_insight_id INTEGER NOT NULL,
          child_insight_id INTEGER NOT NULL,
          relationship_type TEXT NOT NULL,
          strength REAL DEFAULT 0.5,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (parent_insight_id) REFERENCES insights (id) ON DELETE CASCADE,
          FOREIGN KEY (child_insight_id) REFERENCES insights (id) ON DELETE CASCADE
        )`
      ];

      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_insights_severity ON insights(severity)',
        'CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type)',
        'CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_insights_status ON insights(status)',
        'CREATE INDEX IF NOT EXISTS idx_insights_dashboard ON insights(dashboard_id)',
        'CREATE INDEX IF NOT EXISTS idx_insights_data_source ON insights(data_source)',
        'CREATE INDEX IF NOT EXISTS idx_insight_metrics_insight_id ON insight_metrics(insight_id)',
        'CREATE INDEX IF NOT EXISTS idx_insight_actions_insight_id ON insight_actions(insight_id)',
        'CREATE INDEX IF NOT EXISTS idx_insight_history_insight_id ON insight_history(insight_id)'
      ];

      // Create tables
      for (const tableSQL of tables) {
        await this.runQuery(tableSQL);
      }

      // Create indexes
      for (const indexSQL of indexes) {
        await this.runQuery(indexSQL);
      }

      console.log('Insights database tables created successfully');
      return true;
    } catch (error) {
      console.error('Error creating insights tables:', error);
      throw error;
    }
  }

  /**
   * Store a new insight
   * @param {Object} insight - Insight data
   * @returns {Promise<number>} Insight ID
   */
  async storeInsight(insight) {
    try {
      const {
        title,
        description,
        type,
        severity,
        confidence,
        dataSource,
        queryHash,
        dashboardId,
        widgetId,
        metadata = {},
        expiresAt,
        tags = []
      } = insight;

      // Validate required fields
      if (!title || !description || !type || !severity || !dataSource) {
        throw new Error('Missing required insight fields');
      }

      // Validate severity level
      if (!Object.values(this.severityLevels).includes(severity)) {
        throw new Error(`Invalid severity level: ${severity}`);
      }

      // Validate insight type
      if (!Object.values(this.insightTypes).includes(type)) {
        throw new Error(`Invalid insight type: ${type}`);
      }

      const sql = `
        INSERT INTO insights (
          title, description, type, severity, confidence, data_source,
          query_hash, dashboard_id, widget_id, metadata, expires_at, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        title,
        description,
        type,
        severity,
        confidence || 0.5,
        dataSource,
        queryHash || null,
        dashboardId || null,
        widgetId || null,
        JSON.stringify(metadata),
        expiresAt || null,
        JSON.stringify(tags)
      ];

      const result = await this.runQuery(sql, params);
      const insightId = result.lastID;

      // Store associated metrics if provided
      if (insight.metrics && Array.isArray(insight.metrics)) {
        await this.storeInsightMetrics(insightId, insight.metrics);
      }

      // Store associated actions if provided
      if (insight.actions && Array.isArray(insight.actions)) {
        await this.storeInsightActions(insightId, insight.actions);
      }

      console.log(`Stored insight with ID: ${insightId}`);
      return insightId;
    } catch (error) {
      console.error('Error storing insight:', error);
      throw error;
    }
  }

  /**
   * Store metrics associated with an insight
   * @param {number} insightId - Insight ID
   * @param {Array} metrics - Array of metric objects
   */
  async storeInsightMetrics(insightId, metrics) {
    try {
      const sql = `
        INSERT INTO insight_metrics (
          insight_id, metric_name, metric_value, metric_unit,
          baseline_value, threshold_value
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      for (const metric of metrics) {
        const params = [
          insightId,
          metric.name,
          metric.value,
          metric.unit || null,
          metric.baseline || null,
          metric.threshold || null
        ];

        await this.runQuery(sql, params);
      }

      console.log(`Stored ${metrics.length} metrics for insight ${insightId}`);
    } catch (error) {
      console.error('Error storing insight metrics:', error);
      throw error;
    }
  }

  /**
   * Store actions associated with an insight
   * @param {number} insightId - Insight ID
   * @param {Array} actions - Array of action objects
   */
  async storeInsightActions(insightId, actions) {
    try {
      const sql = `
        INSERT INTO insight_actions (
          insight_id, action_type, action_description, priority,
          estimated_impact, required_resources, deadline
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      for (const action of actions) {
        const params = [
          insightId,
          action.type,
          action.description,
          action.priority || 1,
          action.estimatedImpact || null,
          action.requiredResources || null,
          action.deadline || null
        ];

        await this.runQuery(sql, params);
      }

      console.log(`Stored ${actions.length} actions for insight ${insightId}`);
    } catch (error) {
      console.error('Error storing insight actions:', error);
      throw error;
    }
  }

  /**
   * Retrieve insights with filtering options
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of insights
   */
  async getInsights(filters = {}) {
    try {
      let sql = `
        SELECT i.*, 
               COUNT(im.id) as metrics_count,
               COUNT(ia.id) as actions_count
        FROM insights i
        LEFT JOIN insight_metrics im ON i.id = im.insight_id
        LEFT JOIN insight_actions ia ON i.id = ia.insight_id
      `;

      const conditions = [];
      const params = [];

      // Apply filters
      if (filters.severity) {
        conditions.push('i.severity = ?');
        params.push(filters.severity);
      }

      if (filters.type) {
        conditions.push('i.type = ?');
        params.push(filters.type);
      }

      if (filters.status) {
        conditions.push('i.status = ?');
        params.push(filters.status);
      }

      if (filters.dashboardId) {
        conditions.push('i.dashboard_id = ?');
        params.push(filters.dashboardId);
      }

      if (filters.dataSource) {
        conditions.push('i.data_source = ?');
        params.push(filters.dataSource);
      }

      if (filters.minConfidence) {
        conditions.push('i.confidence >= ?');
        params.push(filters.minConfidence);
      }

      if (filters.createdAfter) {
        conditions.push('i.created_at >= ?');
        params.push(filters.createdAfter);
      }

      if (filters.createdBefore) {
        conditions.push('i.created_at <= ?');
        params.push(filters.createdBefore);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' GROUP BY i.id';

      // Apply sorting
      const sortBy = filters.sortBy || 'created_at';
      const sortOrder = filters.sortOrder || 'DESC';
      sql += ` ORDER BY i.${sortBy} ${sortOrder}`;

      // Apply pagination
      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);

        if (filters.offset) {
          sql += ' OFFSET ?';
          params.push(filters.offset);
        }
      }

      const rows = await this.allQuery(sql, params);

      // Parse JSON fields
      const insights = rows.map(row => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}'),
        tags: JSON.parse(row.tags || '[]')
      }));

      return insights;
    } catch (error) {
      console.error('Error retrieving insights:', error);
      throw error;
    }
  }

  /**
   * Get a specific insight by ID with all related data
   * @param {number} insightId - Insight ID
   * @returns {Promise<Object>} Insight with metrics and actions
   */
  async getInsightById(insightId) {
    try {
      // Get main insight
      const insightSql = 'SELECT * FROM insights WHERE id = ?';
      const insight = await this.getQuery(insightSql, [insightId]);

      if (!insight) {
        return null;
      }

      // Parse JSON fields
      insight.metadata = JSON.parse(insight.metadata || '{}');
      insight.tags = JSON.parse(insight.tags || '[]');

      // Get metrics
      const metricsSql = 'SELECT * FROM insight_metrics WHERE insight_id = ? ORDER BY created_at';
      insight.metrics = await this.allQuery(metricsSql, [insightId]);

      // Get actions
      const actionsSql = 'SELECT * FROM insight_actions WHERE insight_id = ? ORDER BY priority DESC, created_at';
      insight.actions = await this.allQuery(actionsSql, [insightId]);

      // Get history
      const historySql = 'SELECT * FROM insight_history WHERE insight_id = ? ORDER BY changed_at DESC';
      insight.history = await this.allQuery(historySql, [insightId]);

      return insight;
    } catch (error) {
      console.error('Error retrieving insight by ID:', error);
      throw error;
    }
  }

  /**
   * Update insight status
   * @param {number} insightId - Insight ID
   * @param {string} status - New status
   * @param {string} changedBy - User who made the change
   * @returns {Promise<boolean>} Success status
   */
  async updateInsightStatus(insightId, status, changedBy = 'system') {
    try {
      // Validate status
      if (!Object.values(this.actionStatuses).includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      // Get current status for history
      const currentInsight = await this.getQuery('SELECT status FROM insights WHERE id = ?', [insightId]);
      if (!currentInsight) {
        throw new Error(`Insight ${insightId} not found`);
      }

      // Update status
      const updateSql = 'UPDATE insights SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      await this.runQuery(updateSql, [status, insightId]);

      // Record history
      await this.recordHistory(insightId, 'status', currentInsight.status, status, changedBy);

      console.log(`Updated insight ${insightId} status to ${status}`);
      return true;
    } catch (error) {
      console.error('Error updating insight status:', error);
      throw error;
    }
  }

  /**
   * Record a change in insight history
   * @param {number} insightId - Insight ID
   * @param {string} fieldName - Field that changed
   * @param {string} oldValue - Previous value
   * @param {string} newValue - New value
   * @param {string} changedBy - User who made the change
   */
  async recordHistory(insightId, fieldName, oldValue, newValue, changedBy) {
    try {
      const sql = `
        INSERT INTO insight_history (insight_id, field_name, old_value, new_value, changed_by)
        VALUES (?, ?, ?, ?, ?)
      `;

      await this.runQuery(sql, [insightId, fieldName, oldValue, newValue, changedBy]);
    } catch (error) {
      console.error('Error recording insight history:', error);
      throw error;
    }
  }

  /**
   * Get insights summary statistics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Summary statistics
   */
  async getInsightsSummary(filters = {}) {
    try {
      const baseWhere = this.buildWhereClause(filters);
      const params = this.buildWhereParams(filters);

      const queries = [
        // Total count
        `SELECT COUNT(*) as total FROM insights ${baseWhere}`,
        
        // Count by severity
        `SELECT severity, COUNT(*) as count FROM insights ${baseWhere} GROUP BY severity`,
        
        // Count by type
        `SELECT type, COUNT(*) as count FROM insights ${baseWhere} GROUP BY type`,
        
        // Count by status
        `SELECT status, COUNT(*) as count FROM insights ${baseWhere} GROUP BY status`,
        
        // Recent insights (last 24 hours)
        `SELECT COUNT(*) as recent FROM insights ${baseWhere} ${baseWhere ? 'AND' : 'WHERE'} created_at >= datetime('now', '-1 day')`
      ];

      const [totalResult, severityResults, typeResults, statusResults, recentResult] = await Promise.all([
        this.getQuery(queries[0], params),
        this.allQuery(queries[1], params),
        this.allQuery(queries[2], params),
        this.allQuery(queries[3], params),
        this.getQuery(queries[4], params)
      ]);

      return {
        total: totalResult.total,
        recent: recentResult.recent,
        bySeverity: severityResults.reduce((acc, row) => {
          acc[row.severity] = row.count;
          return acc;
        }, {}),
        byType: typeResults.reduce((acc, row) => {
          acc[row.type] = row.count;
          return acc;
        }, {}),
        byStatus: statusResults.reduce((acc, row) => {
          acc[row.status] = row.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Error getting insights summary:', error);
      throw error;
    }
  }

  /**
   * Clean up expired insights
   * @returns {Promise<number>} Number of deleted insights
   */
  async cleanupExpiredInsights() {
    try {
      const sql = 'DELETE FROM insights WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP';
      const result = await this.runQuery(sql);
      
      console.log(`Cleaned up ${result.changes} expired insights`);
      return result.changes;
    } catch (error) {
      console.error('Error cleaning up expired insights:', error);
      throw error;
    }
  }

  /**
   * Build WHERE clause from filters
   * @param {Object} filters - Filter options
   * @returns {string} WHERE clause
   */
  buildWhereClause(filters) {
    const conditions = [];

    if (filters.severity) conditions.push('severity = ?');
    if (filters.type) conditions.push('type = ?');
    if (filters.status) conditions.push('status = ?');
    if (filters.dashboardId) conditions.push('dashboard_id = ?');
    if (filters.dataSource) conditions.push('data_source = ?');
    if (filters.minConfidence) conditions.push('confidence >= ?');
    if (filters.createdAfter) conditions.push('created_at >= ?');
    if (filters.createdBefore) conditions.push('created_at <= ?');

    return conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  }

  /**
   * Build parameters array from filters
   * @param {Object} filters - Filter options
   * @returns {Array} Parameters array
   */
  buildWhereParams(filters) {
    const params = [];

    if (filters.severity) params.push(filters.severity);
    if (filters.type) params.push(filters.type);
    if (filters.status) params.push(filters.status);
    if (filters.dashboardId) params.push(filters.dashboardId);
    if (filters.dataSource) params.push(filters.dataSource);
    if (filters.minConfidence) params.push(filters.minConfidence);
    if (filters.createdAfter) params.push(filters.createdAfter);
    if (filters.createdBefore) params.push(filters.createdBefore);

    return params;
  }

  /**
   * Execute a query that returns a single row
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Execute a query that returns multiple rows
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Execute a query that modifies data
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result with changes info
   */
  async runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Close the database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Insights database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = InsightsStorageService;