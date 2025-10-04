const Shopify = require('shopify-api-node');
const axios = require('axios');
const { DataSource } = require('../../models');

class ShopifyService {
  constructor() {
    this.apiVersion = '2023-10';
  }

  /**
   * Create Shopify client with stored credentials
   */
  createClient(credentials) {
    return new Shopify({
      shopName: credentials.shopName,
      accessToken: credentials.accessToken,
      apiVersion: this.apiVersion,
      autoLimit: true, // Automatically handle rate limits
      timeout: 30000
    });
  }

  /**
   * Get valid credentials from data source
   */
  async getValidCredentials(dataSourceId) {
    try {
      const dataSource = await DataSource.findByPk(dataSourceId);
      if (!dataSource || !dataSource.credentials) {
        throw new Error('Data source not found or missing credentials');
      }

      const credentials = JSON.parse(dataSource.credentials);
      return credentials;
    } catch (error) {
      throw new Error(`Failed to get credentials: ${error.message}`);
    }
  }

  /**
   * Get shop information
   */
  async getShopInfo(dataSourceId) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const shopify = this.createClient(credentials);
      const shop = await shopify.shop.get();
      return shop;
    } catch (error) {
      throw new Error(`Failed to get shop info: ${error.message}`);
    }
  }

  /**
   * Get products with pagination
   */
  async getProducts(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const shopify = this.createClient(credentials);
      const {
        limit = 50,
        sinceId = null,
        status = 'any',
        vendor = null,
        productType = null,
        collectionId = null,
        createdAtMin = null,
        createdAtMax = null,
        updatedAtMin = null,
        updatedAtMax = null
      } = options;

      const params = {
        limit,
        status
      };

      if (sinceId) params.since_id = sinceId;
      if (vendor) params.vendor = vendor;
      if (productType) params.product_type = productType;
      if (collectionId) params.collection_id = collectionId;
      if (createdAtMin) params.created_at_min = createdAtMin;
      if (createdAtMax) params.created_at_max = createdAtMax;
      if (updatedAtMin) params.updated_at_min = updatedAtMin;
      if (updatedAtMax) params.updated_at_max = updatedAtMax;

      const products = await shopify.product.list(params);
      return products;
    } catch (error) {
      throw new Error(`Failed to get products: ${error.message}`);
    }
  }

  /**
   * Get orders with pagination
   */
  async getOrders(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const shopify = this.createClient(credentials);
      const {
        limit = 50,
        sinceId = null,
        status = 'any',
        financialStatus = null,
        fulfillmentStatus = null,
        createdAtMin = null,
        createdAtMax = null,
        updatedAtMin = null,
        updatedAtMax = null,
        processedAtMin = null,
        processedAtMax = null
      } = options;

      const params = {
        limit,
        status
      };

      if (sinceId) params.since_id = sinceId;
      if (financialStatus) params.financial_status = financialStatus;
      if (fulfillmentStatus) params.fulfillment_status = fulfillmentStatus;
      if (createdAtMin) params.created_at_min = createdAtMin;
      if (createdAtMax) params.created_at_max = createdAtMax;
      if (updatedAtMin) params.updated_at_min = updatedAtMin;
      if (updatedAtMax) params.updated_at_max = updatedAtMax;
      if (processedAtMin) params.processed_at_min = processedAtMin;
      if (processedAtMax) params.processed_at_max = processedAtMax;

      const orders = await shopify.order.list(params);
      return orders;
    } catch (error) {
      throw new Error(`Failed to get orders: ${error.message}`);
    }
  }

  /**
   * Get customers with pagination
   */
  async getCustomers(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const shopify = this.createClient(credentials);
      const {
        limit = 50,
        sinceId = null,
        createdAtMin = null,
        createdAtMax = null,
        updatedAtMin = null,
        updatedAtMax = null
      } = options;

      const params = { limit };

      if (sinceId) params.since_id = sinceId;
      if (createdAtMin) params.created_at_min = createdAtMin;
      if (createdAtMax) params.created_at_max = createdAtMax;
      if (updatedAtMin) params.updated_at_min = updatedAtMin;
      if (updatedAtMax) params.updated_at_max = updatedAtMax;

      const customers = await shopify.customer.list(params);
      return customers;
    } catch (error) {
      throw new Error(`Failed to get customers: ${error.message}`);
    }
  }

  /**
   * Get inventory levels
   */
  async getInventoryLevels(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const shopify = this.createClient(credentials);
      const {
        limit = 50,
        inventoryItemIds = null,
        locationIds = null,
        updatedAtMin = null
      } = options;

      const params = { limit };

      if (inventoryItemIds) params.inventory_item_ids = inventoryItemIds;
      if (locationIds) params.location_ids = locationIds;
      if (updatedAtMin) params.updated_at_min = updatedAtMin;

      const inventoryLevels = await shopify.inventoryLevel.list(params);
      return inventoryLevels;
    } catch (error) {
      throw new Error(`Failed to get inventory levels: ${error.message}`);
    }
  }

  /**
   * Get transactions for orders
   */
  async getTransactions(dataSourceId, orderId) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const shopify = this.createClient(credentials);
      const transactions = await shopify.transaction.list(orderId);
      return transactions;
    } catch (error) {
      throw new Error(`Failed to get transactions: ${error.message}`);
    }
  }

  /**
   * Get analytics data (requires Shopify Plus)
   */
  async getAnalytics(dataSourceId, options = {}) {
    try {
      const credentials = await this.getValidCredentials(dataSourceId);
      const shopify = this.createClient(credentials);
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate = new Date().toISOString().split('T')[0]
      } = options;

      // Get basic analytics using GraphQL
      const query = `
        query getAnalytics($startDate: DateTime!, $endDate: DateTime!) {
          orders(first: 1, query: "created_at:>=${startDate} AND created_at:<=${endDate}") {
            edges {
              node {
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;

      const variables = { startDate, endDate };
      const result = await shopify.graphql(query, variables);
      
      return result;
    } catch (error) {
      throw new Error(`Failed to get analytics: ${error.message}`);
    }
  }

  /**
   * Detect schema for Shopify data types
   */
  async detectSchema(dataSourceId, dataType) {
    try {
      let schema = [];
      let sampleData = [];

      switch (dataType) {
        case 'products':
          const products = await this.getProducts(dataSourceId, { limit: 5 });
          if (products.length > 0) {
            schema = this.generateProductSchema();
            sampleData = products;
          }
          break;

        case 'orders':
          const orders = await this.getOrders(dataSourceId, { limit: 5 });
          if (orders.length > 0) {
            schema = this.generateOrderSchema();
            sampleData = orders;
          }
          break;

        case 'customers':
          const customers = await this.getCustomers(dataSourceId, { limit: 5 });
          if (customers.length > 0) {
            schema = this.generateCustomerSchema();
            sampleData = customers;
          }
          break;

        case 'inventory':
          const inventory = await this.getInventoryLevels(dataSourceId, { limit: 5 });
          if (inventory.length > 0) {
            schema = this.generateInventorySchema();
            sampleData = inventory;
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
   * Generate product schema
   */
  generateProductSchema() {
    return [
      { name: 'id', type: 'BIGINT', nullable: false, description: 'Product ID' },
      { name: 'title', type: 'TEXT', nullable: false, description: 'Product title' },
      { name: 'body_html', type: 'TEXT', nullable: true, description: 'Product description' },
      { name: 'vendor', type: 'VARCHAR', nullable: true, description: 'Product vendor' },
      { name: 'product_type', type: 'VARCHAR', nullable: true, description: 'Product type' },
      { name: 'handle', type: 'VARCHAR', nullable: false, description: 'Product handle/slug' },
      { name: 'status', type: 'VARCHAR', nullable: false, description: 'Product status' },
      { name: 'published_at', type: 'TIMESTAMP', nullable: true, description: 'Published date' },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, description: 'Created date' },
      { name: 'updated_at', type: 'TIMESTAMP', nullable: false, description: 'Updated date' },
      { name: 'tags', type: 'TEXT', nullable: true, description: 'Product tags' },
      { name: 'variants', type: 'JSON', nullable: true, description: 'Product variants' },
      { name: 'images', type: 'JSON', nullable: true, description: 'Product images' },
      { name: 'options', type: 'JSON', nullable: true, description: 'Product options' }
    ];
  }

  /**
   * Generate order schema
   */
  generateOrderSchema() {
    return [
      { name: 'id', type: 'BIGINT', nullable: false, description: 'Order ID' },
      { name: 'order_number', type: 'INTEGER', nullable: false, description: 'Order number' },
      { name: 'name', type: 'VARCHAR', nullable: false, description: 'Order name' },
      { name: 'email', type: 'VARCHAR', nullable: true, description: 'Customer email' },
      { name: 'phone', type: 'VARCHAR', nullable: true, description: 'Customer phone' },
      { name: 'financial_status', type: 'VARCHAR', nullable: true, description: 'Financial status' },
      { name: 'fulfillment_status', type: 'VARCHAR', nullable: true, description: 'Fulfillment status' },
      { name: 'total_price', type: 'DECIMAL', nullable: false, description: 'Total price' },
      { name: 'subtotal_price', type: 'DECIMAL', nullable: false, description: 'Subtotal price' },
      { name: 'total_tax', type: 'DECIMAL', nullable: true, description: 'Total tax' },
      { name: 'total_discounts', type: 'DECIMAL', nullable: true, description: 'Total discounts' },
      { name: 'currency', type: 'VARCHAR', nullable: false, description: 'Currency code' },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, description: 'Created date' },
      { name: 'updated_at', type: 'TIMESTAMP', nullable: false, description: 'Updated date' },
      { name: 'processed_at', type: 'TIMESTAMP', nullable: true, description: 'Processed date' },
      { name: 'customer', type: 'JSON', nullable: true, description: 'Customer data' },
      { name: 'line_items', type: 'JSON', nullable: true, description: 'Order line items' },
      { name: 'shipping_address', type: 'JSON', nullable: true, description: 'Shipping address' },
      { name: 'billing_address', type: 'JSON', nullable: true, description: 'Billing address' }
    ];
  }

  /**
   * Generate customer schema
   */
  generateCustomerSchema() {
    return [
      { name: 'id', type: 'BIGINT', nullable: false, description: 'Customer ID' },
      { name: 'email', type: 'VARCHAR', nullable: true, description: 'Customer email' },
      { name: 'first_name', type: 'VARCHAR', nullable: true, description: 'First name' },
      { name: 'last_name', type: 'VARCHAR', nullable: true, description: 'Last name' },
      { name: 'phone', type: 'VARCHAR', nullable: true, description: 'Phone number' },
      { name: 'state', type: 'VARCHAR', nullable: false, description: 'Customer state' },
      { name: 'total_spent', type: 'DECIMAL', nullable: true, description: 'Total spent' },
      { name: 'orders_count', type: 'INTEGER', nullable: true, description: 'Orders count' },
      { name: 'accepts_marketing', type: 'BOOLEAN', nullable: false, description: 'Accepts marketing' },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, description: 'Created date' },
      { name: 'updated_at', type: 'TIMESTAMP', nullable: false, description: 'Updated date' },
      { name: 'addresses', type: 'JSON', nullable: true, description: 'Customer addresses' },
      { name: 'tags', type: 'TEXT', nullable: true, description: 'Customer tags' }
    ];
  }

  /**
   * Generate inventory schema
   */
  generateInventorySchema() {
    return [
      { name: 'inventory_item_id', type: 'BIGINT', nullable: false, description: 'Inventory item ID' },
      { name: 'location_id', type: 'BIGINT', nullable: false, description: 'Location ID' },
      { name: 'available', type: 'INTEGER', nullable: true, description: 'Available quantity' },
      { name: 'updated_at', type: 'TIMESTAMP', nullable: false, description: 'Updated date' }
    ];
  }

  /**
   * Test connection to Shopify
   */
  async testConnection(dataSourceId) {
    try {
      const shop = await this.getShopInfo(dataSourceId);
      return { 
        success: true, 
        message: 'Connection successful',
        shopName: shop.name,
        domain: shop.domain
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get Shopify webhook endpoints for real-time sync
   */
  getWebhookTopics() {
    return [
      'orders/create',
      'orders/updated',
      'orders/paid',
      'orders/cancelled',
      'products/create',
      'products/update',
      'customers/create',
      'customers/update',
      'inventory_levels/update'
    ];
  }

  /**
   * Save Shopify connection to database
   */
  async saveConnection(organizationId, connectionData) {
    try {
      // Test connection first
      const shopify = this.createClient(connectionData.credentials);
      const shop = await shopify.shop.get();

      const dataSource = await DataSource.create({
        organization_id: organizationId,
        name: connectionData.name || `Shopify - ${shop.name}`,
        type: 'shopify',
        connection_string: JSON.stringify({
          shopName: connectionData.credentials.shopName,
          domain: shop.domain
        }),
        credentials: JSON.stringify({
          accessToken: connectionData.credentials.accessToken,
          shopName: connectionData.credentials.shopName,
          provider: 'shopify',
          createdAt: new Date().toISOString()
        }),
        status: 'active',
        metadata: JSON.stringify({
          provider: 'shopify',
          shopName: shop.name,
          domain: shop.domain,
          lastSync: new Date(),
          availableDataTypes: ['products', 'orders', 'customers', 'inventory'],
          webhookTopics: this.getWebhookTopics()
        })
      });

      return dataSource;
    } catch (error) {
      throw new Error(`Failed to save Shopify connection: ${error.message}`);
    }
  }

  /**
   * Sync data from Shopify (batch operation)
   */
  async syncData(dataSourceId, dataType, options = {}) {
    try {
      const { batchSize = 100, lastSyncDate = null } = options;
      let allData = [];
      let hasMore = true;
      let sinceId = null;

      const syncOptions = {
        limit: batchSize,
        ...(lastSyncDate && { updated_at_min: lastSyncDate })
      };

      while (hasMore) {
        if (sinceId) {
          syncOptions.since_id = sinceId;
        }

        let batch = [];
        switch (dataType) {
          case 'products':
            batch = await this.getProducts(dataSourceId, syncOptions);
            break;
          case 'orders':
            batch = await this.getOrders(dataSourceId, syncOptions);
            break;
          case 'customers':
            batch = await this.getCustomers(dataSourceId, syncOptions);
            break;
          default:
            throw new Error(`Unsupported sync data type: ${dataType}`);
        }

        if (batch.length === 0) {
          hasMore = false;
        } else {
          allData = allData.concat(batch);
          sinceId = batch[batch.length - 1].id;
          hasMore = batch.length === batchSize;
        }

        // Add delay to respect rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return {
        dataType,
        totalRecords: allData.length,
        data: allData,
        lastSyncDate: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to sync ${dataType}: ${error.message}`);
    }
  }
}

module.exports = ShopifyService;