const { DataSource } = require('../../models');
const databaseConnector = require('../integrations/databaseConnector');
const googleSheets = require('../integrations/googleSheets');
const shopify = require('../integrations/shopify');
const stripe = require('../integrations/stripe');
const quickbooks = require('../integrations/quickbooks');
const csvUpload = require('../integrations/csvUpload');

class SQLExecutor {
  constructor() {
    this.maxExecutionTime = 30000; // 30 seconds
    this.maxResultRows = 10000;
    this.connectionPool = new Map();
  }

  async executeQuery(sql, dataSourceId, organizationId, options = {}) {
    const startTime = Date.now();
    let connection = null;
    
    try {
      // Get data source
      const dataSource = await DataSource.findOne({
        where: { id: dataSourceId, org_id: organizationId }
      });

      if (!dataSource) {
        throw new Error('Data source not found or access denied');
      }

      // Validate SQL before execution
      await this.validateSQL(sql, dataSource.type);

      // Execute query based on data source type
      const result = await this.executeByDataSourceType(sql, dataSource, options);
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: result.data,
        columns: result.columns,
        rowCount: result.rowCount,
        executionTime,
        dataSource: {
          id: dataSource.id,
          name: dataSource.name,
          type: dataSource.type
        },
        metadata: result.metadata || {}
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('SQL Execution Error:', error);
      
      return {
        success: false,
        error: error.message,
        executionTime,
        dataSource: dataSourceId
      };
    } finally {
      // Clean up connection if needed
      if (connection) {
        await this.closeConnection(connection);
      }
    }
  }

  async executeByDataSourceType(sql, dataSource, options) {
    switch (dataSource.type) {
      case 'postgresql':
      case 'mysql':
        return await this.executeDatabaseQuery(sql, dataSource, options);
      
      case 'google_sheets':
        return await this.executeGoogleSheetsQuery(sql, dataSource, options);
      
      case 'shopify':
        return await this.executeShopifyQuery(sql, dataSource, options);
      
      case 'stripe':
        return await this.executeStripeQuery(sql, dataSource, options);
      
      case 'quickbooks':
        return await this.executeQuickBooksQuery(sql, dataSource, options);
      
      case 'csv':
        return await this.executeCSVQuery(sql, dataSource, options);
      
      default:
        throw new Error(`Unsupported data source type: ${dataSource.type}`);
    }
  }

