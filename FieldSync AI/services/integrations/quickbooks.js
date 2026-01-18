const QuickBooks = require('node-quickbooks');
const axios = require('axios');
const { DataSource } = require('../../models');
const OAuthManager = require('./oauthManager');

class QuickBooksService {
  constructor() {
    this.baseURL = process.env.QUICKBOOKS_SANDBOX === 'true' 
      ? 'https://sandbox-quickbooks.api.intuit.com' 
      : 'https://quickbooks.api.intuit.com';
    this.oauthManager = new OAuthManager();
  }

  /**
   * Get valid credentials with automatic token refresh
   */
  async getValidCredentials(dataSourceId) {
    try {
      const dataSource = await DataSource.findByPk(dataSourceId);
      if (!dataSource || !dataSource.credentials) {
        throw new Error('Data source not found or missing credentials');
      }

      const credentials = typeof dataSource.credentials === 'string'
        ? JSON.parse(dataSource.credentials)
        : (dataSource.credentials || {});
      
      // Get valid access token (will refresh if needed)
      const validAccessToken = await this.oauthManager.getValidAccessToken(dataSourceId);
      
      return {
        ...credentials,
        accessToken: validAccessToken,
        dataSourceId: dataSourceId
      };
    } catch (error) {
      throw new Error(`Failed to get valid credentials: ${error.message}`);
    }
  }

  /**
   * Create QuickBooks client with stored credentials
   */
  createClient(credentials) {
    const qbo = new QuickBooks(
      process.env.QUICKBOOKS_CLIENT_ID,
      process.env.QUICKBOOKS_CLIENT_SECRET,
      credentials.accessToken,
      false, // Use token (not consumer key/secret)
      credentials.realmId, // Company ID
      process.env.QUICKBOOKS_SANDBOX === 'true', // Sandbox mode
      true, // Enable debugging
      null, // Minor version
      '2.0', // OAuth version
      credentials.refreshToken
    );

    return qbo;
  }

  /**
   * Get company information
   */
  async getCompanyInfo(dataSourceId) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const qbo = this.createClient(credentials);
      
