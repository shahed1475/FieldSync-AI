const Stripe = require('stripe');
const { DataSource } = require('../../models');
const OAuthManager = require('./oauthManager');

class StripeService {
  constructor() {
    this.apiVersion = '2023-10-16';
    this.oauthManager = new OAuthManager();
  }

  /**
   * Get valid credentials for a data source
   */
  async getValidCredentials(dataSourceId) {
    const dataSource = await DataSource.findByPk(dataSourceId);
    if (!dataSource) {
      throw new Error('Data source not found');
    }

    // For Stripe, we typically use API keys which don't expire
    // But we still use this pattern for consistency
    return typeof dataSource.credentials === 'string'
      ? JSON.parse(dataSource.credentials)
      : dataSource.credentials;
  }

  /**
   * Create Stripe client with API key
   */
  createClient(apiKey) {
    return new Stripe(apiKey, {
      apiVersion: this.apiVersion,
      timeout: 30000,
      maxNetworkRetries: 3
    });
  }

  /**
   * Get account information
   */
  async getAccountInfo(dataSourceId) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const account = await stripe.account.retrieve();
      return account;
    } catch (error) {
      throw new Error(`Failed to get account info: ${error.message}`);
    }
  }

  /**
   * Get payments (charges) with pagination
   */
  async getPayments(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        created = null,
        customer = null,
        paymentIntent = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (created) params.created = created;
      if (customer) params.customer = customer;
      if (paymentIntent) params.payment_intent = paymentIntent;

      const charges = await stripe.charges.list(params);
      return charges.data;
    } catch (error) {
      throw new Error(`Failed to get payments: ${error.message}`);
    }
  }

  /**
   * Get payment intents with pagination
   */
  async getPaymentIntents(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        created = null,
        customer = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (created) params.created = created;
      if (customer) params.customer = customer;

      const paymentIntents = await stripe.paymentIntents.list(params);
      return paymentIntents.data;
    } catch (error) {
      throw new Error(`Failed to get payment intents: ${error.message}`);
    }
  }

  /**
   * Get subscriptions with pagination
   */
  async getSubscriptions(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        status = null,
        customer = null,
        price = null,
        created = null,
        currentPeriodStart = null,
        currentPeriodEnd = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (status) params.status = status;
      if (customer) params.customer = customer;
      if (price) params.price = price;
      if (created) params.created = created;
      if (currentPeriodStart) params.current_period_start = currentPeriodStart;
      if (currentPeriodEnd) params.current_period_end = currentPeriodEnd;

      const subscriptions = await stripe.subscriptions.list(params);
      return subscriptions.data;
    } catch (error) {
      throw new Error(`Failed to get subscriptions: ${error.message}`);
    }
  }

  /**
   * Get customers with pagination
   */
  async getCustomers(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        email = null,
        created = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (email) params.email = email;
      if (created) params.created = created;

      const customers = await stripe.customers.list(params);
      return customers.data;
    } catch (error) {
      throw new Error(`Failed to get customers: ${error.message}`);
    }
  }

  /**
   * Get invoices with pagination
   */
  async getInvoices(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        customer = null,
        status = null,
        subscription = null,
        created = null,
        dueDate = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (customer) params.customer = customer;
      if (status) params.status = status;
      if (subscription) params.subscription = subscription;
      if (created) params.created = created;
      if (dueDate) params.due_date = dueDate;

      const invoices = await stripe.invoices.list(params);
      return invoices.data;
    } catch (error) {
      throw new Error(`Failed to get invoices: ${error.message}`);
    }
  }

  /**
   * Get products with pagination
   */
  async getProducts(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        active = null,
        created = null,
        type = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (active !== null) params.active = active;
      if (created) params.created = created;
      if (type) params.type = type;

      const products = await stripe.products.list(params);
      return products.data;
    } catch (error) {
      throw new Error(`Failed to get products: ${error.message}`);
    }
  }

  /**
   * Get prices with pagination
   */
  async getPrices(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        active = null,
        currency = null,
        product = null,
        type = null,
        created = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (active !== null) params.active = active;
      if (currency) params.currency = currency;
      if (product) params.product = product;
      if (type) params.type = type;
      if (created) params.created = created;

      const prices = await stripe.prices.list(params);
      return prices.data;
    } catch (error) {
      throw new Error(`Failed to get prices: ${error.message}`);
    }
  }

  /**
   * Get payouts with pagination
   */
  async getPayouts(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        status = null,
        created = null,
        arrivalDate = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (status) params.status = status;
      if (created) params.created = created;
      if (arrivalDate) params.arrival_date = arrivalDate;

      const payouts = await stripe.payouts.list(params);
      return payouts.data;
    } catch (error) {
      throw new Error(`Failed to get payouts: ${error.message}`);
    }
  }

  /**
   * Get balance transactions with pagination
   */
  async getBalanceTransactions(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const stripe = this.createClient(credentials.apiKey);
      const {
        limit = 100,
        startingAfter = null,
        endingBefore = null,
        availableOn = null,
        created = null,
        currency = null,
        payout = null,
        source = null,
        type = null
      } = options;

      const params = { limit };

      if (startingAfter) params.starting_after = startingAfter;
      if (endingBefore) params.ending_before = endingBefore;
      if (availableOn) params.available_on = availableOn;
      if (created) params.created = created;
      if (currency) params.currency = currency;
      if (payout) params.payout = payout;
      if (source) params.source = source;
      if (type) params.type = type;

      const balanceTransactions = await stripe.balanceTransactions.list(params);
      return balanceTransactions.data;
    } catch (error) {
      throw new Error(`Failed to get balance transactions: ${error.message}`);
    }
  }

  /**
   * Detect schema for Stripe data types
   */
  async detectSchema(dataSourceId, dataType) {
    try {
      let schema = [];
      let sampleData = [];

      switch (dataType) {
        case 'payments':
          const payments = await this.getPayments(dataSourceId, { limit: 5 });
          if (payments.length > 0) {
            schema = this.generatePaymentSchema();
            sampleData = payments;
          }
          break;

        case 'subscriptions':
          const subscriptions = await this.getSubscriptions(dataSourceId, { limit: 5 });
          if (subscriptions.length > 0) {
            schema = this.generateSubscriptionSchema();
            sampleData = subscriptions;
          }
          break;

        case 'customers':
          const customers = await this.getCustomers(dataSourceId, { limit: 5 });
          if (customers.length > 0) {
            schema = this.generateCustomerSchema();
            sampleData = customers;
          }
          break;

        case 'invoices':
          const invoices = await this.getInvoices(dataSourceId, { limit: 5 });
          if (invoices.length > 0) {
            schema = this.generateInvoiceSchema();
            sampleData = invoices;
          }
          break;

        case 'products':
          const products = await this.getProducts(dataSourceId, { limit: 5 });
          if (products.length > 0) {
            schema = this.generateProductSchema();
            sampleData = products;
          }
          break;

        case 'payouts':
          const payouts = await this.getPayouts(dataSourceId, { limit: 5 });
          if (payouts.length > 0) {
            schema = this.generatePayoutSchema();
            sampleData = payouts;
          }
          break;

        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }

      return {
        schema,
        sampleData,
        totalFields: schema.length
      };
    } catch (error) {
      throw new Error(`Failed to detect schema: ${error.message}`);
    }
  }

  /**
   * Generate payment schema
   */
  generatePaymentSchema() {
    return [
      { name: 'id', type: 'VARCHAR', nullable: false, description: 'Charge ID' },
      { name: 'amount', type: 'BIGINT', nullable: false, description: 'Amount in cents' },
      { name: 'amount_captured', type: 'BIGINT', nullable: false, description: 'Amount captured in cents' },
      { name: 'amount_refunded', type: 'BIGINT', nullable: false, description: 'Amount refunded in cents' },
      { name: 'currency', type: 'VARCHAR', nullable: false, description: 'Currency code' },
      { name: 'status', type: 'VARCHAR', nullable: false, description: 'Charge status' },
      { name: 'paid', type: 'BOOLEAN', nullable: false, description: 'Payment status' },
      { name: 'refunded', type: 'BOOLEAN', nullable: false, description: 'Refund status' },
      { name: 'captured', type: 'BOOLEAN', nullable: false, description: 'Capture status' },
      { name: 'customer', type: 'VARCHAR', nullable: true, description: 'Customer ID' },
      { name: 'description', type: 'TEXT', nullable: true, description: 'Charge description' },
      { name: 'failure_code', type: 'VARCHAR', nullable: true, description: 'Failure code' },
      { name: 'failure_message', type: 'TEXT', nullable: true, description: 'Failure message' },
      { name: 'payment_intent', type: 'VARCHAR', nullable: true, description: 'Payment Intent ID' },
      { name: 'payment_method', type: 'VARCHAR', nullable: true, description: 'Payment Method ID' },
      { name: 'receipt_email', type: 'VARCHAR', nullable: true, description: 'Receipt email' },
      { name: 'receipt_url', type: 'TEXT', nullable: true, description: 'Receipt URL' },
      { name: 'created', type: 'TIMESTAMP', nullable: false, description: 'Created timestamp' },
      { name: 'billing_details', type: 'JSON', nullable: true, description: 'Billing details' },
      { name: 'outcome', type: 'JSON', nullable: true, description: 'Payment outcome' },
      { name: 'metadata', type: 'JSON', nullable: true, description: 'Metadata' }
    ];
  }

  /**
   * Generate subscription schema
   */
  generateSubscriptionSchema() {
    return [
      { name: 'id', type: 'VARCHAR', nullable: false, description: 'Subscription ID' },
      { name: 'customer', type: 'VARCHAR', nullable: false, description: 'Customer ID' },
      { name: 'status', type: 'VARCHAR', nullable: false, description: 'Subscription status' },
      { name: 'current_period_start', type: 'TIMESTAMP', nullable: false, description: 'Current period start' },
      { name: 'current_period_end', type: 'TIMESTAMP', nullable: false, description: 'Current period end' },
      { name: 'created', type: 'TIMESTAMP', nullable: false, description: 'Created timestamp' },
      { name: 'start_date', type: 'TIMESTAMP', nullable: false, description: 'Start date' },
      { name: 'ended_at', type: 'TIMESTAMP', nullable: true, description: 'End timestamp' },
      { name: 'canceled_at', type: 'TIMESTAMP', nullable: true, description: 'Canceled timestamp' },
      { name: 'cancel_at_period_end', type: 'BOOLEAN', nullable: false, description: 'Cancel at period end' },
      { name: 'trial_start', type: 'TIMESTAMP', nullable: true, description: 'Trial start' },
      { name: 'trial_end', type: 'TIMESTAMP', nullable: true, description: 'Trial end' },
      { name: 'collection_method', type: 'VARCHAR', nullable: false, description: 'Collection method' },
      { name: 'currency', type: 'VARCHAR', nullable: false, description: 'Currency code' },
      { name: 'default_payment_method', type: 'VARCHAR', nullable: true, description: 'Default payment method' },
      { name: 'latest_invoice', type: 'VARCHAR', nullable: true, description: 'Latest invoice ID' },
      { name: 'items', type: 'JSON', nullable: false, description: 'Subscription items' },
      { name: 'metadata', type: 'JSON', nullable: true, description: 'Metadata' }
    ];
  }

  /**
   * Generate customer schema
   */
  generateCustomerSchema() {
    return [
      { name: 'id', type: 'VARCHAR', nullable: false, description: 'Customer ID' },
      { name: 'email', type: 'VARCHAR', nullable: true, description: 'Customer email' },
      { name: 'name', type: 'VARCHAR', nullable: true, description: 'Customer name' },
      { name: 'phone', type: 'VARCHAR', nullable: true, description: 'Phone number' },
      { name: 'description', type: 'TEXT', nullable: true, description: 'Customer description' },
      { name: 'balance', type: 'BIGINT', nullable: false, description: 'Account balance in cents' },
      { name: 'currency', type: 'VARCHAR', nullable: true, description: 'Currency code' },
      { name: 'delinquent', type: 'BOOLEAN', nullable: false, description: 'Delinquent status' },
      { name: 'created', type: 'TIMESTAMP', nullable: false, description: 'Created timestamp' },
      { name: 'default_source', type: 'VARCHAR', nullable: true, description: 'Default source ID' },
      { name: 'invoice_prefix', type: 'VARCHAR', nullable: true, description: 'Invoice prefix' },
      { name: 'address', type: 'JSON', nullable: true, description: 'Customer address' },
      { name: 'shipping', type: 'JSON', nullable: true, description: 'Shipping information' },
      { name: 'tax_exempt', type: 'VARCHAR', nullable: true, description: 'Tax exempt status' },
      { name: 'metadata', type: 'JSON', nullable: true, description: 'Metadata' }
    ];
  }

  /**
   * Generate invoice schema
   */
  generateInvoiceSchema() {
    return [
      { name: 'id', type: 'VARCHAR', nullable: false, description: 'Invoice ID' },
      { name: 'customer', type: 'VARCHAR', nullable: false, description: 'Customer ID' },
      { name: 'subscription', type: 'VARCHAR', nullable: true, description: 'Subscription ID' },
      { name: 'status', type: 'VARCHAR', nullable: false, description: 'Invoice status' },
      { name: 'amount_due', type: 'BIGINT', nullable: false, description: 'Amount due in cents' },
      { name: 'amount_paid', type: 'BIGINT', nullable: false, description: 'Amount paid in cents' },
      { name: 'amount_remaining', type: 'BIGINT', nullable: false, description: 'Amount remaining in cents' },
      { name: 'subtotal', type: 'BIGINT', nullable: false, description: 'Subtotal in cents' },
      { name: 'total', type: 'BIGINT', nullable: false, description: 'Total in cents' },
      { name: 'tax', type: 'BIGINT', nullable: true, description: 'Tax in cents' },
      { name: 'currency', type: 'VARCHAR', nullable: false, description: 'Currency code' },
      { name: 'number', type: 'VARCHAR', nullable: true, description: 'Invoice number' },
      { name: 'paid', type: 'BOOLEAN', nullable: false, description: 'Payment status' },
      { name: 'attempted', type: 'BOOLEAN', nullable: false, description: 'Payment attempted' },
      { name: 'created', type: 'TIMESTAMP', nullable: false, description: 'Created timestamp' },
      { name: 'due_date', type: 'TIMESTAMP', nullable: true, description: 'Due date' },
      { name: 'period_start', type: 'TIMESTAMP', nullable: false, description: 'Period start' },
      { name: 'period_end', type: 'TIMESTAMP', nullable: false, description: 'Period end' },
      { name: 'lines', type: 'JSON', nullable: false, description: 'Invoice line items' },
      { name: 'metadata', type: 'JSON', nullable: true, description: 'Metadata' }
    ];
  }

  /**
   * Generate product schema
   */
  generateProductSchema() {
    return [
      { name: 'id', type: 'VARCHAR', nullable: false, description: 'Product ID' },
      { name: 'name', type: 'VARCHAR', nullable: false, description: 'Product name' },
      { name: 'description', type: 'TEXT', nullable: true, description: 'Product description' },
      { name: 'active', type: 'BOOLEAN', nullable: false, description: 'Active status' },
      { name: 'type', type: 'VARCHAR', nullable: false, description: 'Product type' },
      { name: 'unit_label', type: 'VARCHAR', nullable: true, description: 'Unit label' },
      { name: 'url', type: 'TEXT', nullable: true, description: 'Product URL' },
      { name: 'created', type: 'TIMESTAMP', nullable: false, description: 'Created timestamp' },
      { name: 'updated', type: 'TIMESTAMP', nullable: false, description: 'Updated timestamp' },
      { name: 'images', type: 'JSON', nullable: true, description: 'Product images' },
      { name: 'metadata', type: 'JSON', nullable: true, description: 'Metadata' }
    ];
  }

  /**
   * Generate payout schema
   */
  generatePayoutSchema() {
    return [
      { name: 'id', type: 'VARCHAR', nullable: false, description: 'Payout ID' },
      { name: 'amount', type: 'BIGINT', nullable: false, description: 'Payout amount in cents' },
      { name: 'currency', type: 'VARCHAR', nullable: false, description: 'Currency code' },
      { name: 'status', type: 'VARCHAR', nullable: false, description: 'Payout status' },
      { name: 'type', type: 'VARCHAR', nullable: false, description: 'Payout type' },
      { name: 'method', type: 'VARCHAR', nullable: false, description: 'Payout method' },
      { name: 'arrival_date', type: 'TIMESTAMP', nullable: false, description: 'Arrival date' },
      { name: 'created', type: 'TIMESTAMP', nullable: false, description: 'Created timestamp' },
      { name: 'description', type: 'TEXT', nullable: true, description: 'Payout description' },
      { name: 'failure_code', type: 'VARCHAR', nullable: true, description: 'Failure code' },
      { name: 'failure_message', type: 'TEXT', nullable: true, description: 'Failure message' },
      { name: 'destination', type: 'VARCHAR', nullable: true, description: 'Destination ID' },
      { name: 'metadata', type: 'JSON', nullable: true, description: 'Metadata' }
    ];
  }

  /**
   * Test connection to Stripe
   */
  async testConnection(dataSourceId) {
    try {
      const account = await this.getAccountInfo(dataSourceId);
      return { 
        success: true, 
        message: 'Connection successful',
        accountId: account.id,
        businessProfile: account.business_profile,
        country: account.country,
        currency: account.default_currency
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get Stripe webhook events for real-time sync
   */
  getWebhookEvents() {
    return [
      'charge.succeeded',
      'charge.failed',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'customer.created',
      'customer.updated',
      'payout.created',
      'payout.updated'
    ];
  }

  /**
   * Save Stripe connection to database
   */
  async saveConnection(organizationId, connectionData) {
    try {
      // Test connection directly with API key
      const stripe = this.createClient(connectionData.apiKey);
      const account = await stripe.account.retrieve();
      
      const dataSource = await DataSource.create({
        org_id: organizationId,
        name: connectionData.name || `Stripe - ${account.id}`,
        type: 'stripe',
        connection_string: JSON.stringify({
          accountId: account.id,
          country: account.country,
          currency: account.default_currency
        }),
        credentials: {
          apiKey: connectionData.apiKey,
          provider: 'stripe',
          createdAt: new Date()
        },
        status: 'active',
        metadata: {
          provider: 'stripe',
          accountId: account.id,
          businessProfile: account.business_profile,
          country: account.country,
          defaultCurrency: account.default_currency,
          lastSync: new Date(),
          availableDataTypes: ['payments', 'subscriptions', 'customers', 'invoices', 'products', 'payouts'],
          webhookEvents: this.getWebhookEvents()
        }
      });

      return dataSource;
    } catch (error) {
      throw new Error(`Failed to save Stripe connection: ${error.message}`);
    }
  }

  /**
   * Sync data from Stripe (batch operation)
   */
  async syncData(dataSourceId, dataType, options = {}) {
    try {
      const { limit = 100, batchSize = 50 } = options;
      let allData = [];
      let hasMore = true;
      let startingAfter = null;

      while (hasMore && allData.length < limit) {
        const batchOptions = {
          limit: Math.min(batchSize, limit - allData.length),
          startingAfter
        };

        let batchData = [];
        switch (dataType) {
          case 'payments':
            batchData = await this.getPayments(dataSourceId, batchOptions);
            break;
          case 'subscriptions':
            batchData = await this.getSubscriptions(dataSourceId, batchOptions);
            break;
          case 'customers':
            batchData = await this.getCustomers(dataSourceId, batchOptions);
            break;
          case 'invoices':
            batchData = await this.getInvoices(dataSourceId, batchOptions);
            break;
          case 'products':
            batchData = await this.getProducts(dataSourceId, batchOptions);
            break;
          case 'payouts':
            batchData = await this.getPayouts(dataSourceId, batchOptions);
            break;
          default:
            throw new Error(`Unsupported data type: ${dataType}`);
        }

        allData = allData.concat(batchData);
        hasMore = batchData.length === batchSize;
        
        if (hasMore && batchData.length > 0) {
          startingAfter = batchData[batchData.length - 1].id;
        }

        // Rate limiting - Stripe allows 100 requests per second
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        data: allData,
        totalRecords: allData.length,
        dataType,
        syncedAt: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to sync ${dataType}: ${error.message}`);
    }
  }
}

module.exports = StripeService;
