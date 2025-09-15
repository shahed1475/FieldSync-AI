const sqlite3 = require('sqlite3').verbose();
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Database Migration Manager
 * Handles creation and management of HIPAA-compliant database schema
 */
class MigrationManager {
  constructor(dbPath = null) {
    this.migrations = [];
    this.schemaPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    this.dbPath = dbPath || path.join(__dirname, '../../data/claimflow.db');
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info('Connected to SQLite database for migration');
          resolve();
        }
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database:', err);
          }
          resolve();
        });
      });
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    try {
      logger.info('Starting database migrations...');
      
      await this.connect();
      
      // Check if migration tracking table exists
      await this.createMigrationTable();
      
      // Load and execute schema
      await this.executeSchema();
      
      // Verify schema integrity
      await this.verifySchema();
      
      logger.info('Database migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed', { error: error.message });
      throw error;
    } finally {
      await this.close();
    }
  }

  /**
   * Create migration tracking table
   */
  async createMigrationTable() {
    const createMigrationTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        executed_at TEXT DEFAULT (datetime('now')),
        checksum TEXT
      )
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(createMigrationTableSQL, (err) => {
        if (err) {
          logger.error('Failed to create migration table:', err);
          reject(err);
        } else {
          logger.info('Migration tracking table ready');
          resolve();
        }
      });
    });
  }

  /**
   * Execute main schema file
   */
  async executeSchema() {
    try {
      if (!fs.existsSync(this.schemaPath)) {
        throw new Error(`Schema file not found: ${this.schemaPath}`);
      }
      
      const schemaSQL = fs.readFileSync(this.schemaPath, 'utf8');
      const schemaChecksum = require('crypto')
        .createHash('sha256')
        .update(schemaSQL)
        .digest('hex');
      
      // Check if this schema version has already been applied
      const existingMigration = await this.getMigration('1.0.0');
      
      if (existingMigration && existingMigration.checksum === schemaChecksum) {
        logger.info('Schema already up to date');
        return;
      }
      
      logger.info('Executing database schema...');
      
      // Execute the schema in a transaction
      await this.executeInTransaction(schemaSQL);
      
      // Record the migration
      await this.recordMigration('1.0.0', 'Initial Schema', schemaChecksum);
      
      logger.info('Schema executed successfully');
      
    } catch (error) {
      logger.error('Schema execution failed', { error: error.message });
      throw error;
    }
  }

  async getMigration(version) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM schema_migrations WHERE version = ?',
        [version],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async executeInTransaction(sql) {
    const statements = this.splitSQLStatements(sql);
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        let completed = 0;
        let hasError = false;
        
        statements.forEach((statement, index) => {
          if (hasError) return;
          
          const trimmedStatement = statement.trim();
          if (!trimmedStatement) {
            completed++;
            if (completed === statements.length) {
              this.db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  reject(commitErr);
                } else {
                  resolve();
                }
              });
            }
            return;
          }
          
          this.db.run(trimmedStatement, (err) => {
            if (err && !hasError) {
              hasError = true;
              this.db.run('ROLLBACK');
              reject(new Error(`Migration failed at statement ${index + 1}: ${err.message}\nStatement: ${trimmedStatement.substring(0, 100)}...`));
              return;
            }
            
            completed++;
            if (completed === statements.length && !hasError) {
              this.db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  reject(commitErr);
                } else {
                  resolve();
                }
              });
            }
          });
        });
      });
    });
  }

  async recordMigration(version, name, checksum = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)',
        [version, name, checksum],
        (err) => {
          if (err) {
            logger.warn('Failed to record migration', { error: err.message });
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  splitSQLStatements(sql) {
    // Remove comments and clean up
    const cleanSQL = sql
      .replace(/--.*$/gm, '') // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\n\s*\n/g, '\n'); // Remove empty lines
    
    return cleanSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
  }

  async verifySchema() {
    const requiredTables = [
      'practices',
      'providers', 
      'patients',
      'authorizations',
      'documents',
      'audit_logs',
      'system_config'
    ];
    
    for (const table of requiredTables) {
      const exists = await this.tableExists(table);
      if (!exists) {
        throw new Error(`Required table '${table}' not found`);
      }
    }
    
    logger.info('Schema integrity verification passed');
  }

  async tableExists(tableName) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }

  async testConnection() {
    try {
      await this.connect();
      
      return new Promise((resolve, reject) => {
        this.db.get("SELECT datetime('now') as now", (err, row) => {
          if (err) {
            reject(err);
          } else {
            logger.info('Database connection test successful:', row.now);
            resolve(row);
          }
        });
      });
    } catch (error) {
      logger.error('Database connection test failed:', error);
      throw error;
    } finally {
      await this.close();
    }
  }

  async rollback(targetVersion) {
    logger.warn(`Rolling back to version ${targetVersion}`);
    // TODO: Implement rollback functionality
    throw new Error('Rollback functionality not implemented yet');
  }
}

// CLI usage
if (require.main === module) {
  const migrationManager = new MigrationManager();
  
  const command = process.argv[2] || 'migrate';
  
  if (command === 'test') {
    migrationManager.testConnection()
      .then(() => {
        logger.info('Database test completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Database test failed:', error);
        process.exit(1);
      });
  } else {
    migrationManager.runMigrations()
      .then(() => {
        logger.info('Migration process completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Migration process failed:', error);
        process.exit(1);
      });
  }
}

module.exports = {
  MigrationManager
};