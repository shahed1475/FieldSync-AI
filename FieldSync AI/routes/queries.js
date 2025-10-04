const express = require('express');
const crypto = require('crypto');
const { Query, QueryCache } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/queries - Get all queries for organization
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, data_source_id } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = { org_id: req.user.organizationId };
    if (status) whereClause.status = status;
    if (data_source_id) whereClause.data_source_id = data_source_id;
    
    const { count, rows: queries } = await Query.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: require('../models').DataSource,
          as: 'dataSource',
          attributes: ['id', 'type']
        }
      ]
    });
    
    res.json({
      queries,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get queries error:', error);
    res.status(500).json({ error: 'Failed to fetch queries' });
  }
});

// GET /api/queries/:id - Get specific query
router.get('/:id', async (req, res) => {
  try {
    const query = await Query.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      },
      include: [
        {
          model: require('../models').DataSource,
          as: 'dataSource',
          attributes: ['id', 'type']
        }
      ]
    });
    
    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }
    
    res.json(query);
  } catch (error) {
    console.error('Get query error:', error);
    res.status(500).json({ error: 'Failed to fetch query' });
  }
});

// POST /api/queries - Create and process new query
router.post('/', validate(schemas.query), async (req, res) => {
  try {
    const { natural_language, data_source_id } = req.body;
    
    // Create query hash for caching
    const queryHash = crypto
      .createHash('sha256')
      .update(`${natural_language}:${data_source_id || 'no-source'}`)
      .digest('hex');
    
    // Check cache first
    const cachedResult = await QueryCache.getCached(queryHash);
    if (cachedResult) {
      return res.json({
        message: 'Query result retrieved from cache',
        query: {
          natural_language,
          results: cachedResult,
          status: 'completed',
          cached: true
        }
      });
    }
    
    // Create new query
    const query = await Query.create({
      org_id: req.user.organizationId,
      data_source_id: data_source_id || null,
      natural_language,
      status: 'pending'
    });
    
    // TODO: Implement AI-powered natural language to SQL conversion
    // For now, simulate processing
    setTimeout(async () => {
      try {
        // Simulate SQL generation and execution
        const mockSQL = `-- Generated SQL for: "${natural_language}"\nSELECT * FROM sample_table LIMIT 10;`;
        const mockResults = {
          columns: ['id', 'name', 'value'],
          rows: [
            { id: 1, name: 'Sample 1', value: 100 },
            { id: 2, name: 'Sample 2', value: 200 }
          ],
          row_count: 2
        };
        
        await query.update({
          sql_generated: mockSQL,
          results: mockResults,
          status: 'completed',
          execution_time_ms: Math.floor(Math.random() * 1000) + 100
        });
        
        // Cache the results
        await QueryCache.setCache(queryHash, mockResults, 60); // Cache for 1 hour
      } catch (error) {
        await query.update({
          status: 'failed',
          error_message: error.message
        });
      }
    }, 1000);
    
    res.status(201).json({
      message: 'Query created and processing started',
      query: {
        id: query.id,
        natural_language: query.natural_language,
        status: query.status,
        created_at: query.created_at
      }
    });
  } catch (error) {
    console.error('Create query error:', error);
    res.status(500).json({ error: 'Failed to create query' });
  }
});

// PUT /api/queries/:id - Update query
router.put('/:id', validate(schemas.query), async (req, res) => {
  try {
    const { natural_language } = req.body;
    
    const [updatedRowsCount] = await Query.update(
      { 
        natural_language,
        status: 'pending', // Reset status when updating
        sql_generated: null,
        results: null,
        error_message: null
      },
      { 
        where: { 
          id: req.params.id,
          org_id: req.user.organizationId 
        }
      }
    );
    
    if (updatedRowsCount === 0) {
      return res.status(404).json({ error: 'Query not found' });
    }
    
    const updatedQuery = await Query.findByPk(req.params.id);
    
    res.json({
      message: 'Query updated successfully',
      query: updatedQuery
    });
  } catch (error) {
    console.error('Update query error:', error);
    res.status(500).json({ error: 'Failed to update query' });
  }
});

// DELETE /api/queries/:id - Delete query
router.delete('/:id', async (req, res) => {
  try {
    const deletedRowsCount = await Query.destroy({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (deletedRowsCount === 0) {
      return res.status(404).json({ error: 'Query not found' });
    }
    
    res.json({ message: 'Query deleted successfully' });
  } catch (error) {
    console.error('Delete query error:', error);
    res.status(500).json({ error: 'Failed to delete query' });
  }
});

// POST /api/queries/:id/rerun - Rerun a query
router.post('/:id/rerun', async (req, res) => {
  try {
    const query = await Query.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }
    
    // Reset query status
    await query.update({
      status: 'pending',
      results: null,
      error_message: null,
      execution_time_ms: null
    });
    
    // TODO: Implement actual query rerun logic
    
    res.json({
      message: 'Query rerun initiated',
      query: {
        id: query.id,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Rerun query error:', error);
    res.status(500).json({ error: 'Failed to rerun query' });
  }
});

module.exports = router;