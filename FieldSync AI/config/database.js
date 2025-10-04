const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;
let testConnection;

// Try to use real database first, fallback to mock if connection fails
try {
  sequelize = new Sequelize({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'insightflow_ai',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  });

  // Test the connection
  testConnection = async () => {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection has been established successfully.');
      return true;
    } catch (error) {
      console.warn('⚠️ Unable to connect to PostgreSQL database, falling back to mock database');
      console.warn('Error:', error.message);
      
      // Load mock database
      const mockDb = require('./database-mock');
      sequelize = mockDb.sequelize;
      testConnection = mockDb.testConnection;
      
      await testConnection();
      return false;
    }
  };
} catch (error) {
  console.warn('⚠️ Failed to initialize PostgreSQL, using mock database');
  const mockDb = require('./database-mock');
  sequelize = mockDb.sequelize;
  testConnection = mockDb.testConnection;
}

module.exports = {
  sequelize,
  testConnection
};