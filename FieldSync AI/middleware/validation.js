const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Validation schemas
const schemas = {
  organization: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    subscription_tier: Joi.string().valid('free', 'pro', 'enterprise').default('free')
  }),

  dataSource: Joi.object({
    type: Joi.string().valid('postgresql', 'mysql', 'mongodb', 'api', 'csv').required(),
    connection_string: Joi.string().required(),
    schema: Joi.object().default({})
  }),

  query: Joi.object({
    natural_language: Joi.string().min(10).max(1000).required(),
    sql_generated: Joi.string().optional(),
    results: Joi.object().optional()
  }),

  dashboard: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    layout: Joi.object().default({}),
    refresh_schedule: Joi.string().valid('manual', 'hourly', 'daily', 'weekly').default('manual')
  }),

  insight: Joi.object({
    type: Joi.string().valid('trend', 'anomaly', 'correlation', 'prediction').required(),
    description: Joi.string().min(10).max(500).required(),
    severity: Joi.string().valid('low', 'medium', 'high', 'critical').required()
  })
};

module.exports = {
  validate,
  schemas
};