      return new Promise((resolve, reject) => {
        qbo.getCompanyInfo(credentials.realmId, (err, companyInfo) => {
          if (err) {
            reject(new Error(`Failed to get company info: ${err.message}`));
          } else {
            resolve(companyInfo);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get company info: ${error.message}`);
    }
  }

  /**
   * Get customers from QuickBooks
   */
  async getCustomers(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const qbo = this.createClient(credentials);
      const { limit = 100, offset = 0 } = options;

      return new Promise((resolve, reject) => {
        qbo.findCustomers({
          limit,
          offset,
          fetchAll: false
        }, (err, customers) => {
          if (err) {
            reject(new Error(`Failed to get customers: ${err.message}`));
          } else {
            resolve(customers);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get customers: ${error.message}`);
    }
  }

  /**
   * Get items (products/services)
   */
  async getItems(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const qbo = this.createClient(credentials);
      const { limit = 100, offset = 0 } = options;

      return new Promise((resolve, reject) => {
        qbo.findItems({
          limit,
          offset,
          fetchAll: false
        }, (err, items) => {
          if (err) {
            reject(new Error(`Failed to get items: ${err.message}`));
          } else {
            resolve(items);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get items: ${error.message}`);
    }
  }

  /**
   * Get invoices
   */
  async getInvoices(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const qbo = this.createClient(credentials);
      const { limit = 100, offset = 0, startDate, endDate } = options;

      let query = `SELECT * FROM Invoice`;
      const conditions = [];

      if (startDate) {
        conditions.push(`TxnDate >= '${startDate}'`);
      }
      if (endDate) {
        conditions.push(`TxnDate <= '${endDate}'`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` MAXRESULTS ${limit} STARTPOSITION ${offset + 1}`;

      return new Promise((resolve, reject) => {
        qbo.reportQuery(query, (err, invoices) => {
          if (err) {
            reject(new Error(`Failed to get invoices: ${err.message}`));
          } else {
            resolve(invoices);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get invoices: ${error.message}`);
    }
  }

  /**
   * Get payments
   */
  async getPayments(credentials, options = {}) {
    try {
      const qbo = this.createClient(credentials);
      const { limit = 100, offset = 0, startDate, endDate } = options;

      let query = `SELECT * FROM Payment`;
      const conditions = [];

      if (startDate) {
        conditions.push(`TxnDate >= '${startDate}'`);
      }
      if (endDate) {
        conditions.push(`TxnDate <= '${endDate}'`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` MAXRESULTS ${limit} STARTPOSITION ${offset + 1}`;

      return new Promise((resolve, reject) => {
        qbo.reportQuery(query, (err, payments) => {
          if (err) {
            reject(new Error(`Failed to get payments: ${err.message}`));
          } else {
            resolve(payments);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get payments: ${error.message}`);
    }
  }

  /**
   * Get profit and loss report
   */
  async getProfitLossReport(credentials, options = {}) {
    try {
      const qbo = this.createClient(credentials);
      const { 
        startDate = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        endDate = new Date().toISOString().split('T')[0]
      } = options;

      return new Promise((resolve, reject) => {
        qbo.reportProfitAndLoss({
          start_date: startDate,
          end_date: endDate,
          summarize_column_by: 'Month'
        }, (err, report) => {
          if (err) {
            reject(new Error(`Failed to get P&L report: ${err.message}`));
          } else {
            resolve(report);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get P&L report: ${error.message}`);
    }
  }

  /**
   * Get balance sheet report
   */
  async getBalanceSheet(credentials, options = {}) {
    try {
      const qbo = this.createClient(credentials);
      const { 
        date = new Date().toISOString().split('T')[0]
      } = options;

      return new Promise((resolve, reject) => {
        qbo.reportBalanceSheet({
          date: date,
          summarize_column_by: 'Month'
        }, (err, report) => {
          if (err) {
            reject(new Error(`Failed to get balance sheet: ${err.message}`));
          } else {
            resolve(report);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get balance sheet: ${error.message}`);
    }
  }

  /**
   * Detect schema for QuickBooks data
   */
  async detectSchema(credentials, dataType) {
    try {
      let schema = [];
      let sampleData = [];

      switch (dataType) {
        case 'customers':
          const customers = await this.getCustomers(credentials, { limit: 10 });
          if (customers && customers.QueryResponse && customers.QueryResponse.Customer) {
            const customer = customers.QueryResponse.Customer[0];
            schema = this.generateSchemaFromObject(customer, 'Customer');
            sampleData = customers.QueryResponse.Customer.slice(0, 5);
          }
          break;

        case 'items':
          const items = await this.getItems(credentials, { limit: 10 });
          if (items && items.QueryResponse && items.QueryResponse.Item) {
            const item = items.QueryResponse.Item[0];
            schema = this.generateSchemaFromObject(item, 'Item');
            sampleData = items.QueryResponse.Item.slice(0, 5);
          }
          break;

        case 'invoices':
          const invoices = await this.getInvoices(credentials, { limit: 10 });
          if (invoices && invoices.QueryResponse && invoices.QueryResponse.Invoice) {
            const invoice = invoices.QueryResponse.Invoice[0];
            schema = this.generateSchemaFromObject(invoice, 'Invoice');
            sampleData = invoices.QueryResponse.Invoice.slice(0, 5);
          }
          break;

        case 'payments':
          const payments = await this.getPayments(credentials, { limit: 10 });
          if (payments && payments.QueryResponse && payments.QueryResponse.Payment) {
            const payment = payments.QueryResponse.Payment[0];
            schema = this.generateSchemaFromObject(payment, 'Payment');
            sampleData = payments.QueryResponse.Payment.slice(0, 5);
          }
          break;

        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }

      return {
        dataType,
        schema,
        sampleData,
        totalFields: schema.length
      };
    } catch (error) {
      throw new Error(`Failed to detect schema: ${error.message}`);
    }
  }

  /**
   * Generate schema from QuickBooks object
   */
  generateSchemaFromObject(obj, prefix = '') {
    const schema = [];

    const processObject = (object, path = '') => {
      for (const [key, value] of Object.entries(object)) {
        const fieldPath = path ? `${path}.${key}` : key;
        
        if (value === null || value === undefined) {
          schema.push({
            name: fieldPath,
            type: 'TEXT',
            nullable: true,
            description: `${prefix} ${key}`
          });
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          // Nested object - flatten it
          processObject(value, fieldPath);
        } else if (Array.isArray(value)) {
          schema.push({
            name: fieldPath,
            type: 'JSON',
            nullable: true,
            description: `${prefix} ${key} (Array)`
          });
        } else {
          const dataType = this.inferDataType(value);
          schema.push({
            name: fieldPath,
            type: dataType,
            nullable: true,
            description: `${prefix} ${key}`
          });
        }
      }
    };

    processObject(obj);
    return schema;
  }

  /**
   * Infer data type from value
   */
  inferDataType(value) {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'INTEGER' : 'DECIMAL';
    }
    if (typeof value === 'boolean') {
      return 'BOOLEAN';
    }
    if (typeof value === 'string') {
      // Check if it's a date
      const dateValue = new Date(value);
      if (!isNaN(dateValue.getTime()) && value.match(/\d{4}-\d{2}-\d{2}/)) {
        return 'DATE';
      }
      // Check if it's a number string
      if (!isNaN(value) && !isNaN(parseFloat(value))) {
        return value.includes('.') ? 'DECIMAL' : 'INTEGER';
      }
    }
    return 'TEXT';
  }

  /**
   * Test connection to QuickBooks
   */
  async testConnection(credentials) {
    try {
      const companyInfo = await this.getCompanyInfo(credentials);
      return { 
        success: true, 
        message: 'Connection successful',
        companyName: companyInfo.QueryResponse?.CompanyInfo?.[0]?.CompanyName || 'Unknown'
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const response = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', 
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }), {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  /**
   * Save QuickBooks connection to database
   */
  async saveConnection(organizationId, connectionData) {
    try {
      const dataSource = await DataSource.create({
        org_id: organizationId,
        name: connectionData.name || 'QuickBooks Connection',
        type: 'quickbooks',
        connection_string: JSON.stringify({
          realmId: connectionData.realmId,
          baseURL: this.baseURL
        }),
        credentials: {
          accessToken: connectionData.accessToken,
          refreshToken: connectionData.refreshToken,
          realmId: connectionData.realmId,
          expiresAt: new Date(Date.now() + (connectionData.expiresIn * 1000))
        },
        status: 'active',
        metadata: {
          provider: 'quickbooks',
          companyName: connectionData.companyName,
          lastSync: new Date(),
          availableDataTypes: ['customers', 'items', 'invoices', 'payments', 'reports']
        }
      });

      return dataSource;
    } catch (error) {
      throw new Error(`Failed to save connection: ${error.message}`);
    }
  }
}

module.exports = QuickBooksService;
