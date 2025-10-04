const { Sequelize } = require('sequelize');

// Mock Sequelize for development without database
class MockSequelize {
  constructor(options = {}) {
    this.options = options;
    this.models = {};
    this.authenticated = false;
  }

  async authenticate() {
    console.log('🔄 Mock database connection established');
    this.authenticated = true;
    return Promise.resolve();
  }

  async sync(options = {}) {
    console.log('🔄 Mock database sync completed');
    return Promise.resolve();
  }

  async close() {
    console.log('🔄 Mock database connection closed');
    return Promise.resolve();
  }

  define(modelName, attributes, options = {}) {
    console.log(`📋 Mock model '${modelName}' defined`);
    
    // Create a mock model with basic CRUD operations
    const mockModel = {
      findAll: async (options = {}) => {
        console.log(`🔍 Mock ${modelName}.findAll called`);
        return [];
      },
      findOne: async (options = {}) => {
        console.log(`🔍 Mock ${modelName}.findOne called`);
        return null;
      },
      findByPk: async (id) => {
        console.log(`🔍 Mock ${modelName}.findByPk(${id}) called`);
        return null;
      },
      create: async (data) => {
        console.log(`✨ Mock ${modelName}.create called with:`, data);
        return { id: Math.random().toString(36), ...data };
      },
      update: async (data, options) => {
        console.log(`📝 Mock ${modelName}.update called`);
        return [1];
      },
      destroy: async (options) => {
        console.log(`🗑️ Mock ${modelName}.destroy called`);
        return 1;
      },
      findOrCreate: async (options) => {
        console.log(`🔍✨ Mock ${modelName}.findOrCreate called`);
        return [{ id: Math.random().toString(36), ...options.defaults }, true];
      },
      cleanExpired: async () => {
        console.log(`🧹 Mock ${modelName}.cleanExpired called`);
        return 0;
      },
      associate: (models) => {
        console.log(`🔗 Mock ${modelName} associations defined`);
      }
    };

    this.models[modelName] = mockModel;
    return mockModel;
  }

  getQueryInterface() {
    return {
      showAllTables: async () => {
        console.log('📋 Mock showAllTables called');
        return ['organizations', 'data_sources', 'queries', 'dashboards', 'insights', 'query_cache', 'users'];
      },
      addIndex: async (table, columns, options = {}) => {
        console.log(`🔧 Mock addIndex called for ${table}`);
        return Promise.resolve();
      }
    };
  }

  async query(sql, options = {}) {
    console.log('🔍 Mock query executed:', sql.substring(0, 100) + '...');
    return [[], {}];
  }
}

// Create mock sequelize instance
const sequelize = new MockSequelize({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'insightflow_ai',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  dialect: 'postgres',
  logging: false
});

// Test the connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Mock database connection has been established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the mock database:', error);
  }
};

module.exports = {
  sequelize,
  testConnection
};