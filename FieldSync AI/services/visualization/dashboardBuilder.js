const _ = require('lodash');
const { Op } = require('sequelize');
const { Dashboard, Query } = require('../../models');

/**
 * Dashboard builder service for drag & drop layout management
 * Handles dashboard creation, layout persistence, and widget management
 */
class DashboardBuilder {
  constructor() {
    // Default layout configuration
    this.defaultLayout = {
      version: '1.0',
      grid: {
        columns: 12,
        rowHeight: 100,
        margin: [10, 10],
        containerPadding: [10, 10],
        breakpoints: {
          lg: 1200,
          md: 996,
          sm: 768,
          xs: 480,
          xxs: 0
        },
        cols: {
          lg: 12,
          md: 10,
          sm: 6,
          xs: 4,
          xxs: 2
        }
      },
      widgets: [],
      theme: 'default',
      autoRefresh: false,
      refreshInterval: 300000 // 5 minutes default
    };

    // Widget type definitions
    this.widgetTypes = {
      chart: {
        name: 'Chart Widget',
        description: 'Display data visualizations',
        minSize: { w: 2, h: 2 },
        defaultSize: { w: 4, h: 3 },
        maxSize: { w: 12, h: 8 },
        configurable: ['title', 'chartType', 'dataSource', 'filters', 'colors']
      },
      metric: {
        name: 'Metric Widget',
        description: 'Show key performance indicators',
        minSize: { w: 1, h: 1 },
        defaultSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 3 },
        configurable: ['title', 'metric', 'target', 'format', 'color']
      },
      table: {
        name: 'Table Widget',
        description: 'Display tabular data',
        minSize: { w: 3, h: 2 },
        defaultSize: { w: 6, h: 4 },
        maxSize: { w: 12, h: 8 },
        configurable: ['title', 'columns', 'sorting', 'pagination', 'filters']
      },
      text: {
        name: 'Text Widget',
        description: 'Add text, markdown, or HTML content',
        minSize: { w: 1, h: 1 },
        defaultSize: { w: 3, h: 2 },
        maxSize: { w: 12, h: 6 },
        configurable: ['content', 'fontSize', 'alignment', 'backgroundColor']
      },
      filter: {
        name: 'Filter Widget',
        description: 'Interactive filters for dashboard data',
        minSize: { w: 2, h: 1 },
        defaultSize: { w: 3, h: 1 },
        maxSize: { w: 6, h: 2 },
        configurable: ['filterType', 'dataSource', 'field', 'defaultValue']
      }
    };
  }

  /**
   * Create a new dashboard with default layout
   * @param {Object} dashboardData - Dashboard creation data
   * @param {string} organizationId - Organization ID
   * @returns {Object} Created dashboard
   */
  async createDashboard(dashboardData, organizationId) {
    try {
      const layout = {
        ...this.defaultLayout,
        ...dashboardData.layout
      };

      const dashboard = await Dashboard.create({
        name: dashboardData.name,
        description: dashboardData.description || '',
        layout: layout,
        refresh_schedule: dashboardData.refreshSchedule || null,
        org_id: organizationId,
        created_by: dashboardData.createdBy,
        is_public: dashboardData.isPublic || false,
        tags: dashboardData.tags || []
      });

      return {
        success: true,
        dashboard: await this.getDashboardWithLayout(dashboard.id)
      };
    } catch (error) {
      console.error('Dashboard creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getDashboards(organizationId, options = {}) {
    const { page = 1, limit = 10, search } = options;
    const offset = (page - 1) * limit;
    const whereClause = { org_id: organizationId };

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Dashboard.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      total: count,
      dashboards: rows.map(d => ({
        ...d.toJSON(),
        layout: typeof d.layout === 'string' ? JSON.parse(d.layout) : d.layout
      }))
    };
  }

  async getDashboard(dashboardId, organizationId) {
    const dashboard = await Dashboard.findOne({
      where: { id: dashboardId, org_id: organizationId }
    });
    if (!dashboard) return null;
    return {
      ...dashboard.toJSON(),
      layout: typeof dashboard.layout === 'string' ? JSON.parse(dashboard.layout) : dashboard.layout
    };
  }

  async updateDashboard(dashboardId, organizationId, updates = {}) {
    const dashboard = await Dashboard.findOne({
      where: { id: dashboardId, org_id: organizationId }
    });
    if (!dashboard) return null;

    const updateData = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.refresh_schedule) updateData.refresh_schedule = updates.refresh_schedule;
    if (updates.is_public !== undefined) updateData.is_public = updates.is_public;
    if (updates.tags) updateData.tags = updates.tags;

    if (updates.layout) {
      const validationResult = this.validateLayout(updates.layout);
      if (!validationResult.valid) {
        throw new Error(validationResult.error);
      }
      updateData.layout = updates.layout;
    }

    await dashboard.update(updateData);

    return this.getDashboardWithLayout(dashboardId);
  }

  async deleteDashboard(dashboardId, organizationId) {
    const deleted = await Dashboard.destroy({
      where: { id: dashboardId, org_id: organizationId }
    });
    return deleted > 0;
  }

  /**
   * Update dashboard layout
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} layout - New layout configuration
   * @param {string} organizationId - Organization ID
   * @returns {Object} Update result
   */
  async updateLayout(dashboardId, layout, organizationId) {
    try {
      const dashboard = await Dashboard.findOne({
        where: {
          id: dashboardId,
          org_id: organizationId
        }
      });

      if (!dashboard) {
        return {
          success: false,
          error: 'Dashboard not found'
        };
      }

      // Validate layout structure
      const validationResult = this.validateLayout(layout);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error
        };
      }

      // Update layout
      await dashboard.update({
        layout: layout,
        updated_at: new Date()
      });

      return {
        success: true,
        dashboard: await this.getDashboardWithLayout(dashboardId)
      };
    } catch (error) {
      console.error('Layout update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add widget to dashboard
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} widgetConfig - Widget configuration
   * @param {string} organizationId - Organization ID
   * @returns {Object} Update result
   */
  async addWidget(dashboardId, widgetConfig, organizationId) {
    try {
      const dashboard = await Dashboard.findOne({
        where: {
          id: dashboardId,
          org_id: organizationId
        }
      });

      if (!dashboard) {
        return {
          success: false,
          error: 'Dashboard not found'
        };
      }

      const layout = typeof dashboard.layout === 'string' ? JSON.parse(dashboard.layout) : dashboard.layout;
      
      // Generate widget configuration
      const widget = this.generateWidgetConfig(widgetConfig);
      
      // Find optimal position for new widget
      const position = this.findOptimalPosition(layout, widget.size);
      
      // Add widget to layout
      widget.position = position;
      layout.widgets.push(widget);

      // Update dashboard
      await dashboard.update({
        layout: layout,
        updated_at: new Date()
      });

      return {
        success: true,
        widget,
        dashboard: await this.getDashboardWithLayout(dashboardId)
      };
    } catch (error) {
      console.error('Widget addition error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update widget configuration
   * @param {string} dashboardId - Dashboard ID
   * @param {string} widgetId - Widget ID
   * @param {Object} updates - Widget updates
   * @param {string} organizationId - Organization ID
   * @returns {Object} Update result
   */
  async updateWidget(dashboardId, widgetId, updates, organizationId) {
    try {
      const dashboard = await Dashboard.findOne({
        where: {
          id: dashboardId,
          org_id: organizationId
        }
      });

      if (!dashboard) {
        return {
          success: false,
          error: 'Dashboard not found'
        };
      }

      const layout = typeof dashboard.layout === 'string' ? JSON.parse(dashboard.layout) : dashboard.layout;
      const widgetIndex = layout.widgets.findIndex(w => w.id === widgetId);

      if (widgetIndex === -1) {
        return {
          success: false,
          error: 'Widget not found'
        };
      }

      // Update widget
      layout.widgets[widgetIndex] = {
        ...layout.widgets[widgetIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Validate updated layout
      const validationResult = this.validateLayout(layout);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error
        };
      }

      // Save changes
      await dashboard.update({
        layout: layout,
        updated_at: new Date()
      });

      return {
        success: true,
        widget: layout.widgets[widgetIndex],
        dashboard: await this.getDashboardWithLayout(dashboardId)
      };
    } catch (error) {
      console.error('Widget update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove widget from dashboard
   * @param {string} dashboardId - Dashboard ID
   * @param {string} widgetId - Widget ID
   * @param {string} organizationId - Organization ID
   * @returns {Object} Update result
   */
  async removeWidget(dashboardId, widgetId, organizationId) {
    try {
      const dashboard = await Dashboard.findOne({
        where: {
          id: dashboardId,
          org_id: organizationId
        }
      });

      if (!dashboard) {
        return {
          success: false,
          error: 'Dashboard not found'
        };
      }

      const layout = typeof dashboard.layout === 'string' ? JSON.parse(dashboard.layout) : dashboard.layout;
      const initialCount = layout.widgets.length;
      
      // Remove widget
      layout.widgets = layout.widgets.filter(w => w.id !== widgetId);

      if (layout.widgets.length === initialCount) {
        return {
          success: false,
          error: 'Widget not found'
        };
      }

      // Optimize layout after removal
      this.optimizeLayout(layout);

      // Save changes
      await dashboard.update({
        layout: layout,
        updated_at: new Date()
      });

      return {
        success: true,
        dashboard: await this.getDashboardWithLayout(dashboardId)
      };
    } catch (error) {
      console.error('Widget removal error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get dashboard with parsed layout
   * @param {string} dashboardId - Dashboard ID
   * @returns {Object} Dashboard with layout
   */
  async getDashboardWithLayout(dashboardId) {
    const dashboard = await Dashboard.findByPk(dashboardId);
    if (!dashboard) return null;

    return {
      ...dashboard.toJSON(),
      layout: typeof dashboard.layout === 'string' ? JSON.parse(dashboard.layout) : dashboard.layout
    };
  }

  /**
   * Generate widget configuration
   * @param {Object} widgetConfig - Widget configuration input
   * @returns {Object} Complete widget configuration
   */
  generateWidgetConfig(widgetConfig) {
    const widgetType = this.widgetTypes[widgetConfig.type];
    if (!widgetType) {
      throw new Error(`Unknown widget type: ${widgetConfig.type}`);
    }

    return {
      id: this.generateWidgetId(),
      type: widgetConfig.type,
      title: widgetConfig.title || `New ${widgetType.name}`,
      size: widgetConfig.size || widgetType.defaultSize,
      config: widgetConfig.config || {},
      style: widgetConfig.style || {},
      dataSource: widgetConfig.dataSource || null,
      filters: widgetConfig.filters || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate unique widget ID
   * @returns {string} Widget ID
   */
  generateWidgetId() {
    return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find optimal position for new widget
   * @param {Object} layout - Current layout
   * @param {Object} size - Widget size
   * @returns {Object} Position coordinates
   */
  findOptimalPosition(layout, size) {
    const grid = layout.grid;
    const widgets = layout.widgets;
    
    // Create occupancy grid
    const occupancy = Array(20).fill().map(() => Array(grid.columns).fill(false));
    
    // Mark occupied positions
    widgets.forEach(widget => {
      if (widget.position) {
        for (let y = widget.position.y; y < widget.position.y + widget.size.h; y++) {
          for (let x = widget.position.x; x < widget.position.x + widget.size.w; x++) {
            if (occupancy[y] && occupancy[y][x] !== undefined) {
              occupancy[y][x] = true;
            }
          }
        }
      }
    });

    // Find first available position
    for (let y = 0; y < occupancy.length - size.h; y++) {
      for (let x = 0; x <= grid.columns - size.w; x++) {
        let canPlace = true;
        
        // Check if area is free
        for (let dy = 0; dy < size.h && canPlace; dy++) {
          for (let dx = 0; dx < size.w && canPlace; dx++) {
            if (occupancy[y + dy][x + dx]) {
              canPlace = false;
            }
          }
        }
        
        if (canPlace) {
          return { x, y };
        }
      }
    }

    // If no space found, place at bottom
    const maxY = Math.max(0, ...widgets.map(w => (w.position?.y || 0) + (w.size?.h || 1)));
    return { x: 0, y: maxY };
  }

  /**
   * Validate layout structure
   * @param {Object} layout - Layout to validate
   * @returns {Object} Validation result
   */
  validateLayout(layout) {
    try {
      // Check required properties
      if (!layout.version || !layout.grid || !Array.isArray(layout.widgets)) {
        return {
          valid: false,
          error: 'Invalid layout structure'
        };
      }

      // Validate grid configuration
      const grid = layout.grid;
      if (!grid.columns || !grid.rowHeight || !grid.margin) {
        return {
          valid: false,
          error: 'Invalid grid configuration'
        };
      }

      // Validate widgets
      for (const widget of layout.widgets) {
        if (!widget.id || !widget.type || !this.widgetTypes[widget.type]) {
          return {
            valid: false,
            error: `Invalid widget: ${widget.id || 'unknown'}`
          };
        }

        // Check widget size constraints
        const widgetType = this.widgetTypes[widget.type];
        if (widget.size) {
          if (widget.size.w < widgetType.minSize.w || widget.size.h < widgetType.minSize.h) {
            return {
              valid: false,
              error: `Widget ${widget.id} is too small`
            };
          }
          if (widget.size.w > widgetType.maxSize.w || widget.size.h > widgetType.maxSize.h) {
            return {
              valid: false,
              error: `Widget ${widget.id} is too large`
            };
          }
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Optimize layout by removing gaps and organizing widgets
   * @param {Object} layout - Layout to optimize
   */
  optimizeLayout(layout) {
    // Sort widgets by position (top to bottom, left to right)
    layout.widgets.sort((a, b) => {
      if (!a.position || !b.position) return 0;
      if (a.position.y !== b.position.y) {
        return a.position.y - b.position.y;
      }
      return a.position.x - b.position.x;
    });

    // Compact layout by moving widgets up
    const grid = layout.grid;
    const occupancy = Array(50).fill().map(() => Array(grid.columns).fill(false));

    layout.widgets.forEach(widget => {
      if (!widget.position || !widget.size) return;

      // Find the highest available position for this widget
      let bestY = 0;
      let canPlace = false;

      while (!canPlace && bestY < 50) {
        canPlace = true;
        
        // Check if widget can be placed at this position
        for (let dy = 0; dy < widget.size.h && canPlace; dy++) {
          for (let dx = 0; dx < widget.size.w && canPlace; dx++) {
            const x = widget.position.x + dx;
            const y = bestY + dy;
            if (x >= grid.columns || occupancy[y][x]) {
              canPlace = false;
            }
          }
        }

        if (!canPlace) {
          bestY++;
        }
      }

      // Update widget position
      widget.position.y = bestY;

      // Mark occupied positions
      for (let dy = 0; dy < widget.size.h; dy++) {
        for (let dx = 0; dx < widget.size.w; dx++) {
          const x = widget.position.x + dx;
          const y = bestY + dy;
          if (x < grid.columns && y < 50) {
            occupancy[y][x] = true;
          }
        }
      }
    });
  }

  /**
   * Clone dashboard with new name
   * @param {string} dashboardId - Source dashboard ID
   * @param {string} newName - New dashboard name
   * @param {string} organizationId - Organization ID
   * @returns {Object} Cloned dashboard
   */
  async cloneDashboard(dashboardId, newName, organizationId) {
    try {
      const sourceDashboard = await Dashboard.findOne({
        where: {
          id: dashboardId,
          org_id: organizationId
        }
      });

      if (!sourceDashboard) {
        return {
          success: false,
          error: 'Source dashboard not found'
        };
      }

      const layout = typeof sourceDashboard.layout === 'string' ? JSON.parse(sourceDashboard.layout) : sourceDashboard.layout;
      
      // Generate new widget IDs
      layout.widgets.forEach(widget => {
        widget.id = this.generateWidgetId();
        widget.createdAt = new Date().toISOString();
        widget.updatedAt = new Date().toISOString();
      });

      const clonedDashboard = await Dashboard.create({
        name: newName,
        description: `Copy of ${sourceDashboard.name}`,
        layout: layout,
        refresh_schedule: sourceDashboard.refresh_schedule,
        org_id: organizationId,
        created_by: sourceDashboard.created_by,
        is_public: false,
        tags: sourceDashboard.tags
      });

      return {
        success: true,
        dashboard: await this.getDashboardWithLayout(clonedDashboard.id)
      };
    } catch (error) {
      console.error('Dashboard cloning error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get widget types and their configurations
   * @returns {Object} Available widget types
   */
  getWidgetTypes() {
    return this.widgetTypes;
  }

  /**
   * Export dashboard layout as JSON
   * @param {string} dashboardId - Dashboard ID
   * @param {string} organizationId - Organization ID
   * @returns {Object} Export result
   */
  async exportDashboard(dashboardId, organizationId) {
    try {
      const dashboard = await this.getDashboardWithLayout(dashboardId);
      
      if (!dashboard || dashboard.org_id !== organizationId) {
        return {
          success: false,
          error: 'Dashboard not found'
        };
      }

      return {
        success: true,
        export: {
          name: dashboard.name,
          description: dashboard.description,
          layout: dashboard.layout,
          exportedAt: new Date().toISOString(),
          version: '1.0'
        }
      };
    } catch (error) {
      console.error('Dashboard export error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Import dashboard from JSON
   * @param {Object} importData - Dashboard import data
   * @param {string} organizationId - Organization ID
   * @param {string} createdBy - User ID
   * @returns {Object} Import result
   */
  async importDashboard(importData, organizationId, createdBy) {
    try {
      // Validate import data
      if (!importData.layout || !importData.name) {
        return {
          success: false,
          error: 'Invalid import data'
        };
      }

      // Validate layout
      const validationResult = this.validateLayout(importData.layout);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Invalid layout: ${validationResult.error}`
        };
      }

      // Generate new widget IDs
      importData.layout.widgets.forEach(widget => {
        widget.id = this.generateWidgetId();
        widget.createdAt = new Date().toISOString();
        widget.updatedAt = new Date().toISOString();
      });

      const dashboard = await Dashboard.create({
        name: importData.name,
        description: importData.description || 'Imported dashboard',
        layout: importData.layout,
        org_id: organizationId,
        created_by: createdBy,
        is_public: false,
        tags: importData.tags || []
      });

      return {
        success: true,
        dashboard: await this.getDashboardWithLayout(dashboard.id)
      };
    } catch (error) {
      console.error('Dashboard import error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new DashboardBuilder();
