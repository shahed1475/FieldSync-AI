const { supabase } = require('../src/database/connection');
const { MigrationManager } = require('../src/database/migrate');
const { DatabaseSeeder } = require('../src/database/seed');

module.exports = async () => {
  console.log('Setting up test environment...');
  
  try {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    
    // Ensure required environment variables are set
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required Supabase environment variables for testing');
    }
    
    if (!process.env.ENCRYPTION_KEY || !process.env.PHI_ENCRYPTION_KEY) {
      console.warn('Using default encryption keys for testing');
      process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-32-characters';
      process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY || 'test-phi-encryption-key-32-chars';
    }
    
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';
    }
    
    // Test database connection
    console.log('Testing database connection...');
    const { data, error } = await supabase
      .from('system_config')
      .select('config_key')
      .limit(1);
    
    if (error) {
      console.log('Database schema not found, running migrations...');
      
      // Run migrations
      const migrationManager = new MigrationManager();
      await migrationManager.runMigrations();
      
      console.log('Database migrations completed');
    }
    
    // Check if test data exists
    const { data: practices } = await supabase
      .from('practices')
      .select('id')
      .limit(1);
    
    if (!practices || practices.length === 0) {
      console.log('Seeding test data...');
      
      // Seed test data
      const seeder = new DatabaseSeeder();
      await seeder.seed();
      
      console.log('Test data seeding completed');
    } else {
      console.log('Test data already exists');
    }
    
    // Clean up any existing test data from previous runs
    console.log('Cleaning up previous test data...');
    await cleanupPreviousTestData();
    
    console.log('Test environment setup completed successfully');
    
  } catch (error) {
    console.error('Failed to set up test environment:', error);
    process.exit(1);
  }
};

/**
 * Clean up test data from previous test runs
 */
async function cleanupPreviousTestData() {
  try {
    // Clean up test audit logs
    await supabase
      .from('audit_logs')
      .delete()
      .like('correlation_id', 'test-%');
    
    // Clean up test documents
    await supabase
      .from('documents')
      .delete()
      .like('file_name', 'test-%');
    
    // Clean up test authorizations
    await supabase
      .from('authorizations')
      .delete()
      .like('authorization_number', 'TEST-%');
    
    // Clean up test patients
    await supabase
      .from('patients')
      .delete()
      .like('patient_id', 'TEST-%');
    
    console.log('Previous test data cleaned up');
    
  } catch (error) {
    console.warn('Failed to clean up previous test data:', error.message);
  }
}