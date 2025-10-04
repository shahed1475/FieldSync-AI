const express = require('express');
const multer = require('multer');
const passport = require('passport');
const Joi = require('joi');
const { Op } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');
const { DataSource } = require('../models');

// Import integration services
const GoogleSheetsService = require('../services/integrations/googleSheets');
const QuickBooksService = require('../services/integrations/quickbooks');
const DatabaseConnector = require('../services/integrations/databaseConnector');
const ShopifyService = require('../services/integrations/shopify');
const StripeService = require('../services/integrations/stripe');
const CSVUploadService = require('../services/integrations/csvUpload');

const router = express.Router();

// Initialize services
const googleSheetsService = new GoogleSheetsService();
const quickBooksService = new QuickBooksService();
const databaseConnector = new DatabaseConnector();
const shopifyService = new ShopifyService();
const stripeService = new StripeService();
const csvUploadService = new CSVUploadService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['text/csv', 'text/plain', 'application/csv'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'));
    }
  }
});

// Validation schemas
const dataSourceSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  type: Joi.string().required().valid('google_sheets', 'quickbooks', 'postgresql', 'mysql', 'shopify', 'stripe', 'csv'),
  tags: Joi.array().items(Joi.string().max(50)).optional()
});

const googleSheetsSchema = Joi.object({
  name: Joi.string().required(),
  spreadsheetId: Joi.string().required(),
  worksheetName: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

const quickbooksSchema = Joi.object({
  name: Joi.string().required(),
  companyId: Joi.string().required(),
  tags: Joi.array().items(Joi.string()).optional()
});

const databaseSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().required().valid('postgresql', 'mysql'),
  host: Joi.string().required(),
  port: Joi.number().integer().min(1).max(65535).required(),
  database: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  ssl: Joi.boolean().optional().default(false),
  tags: Joi.array().items(Joi.string()).optional()
});

const shopifySchema = Joi.object({
  name: Joi.string().required(),
  shopName: Joi.string().required(),
  accessToken: Joi.string().required(),
  tags: Joi.array().items(Joi.string()).optional()
});

const stripeSchema = Joi.object({
  name: Joi.string().required(),
  apiKey: Joi.string().required(),
  tags: Joi.array().items(Joi.string()).optional()
});

// OAuth Routes

/**
 * @route GET /api/integrations/oauth/google
 * @desc Initiate Google OAuth flow
 */
router.get('/oauth/google', authenticateToken, passport.authenticate('google', {
  scope: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly']
}));

/**
 * @route GET /api/integrations/oauth/google/callback
 * @desc Handle Google OAuth callback
 */
router.get('/oauth/google/callback', authenticateToken, 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      // Store OAuth tokens in session or return to frontend
      res.json({
        success: true,
        message: 'Google OAuth successful',
        tokens: req.user.tokens
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'OAuth callback failed',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/integrations/oauth/quickbooks
 * @desc Initiate QuickBooks OAuth flow
 */
router.get('/oauth/quickbooks', authenticateToken, passport.authenticate('quickbooks'));

/**
 * @route GET /api/integrations/oauth/quickbooks/callback
 * @desc Handle QuickBooks OAuth callback
 */
router.get('/oauth/quickbooks/callback', authenticateToken,
  passport.authenticate('quickbooks', { session: false }),
  async (req, res) => {
    try {
      res.json({
        success: true,
        message: 'QuickBooks OAuth successful',
        tokens: req.user.tokens,
        companyId: req.user.companyId
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'OAuth callback failed',
        error: error.message
      });
    }
  }
);

// Data Source Management Routes

/**
 * @route GET /api/integrations/data-sources
 * @desc Get all data sources for organization
 */
router.get('/data-sources', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { organization_id: req.user.organizationId };
    
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { type: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await DataSource.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data sources',
      error: error.message
    });
  }
});

/**
 * @route GET /api/integrations/data-sources/:id
 * @desc Get specific data source
 */
router.get('/data-sources/:id', authenticateToken, async (req, res) => {
  try {
    const dataSource = await DataSource.findOne({
      where: {
        id: req.params.id,
        organization_id: req.user.organizationId
      }
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        message: 'Data source not found'
      });
    }

    res.json({
      success: true,
      data: dataSource
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data source',
      error: error.message
    });
  }
});

/**
 * @route POST /api/integrations/google-sheets
 * @desc Create Google Sheets connection
 */
router.post('/google-sheets', authenticateToken, async (req, res) => {
  try {
    const { error, value } = googleSheetsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    // Assume OAuth tokens are stored in session or provided
    const tokens = req.body.tokens || req.session?.googleTokens;
    if (!tokens) {
      return res.status(400).json({
        success: false,
        message: 'Google OAuth tokens required. Please authenticate first.'
      });
    }

    const connectionData = {
      name: value.name,
      spreadsheetId: value.spreadsheetId,
      worksheetName: value.worksheetName,
      tokens,
      tags: value.tags
    };

    const dataSource = await googleSheetsService.saveConnection(
      req.user.organizationId,
      connectionData
    );

    res.status(201).json({
      success: true,
      message: 'Google Sheets connection created successfully',
      data: dataSource
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create Google Sheets connection',
      error: error.message
    });
  }
});

