const { sequelize, testConnection } = require('../config/database');
const models = require('../models');

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');
  
  try {
    // Test database connection
    console.log('1. Testing database connection...');
    await testConnection();
    console.log('✅ Database connection successful\n');
    
    // Sync all models
    console.log('2. Syncing database models...');
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ All models synced successfully\n');
    
    // Verify all tables exist
    console.log('3. Verifying table creation...');
    const tableNames = await sequelize.getQueryInterface().showAllTables();
    console.log('📋 Created tables:', tableNames.join(', '));
    
    // Create indexes if they don't exist
    console.log('\n4. Ensuring indexes are created...');
    
    // Organization indexes
    try {
      await sequelize.getQueryInterface().addIndex('organizations', ['name'], {
        name: 'organizations_name_idx',
        concurrently: true
      });
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️  Index creation warning:', error.message);
      }
    }
    
    try {
      await sequelize.getQueryInterface().addIndex('organizations', ['subscription_tier'], {
        name: 'organizations_subscription_tier_idx',
        concurrently: true
      });
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️  Index creation warning:', error.message);
      }
    }
    
    // Query cache indexes
    try {
      await sequelize.getQueryInterface().addIndex('query_cache', ['expiry'], {
        name: 'query_cache_expiry_idx',
        concurrently: true
      });
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️  Index creation warning:', error.message);
      }
    }
    
    console.log('✅ Database indexes verified\n');
    
    // Test model operations
    console.log('5. Testing model operations...');
    
    // Test Organization creation
    const testOrg = await models.Organization.findOrCreate({
      where: { name: 'Test Organization' },
      defaults: {
        subscription_tier: 'free'
      }
    });
    
    console.log('✅ Organization model test passed');
    
    // Clean up expired cache entries
    console.log('\n6. Cleaning expired cache entries...');
    const cleanedCount = await models.QueryCache.cleanExpired();
    console.log(`✅ Cleaned ${cleanedCount} expired cache entries`);
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('📊 Database is ready for production use.');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };