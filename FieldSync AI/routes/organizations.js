const express = require('express');
const { Organization } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/organizations - Get current organization
router.get('/', async (req, res) => {
  try {
    const organization = await Organization.findByPk(req.user.organizationId, {
      attributes: ['id', 'name', 'subscription_tier', 'created_at', 'updated_at']
    });
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    res.json(organization);
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// PUT /api/organizations - Update current organization
router.put('/', validate(schemas.organization), async (req, res) => {
  try {
    const { name, subscription_tier } = req.body;
    
    // Check if new name already exists (if changing name)
    if (name !== req.user.organization.name) {
      const existingOrg = await Organization.findOne({ where: { name } });
      if (existingOrg) {
        return res.status(409).json({ error: 'Organization name already exists' });
      }
    }
    
    const [updatedRowsCount] = await Organization.update(
      { name, subscription_tier },
      { 
        where: { id: req.user.organizationId },
        returning: true
      }
    );
    
    if (updatedRowsCount === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    const updatedOrganization = await Organization.findByPk(req.user.organizationId, {
      attributes: ['id', 'name', 'subscription_tier', 'created_at', 'updated_at']
    });
    
    res.json({
      message: 'Organization updated successfully',
      organization: updatedOrganization
    });
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// DELETE /api/organizations - Delete current organization
router.delete('/', async (req, res) => {
  try {
    const deletedRowsCount = await Organization.destroy({
      where: { id: req.user.organizationId }
    });
    
    if (deletedRowsCount === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// GET /api/organizations/stats - Get organization statistics
router.get('/stats', async (req, res) => {
  try {
    const { DataSource, Query, Dashboard, Insight } = require('../models');
    
    const stats = await Promise.all([
      DataSource.count({ where: { org_id: req.user.organizationId } }),
      Query.count({ where: { org_id: req.user.organizationId } }),
      Dashboard.count({ where: { org_id: req.user.organizationId } }),
      Insight.count({ where: { org_id: req.user.organizationId } })
    ]);
    
    res.json({
      data_sources: stats[0],
      queries: stats[1],
      dashboards: stats[2],
      insights: stats[3]
    });
  } catch (error) {
    console.error('Get organization stats error:', error);
    res.status(500).json({ error: 'Failed to fetch organization statistics' });
  }
});

module.exports = router;