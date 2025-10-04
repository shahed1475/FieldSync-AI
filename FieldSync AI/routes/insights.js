const express = require('express');
const { Insight } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/insights - Get all insights for organization
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      type, 
      severity, 
      is_acknowledged 
    } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = { org_id: req.user.organizationId };
    if (type) whereClause.type = type;
    if (severity) whereClause.severity = severity;
    if (is_acknowledged !== undefined) whereClause.is_acknowledged = is_acknowledged === 'true';
    
    const { count, rows: insights } = await Insight.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [
        ['severity', 'DESC'], // Critical first
        ['created_at', 'DESC']
      ]
    });
    
    res.json({
      insights,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// GET /api/insights/:id - Get specific insight
router.get('/:id', async (req, res) => {
  try {
    const insight = await Insight.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!insight) {
      return res.status(404).json({ error: 'Insight not found' });
    }
    
    res.json(insight);
  } catch (error) {
    console.error('Get insight error:', error);
    res.status(500).json({ error: 'Failed to fetch insight' });
  }
});

// POST /api/insights - Create new insight
router.post('/', validate(schemas.insight), async (req, res) => {
  try {
    const { type, description, severity, confidence_score, metadata } = req.body;
    
    const insight = await Insight.create({
      org_id: req.user.organizationId,
      type,
      description,
      severity,
      confidence_score: confidence_score || null,
      metadata: metadata || {}
    });
    
    res.status(201).json({
      message: 'Insight created successfully',
      insight
    });
  } catch (error) {
    console.error('Create insight error:', error);
    res.status(500).json({ error: 'Failed to create insight' });
  }
});

// PUT /api/insights/:id - Update insight
router.put('/:id', validate(schemas.insight), async (req, res) => {
  try {
    const { type, description, severity, confidence_score, metadata } = req.body;
    
    const [updatedRowsCount] = await Insight.update(
      { type, description, severity, confidence_score, metadata },
      { 
        where: { 
          id: req.params.id,
          org_id: req.user.organizationId 
        }
      }
    );
    
    if (updatedRowsCount === 0) {
      return res.status(404).json({ error: 'Insight not found' });
    }
    
    const updatedInsight = await Insight.findByPk(req.params.id);
    
    res.json({
      message: 'Insight updated successfully',
      insight: updatedInsight
    });
  } catch (error) {
    console.error('Update insight error:', error);
    res.status(500).json({ error: 'Failed to update insight' });
  }
});

// DELETE /api/insights/:id - Delete insight
router.delete('/:id', async (req, res) => {
  try {
    const deletedRowsCount = await Insight.destroy({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (deletedRowsCount === 0) {
      return res.status(404).json({ error: 'Insight not found' });
    }
    
    res.json({ message: 'Insight deleted successfully' });
  } catch (error) {
    console.error('Delete insight error:', error);
    res.status(500).json({ error: 'Failed to delete insight' });
  }
});

// POST /api/insights/:id/acknowledge - Acknowledge an insight
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const insight = await Insight.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!insight) {
      return res.status(404).json({ error: 'Insight not found' });
    }
    
    if (insight.is_acknowledged) {
      return res.status(400).json({ error: 'Insight already acknowledged' });
    }
    
    await insight.update({
      is_acknowledged: true,
      acknowledged_at: new Date()
    });
    
    res.json({
      message: 'Insight acknowledged successfully',
      insight: {
        id: insight.id,
        is_acknowledged: true,
        acknowledged_at: insight.acknowledged_at
      }
    });
  } catch (error) {
    console.error('Acknowledge insight error:', error);
    res.status(500).json({ error: 'Failed to acknowledge insight' });
  }
});

// POST /api/insights/:id/unacknowledge - Unacknowledge an insight
router.post('/:id/unacknowledge', async (req, res) => {
  try {
    const insight = await Insight.findOne({
      where: { 
        id: req.params.id,
        org_id: req.user.organizationId 
      }
    });
    
    if (!insight) {
      return res.status(404).json({ error: 'Insight not found' });
    }
    
    if (!insight.is_acknowledged) {
      return res.status(400).json({ error: 'Insight not acknowledged' });
    }
    
    await insight.update({
      is_acknowledged: false,
      acknowledged_at: null
    });
    
    res.json({
      message: 'Insight unacknowledged successfully',
      insight: {
        id: insight.id,
        is_acknowledged: false,
        acknowledged_at: null
      }
    });
  } catch (error) {
    console.error('Unacknowledge insight error:', error);
    res.status(500).json({ error: 'Failed to unacknowledge insight' });
  }
});

// GET /api/insights/summary - Get insights summary
router.get('/summary/stats', async (req, res) => {
  try {
    const { Sequelize } = require('sequelize');
    
    const summary = await Insight.findAll({
      where: { org_id: req.user.organizationId },
      attributes: [
        'type',
        'severity',
        'is_acknowledged',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      group: ['type', 'severity', 'is_acknowledged'],
      raw: true
    });
    
    // Transform the results into a more readable format
    const stats = {
      by_type: {},
      by_severity: {},
      acknowledged: 0,
      unacknowledged: 0,
      total: 0
    };
    
    summary.forEach(item => {
      const count = parseInt(item.count);
      stats.total += count;
      
      // By type
      if (!stats.by_type[item.type]) stats.by_type[item.type] = 0;
      stats.by_type[item.type] += count;
      
      // By severity
      if (!stats.by_severity[item.severity]) stats.by_severity[item.severity] = 0;
      stats.by_severity[item.severity] += count;
      
      // By acknowledgment
      if (item.is_acknowledged) {
        stats.acknowledged += count;
      } else {
        stats.unacknowledged += count;
      }
    });
    
    res.json(stats);
  } catch (error) {
    console.error('Get insights summary error:', error);
    res.status(500).json({ error: 'Failed to fetch insights summary' });
  }
});

module.exports = router;