  async executeQueryWithProgress(sql, dataSource, options = {}) {
    const startTime = Date.now();
    const { timeout = 120000, onProgress } = options;
    let connection = null;
    
    try {
      // Send initial progress
      if (onProgress) {
        onProgress({
          progress: 0.1,
          message: 'Validating SQL query...',
          step: 'validation'
        });
      }

      // Validate SQL before execution
      await this.validateSQL(sql, dataSource.type);

      if (onProgress) {
        onProgress({
          progress: 0.2,
          message: 'Establishing connection...',
          step: 'connection'
        });
      }

      // Execute query based on data source type with progress
      const result = await this.executeByDataSourceTypeWithProgress(sql, dataSource, {
        ...options,
        onProgress: (progressData) => {
          if (onProgress) {
            onProgress({
              progress: 0.2 + (progressData.progress * 0.7), // 20% to 90%
              message: progressData.message,
              step: progressData.step,
              data: progressData.data
            });
          }
        }
      });
      
      if (onProgress) {
        onProgress({
          progress: 0.95,
          message: 'Processing results...',
          step: 'processing'
        });
      }

      const executionTime = Date.now() - startTime;
      
      if (onProgress) {
        onProgress({
          progress: 1.0,
          message: 'Query completed successfully',
          step: 'completed'
        });
      }
      
      return {
        success: true,
        data: result.data,
        columns: result.columns,
        rowCount: result.rowCount,
        executionTime,
        dataSource: {
          id: dataSource.id,
          name: dataSource.name,
          type: dataSource.type
        },
        metadata: result.metadata || {}
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('SQL Execution Error:', error);
      
      if (onProgress) {
        onProgress({
          progress: 1.0,
          message: `Query failed: ${error.message}`,
          step: 'error',
          error: error.message
        });
      }
      
      return {
        success: false,
        error: error.message,
        executionTime,
        dataSource: dataSource.id
      };
    } finally {
      // Clean up connection if needed
      if (connection) {
        await this.closeConnection(connection);
      }
    }
  }

  async executeByDataSourceTypeWithProgress(sql, dataSource, options) {
    const { onProgress } = options;
    
    switch (dataSource.type) {
      case 'postgresql':
      case 'mysql':
        return await this.executeDatabaseQueryWithProgress(sql, dataSource, options);
      
      case 'google_sheets':
        return await this.executeGoogleSheetsQueryWithProgress(sql, dataSource, options);
      
      case 'shopify':
        return await this.executeShopifyQueryWithProgress(sql, dataSource, options);
      
      case 'stripe':
        return await this.executeStripeQueryWithProgress(sql, dataSource, options);
      
      case 'quickbooks':
        return await this.executeQuickBooksQueryWithProgress(sql, dataSource, options);
      
      case 'csv':
        return await this.executeCSVQueryWithProgress(sql, dataSource, options);
      
      default:
        throw new Error(`Unsupported data source type: ${dataSource.type}`);
    }
  }

  async executeDatabaseQueryWithProgress(sql, dataSource, options) {
    const { onProgress } = options;
    
    if (onProgress) {
      onProgress({
        progress: 0.1,
        message: 'Connecting to database...',
        step: 'database_connection'
      });
    }

    const connectionConfig = this.parseConnectionConfig(dataSource);
    const connection = await databaseConnector.createConnection({
      type: dataSource.type,
      ...connectionConfig
    });
    
    try {
      if (onProgress) {
        onProgress({
          progress: 0.3,
          message: 'Executing SQL query...',
          step: 'sql_execution'
        });
      }

      // Set query timeout
      const timeout = options.timeout || this.maxExecutionTime;
      
      // Execute query with timeout
      const queryPromise = connection.query(sql);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout exceeded')), timeout);
      });
      
      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      if (onProgress) {
        onProgress({
          progress: 0.8,
          message: 'Processing query results...',
          step: 'result_processing'
        });
      }

      // Process results based on database type
      const processedResult = this.normalizeQueryResult(result);

      // Limit result rows
      if (processedResult.data.length > this.maxResultRows) {
        processedResult.data = processedResult.data.slice(0, this.maxResultRows);
        processedResult.truncated = true;
        processedResult.originalRowCount = processedResult.rowCount;
        processedResult.rowCount = this.maxResultRows;
      }

      if (onProgress) {
        onProgress({
          progress: 1.0,
          message: `Query completed. Retrieved ${processedResult.rowCount} rows.`,
          step: 'completed'
        });
      }

      return processedResult;

    } finally {
      await this.closeConnection(connection);
    }
  }

  async executeDatabaseQuery(sql, dataSource, options = {}) {
    const connectionConfig = this.parseConnectionConfig(dataSource);
    const connection = await databaseConnector.createConnection({
      type: dataSource.type,
      ...connectionConfig
    });

    try {
      const timeout = options.timeout || this.maxExecutionTime;
      const queryPromise = connection.query(sql);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout exceeded')), timeout);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);

      const processedResult = this.normalizeQueryResult(result);

      if (processedResult.data.length > this.maxResultRows) {
        processedResult.data = processedResult.data.slice(0, this.maxResultRows);
        processedResult.truncated = true;
        processedResult.originalRowCount = processedResult.rowCount;
        processedResult.rowCount = this.maxResultRows;
      }

      return processedResult;
    } finally {
      await this.closeConnection(connection);
    }
  }

  async executeGoogleSheetsQueryWithProgress(sql, dataSource, options) {
    const { onProgress } = options;
    
    if (onProgress) {
      onProgress({
        progress: 0.2,
        message: 'Connecting to Google Sheets...',
        step: 'sheets_connection'
      });
    }

    // For Google Sheets, we'll simulate the SQL execution by converting to Sheets API calls
    const result = await googleSheets.executeQuery(sql, dataSource);
    
    if (onProgress) {
      onProgress({
        progress: 0.8,
        message: 'Processing spreadsheet data...',
        step: 'sheets_processing'
      });
    }

    return result;
  }

  async executeShopifyQueryWithProgress(sql, dataSource, options) {
    const { onProgress } = options;
    
    if (onProgress) {
      onProgress({
        progress: 0.2,
        message: 'Connecting to Shopify API...',
        step: 'shopify_connection'
      });
    }

    const result = await shopify.executeQuery(sql, dataSource);
    
    if (onProgress) {
      onProgress({
        progress: 0.8,
        message: 'Processing Shopify data...',
        step: 'shopify_processing'
      });
    }

    return result;
  }

  async executeStripeQueryWithProgress(sql, dataSource, options) {
    const { onProgress } = options;
    
    if (onProgress) {
      onProgress({
        progress: 0.2,
        message: 'Connecting to Stripe API...',
        step: 'stripe_connection'
      });
    }

    const result = await stripe.executeQuery(sql, dataSource);
    
    if (onProgress) {
      onProgress({
        progress: 0.8,
        message: 'Processing Stripe data...',
        step: 'stripe_processing'
      });
    }

    return result;
  }

  async executeQuickBooksQueryWithProgress(sql, dataSource, options) {
    const { onProgress } = options;
    
    if (onProgress) {
      onProgress({
        progress: 0.2,
        message: 'Connecting to QuickBooks API...',
        step: 'quickbooks_connection'
      });
    }

    const result = await quickbooks.executeQuery(sql, dataSource);
    
    if (onProgress) {
      onProgress({
        progress: 0.8,
        message: 'Processing QuickBooks data...',
        step: 'quickbooks_processing'
      });
    }

    return result;
  }

  async executeCSVQueryWithProgress(sql, dataSource, options) {
    const { onProgress } = options;
    
    if (onProgress) {
      onProgress({
        progress: 0.2,
        message: 'Loading CSV data...',
        step: 'csv_loading'
      });
    }

    const result = await csvUpload.executeQuery(sql, dataSource);
    
    if (onProgress) {
      onProgress({
        progress: 0.8,
        message: 'Processing CSV data...',
        step: 'csv_processing'
      });
    }

    return result;
  }

  async validateSQL(sql, dataSourceType) {
    // Basic SQL validation
    const lowerSQL = sql.toLowerCase().trim();
    
    // Check for dangerous operations
    const dangerousKeywords = ['drop', 'delete', 'update', 'insert', 'create', 'alter', 'truncate'];
    for (const keyword of dangerousKeywords) {
      if (lowerSQL.includes(keyword)) {
        throw new Error(`Dangerous SQL operation detected: ${keyword.toUpperCase()}`);
      }
    }

    // Must start with SELECT
    if (!lowerSQL.startsWith('select')) {
      throw new Error('Only SELECT queries are allowed');
    }

    // Check for SQL injection patterns
    const injectionPatterns = [
      /;\s*(drop|delete|update|insert|create|alter)/i,
      /union\s+select/i,
      /--/,
      /\/\*/
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(sql)) {
        throw new Error('Potentially dangerous SQL pattern detected');
      }
    }

    return true;
  }

  addRowLimit(sql, dataSourceType) {
    const lowerSQL = sql.toLowerCase();
    
    // Check if LIMIT already exists
    if (lowerSQL.includes('limit') || lowerSQL.includes('top')) {
      return sql;
    }

    // Add appropriate LIMIT clause based on database type
    if (dataSourceType === 'mysql' || dataSourceType === 'postgresql') {
      return `${sql} LIMIT ${this.maxResultRows}`;
    }

    return sql;
  }

  parseShopifyQueryType(sql) {
    const lowerSQL = sql.toLowerCase();
    if (lowerSQL.includes('product')) return 'products';
    if (lowerSQL.includes('order')) return 'orders';
    if (lowerSQL.includes('customer')) return 'customers';
    return 'products'; // default
  }

  parseStripeQueryType(sql) {
    const lowerSQL = sql.toLowerCase();
    if (lowerSQL.includes('payment')) return 'payments';
    if (lowerSQL.includes('customer')) return 'customers';
    if (lowerSQL.includes('subscription')) return 'subscriptions';
    return 'payments'; // default
  }

  parseQuickBooksQueryType(sql) {
    const lowerSQL = sql.toLowerCase();
    if (lowerSQL.includes('customer')) return 'customers';
    if (lowerSQL.includes('item')) return 'items';
    if (lowerSQL.includes('invoice')) return 'invoices';
    return 'customers'; // default
  }

  getPostgreSQLTypeName(typeId) {
    const typeMap = {
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      1043: 'varchar',
      1082: 'date',
      1184: 'timestamp',
      1700: 'numeric',
      16: 'boolean'
    };
    return typeMap[typeId] || 'unknown';
  }

  getShopifyProductColumns() {
    return [
      { name: 'id', type: 'bigint', typeName: 'bigint' },
      { name: 'title', type: 'string', typeName: 'varchar' },
      { name: 'vendor', type: 'string', typeName: 'varchar' },
      { name: 'product_type', type: 'string', typeName: 'varchar' },
      { name: 'created_at', type: 'string', typeName: 'timestamp' }
    ];
  }

  getShopifyOrderColumns() {
    return [
      { name: 'id', type: 'bigint', typeName: 'bigint' },
      { name: 'order_number', type: 'string', typeName: 'varchar' },
      { name: 'total_price', type: 'string', typeName: 'decimal' },
      { name: 'created_at', type: 'string', typeName: 'timestamp' },
      { name: 'customer_id', type: 'bigint', typeName: 'bigint' }
    ];
  }

  getShopifyCustomerColumns() {
    return [
      { name: 'id', type: 'bigint', typeName: 'bigint' },
      { name: 'email', type: 'string', typeName: 'varchar' },
      { name: 'first_name', type: 'string', typeName: 'varchar' },
      { name: 'last_name', type: 'string', typeName: 'varchar' },
      { name: 'created_at', type: 'string', typeName: 'timestamp' }
    ];
  }

  getStripePaymentColumns() {
    return [
      { name: 'id', type: 'string', typeName: 'varchar' },
      { name: 'amount', type: 'number', typeName: 'bigint' },
      { name: 'currency', type: 'string', typeName: 'varchar' },
      { name: 'status', type: 'string', typeName: 'varchar' },
      { name: 'created', type: 'number', typeName: 'timestamp' }
    ];
  }

  getStripeCustomerColumns() {
    return [
      { name: 'id', type: 'string', typeName: 'varchar' },
      { name: 'email', type: 'string', typeName: 'varchar' },
      { name: 'name', type: 'string', typeName: 'varchar' },
      { name: 'created', type: 'number', typeName: 'timestamp' }
    ];
  }

  getStripeSubscriptionColumns() {
    return [
      { name: 'id', type: 'string', typeName: 'varchar' },
      { name: 'customer', type: 'string', typeName: 'varchar' },
      { name: 'status', type: 'string', typeName: 'varchar' },
      { name: 'current_period_start', type: 'number', typeName: 'timestamp' },
      { name: 'current_period_end', type: 'number', typeName: 'timestamp' }
    ];
  }

  getQuickBooksCustomerColumns() {
    return [
      { name: 'Id', type: 'string', typeName: 'varchar' },
      { name: 'Name', type: 'string', typeName: 'varchar' },
      { name: 'CompanyName', type: 'string', typeName: 'varchar' },
      { name: 'Balance', type: 'number', typeName: 'decimal' }
    ];
  }

  getQuickBooksItemColumns() {
    return [
      { name: 'Id', type: 'string', typeName: 'varchar' },
      { name: 'Name', type: 'string', typeName: 'varchar' },
      { name: 'Type', type: 'string', typeName: 'varchar' },
      { name: 'UnitPrice', type: 'number', typeName: 'decimal' }
    ];
  }

  getQuickBooksInvoiceColumns() {
    return [
      { name: 'Id', type: 'string', typeName: 'varchar' },
      { name: 'DocNumber', type: 'string', typeName: 'varchar' },
      { name: 'TotalAmt', type: 'number', typeName: 'decimal' },
      { name: 'TxnDate', type: 'string', typeName: 'date' },
      { name: 'CustomerId', type: 'string', typeName: 'varchar' }
    ];
  }

  async closeConnection(connection) {
    try {
      if (connection && typeof connection.end === 'function') {
        await connection.end();
      }
    } catch (error) {
      console.error('Error closing connection:', error);
    }
  }

  normalizeQueryResult(result) {
    if (Array.isArray(result)) {
      const rows = Array.isArray(result[0]) ? result[0] : result;
      return {
        data: rows || [],
        columns: rows && rows.length > 0
          ? Object.keys(rows[0]).map(key => ({
              name: key,
              type: 'unknown',
              nullable: true
            }))
          : [],
        rowCount: rows ? rows.length : 0
      };
    }

    if (result && result.rows) {
      return {
        data: result.rows || [],
        columns: result.fields ? result.fields.map(field => ({
          name: field.name,
          type: field.dataTypeID,
          nullable: true
        })) : [],
        rowCount: result.rowCount || (result.rows ? result.rows.length : 0)
      };
    }

    return { data: [], columns: [], rowCount: 0 };
  }

  parseConnectionConfig(dataSource) {
    const raw = dataSource.connection_string;
    let config = {};

    if (raw) {
      if (typeof raw === 'object') {
        config = raw;
      } else if (typeof raw === 'string') {
        try {
          config = JSON.parse(raw);
        } catch {
          try {
            const url = new URL(raw);
            config = {
              host: url.hostname,
              port: url.port ? parseInt(url.port, 10) : undefined,
              database: url.pathname ? url.pathname.replace(/^\//, '') : undefined,
              username: decodeURIComponent(url.username || ''),
              password: decodeURIComponent(url.password || '')
            };
          } catch {
            config = {};
          }
        }
      }
    }

    if (dataSource.credentials && typeof dataSource.credentials === 'object') {
      config = { ...config, ...dataSource.credentials };
    } else if (typeof dataSource.credentials === 'string') {
      try {
        config = { ...config, ...JSON.parse(dataSource.credentials) };
      } catch {
        // ignore
      }
    }

    return config;
  }
}

module.exports = new SQLExecutor();