/**
 * @route POST /api/integrations/quickbooks
 * @desc Create QuickBooks connection
 */
router.post('/quickbooks', authenticateToken, async (req, res) => {
  try {
    const { error, value } = quickbooksSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const tokens = req.body.tokens || req.session?.quickbooksTokens;
    if (!tokens) {
      return res.status(400).json({
        success: false,
        message: 'QuickBooks OAuth tokens required. Please authenticate first.'
      });
    }

    const connectionData = {
      name: value.name,
      companyId: value.companyId,
      tokens,
      tags: value.tags
    };

    const dataSource = await quickBooksService.saveConnection(
      req.user.organizationId,
      connectionData
    );

    res.status(201).json({
      success: true,
      message: 'QuickBooks connection created successfully',
      data: dataSource
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create QuickBooks connection',
      error: error.message
    });
  }
});

/**
 * @route POST /api/integrations/database
 * @desc Create database connection
 */
router.post('/database', authenticateToken, async (req, res) => {
  try {
    const { error, value } = databaseSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const connectionData = {
      name: value.name,
      type: value.type,
      config: {
        host: value.host,
        port: value.port,
        database: value.database,
        username: value.username,
        password: value.password,
        ssl: value.ssl
      },
      tags: value.tags
    };

    const dataSource = await databaseConnector.saveConnection(
      req.user.organizationId,
      connectionData
    );

    res.status(201).json({
      success: true,
      message: 'Database connection created successfully',
      data: dataSource
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create database connection',
      error: error.message
    });
  }
});

/**
 * @route POST /api/integrations/shopify
 * @desc Create Shopify connection
 */
router.post('/shopify', authenticateToken, async (req, res) => {
  try {
    const { error, value } = shopifySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const connectionData = {
      name: value.name,
      credentials: {
        shopName: value.shopName,
        accessToken: value.accessToken
      },
      tags: value.tags
    };

    const dataSource = await shopifyService.saveConnection(
      req.user.organizationId,
      connectionData
    );

    res.status(201).json({
      success: true,
      message: 'Shopify connection created successfully',
      data: dataSource
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create Shopify connection',
      error: error.message
    });
  }
});

/**
 * @route POST /api/integrations/stripe
 * @desc Create Stripe connection
 */
router.post('/stripe', authenticateToken, async (req, res) => {
  try {
    const { error, value } = stripeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const connectionData = {
      name: value.name,
      apiKey: value.apiKey,
      tags: value.tags
    };

    const dataSource = await stripeService.saveConnection(
      req.user.organizationId,
      connectionData
    );

    res.status(201).json({
      success: true,
      message: 'Stripe connection created successfully',
      data: dataSource
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create Stripe connection',
      error: error.message
    });
  }
});

/**
 * @route POST /api/integrations/csv/upload
 * @desc Upload and process CSV file
 */
router.post('/csv/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const options = {
      delimiter: req.body.delimiter || ',',
      quote: req.body.quote || '"',
      encoding: req.body.encoding || 'utf8',
      skipEmptyLines: req.body.skipEmptyLines !== 'false',
      headers: req.body.headers !== 'false'
    };

    const result = await csvUploadService.processUpload(req.file, options);

    res.json({
      success: true,
      message: 'CSV file processed successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process CSV upload',
      error: error.message
    });
  }
});

/**
 * @route POST /api/integrations/csv/import
 * @desc Import CSV data to database
 */
router.post('/csv/import', authenticateToken, async (req, res) => {
  try {
    const { filename, dataSourceName, tableName, schema, skipRows, maxRows } = req.body;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Filename is required'
      });
    }

    // Get upload result from session or reconstruct
    const uploadResult = req.session?.csvUploads?.[filename];
    if (!uploadResult) {
      return res.status(400).json({
        success: false,
        message: 'Upload session not found. Please upload the file again.'
      });
    }

    const importOptions = {
      dataSourceName,
      tableName,
      schema,
      skipRows: parseInt(skipRows) || 0,
      maxRows: maxRows ? parseInt(maxRows) : null
    };

    const result = await csvUploadService.importToDatabase(
      req.user.organizationId,
      uploadResult,
      importOptions
    );

    res.json({
      success: true,
      message: 'CSV data imported successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to import CSV data',
      error: error.message
    });
  }
});

// Schema Detection Routes

/**
 * @route POST /api/integrations/:type/detect-schema
 * @desc Detect schema for different integration types
 */
