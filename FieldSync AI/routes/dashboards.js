const express = require('express');
const { Dashboard } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/dashboards - Get all dashboards for organization
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, refresh_schedule, is_public } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = { org_id: req.user.organizationId };
    if (refresh_schedule) whereClause.refresh_schedule = refresh_schedule;
    if (is_public !== undefined) whereClause.is_public = is_public === 'true';
    
    const { count, rows: dashboards } = await Dashboard.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });
    
    res.json({
      dashboards,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get dashboards error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

// GET /api/dashboards/:id - Get specific dashboard
router.get('/:id', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    
    res.json(dashboard);
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// POST /api/dashboards - Create new dashboard
router.post('/', validate(schemas.dashboard), async (req, res) => {
  try {
    const { name, layout, refresh_schedule, is_public } = req.body;
    
    const dashboard = await Dashboard.create({
      org_id: req.user.organizationId,
      name,
      layout: layout || {},
      refresh_schedule: refresh_schedule || 'manual',
      is_public: is_public || false
    });
    
    res.status(201).json({
      message: 'Dashboard created successfully',
      dashboard
    });
  } catch (error) {
    console.error('Create dashboard error:', error);
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

// PUT /api/dashboards/:id - Update dashboard
router.put('/:id', validate(schemas.dashboard), async (req, res) => {
  try {
    const { name, layout, refresh_schedule, is_public } = req.body;
    
    const [updatedRowsCount] = await Dashboard.update(
      { name, layout, refresh_schedule, is_public },
      { 
        where: { 
          id: req.params.id,
          org_id: req.user.organizationId 
        }
      }
    );
    
    if (updatedRowsCount === 0) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    
    const updatedDashboard = await Dashboard.findByPk(req.params.id);
    
    res.json({
      message: 'Dashboard updated successfully',
      dashboard: updatedDashboard
    });
  } catch (error) {
    console.error('Update dashboard error:', error);
    res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

// DELETE /api/dashboards/:id - Delete dashboard
router.delete('/:id', async (req, res) => {
  try {
    const deletedRowsCount = await Dashboard.destroy({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (deletedRowsCount === 0) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    
    res.json({ message: 'Dashboard deleted successfully' });
  } catch (error) {
    console.error('Delete dashboard error:', error);
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

// POST /api/dashboards/:id/refresh - Manually refresh dashboard
router.post('/:id/refresh', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    
    // Update last refreshed timestamp
    await dashboard.update({ last_refreshed: new Date() });
    
    // TODO: Implement actual dashboard refresh logic
    // This would typically involve re-running queries and updating visualizations
    
    res.json({
      message: 'Dashboard refreshed successfully',
      last_refreshed: dashboard.last_refreshed
    });
  } catch (error) {
    console.error('Refresh dashboard error:', error);
    res.status(500).json({ error: 'Failed to refresh dashboard' });
  }
});

// POST /api/dashboards/:id/duplicate - Duplicate dashboard
router.post('/:id/duplicate', async (req, res) => {
  try {
    const originalDashboard = await Dashboard.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!originalDashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }
    
    const duplicatedDashboard = await Dashboard.create({
      org_id: req.user.organizationId,
      name: `${originalDashboard.name} (Copy)`,
      layout: originalDashboard.layout,
      refresh_schedule: originalDashboard.refresh_schedule,
      is_public: false // Always make duplicates private by default
    });
    
    res.status(201).json({
      message: 'Dashboard duplicated successfully',
      dashboard: duplicatedDashboard
    });
  } catch (error) {
    console.error('Duplicate dashboard error:', error);
    res.status(500).json({ error: 'Failed to duplicate dashboard' });
  }
});

module.exports = router;