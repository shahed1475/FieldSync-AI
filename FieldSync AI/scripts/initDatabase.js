const { sequelize } = require('../config/database');
const models = require('../models');
const bcrypt = require('bcryptjs');

const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database...');

    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Sync all models (create tables)
    await sequelize.sync({ force: false }); // Set to true to drop existing tables
    console.log('✅ Database tables synchronized successfully.');

    // Check if sample data already exists
    const existingOrg = await models.Organization.findOne();
    if (existingOrg) {
      console.log('ℹ️  Sample data already exists. Skipping seed data creation.');
      return;
    }

    console.log('🌱 Creating sample data...');

    // Create sample organization
    const sampleOrg = await models.Organization.create({
      name: 'Acme Analytics Corp',
      subscription_tier: 'pro'
    });

    console.log('✅ Sample organization created:', sampleOrg.name);

    // Create sample data sources
    const dataSources = await Promise.all([
      models.DataSource.create({
        org_id: sampleOrg.id,
        type: 'postgresql',
        connection_string: 'postgresql://user:password@localhost:5432/sales_db',
        schema: {
          tables: ['customers', 'orders', 'products'],
          relationships: ['customers->orders', 'orders->products']
        },
        is_active: true
      }),
      models.DataSource.create({
        org_id: sampleOrg.id,
        type: 'mysql',
        connection_string: 'mysql://user:password@localhost:3306/inventory_db',
        schema: {
          tables: ['inventory', 'suppliers', 'warehouses'],
          relationships: ['suppliers->inventory', 'warehouses->inventory']
        },
        is_active: true
      })
    ]);

    console.log('✅ Sample data sources created:', dataSources.length);

    // Create sample queries
    const queries = await Promise.all([
      models.Query.create({
        org_id: sampleOrg.id,
        data_source_id: dataSources[0].id,
        natural_language: 'Show me the top 10 customers by total order value',
        sql_generated: 'SELECT c.name, SUM(o.total) as total_value FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.id ORDER BY total_value DESC LIMIT 10',
        results: [
          { name: 'John Doe', total_value: 15000 },
          { name: 'Jane Smith', total_value: 12500 }
        ],
        execution_time_ms: 45,
        status: 'completed'
      }),
      models.Query.create({
        org_id: sampleOrg.id,
        data_source_id: dataSources[1].id,
        natural_language: 'What products are running low in inventory?',
        sql_generated: 'SELECT product_name, current_stock FROM inventory WHERE current_stock < minimum_threshold',
        results: [
          { product_name: 'Widget A', current_stock: 5 },
          { product_name: 'Gadget B', current_stock: 2 }
        ],
        execution_time_ms: 23,
        status: 'completed'
      })
    ]);

    console.log('✅ Sample queries created:', queries.length);

    // Create sample dashboard
    const dashboard = await models.Dashboard.create({
      org_id: sampleOrg.id,
      name: 'Sales Performance Dashboard',
      layout: {
        widgets: [
          { type: 'chart', query_id: queries[0].id, position: { x: 0, y: 0, w: 6, h: 4 } },
          { type: 'table', query_id: queries[1].id, position: { x: 6, y: 0, w: 6, h: 4 } }
        ]
      },
      refresh_schedule: '0 */6 * * *', // Every 6 hours
      is_public: false
    });

    console.log('✅ Sample dashboard created:', dashboard.name);

    // Create sample insights
    const insights = await Promise.all([
      models.Insight.create({
        org_id: sampleOrg.id,
        type: 'trend',
        description: 'Sales have increased by 15% compared to last month',
        severity: 'low',
        confidence_score: 0.85,
        metadata: {
          metric: 'sales_growth',
          period: 'monthly',
          value: 0.15
        },
        is_acknowledged: false
      }),
      models.Insight.create({
        org_id: sampleOrg.id,
        type: 'anomaly',
        description: 'Unusual spike in returns detected for Product XYZ',
        severity: 'medium',
        confidence_score: 0.92,
        metadata: {
          product: 'Product XYZ',
          return_rate: 0.25,
          normal_rate: 0.05
        },
        is_acknowledged: false
      })
    ]);

    console.log('✅ Sample insights created:', insights.length);

    // Create sample query cache entries
    await models.QueryCache.create({
      query_hash: 'abc123def456',
      results: [{ sample: 'cached_data' }],
      expiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      hit_count: 5
    });

    console.log('✅ Sample cache entry created');

    console.log('🎉 Database initialization completed successfully!');
    console.log(`
📊 Sample Data Summary:
- Organizations: 1
- Data Sources: ${dataSources.length}
- Queries: ${queries.length}
- Dashboards: 1
- Insights: ${insights.length}
- Cache Entries: 1

🚀 Your InsightFlow AI backend is ready to use!
    `);

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Run initialization if this script is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('✅ Initialization script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Initialization script failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
