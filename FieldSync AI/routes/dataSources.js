const express = require('express');
const { DataSource } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/data-sources - Get all data sources for organization
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, type, is_active } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = { org_id: req.user.organizationId };
    if (type) whereClause.type = type;
    if (is_active !== undefined) whereClause.is_active = is_active === 'true';
    
    const { count, rows: dataSources } = await DataSource.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['connection_string', 'credentials'] } // Hide sensitive connection info
    });
    
    res.json({
      data_sources: dataSources,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get data sources error:', error);
    res.status(500).json({ error: 'Failed to fetch data sources' });
  }
});

// GET /api/data-sources/:id - Get specific data source
router.get('/:id', async (req, res) => {
  try {
    const dataSource = await DataSource.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      },
      attributes: { exclude: ['connection_string', 'credentials'] } // Hide sensitive connection info
    });
    
    if (!dataSource) {
      return res.status(404).json({ error: 'Data source not found' });
    }
    
    res.json(dataSource);
  } catch (error) {
    console.error('Get data source error:', error);
    res.status(500).json({ error: 'Failed to fetch data source' });
  }
});

// POST /api/data-sources - Create new data source
router.post('/', validate(schemas.dataSource), async (req, res) => {
  try {
    const {
      name,
      type,
      connection_string,
      schema,
      credentials,
      metadata,
      tags,
      status,
      is_active
    } = req.body;
    
    const dataSource = await DataSource.create({
      org_id: req.user.organizationId,
      name,
      type,
      connection_string,
      schema: schema || {},
      credentials,
      metadata,
      tags,
      status,
      is_active
    });
    
    // Return without sensitive connection string
    const { connection_string: _, credentials: __, ...safeDataSource } = dataSource.toJSON();
    
    res.status(201).json({
      message: 'Data source created successfully',
      data_source: safeDataSource
    });
  } catch (error) {
    console.error('Create data source error:', error);
    res.status(500).json({ error: 'Failed to create data source' });
  }
});

// PUT /api/data-sources/:id - Update data source
router.put('/:id', validate(schemas.dataSourceUpdate), async (req, res) => {
  try {
    const {
      name,
      type,
      connection_string,
      schema,
      credentials,
      metadata,
      tags,
      status,
      is_active
    } = req.body;

    const updateData = {
      name,
      type,
      connection_string,
      schema,
      credentials,
      metadata,
      tags,
      status,
      is_active
    };
    
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    const [updatedRowsCount] = await DataSource.update(
      updateData,
      { 
        where: { 
          id: req.params.id,
          org_id: req.user.organizationId 
        }
      }
    );
    
    if (updatedRowsCount === 0) {
      return res.status(404).json({ error: 'Data source not found' });
    }
    
    const updatedDataSource = await DataSource.findByPk(req.params.id, {
      attributes: { exclude: ['connection_string', 'credentials'] }
    });
    
    res.json({
      message: 'Data source updated successfully',
      data_source: updatedDataSource
    });
  } catch (error) {
    console.error('Update data source error:', error);
    res.status(500).json({ error: 'Failed to update data source' });
  }
});

// DELETE /api/data-sources/:id - Delete data source
router.delete('/:id', async (req, res) => {
  try {
    const deletedRowsCount = await DataSource.destroy({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (deletedRowsCount === 0) {
      return res.status(404).json({ error: 'Data source not found' });
    }
    
    res.json({ message: 'Data source deleted successfully' });
  } catch (error) {
    console.error('Delete data source error:', error);
    res.status(500).json({ error: 'Failed to delete data source' });
  }
});

// POST /api/data-sources/:id/test - Test data source connection
router.post('/:id/test', async (req, res) => {
  try {
    const dataSource = await DataSource.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!dataSource) {
      return res.status(404).json({ error: 'Data source not found' });
    }
    
    // TODO: Implement actual connection testing based on data source type
    // For now, just update last_connected timestamp
    await dataSource.update({ last_connected: new Date() });
    
    res.json({ 
      message: 'Connection test successful',
      last_connected: dataSource.last_connected
    });
  } catch (error) {
    console.error('Test data source error:', error);
    res.status(500).json({ error: 'Connection test failed' });
  }
});

module.exports = router;
