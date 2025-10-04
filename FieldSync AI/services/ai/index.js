// AI Services Index
// Centralized exports for all AI-related services

const intentDetection = require('./intentDetection');
const sqlGenerator = require('./sqlGenerator');
const sqlExecutor = require('./sqlExecutor');
const queryManager = require('./queryManager');
const queryOptimizer = require('./queryOptimizer');

module.exports = {
  intentDetection,
  sqlGenerator,
  sqlExecutor,
  queryManager,
  queryOptimizer
};