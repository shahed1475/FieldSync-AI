const { Sequelize, DataTypes } = require('sequelize');
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { DataSource } = require('../../models');
const OAuthManager = require('./oauthManager');

class DatabaseConnectorService {
  constructor() {
    this.connections = new Map(); // Cache connections
    this.oauthManager = new OAuthManager();
  }

  /**
   * Get valid credentials for a data source
   */
  async getValidCredentials(dataSourceId) {
    try {
      return await this.oauthManager.getValidCredentials(dataSourceId);
    } catch (error) {
      throw new Error(`Failed to get valid credentials: ${error.message}`);
    }
  }

  /**
   * Create database connection based on type
   */
  async createConnection(connectionConfig) {
    const { type, host, port, database, username, password, ssl } = connectionConfig;

    try {
      if (type === 'postgresql') {
        const sequelize = new Sequelize(database, username, password, {
          host,
          port: port || 5432,
          dialect: 'postgres',
          dialectOptions: ssl ? {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          } : {},
          logging: false,
          pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
          }
        });

        await sequelize.authenticate();
        return sequelize;
      } else if (type === 'mysql') {
        const sequelize = new Sequelize(database, username, password, {
          host,
          port: port || 3306,
          dialect: 'mysql',
          dialectOptions: ssl ? {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          } : {},
          logging: false,
          pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
          }
        });

        await sequelize.authenticate();
        return sequelize;
      } else {
        throw new Error(`Unsupported database type: ${type}`);
      }
    } catch (error) {
      throw new Error(`Failed to connect to ${type}: ${error.message}`);
    }
  }

  /**
   * Test database connection
   */
  async testConnection(connectionConfig) {
    try {
      const connection = await this.createConnection(connectionConfig);
      await connection.close();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get all tables from database
   */
  async getTables(connectionConfig) {
    const connection = await this.createConnection(connectionConfig);
    
    try {
      let query;
      if (connectionConfig.type === 'postgresql') {
        query = `
          SELECT table_name, table_schema
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND table_type = 'BASE TABLE'
          ORDER BY table_schema, table_name
        `;
      } else if (connectionConfig.type === 'mysql') {
        query = `
          SELECT table_name, table_schema
          FROM information_schema.tables 
          WHERE table_schema = '${connectionConfig.database}'
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `;
      }

      const [results] = await connection.query(query);
      return results.map(row => ({
        name: row.table_name,
        schema: row.table_schema || connectionConfig.database
      }));
    } finally {
      await connection.close();
    }
  }

  /**
   * Detect schema for a specific table
   */
  async detectTableSchema(connectionConfig, tableName, schemaName = null) {
    const connection = await this.createConnection(connectionConfig);
    
    try {
      let query;
      const params = [];

      if (connectionConfig.type === 'postgresql') {
        query = `
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            ordinal_position
          FROM information_schema.columns 
          WHERE table_name = $1
          ${schemaName ? 'AND table_schema = $2' : ''}
          ORDER BY ordinal_position
        `;
        params.push(tableName);
        if (schemaName) params.push(schemaName);
      } else if (connectionConfig.type === 'mysql') {
        query = `
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            ordinal_position
          FROM information_schema.columns 
          WHERE table_name = ? AND table_schema = ?
          ORDER BY ordinal_position
        `;
        params.push(tableName, connectionConfig.database);
      }

      const [columns] = await connection.query(query, params);

      // Get sample data
      const sampleQuery = `SELECT * FROM ${schemaName ? `${schemaName}.` : ''}${tableName} LIMIT 5`;
      const [sampleData] = await connection.query(sampleQuery);

      // Get row count
      const countQuery = `SELECT COUNT(*) as total FROM ${schemaName ? `${schemaName}.` : ''}${tableName}`;
      const [countResult] = await connection.query(countQuery);
      const totalRows = countResult[0].total || countResult[0].COUNT;

      const schema = columns.map(col => ({
        name: col.column_name,
        type: this.mapDatabaseType(col.data_type, connectionConfig.type),
        nullable: col.is_nullable === 'YES',
        defaultValue: col.column_default,
        maxLength: col.character_maximum_length,
        precision: col.numeric_precision,
        scale: col.numeric_scale,
        position: col.ordinal_position,
        originalType: col.data_type
      }));

      return {
        tableName,
        schemaName,
        totalRows: parseInt(totalRows),
        totalColumns: schema.length,
        schema,
        sampleData: sampleData.slice(0, 5)
      };
    } finally {
      await connection.close();
    }
  }

  /**
   * Extract data from table with pagination
   */
  async extractTableData(connectionConfig, tableName, options = {}) {
    const connection = await this.createConnection(connectionConfig);
    
    try {
      const {
        schemaName = null,
        limit = 1000,
        offset = 0,
        columns = '*',
        whereClause = '',
        orderBy = ''
      } = options;

      let query = `SELECT ${columns} FROM ${schemaName ? `${schemaName}.` : ''}${tableName}`;
      
      if (whereClause) {
        query += ` WHERE ${whereClause}`;
      }
      
      if (orderBy) {
        query += ` ORDER BY ${orderBy}`;
      }
      
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      const [results] = await connection.query(query);
      
      return {
        data: results,
        totalRows: results.length,
        hasMore: results.length === limit
      };
    } finally {
      await connection.close();
    }
  }

  /**
   * Execute custom query
   */
  async executeQuery(connectionConfig, query, params = []) {
    const connection = await this.createConnection(connectionConfig);
    
    try {
      const [results] = await connection.query(query, params);
      return results;
    } finally {
      await connection.close();
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(connectionConfig) {
    const connection = await this.createConnection(connectionConfig);
    
    try {
      let query;
      
      if (connectionConfig.type === 'postgresql') {
        query = `
          SELECT 
            schemaname as schema_name,
            tablename as table_name,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples
          FROM pg_stat_user_tables
          ORDER BY schemaname, tablename
        `;
      } else if (connectionConfig.type === 'mysql') {
        query = `
          SELECT 
            table_schema as schema_name,
            table_name,
            table_rows as live_tuples,
            data_length,
            index_length,
            auto_increment
          FROM information_schema.tables 
          WHERE table_schema = '${connectionConfig.database}'
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `;
      }

      const [results] = await connection.query(query);
      return results;
    } finally {
      await connection.close();
    }
  }

  /**
   * Map database-specific types to standard types
   */
  mapDatabaseType(dbType, databaseType) {
    const typeMap = {
      postgresql: {
        'integer': 'INTEGER',
        'bigint': 'BIGINT',
        'smallint': 'INTEGER',
        'decimal': 'DECIMAL',
        'numeric': 'DECIMAL',
        'real': 'FLOAT',
        'double precision': 'DOUBLE',
        'money': 'DECIMAL',
        'character varying': 'VARCHAR',
        'varchar': 'VARCHAR',
        'character': 'CHAR',
        'char': 'CHAR',
        'text': 'TEXT',
        'boolean': 'BOOLEAN',
        'date': 'DATE',
        'timestamp': 'TIMESTAMP',
        'timestamptz': 'TIMESTAMP',
        'time': 'TIME',
        'timetz': 'TIME',
        'json': 'JSON',
        'jsonb': 'JSON',
        'uuid': 'UUID',
        'bytea': 'BLOB'
      },
      mysql: {
        'int': 'INTEGER',
        'integer': 'INTEGER',
        'bigint': 'BIGINT',
        'smallint': 'INTEGER',
        'tinyint': 'INTEGER',
        'decimal': 'DECIMAL',
        'numeric': 'DECIMAL',
        'float': 'FLOAT',
        'double': 'DOUBLE',
        'varchar': 'VARCHAR',
        'char': 'CHAR',
        'text': 'TEXT',
        'longtext': 'TEXT',
        'mediumtext': 'TEXT',
        'tinytext': 'TEXT',
        'boolean': 'BOOLEAN',
        'bool': 'BOOLEAN',
        'date': 'DATE',
        'datetime': 'TIMESTAMP',
        'timestamp': 'TIMESTAMP',
        'time': 'TIME',
        'json': 'JSON',
        'blob': 'BLOB',
        'longblob': 'BLOB',
        'mediumblob': 'BLOB',
        'tinyblob': 'BLOB'
      }
    };

    const mappings = typeMap[databaseType] || {};
    return mappings[dbType.toLowerCase()] || 'TEXT';
  }

  /**
   * Save database connection to data sources
   */
  async saveConnection(organizationId, connectionData) {
    try {
      // Test connection first
      const testResult = await this.testConnection(connectionData.config);
      if (!testResult.success) {
        throw new Error(`Connection test failed: ${testResult.message}`);
      }

      // Get basic database info
      const tables = await this.getTables(connectionData.config);
      const stats = await this.getDatabaseStats(connectionData.config);

      const dataSource = await DataSource.create({
        org_id: organizationId,
        name: connectionData.name || `${connectionData.config.type} - ${connectionData.config.database}`,
        type: connectionData.config.type,
        connection_string: JSON.stringify({
          host: connectionData.config.host,
          port: connectionData.config.port,
          database: connectionData.config.database,
          ssl: connectionData.config.ssl || false
        }),
        credentials: {
          username: connectionData.config.username,
          password: connectionData.config.password, // In production, encrypt this
          provider: connectionData.config.type,
          createdAt: new Date()
        },
        status: 'active',
        metadata: {
          provider: connectionData.config.type,
          lastSync: new Date(),
          totalTables: tables.length,
          tables: tables.map(t => t.name),
          statistics: stats
        }
      });

      return dataSource;
    } catch (error) {
      throw new Error(`Failed to save database connection: ${error.message}`);
    }
  }

  /**
   * Get cached connection or create new one
   */
  async getConnection(dataSourceId) {
    if (this.connections.has(dataSourceId)) {
      return this.connections.get(dataSourceId);
    }

    const dataSource = await DataSource.findByPk(dataSourceId);
    if (!dataSource) {
      throw new Error('Data source not found');
    }

    const connectionString = JSON.parse(dataSource.connection_string);
    const credentials = await this.getValidCredentials(dataSourceId);

    const config = {
      type: dataSource.type,
      ...connectionString,
      ...credentials
    };

    const connection = await this.createConnection(config);
    this.connections.set(dataSourceId, connection);

    return connection;
  }

  /**
   * Close all cached connections
   */
  async closeAllConnections() {
    for (const [id, connection] of this.connections) {
      try {
        await connection.close();
      } catch (error) {
        console.error(`Error closing connection ${id}:`, error);
      }
    }
    this.connections.clear();
  }
}

module.exports = DatabaseConnectorService;
