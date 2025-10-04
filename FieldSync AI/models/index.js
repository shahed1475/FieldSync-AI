const { sequelize } = require('../config/database');
const Organization = require('./Organization');
const DataSource = require('./DataSource');
const Query = require('./Query');
const Dashboard = require('./Dashboard');
const Insight = require('./Insight');
const QueryCache = require('./QueryCache');
const User = require('./User');

// Initialize models
const models = {
  Organization: Organization(sequelize),
  DataSource: DataSource(sequelize),
  Query: Query(sequelize),
  Dashboard: Dashboard(sequelize),
  Insight: Insight(sequelize),
  QueryCache: QueryCache(sequelize),
  User: User(sequelize)
};

// Define associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

module.exports = {
  sequelize,
  ...models
};