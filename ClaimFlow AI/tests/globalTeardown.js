const { supabase } = require('../src/database/connection');

module.exports = async () => {
  console.log('Tearing down test environment...');
  
  try {
    // Clean up all test data
    await cleanupAllTestData();
    
    // Close database connections
    if (supabase && typeof supabase.removeAllChannels === 'function') {
      supabase.removeAllChannels();
    }
    
    console.log('Test environment teardown completed');
    
  } catch (error) {
    console.error('Failed to tear down test environment:', error);
  }
};

/**
 * Clean up all test data
 */
async function cleanupAllTestData() {
  try {
    console.log('Cleaning up test data...');
    
    // Clean up test audit logs
    const { error: auditError } = await supabase
      .from('audit_logs')
      .delete()
      .like('correlation_id', 'test-%');
    
    if (auditError) {
      console.warn('Failed to clean up test audit logs:', auditError.message);
    }
    
    // Clean up test documents
    const { error: docsError } = await supabase
      .from('documents')
      .delete()
      .like('file_name', 'test-%');
    
    if (docsError) {
      console.warn('Failed to clean up test documents:', docsError.message);
    }
    
    // Clean up test authorizations
    const { error: authError } = await supabase
      .from('authorizations')
      .delete()
      .like('authorization_number', 'TEST-%');
    
    if (authError) {
      console.warn('Failed to clean up test authorizations:', authError.message);
    }
    
    // Clean up test patients
    const { error: patientsError } = await supabase
      .from('patients')
      .delete()
      .like('patient_id', 'TEST-%');
    
    if (patientsError) {
      console.warn('Failed to clean up test patients:', patientsError.message);
    }
    
    console.log('Test data cleanup completed');
    
  } catch (error) {
    console.error('Error during test data cleanup:', error);
  }
}