const { sequelize } = require('../config/database');

/**
 * Create database indexes for optimal query performance
 */
async function createIndexes() {
  try {
    console.log('🔧 Creating database indexes for optimal performance...');

    // Organizations table indexes
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_name 
      ON organizations(name);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_subscription_tier 
      ON organizations(subscription_tier);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_created_at 
      ON organizations(created_at);
    `);

    // Data sources table indexes
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_sources_org_id 
      ON data_sources(org_id);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_sources_type 
      ON data_sources(type);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_sources_status 
      ON data_sources(status);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_sources_org_type 
      ON data_sources(org_id, type);
    `);

    // Queries table indexes
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_org_id 
      ON queries(org_id);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_data_source_id 
      ON queries(data_source_id);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_status 
      ON queries(status);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_created_at 
      ON queries(created_at);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_org_status 
      ON queries(org_id, status);
    `);

    // Dashboards table indexes
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboards_org_id 
      ON dashboards(org_id);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboards_created_at 
      ON dashboards(created_at);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboards_updated_at 
      ON dashboards(updated_at);
    `);

    // Insights table indexes
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_org_id 
      ON insights(org_id);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_query_id 
      ON insights(query_id);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_type 
      ON insights(type);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_confidence_score 
      ON insights(confidence_score);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_created_at 
      ON insights(created_at);
    `);

    // Query cache table indexes (already defined in model, but ensuring they exist)
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_cache_expiry 
      ON query_cache(expiry);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_cache_hit_count 
      ON query_cache(hit_count);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_cache_created_at 
      ON query_cache(created_at);
    `);

    // Full-text search indexes for better search performance
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_name_gin 
      ON organizations USING gin(to_tsvector('english', name));
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_name_gin 
      ON queries USING gin(to_tsvector('english', name));
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboards_name_gin 
      ON dashboards USING gin(to_tsvector('english', name));
    `);

    // Composite indexes for common query patterns
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_org_datasource_status 
      ON queries(org_id, data_source_id, status);
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insights_org_type_confidence 
      ON insights(org_id, type, confidence_score);
    `);

    // Partial indexes for active records
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_sources_active 
      ON data_sources(org_id, type) WHERE status = 'active';
    `);
    
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queries_running 
      ON queries(org_id, created_at) WHERE status = 'running';
    `);

    console.log('✅ Database indexes created successfully!');
    
    // Show index information
    const indexInfo = await sequelize.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      ORDER BY tablename, indexname;
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log('\n📊 Current database indexes:');
    indexInfo.forEach(index => {
      console.log(`  ${index.tablename}.${index.indexname}`);
    });
    
    return indexInfo;
  } catch (error) {
    console.error('❌ Error creating indexes:', error.message);
    throw error;
  }
}

/**
 * Analyze query performance and suggest optimizations
 */
async function analyzeQueryPerformance() {
  try {
    console.log('\n🔍 Analyzing query performance...');
    
    // Get slow queries
    const slowQueries = await sequelize.query(`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements 
      WHERE mean_time > 100 
      ORDER BY mean_time DESC 
      LIMIT 10;
    `, { type: sequelize.QueryTypes.SELECT });
    
    if (slowQueries.length > 0) {
      console.log('\n⚠️  Slow queries detected (>100ms average):');
      slowQueries.forEach((query, index) => {
        console.log(`${index + 1}. Average: ${query.mean_time.toFixed(2)}ms, Calls: ${query.calls}`);
        console.log(`   Query: ${query.query.substring(0, 100)}...`);
      });
    } else {
      console.log('✅ No slow queries detected');
    }
    
    // Get table sizes
    const tableSizes = await sequelize.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log('\n📏 Table sizes:');
    tableSizes.forEach(table => {
      console.log(`  ${table.tablename}: ${table.size}`);
    });
    
    return { slowQueries, tableSizes };
  } catch (error) {
    console.error('❌ Error analyzing performance:', error.message);
    // Don't throw error as pg_stat_statements might not be enabled
    return { slowQueries: [], tableSizes: [] };
  }
}

/**
 * Main function to run index creation and analysis
 */
async function main() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Create indexes
    await createIndexes();
    
    // Analyze performance
    await analyzeQueryPerformance();
    
    console.log('\n🎉 Index optimization completed successfully!');
  } catch (error) {
    console.error('❌ Index optimization failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  createIndexes,
  analyzeQueryPerformance
};