const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { logger } = require('../utils/logger');

// SQLite database connection
class SQLitePool {
  constructor() {
    this.dbPath = path.join(__dirname, '../../data/claimflow.db');
    this.db = null;
    this.connected = false;
  }

  async connect() {
    if (!this.db) {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Error opening database:', err);
        } else {
          logger.info('Connected to SQLite database');
          this.connected = true;
        }
      });
    }
    return {
      query: this.query.bind(this),
      release: () => {}
    };
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      // Convert PostgreSQL-style queries to SQLite
      let sqliteQuery = sql
        .replace(/\$\d+/g, '?')
        .replace(/NOW\(\)/g, "datetime('now')")
        .replace(/SERIAL/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        .replace(/TIMESTAMP/g, 'DATETIME')
        .replace(/BOOLEAN/g, 'INTEGER')
        .replace(/TEXT\[\]/g, 'TEXT');

      if (sqliteQuery.toLowerCase().includes('select')) {
        this.db.all(sqliteQuery, params, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows: rows || [] });
        });
      } else {
        this.db.run(sqliteQuery, params, function(err) {
          if (err) reject(err);
          else resolve({ rows: [], rowCount: this.changes, insertId: this.lastID });
        });
      }
    });
  }

  async end() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) logger.error('Error closing database:', err);
          else logger.info('Database connection closed');
          this.connected = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Create SQLite pool instance
const pool = new SQLitePool();

// Database connection health check
async function checkDatabaseHealth() {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT datetime('now') as now");
      return { 
        healthy: true, 
        timestamp: result.rows[0].now,
        connection: 'Mock Database (Development)'
      };
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    return { 
      healthy: false, 
      error: error.message, 
      timestamp: new Date().toISOString(),
      connection: 'Mock Database (Development)'
    };
  }
}

// Initialize database connection
async function initializeDatabase() {
  try {
    const health = await checkDatabaseHealth();
    if (health.healthy) {
      logger.info('Database connection established successfully', {
        connection: health.connection,
        timestamp: health.timestamp
      });
    } else {
      throw new Error(`Database connection failed: ${health.error}`);
    }
  } catch (error) {
    logger.error('Failed to initialize database connection', { error: error.message });
    throw error;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Closing database connection pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Closing database connection pool...');
  await pool.end();
  process.exit(0);
});

module.exports = {
  pool,
  checkDatabaseHealth,
  initializeDatabase
};