router.post('/:type/detect-schema', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const { dataSourceId, dataType } = req.body;

    if (!dataSourceId) {
      return res.status(400).json({
        success: false,
        message: 'dataSourceId is required'
      });
    }

    let result;

    switch (type) {
      case 'google-sheets':
        result = await googleSheetsService.detectSchema(dataSourceId, dataType);
        break;
      case 'quickbooks':
        result = await quickBooksService.detectSchema(dataSourceId, dataType);
        break;
      case 'database':
        result = await databaseConnector.detectSchema(dataSourceId, dataType);
        break;
      case 'shopify':
        result = await shopifyService.detectSchema(dataSourceId, dataType);
        break;
      case 'stripe':
        result = await stripeService.detectSchema(dataSourceId, dataType);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unsupported integration type: ${type}`
        });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to detect schema',
      error: error.message
    });
  }
});

// Connection Testing Routes

/**
 * @route POST /api/integrations/:type/test-connection
 * @desc Test connection for different integration types
 */
router.post('/:type/test-connection', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const { dataSourceId } = req.body;

    if (!dataSourceId) {
      return res.status(400).json({
        success: false,
        message: 'dataSourceId is required'
      });
    }

    let result;

    switch (type) {
      case 'google-sheets':
        result = await googleSheetsService.testConnection(dataSourceId);
        break;
      case 'quickbooks':
        result = await quickBooksService.testConnection(dataSourceId);
        break;
      case 'database':
        result = await databaseConnector.testConnection(dataSourceId);
        break;
      case 'shopify':
        result = await shopifyService.testConnection(dataSourceId);
        break;
      case 'stripe':
        result = await stripeService.testConnection(dataSourceId);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unsupported integration type: ${type}`
        });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

// Data Sync Routes

/**
 * @route POST /api/integrations/data-sources/:id/sync
 * @desc Sync data from external source
 */
/**
 * @route POST /api/integrations/data-sources/:id/sync
 * @desc Sync data from external source
 */
router.post('/data-sources/:id/sync', authenticateToken, async (req, res) => {
  try {
    const dataSource = await DataSource.findOne({
      where: {
        id: req.params.id,
        organization_id: req.user.organizationId
      }
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        message: 'Data source not found'
      });
    }

    const { dataType, batchSize = 100 } = req.body;
    const dataSourceId = req.params.id;

    let result;

    switch (dataSource.type) {
      case 'google_sheets':
        result = await googleSheetsService.syncData(dataSourceId, dataType, { batchSize });
        break;
      case 'quickbooks':
        result = await quickBooksService.syncData(dataSourceId, dataType, { batchSize });
        break;
      case 'shopify':
        result = await shopifyService.syncData(dataSourceId, dataType, { batchSize });
        break;
      case 'stripe':
        result = await stripeService.syncData(dataSourceId, dataType, { batchSize });
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Sync not supported for type: ${dataSource.type}`
        });
    }

    // Update last sync time
    const currentMetadata = typeof dataSource.metadata === 'object' ? dataSource.metadata : {};
    await dataSource.update({
      metadata: {
        ...currentMetadata,
        lastSync: new Date(),
        lastSyncResult: {
          dataType,
          recordCount: result.totalRecords,
          syncedAt: new Date()
        }
      }
    });

    res.json({
      success: true,
      message: 'Data sync completed successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Data sync failed',
      error: error.message
    });
  }
});

/**
 * @route PUT /api/integrations/data-sources/:id
 * @desc Update data source
 */
router.put('/data-sources/:id', authenticateToken, async (req, res) => {
  try {
    const dataSource = await DataSource.findOne({
      where: {
        id: req.params.id,
        organization_id: req.user.organizationId
      }
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        message: 'Data source not found'
      });
    }

    const { name, status, tags } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (status) updateData.status = status;
    
    if (tags) {
      const metadata = JSON.parse(dataSource.metadata);
      updateData.metadata = JSON.stringify({
        ...metadata,
        tags
      });
    }

    await dataSource.update(updateData);

    res.json({
      success: true,
      message: 'Data source updated successfully',
      data: dataSource
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update data source',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/integrations/data-sources/:id
 * @desc Delete data source
 */
router.delete('/data-sources/:id', authenticateToken, async (req, res) => {
  try {
    const dataSource = await DataSource.findOne({
      where: {
        id: req.params.id,
        organization_id: req.user.organizationId
      }
    });

    if (!dataSource) {
      return res.status(404).json({
        success: false,
        message: 'Data source not found'
      });
    }

    // Clean up CSV files if it's a CSV data source
    if (dataSource.type === 'csv') {
      const connectionString = JSON.parse(dataSource.connection_string);
      if (connectionString.filePath) {
        await csvUploadService.cleanupFile(connectionString.filePath);
      }
    }

    await dataSource.destroy();

    res.json({
      success: true,
      message: 'Data source deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete data source',
      error: error.message
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 50MB.'
      });
    }
  }

  res.status(500).json({
    success: false,
    message: 'Integration service error',
    error: error.message
  });
});

module.exports = router;