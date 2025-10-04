const { DataSource } = require('../models');
const { Op } = require('sequelize');

/**
 * Data Transformation Service
 * Provides utilities for normalizing and transforming data from different sources
 * for unified business analytics
 */
class DataTransformationService {
  constructor() {
    this.standardFields = {
      // Customer/Contact fields
      customer: {
        id: 'customer_id',
        name: 'customer_name',
        email: 'email',
        phone: 'phone',
        address: 'address',
        city: 'city',
        state: 'state',
        country: 'country',
        zipCode: 'zip_code',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      
      // Product fields
      product: {
        id: 'product_id',
        name: 'product_name',
        sku: 'sku',
        price: 'price',
        cost: 'cost',
        category: 'category',
        description: 'description',
        inventory: 'inventory_quantity',
        status: 'status',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      
      // Order/Transaction fields
      order: {
        id: 'order_id',
        customerId: 'customer_id',
        orderNumber: 'order_number',
        status: 'status',
        totalAmount: 'total_amount',
        subtotal: 'subtotal',
        tax: 'tax_amount',
        shipping: 'shipping_amount',
        discount: 'discount_amount',
        currency: 'currency',
        orderDate: 'order_date',
        shippedDate: 'shipped_date',
        deliveredDate: 'delivered_date',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      
      // Payment fields
      payment: {
        id: 'payment_id',
        orderId: 'order_id',
        customerId: 'customer_id',
        amount: 'amount',
        currency: 'currency',
        method: 'payment_method',
        status: 'status',
        transactionId: 'transaction_id',
        processedAt: 'processed_at',
        createdAt: 'created_at'
      },
      
      // Financial fields
      financial: {
        id: 'record_id',
        accountName: 'account_name',
        accountType: 'account_type',
        amount: 'amount',
        currency: 'currency',
        date: 'transaction_date',
        description: 'description',
        category: 'category',
        reference: 'reference',
        createdAt: 'created_at'
      }
    };

    this.dataTypeMapping = {
      // Source type -> Standard type mapping
      'google_sheets': {
        'spreadsheet_data': 'raw_data'
      },
      'quickbooks': {
        'customers': 'customer',
        'items': 'product',
        'invoices': 'order',
        'payments': 'payment',
        'profit_loss': 'financial',
        'balance_sheet': 'financial'
      },
      'shopify': {
        'customers': 'customer',
        'products': 'product',
        'orders': 'order',
        'transactions': 'payment'
      },
      'stripe': {
        'customers': 'customer',
        'charges': 'payment',
        'payment_intents': 'payment',
        'invoices': 'order',
        'subscriptions': 'order'
      },
      'postgresql': {
        'table_data': 'raw_data'
      },
      'mysql': {
        'table_data': 'raw_data'
      },
      'csv': {
        'file_data': 'raw_data'
      }
    };
  }

  /**
   * Normalize data from different sources to standard format
   * @param {Object} data - Raw data from source
   * @param {string} sourceType - Type of data source
   * @param {string} dataType - Type of data (customers, products, etc.)
   * @param {Object} fieldMapping - Custom field mapping
   * @returns {Object} Normalized data
   */
  normalizeData(data, sourceType, dataType, fieldMapping = {}) {
    try {
      const standardType = this.dataTypeMapping[sourceType]?.[dataType] || 'raw_data';
      const standardFields = this.standardFields[standardType] || {};
      
      if (Array.isArray(data)) {
        return data.map(record => this.normalizeRecord(record, standardFields, fieldMapping));
      } else {
        return this.normalizeRecord(data, standardFields, fieldMapping);
      }
    } catch (error) {
      throw new Error(`Data normalization failed: ${error.message}`);
    }
  }

  /**
   * Normalize a single record
   * @param {Object} record - Single data record
   * @param {Object} standardFields - Standard field mapping
   * @param {Object} customMapping - Custom field mapping
   * @returns {Object} Normalized record
   */
  normalizeRecord(record, standardFields, customMapping = {}) {
    const normalized = {};
    const mapping = { ...standardFields, ...customMapping };

    // Apply field mapping
    for (const [standardField, sourceField] of Object.entries(mapping)) {
      if (record.hasOwnProperty(sourceField)) {
        normalized[standardField] = this.transformValue(record[sourceField], standardField);
      }
    }

    // Add metadata
    normalized._source_data = record;
    normalized._normalized_at = new Date();

    return normalized;
  }

  /**
   * Transform value based on field type
   * @param {any} value - Original value
   * @param {string} fieldName - Field name for context
   * @returns {any} Transformed value
   */
  transformValue(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Date fields
    if (fieldName.includes('date') || fieldName.includes('_at')) {
      return this.normalizeDate(value);
    }

    // Amount/Price fields
    if (fieldName.includes('amount') || fieldName.includes('price') || fieldName.includes('cost')) {
      return this.normalizeAmount(value);
    }

    // Email fields
    if (fieldName.includes('email')) {
      return this.normalizeEmail(value);
    }

    // Phone fields
    if (fieldName.includes('phone')) {
      return this.normalizePhone(value);
    }

    // Status fields
    if (fieldName.includes('status')) {
      return this.normalizeStatus(value);
    }

    return value;
  }

  /**
   * Normalize date values
   * @param {any} value - Date value
   * @returns {Date|null} Normalized date
   */
  normalizeDate(value) {
    if (!value) return null;
    
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalize amount values
   * @param {any} value - Amount value
   * @returns {number|null} Normalized amount
   */
  normalizeAmount(value) {
    if (!value) return null;
    
    // Remove currency symbols and commas
    const cleanValue = String(value).replace(/[$,€£¥]/g, '').trim();
    const numValue = parseFloat(cleanValue);
    
    return isNaN(numValue) ? null : numValue;
  }

  /**
   * Normalize email values
   * @param {string} value - Email value
   * @returns {string|null} Normalized email
   */
  normalizeEmail(value) {
    if (!value) return null;
    
    const email = String(value).toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    return emailRegex.test(email) ? email : null;
  }

  /**
   * Normalize phone values
   * @param {string} value - Phone value
   * @returns {string|null} Normalized phone
   */
  normalizePhone(value) {
    if (!value) return null;
    
    // Remove all non-digit characters except +
    const phone = String(value).replace(/[^\d+]/g, '');
    
    return phone.length >= 10 ? phone : null;
  }

  /**
   * Normalize status values
   * @param {string} value - Status value
   * @returns {string} Normalized status
   */
  normalizeStatus(value) {
    if (!value) return 'unknown';
    
    const status = String(value).toLowerCase().trim();
    
    // Common status mappings
    const statusMap = {
      'active': 'active',
      'inactive': 'inactive',
      'pending': 'pending',
      'completed': 'completed',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'draft': 'draft',
      'published': 'active',
      'unpublished': 'inactive',
      'enabled': 'active',
      'disabled': 'inactive',
      'open': 'active',
      'closed': 'inactive',
      'paid': 'completed',
      'unpaid': 'pending',
      'refunded': 'cancelled'
    };

    return statusMap[status] || status;
  }

  /**
   * Create unified analytics schema
   * @param {Array} dataSources - Array of data sources
   * @returns {Object} Unified schema
   */
  async createUnifiedSchema(dataSources) {
    try {
      const schema = {
        entities: {},
        relationships: [],
        metrics: {},
        dimensions: {}
      };

      for (const dataSource of dataSources) {
        const sourceSchema = JSON.parse(dataSource.metadata).schema || {};
        const sourceType = dataSource.type;
        
        // Map source entities to standard entities
        for (const [dataType, fields] of Object.entries(sourceSchema)) {
          const standardType = this.dataTypeMapping[sourceType]?.[dataType] || 'raw_data';
          
          if (!schema.entities[standardType]) {
            schema.entities[standardType] = {
              fields: {},
              sources: []
            };
          }

          // Merge fields
          const standardFields = this.standardFields[standardType] || {};
          for (const [fieldName, fieldInfo] of Object.entries(fields)) {
            const standardFieldName = this.findStandardFieldName(fieldName, standardFields);
            if (standardFieldName) {
              schema.entities[standardType].fields[standardFieldName] = {
                type: fieldInfo.type,
                sources: [...(schema.entities[standardType].fields[standardFieldName]?.sources || []), {
                  dataSource: dataSource.id,
                  sourceField: fieldName
                }]
              };
            }
          }

          schema.entities[standardType].sources.push({
            dataSourceId: dataSource.id,
            dataSourceName: dataSource.name,
            dataType: dataType
          });
        }
      }

      // Define common relationships
      schema.relationships = this.defineCommonRelationships();
      
      // Define common metrics
      schema.metrics = this.defineCommonMetrics();
      
      // Define common dimensions
      schema.dimensions = this.defineCommonDimensions();

      return schema;
    } catch (error) {
      throw new Error(`Failed to create unified schema: ${error.message}`);
    }
  }

  /**
   * Find standard field name for a source field
   * @param {string} sourceField - Source field name
   * @param {Object} standardFields - Standard field mapping
   * @returns {string|null} Standard field name
   */
  findStandardFieldName(sourceField, standardFields) {
    const lowerSourceField = sourceField.toLowerCase();
    
    for (const [standardField, mappedField] of Object.entries(standardFields)) {
      if (mappedField.toLowerCase() === lowerSourceField) {
        return standardField;
      }
    }

    // Try fuzzy matching
    for (const [standardField, mappedField] of Object.entries(standardFields)) {
      if (lowerSourceField.includes(mappedField.toLowerCase()) || 
          mappedField.toLowerCase().includes(lowerSourceField)) {
        return standardField;
      }
    }

    return null;
  }

  /**
   * Define common entity relationships
   * @returns {Array} Common relationships
   */
  defineCommonRelationships() {
    return [
      {
        from: 'order',
        to: 'customer',
        type: 'many_to_one',
        foreignKey: 'customer_id'
      },
      {
        from: 'payment',
        to: 'order',
        type: 'many_to_one',
        foreignKey: 'order_id'
      },
      {
        from: 'payment',
        to: 'customer',
        type: 'many_to_one',
        foreignKey: 'customer_id'
      },
      {
        from: 'order_item',
        to: 'order',
        type: 'many_to_one',
        foreignKey: 'order_id'
      },
      {
        from: 'order_item',
        to: 'product',
        type: 'many_to_one',
        foreignKey: 'product_id'
      }
    ];
  }

  /**
   * Define common business metrics
   * @returns {Object} Common metrics
   */
  defineCommonMetrics() {
    return {
      revenue: {
        name: 'Total Revenue',
        calculation: 'SUM(order.total_amount)',
        entity: 'order',
        field: 'total_amount',
        aggregation: 'sum'
      },
      orderCount: {
        name: 'Order Count',
        calculation: 'COUNT(order.order_id)',
        entity: 'order',
        field: 'order_id',
        aggregation: 'count'
      },
      averageOrderValue: {
        name: 'Average Order Value',
        calculation: 'AVG(order.total_amount)',
        entity: 'order',
        field: 'total_amount',
        aggregation: 'avg'
      },
      customerCount: {
        name: 'Customer Count',
        calculation: 'COUNT(DISTINCT customer.customer_id)',
        entity: 'customer',
        field: 'customer_id',
        aggregation: 'count_distinct'
      },
      productCount: {
        name: 'Product Count',
        calculation: 'COUNT(product.product_id)',
        entity: 'product',
        field: 'product_id',
        aggregation: 'count'
      },
      paymentVolume: {
        name: 'Payment Volume',
        calculation: 'SUM(payment.amount)',
        entity: 'payment',
        field: 'amount',
        aggregation: 'sum'
      }
    };
  }

  /**
   * Define common dimensions for analytics
   * @returns {Object} Common dimensions
   */
  defineCommonDimensions() {
    return {
      time: {
        year: 'YEAR(order.order_date)',
        quarter: 'QUARTER(order.order_date)',
        month: 'MONTH(order.order_date)',
        week: 'WEEK(order.order_date)',
        day: 'DAY(order.order_date)',
        dayOfWeek: 'DAYOFWEEK(order.order_date)'
      },
      geography: {
        country: 'customer.country',
        state: 'customer.state',
        city: 'customer.city'
      },
      product: {
        category: 'product.category',
        sku: 'product.sku',
        name: 'product.product_name'
      },
      customer: {
        segment: 'customer.segment',
        type: 'customer.type'
      },
      order: {
        status: 'order.status',
        channel: 'order.channel'
      }
    };
  }

  /**
   * Generate analytics query based on unified schema
   * @param {Object} querySpec - Query specification
   * @param {Object} unifiedSchema - Unified schema
   * @returns {Object} Analytics query result
   */
  generateAnalyticsQuery(querySpec, unifiedSchema) {
    const { metrics, dimensions, filters, timeRange } = querySpec;
    
    const query = {
      select: [],
      from: [],
      joins: [],
      where: [],
      groupBy: [],
      orderBy: []
    };

    // Add metrics to SELECT
    metrics.forEach(metric => {
      const metricDef = unifiedSchema.metrics[metric];
      if (metricDef) {
        query.select.push(`${metricDef.aggregation.toUpperCase()}(${metricDef.field}) as ${metric}`);
        if (!query.from.includes(metricDef.entity)) {
          query.from.push(metricDef.entity);
        }
      }
    });

    // Add dimensions to SELECT and GROUP BY
    dimensions.forEach(dimension => {
      const dimPath = dimension.split('.');
      const dimCategory = dimPath[0];
      const dimField = dimPath[1];
      
      const dimensionDef = unifiedSchema.dimensions[dimCategory]?.[dimField];
      if (dimensionDef) {
        query.select.push(`${dimensionDef} as ${dimension.replace('.', '_')}`);
        query.groupBy.push(dimensionDef);
      }
    });

    // Add filters to WHERE
    if (filters) {
      Object.entries(filters).forEach(([field, value]) => {
        if (Array.isArray(value)) {
          query.where.push(`${field} IN (${value.map(v => `'${v}'`).join(', ')})`);
        } else {
          query.where.push(`${field} = '${value}'`);
        }
      });
    }

    // Add time range filter
    if (timeRange) {
      const { start, end, field = 'order.order_date' } = timeRange;
      if (start) query.where.push(`${field} >= '${start}'`);
      if (end) query.where.push(`${field} <= '${end}'`);
    }

    // Generate relationships/joins
    const entities = [...new Set(query.from)];
    if (entities.length > 1) {
      query.joins = this.generateJoins(entities, unifiedSchema.relationships);
    }

    return query;
  }

  /**
   * Generate JOIN clauses for multi-entity queries
   * @param {Array} entities - Entities to join
   * @param {Array} relationships - Available relationships
   * @returns {Array} JOIN clauses
   */
  generateJoins(entities, relationships) {
    const joins = [];
    const processed = new Set();
    
    // Start with first entity as base
    processed.add(entities[0]);
    
    // Find joins for remaining entities
    entities.slice(1).forEach(entity => {
      const relationship = relationships.find(rel => 
        (rel.from === entity && processed.has(rel.to)) ||
        (rel.to === entity && processed.has(rel.from))
      );
      
      if (relationship) {
        if (relationship.from === entity) {
          joins.push(`LEFT JOIN ${entity} ON ${entity}.${relationship.foreignKey} = ${relationship.to}.id`);
        } else {
          joins.push(`LEFT JOIN ${entity} ON ${relationship.from}.${relationship.foreignKey} = ${entity}.id`);
        }
        processed.add(entity);
      }
    });
    
    return joins;
  }

  /**
   * Transform data for specific analytics use case
   * @param {Array} data - Raw data
   * @param {string} useCase - Analytics use case
   * @returns {Array} Transformed data
   */
  transformForAnalytics(data, useCase) {
    switch (useCase) {
      case 'revenue_analysis':
        return this.transformForRevenueAnalysis(data);
      case 'customer_analysis':
        return this.transformForCustomerAnalysis(data);
      case 'product_analysis':
        return this.transformForProductAnalysis(data);
      case 'cohort_analysis':
        return this.transformForCohortAnalysis(data);
      default:
        return data;
    }
  }

  /**
   * Transform data for revenue analysis
   * @param {Array} data - Raw data
   * @returns {Array} Transformed data
   */
  transformForRevenueAnalysis(data) {
    return data.map(record => ({
      ...record,
      revenue: this.normalizeAmount(record.total_amount || record.amount),
      period: this.extractTimePeriod(record.order_date || record.created_at),
      growth_rate: null // Will be calculated in post-processing
    }));
  }

  /**
   * Transform data for customer analysis
   * @param {Array} data - Raw data
   * @returns {Array} Transformed data
   */
  transformForCustomerAnalysis(data) {
    return data.map(record => ({
      ...record,
      customer_lifetime_value: null, // Will be calculated
      acquisition_date: this.normalizeDate(record.created_at),
      last_order_date: this.normalizeDate(record.last_order_date),
      order_frequency: null, // Will be calculated
      customer_segment: this.categorizeCustomer(record)
    }));
  }

  /**
   * Transform data for product analysis
   * @param {Array} data - Raw data
   * @returns {Array} Transformed data
   */
  transformForProductAnalysis(data) {
    return data.map(record => ({
      ...record,
      profit_margin: this.calculateProfitMargin(record.price, record.cost),
      inventory_turnover: null, // Will be calculated
      sales_velocity: null, // Will be calculated
      product_category: record.category || 'uncategorized'
    }));
  }

  /**
   * Transform data for cohort analysis
   * @param {Array} data - Raw data
   * @returns {Array} Transformed data
   */
  transformForCohortAnalysis(data) {
    return data.map(record => ({
      ...record,
      cohort_month: this.extractCohortMonth(record.created_at),
      period_number: null, // Will be calculated based on cohort
      retention_rate: null // Will be calculated
    }));
  }

  /**
   * Extract time period from date
   * @param {Date|string} date - Date value
   * @returns {string} Time period
   */
  extractTimePeriod(date) {
    if (!date) return null;
    
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Extract cohort month from date
   * @param {Date|string} date - Date value
   * @returns {string} Cohort month
   */
  extractCohortMonth(date) {
    if (!date) return null;
    
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Categorize customer based on behavior
   * @param {Object} record - Customer record
   * @returns {string} Customer segment
   */
  categorizeCustomer(record) {
    const totalSpent = this.normalizeAmount(record.total_spent || 0);
    const orderCount = parseInt(record.order_count || 0);
    
    if (totalSpent > 1000 && orderCount > 5) return 'vip';
    if (totalSpent > 500 || orderCount > 3) return 'loyal';
    if (orderCount > 1) return 'repeat';
    return 'new';
  }

  /**
   * Calculate profit margin
   * @param {number} price - Product price
   * @param {number} cost - Product cost
   * @returns {number} Profit margin percentage
   */
  calculateProfitMargin(price, cost) {
    const p = this.normalizeAmount(price);
    const c = this.normalizeAmount(cost);
    
    if (!p || !c || p === 0) return null;
    
    return ((p - c) / p) * 100;
  }
}

module.exports = DataTransformationService;