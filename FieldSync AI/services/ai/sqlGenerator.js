const OpenAI = require('openai');
const { Parser } = require('node-sql-parser');
const { format } = require('sql-formatter');
const { DataSource } = require('../../models');

class SQLGenerator {
  constructor() {
    this.initializeLLMProviders();
    this.parser = new Parser();
    this.maxTokens = 1500;
    this.temperature = 0.1; // Low temperature for consistent SQL generation
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  initializeLLMProviders() {
    this.providers = {};
    
    // OpenAI Provider
    if (process.env.OPENAI_API_KEY) {
      this.providers.openai = {
        client: new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        }),
        models: {
          primary: "gpt-4-turbo-preview",
          fallback: "gpt-3.5-turbo"
        },
        available: true
      };
    }

    // Azure OpenAI Provider
    if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
      this.providers.azure = {
        client: new OpenAI({
          apiKey: process.env.AZURE_OPENAI_API_KEY,
          baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
          defaultQuery: { 'api-version': '2024-02-15-preview' },
          defaultHeaders: {
            'api-key': process.env.AZURE_OPENAI_API_KEY,
          }
        }),
        models: {
          primary: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4",
          fallback: process.env.AZURE_OPENAI_FALLBACK_DEPLOYMENT || "gpt-35-turbo"
        },
        available: true
      };
    }

    // Set primary provider
    this.primaryProvider = process.env.LLM_PROVIDER || 'openai';
    
    if (!this.providers[this.primaryProvider]?.available) {
      const availableProviders = Object.keys(this.providers).filter(p => this.providers[p].available);
      if (availableProviders.length > 0) {
        this.primaryProvider = availableProviders[0];
        console.warn(`Primary LLM provider not available, using ${this.primaryProvider}`);
      } else {
        this.primaryProvider = null;
      }
    }
  }

  async generateSQL(query, intent, dataSourceId, organizationId) {
    const startTime = Date.now();
    let lastError = null;

    if (!this.primaryProvider) {
      throw new Error('No LLM providers configured. Please set OPENAI_API_KEY or Azure OpenAI credentials.');
    }

    // Try primary provider first, then fallback providers
    const providers = [this.primaryProvider, ...Object.keys(this.providers).filter(p => p !== this.primaryProvider)];
    
    for (const providerName of providers) {
      const provider = this.providers[providerName];
      if (!provider?.available) continue;

      try {
        console.log(`Attempting SQL generation with ${providerName} provider`);
        
        // Get data source schema
        const dataSource = await DataSource.findOne({
          where: { id: dataSourceId, org_id: organizationId }
        });

        if (!dataSource) {
          throw new Error('Data source not found');
        }

        const schema = await this.getDataSourceSchema(dataSource);
        const result = await this.generateWithProvider(provider, query, intent, schema, dataSource);
        
        console.log(`SQL generation successful with ${providerName} (${Date.now() - startTime}ms)`);
        return result;

      } catch (error) {
        console.error(`SQL generation failed with ${providerName}:`, error.message);
        lastError = error;
        
        // If it's a rate limit error, wait before trying next provider
        if (error.message.includes('rate limit') || error.message.includes('quota')) {
          await this.delay(this.retryDelay);
        }
        
        continue;
      }
    }

    // All providers failed
    console.error('All LLM providers failed for SQL generation');
    throw new Error(`Failed to generate SQL: ${lastError?.message || 'All providers unavailable'}`);
  }

  async generateWithProvider(provider, query, intent, schema, dataSource) {
    const systemPrompt = this.buildSystemPrompt(schema, dataSource.type);
    const userPrompt = this.buildUserPrompt(query, intent);

    let attempt = 0;
    while (attempt < this.retryAttempts) {
      try {
        const completion = await provider.client.chat.completions.create({
          model: attempt === 0 ? provider.models.primary : provider.models.fallback,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          response_format: { type: "json_object" }
        });

        const response = JSON.parse(completion.choices[0].message.content);
        
        // Validate and format the generated SQL
        const validatedSQL = await this.validateAndFormatSQL(response.sql, dataSource.type);
        
        return {
          sql: validatedSQL,
          explanation: response.explanation,
          confidence: response.confidence || 0.8,
          estimatedRows: response.estimated_rows || null,
          executionPlan: response.execution_plan || null,
          warnings: response.warnings || [],
          provider: provider === this.providers.openai ? 'openai' : 'azure',
          model: attempt === 0 ? provider.models.primary : provider.models.fallback
        };

      } catch (error) {
        attempt++;
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt);
        } else {
          throw error;
        }
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  buildSystemPrompt(schema, dataSourceType) {
    return `You are an expert SQL query generator. Your task is to convert natural language questions into optimized SQL queries.

Database Type: ${dataSourceType}
Available Schema:
${JSON.stringify(schema, null, 2)}

IMPORTANT RULES:
1. Only use tables and columns that exist in the provided schema
2. Generate syntactically correct SQL for ${dataSourceType}
3. Use appropriate JOINs when querying multiple tables
4. Include proper WHERE clauses for filtering
5. Use GROUP BY and ORDER BY when appropriate
6. Limit results to reasonable numbers (use LIMIT/TOP)
7. Use proper date functions for time-based queries
8. Never use DROP, DELETE, UPDATE, INSERT, or other destructive operations
9. Always use parameterized queries when possible

Response Format (JSON):
{
  "sql": "SELECT statement here",
  "explanation": "Brief explanation of what the query does",
  "confidence": 0.95,
  "estimated_rows": 1000,
  "execution_plan": "Brief execution strategy",
  "warnings": ["Any potential issues or limitations"]
}

Focus on generating efficient, readable SQL that answers the user's question accurately.`;
  }

  buildUserPrompt(query, intent) {
    return `Natural Language Query: "${query}"
Detected Intent: ${intent.intent}
Confidence: ${intent.confidence}
Entities: ${JSON.stringify(intent.entities)}
Timeframe: ${JSON.stringify(intent.timeframe)}
Metrics: ${JSON.stringify(intent.metrics)}
Dimensions: ${JSON.stringify(intent.dimensions)}

Generate an optimized SQL query that answers this question. Consider the detected intent and entities to create the most accurate query possible.`;
  }

  async getDataSourceSchema(dataSource) {
    try {
      const config = this.parseConnectionConfig(dataSource);
      const schema = this.parseSchemaField(dataSource.schema);

      switch (dataSource.type) {
        case 'postgresql':
        case 'mysql':
          return await this.getDatabaseSchema(dataSource, config);
        case 'google_sheets':
          return this.getGoogleSheetsSchema(config, schema);
        case 'shopify':
          return this.getShopifySchema();
        case 'stripe':
          return this.getStripeSchema();
        case 'quickbooks':
          return this.getQuickBooksSchema();
        case 'csv':
          return this.getCSVSchema(config, schema);
        default:
          throw new Error(`Unsupported data source type: ${dataSource.type}`);
      }
    } catch (error) {
      console.error('Schema retrieval error:', error);
      return { tables: [], relationships: [] };
    }
  }

  async getDatabaseSchema(dataSource, config) {
    const databaseConnector = require('../integrations/databaseConnector');
    try {
      const connectionConfig = {
        type: dataSource.type,
        ...config
      };
      const tables = await databaseConnector.getTables(connectionConfig);
      
      const schema = { tables: [], relationships: [] };
      
      for (const table of tables) {
        const tableSchema = await databaseConnector.detectTableSchema(
          connectionConfig,
          table.name,
          table.schema || null
        );
        schema.tables.push({
          name: table.name,
          columns: tableSchema.schema,
          sample_data: tableSchema.sampleData?.slice(0, 3) || []
        });
      }
      return schema;
    } catch (error) {
      console.error('Database schema error:', error);
      return { tables: [], relationships: [] };
    }
  }

  getGoogleSheetsSchema(config, schemaOverride) {
    if (schemaOverride && schemaOverride.tables) {
      return schemaOverride;
    }
    return {
      tables: [{
        name: config.sheet_name || 'sheet_data',
        columns: config.schema || [],
        sample_data: config.sample_data?.slice(0, 3) || []
      }],
      relationships: []
    };
  }

  getShopifySchema() {
    return {
      tables: [
        {
          name: 'products',
          columns: [
            { name: 'id', type: 'bigint', description: 'Product ID' },
            { name: 'title', type: 'varchar', description: 'Product title' },
            { name: 'vendor', type: 'varchar', description: 'Product vendor' },
            { name: 'product_type', type: 'varchar', description: 'Product type' },
            { name: 'created_at', type: 'timestamp', description: 'Creation date' },
            { name: 'updated_at', type: 'timestamp', description: 'Last update' }
          ]
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'bigint', description: 'Order ID' },
            { name: 'order_number', type: 'varchar', description: 'Order number' },
            { name: 'total_price', type: 'decimal', description: 'Total order price' },
            { name: 'subtotal_price', type: 'decimal', description: 'Subtotal price' },
            { name: 'created_at', type: 'timestamp', description: 'Order date' },
            { name: 'customer_id', type: 'bigint', description: 'Customer ID' }
          ]
        },
        {
          name: 'customers',
          columns: [
            { name: 'id', type: 'bigint', description: 'Customer ID' },
            { name: 'email', type: 'varchar', description: 'Customer email' },
            { name: 'first_name', type: 'varchar', description: 'First name' },
            { name: 'last_name', type: 'varchar', description: 'Last name' },
            { name: 'created_at', type: 'timestamp', description: 'Registration date' }
          ]
        }
      ],
      relationships: [
        { from: 'orders.customer_id', to: 'customers.id', type: 'many_to_one' }
      ]
    };
  }

  getStripeSchema() {
    return {
      tables: [
        {
          name: 'payments',
          columns: [
            { name: 'id', type: 'varchar', description: 'Payment ID' },
            { name: 'amount', type: 'bigint', description: 'Amount in cents' },
            { name: 'currency', type: 'varchar', description: 'Currency code' },
            { name: 'status', type: 'varchar', description: 'Payment status' },
            { name: 'created', type: 'timestamp', description: 'Payment date' },
            { name: 'customer_id', type: 'varchar', description: 'Customer ID' }
          ]
        },
        {
          name: 'customers',
          columns: [
            { name: 'id', type: 'varchar', description: 'Customer ID' },
            { name: 'email', type: 'varchar', description: 'Customer email' },
            { name: 'name', type: 'varchar', description: 'Customer name' },
            { name: 'created', type: 'timestamp', description: 'Registration date' }
          ]
        },
        {
          name: 'subscriptions',
          columns: [
            { name: 'id', type: 'varchar', description: 'Subscription ID' },
            { name: 'customer_id', type: 'varchar', description: 'Customer ID' },
            { name: 'status', type: 'varchar', description: 'Subscription status' },
            { name: 'current_period_start', type: 'timestamp', description: 'Period start' },
            { name: 'current_period_end', type: 'timestamp', description: 'Period end' }
          ]
        }
      ],
      relationships: [
        { from: 'payments.customer_id', to: 'customers.id', type: 'many_to_one' },
        { from: 'subscriptions.customer_id', to: 'customers.id', type: 'many_to_one' }
      ]
    };
  }

  getQuickBooksSchema() {
    return {
      tables: [
        {
          name: 'customers',
          columns: [
            { name: 'Id', type: 'varchar', description: 'Customer ID' },
            { name: 'Name', type: 'varchar', description: 'Customer name' },
            { name: 'CompanyName', type: 'varchar', description: 'Company name' },
            { name: 'Balance', type: 'decimal', description: 'Current balance' }
          ]
        },
        {
          name: 'items',
          columns: [
            { name: 'Id', type: 'varchar', description: 'Item ID' },
            { name: 'Name', type: 'varchar', description: 'Item name' },
            { name: 'Type', type: 'varchar', description: 'Item type' },
            { name: 'UnitPrice', type: 'decimal', description: 'Unit price' }
          ]
        },
        {
          name: 'invoices',
          columns: [
            { name: 'Id', type: 'varchar', description: 'Invoice ID' },
            { name: 'DocNumber', type: 'varchar', description: 'Document number' },
            { name: 'TotalAmt', type: 'decimal', description: 'Total amount' },
            { name: 'TxnDate', type: 'date', description: 'Transaction date' },
            { name: 'CustomerId', type: 'varchar', description: 'Customer ID' }
          ]
        }
      ],
      relationships: [
        { from: 'invoices.CustomerId', to: 'customers.Id', type: 'many_to_one' }
      ]
    };
  }

  getCSVSchema(config, schemaOverride) {
    if (schemaOverride && schemaOverride.tables) {
      return schemaOverride;
    }
    return {
      tables: [{
        name: config.table_name || 'csv_data',
        columns: config.schema || [],
        sample_data: config.sample_data?.slice(0, 3) || []
      }],
      relationships: []
    };
  }

  parseConnectionConfig(dataSource) {
    const raw = dataSource.connection_string;
    if (!raw) return {};

    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return {};

    try {
      return JSON.parse(raw);
    } catch (error) {
      try {
        const url = new URL(raw);
        return {
          host: url.hostname,
          port: url.port ? parseInt(url.port, 10) : undefined,
          database: url.pathname ? url.pathname.replace(/^\//, '') : undefined,
          username: decodeURIComponent(url.username || ''),
          password: decodeURIComponent(url.password || '')
        };
      } catch {
        return {};
      }
    }
  }

  parseSchemaField(schemaField) {
    if (!schemaField) return null;
    if (typeof schemaField === 'object') return schemaField;
    try {
      return JSON.parse(schemaField);
    } catch (error) {
      return null;
    }
  }

  async validateAndFormatSQL(sql, dataSourceType) {
    try {
      // Parse SQL to validate syntax
      const ast = this.parser.astify(sql, { database: this.getDatabaseDialect(dataSourceType) });
      
      // Check for dangerous operations
      this.validateSQLSafety(ast);
      
      // Format SQL for readability
      const formattedSQL = format(sql, {
        language: this.getDatabaseDialect(dataSourceType),
        indent: '  ',
        uppercase: true,
        linesBetweenQueries: 2
      });
      
      return formattedSQL;
    } catch (error) {
      console.error('SQL validation error:', error);
      throw new Error(`Invalid SQL generated: ${error.message}`);
    }
  }

  validateSQLSafety(ast) {
    const dangerousOperations = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE'];
    
    const checkNode = (node) => {
      if (typeof node === 'object' && node !== null) {
        if (node.type && dangerousOperations.includes(node.type.toUpperCase())) {
          throw new Error(`Dangerous SQL operation detected: ${node.type}`);
        }
        
        // Recursively check all properties
        Object.values(node).forEach(value => {
          if (Array.isArray(value)) {
            value.forEach(checkNode);
          } else if (typeof value === 'object') {
            checkNode(value);
          }
        });
      }
    };
    
    checkNode(ast);
  }

  getDatabaseDialect(dataSourceType) {
    const dialectMap = {
      'postgresql': 'postgresql',
      'mysql': 'mysql',
      'google_sheets': 'postgresql', // Use PostgreSQL syntax as default
      'shopify': 'postgresql',
      'stripe': 'postgresql',
      'quickbooks': 'postgresql',
      'csv': 'postgresql'
    };
    
    return dialectMap[dataSourceType] || 'postgresql';
  }

  async optimizeSQL(sql, dataSourceType) {
    try {
      // Basic optimization suggestions
      const optimizations = [];
      const lowerSQL = sql.toLowerCase();
      
      // Check for missing indexes hints
      if (lowerSQL.includes('where') && !lowerSQL.includes('limit')) {
        optimizations.push('Consider adding a LIMIT clause to prevent large result sets');
      }
      
      // Check for SELECT *
      if (lowerSQL.includes('select *')) {
        optimizations.push('Consider selecting specific columns instead of SELECT *');
      }
      
      // Check for missing ORDER BY with LIMIT
      if (lowerSQL.includes('limit') && !lowerSQL.includes('order by')) {
        optimizations.push('Consider adding ORDER BY clause when using LIMIT for consistent results');
      }
      
      return {
        optimized_sql: sql,
        suggestions: optimizations,
        estimated_performance: this.estimatePerformance(sql)
      };
    } catch (error) {
      console.error('SQL optimization error:', error);
      return {
        optimized_sql: sql,
        suggestions: [],
        estimated_performance: 'unknown'
      };
    }
  }

  estimatePerformance(sql) {
    const lowerSQL = sql.toLowerCase();
    let score = 100;
    
    // Deduct points for potential performance issues
    if (lowerSQL.includes('select *')) score -= 20;
    if (lowerSQL.includes('like %')) score -= 15;
    if (!lowerSQL.includes('limit') && !lowerSQL.includes('top')) score -= 25;
    if (lowerSQL.includes('order by') && !lowerSQL.includes('limit')) score -= 10;
    
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }
}

module.exports = new SQLGenerator();
