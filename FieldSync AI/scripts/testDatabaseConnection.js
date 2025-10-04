/**
 * Simple database connection test without external dependencies
 * This script tests PostgreSQL connection using basic Node.js modules
 */

const { Client } = require('pg');
require('dotenv').config();

async function testDatabaseConnection() {
  console.log('🔧 Testing PostgreSQL database connection...');
  
  // Database configuration from environment variables
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'insightflow_ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres123'
  };
  
  console.log('Database configuration:');
  console.log(`  Host: ${dbConfig.host}`);
  console.log(`  Port: ${dbConfig.port}`);
  console.log(`  Database: ${dbConfig.database}`);
  console.log(`  User: ${dbConfig.user}`);
  console.log(`  Password: ${'*'.repeat(dbConfig.password.length)}`);
  
  const client = new Client(dbConfig);
  
  try {
    // Test connection
    console.log('\n📡 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Database connection established successfully!');
    
    // Test basic query
    console.log('\n🔍 Testing basic query...');
    const result = await client.query('SELECT version()');
    console.log('✅ Query executed successfully!');
    console.log(`PostgreSQL Version: ${result.rows[0].version}`);
    
    // Test database existence
    console.log('\n🗄️  Checking database structure...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log('✅ Found existing tables:');
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    } else {
      console.log('ℹ️  No tables found - database is empty (this is expected for first run)');
    }
    
    // Test table creation (basic test)
    console.log('\n🔨 Testing table creation...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_connection (
        id SERIAL PRIMARY KEY,
        test_message VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Test table created successfully!');
    
    // Insert test data
    console.log('\n📝 Testing data insertion...');
    await client.query(`
      INSERT INTO test_connection (test_message) 
      VALUES ('Database connection test successful at ${new Date().toISOString()}');
    `);
    console.log('✅ Test data inserted successfully!');
    
    // Query test data
    console.log('\n📊 Testing data retrieval...');
    const testDataResult = await client.query('SELECT * FROM test_connection ORDER BY created_at DESC LIMIT 1');
    if (testDataResult.rows.length > 0) {
      console.log('✅ Test data retrieved successfully!');
      console.log(`  Message: ${testDataResult.rows[0].test_message}`);
      console.log(`  Created: ${testDataResult.rows[0].created_at}`);
    }
    
    // Clean up test table
    console.log('\n🧹 Cleaning up test table...');
    await client.query('DROP TABLE IF EXISTS test_connection');
    console.log('✅ Test table cleaned up successfully!');
    
    console.log('\n🎉 All database tests passed! PostgreSQL is ready for InsightFlow AI.');
    
    return {
      success: true,
      version: result.rows[0].version,
      existingTables: tablesResult.rows.map(row => row.table_name)
    };
    
  } catch (error) {
    console.error('\n❌ Database connection test failed:');
    console.error(`Error: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Troubleshooting tips:');
      console.error('  1. Make sure PostgreSQL is running');
      console.error('  2. Check if the host and port are correct');
      console.error('  3. Verify firewall settings');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed:');
      console.error('  1. Check username and password');
      console.error('  2. Verify user has access to the database');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist:');
      console.error('  1. Create the database first');
      console.error('  2. Or update DB_NAME in .env file');
    }
    
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed.');
  }
}

// Run the test if called directly
if (require.main === module) {
  testDatabaseConnection()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Database connection test completed successfully!');
        process.exit(0);
      } else {
        console.log('\n❌ Database connection test failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = testDatabaseConnection;