const { DataSource } = require('../models');
const { Op } = require('sequelize');

/**
 * Data Source Tagging Utilities
 * Provides functions for managing tags and organization-based data source filtering
 */
class DataSourceTagManager {
  /**
   * Add tags to a data source
   * @param {string} dataSourceId - Data source ID
   * @param {Array} tags - Array of tag strings
   * @param {string} organizationId - Organization ID
   * @returns {Object} Updated data source
   */
  static async addTags(dataSourceId, tags, organizationId) {
    try {
      const dataSource = await DataSource.findOne({
        where: {
          id: dataSourceId,
          organization_id: organizationId
        }
      });

      if (!dataSource) {
        throw new Error('Data source not found');
      }

      const metadata = JSON.parse(dataSource.metadata || '{}');
      const existingTags = metadata.tags || [];
      
      // Merge and deduplicate tags
      const newTags = [...new Set([...existingTags, ...tags])];
      
      metadata.tags = newTags;
      
      await dataSource.update({
        metadata: JSON.stringify(metadata)
      });

      return dataSource;
    } catch (error) {
      throw new Error(`Failed to add tags: ${error.message}`);
    }
  }

  /**
   * Remove tags from a data source
   * @param {string} dataSourceId - Data source ID
   * @param {Array} tags - Array of tag strings to remove
   * @param {string} organizationId - Organization ID
   * @returns {Object} Updated data source
   */
  static async removeTags(dataSourceId, tags, organizationId) {
    try {
      const dataSource = await DataSource.findOne({
        where: {
          id: dataSourceId,
          organization_id: organizationId
        }
      });

      if (!dataSource) {
        throw new Error('Data source not found');
      }

      const metadata = JSON.parse(dataSource.metadata || '{}');
      const existingTags = metadata.tags || [];
      
      // Remove specified tags
      const updatedTags = existingTags.filter(tag => !tags.includes(tag));
      
      metadata.tags = updatedTags;
      
      await dataSource.update({
        metadata: JSON.stringify(metadata)
      });

      return dataSource;
    } catch (error) {
      throw new Error(`Failed to remove tags: ${error.message}`);
    }
  }

  /**
   * Get data sources by tags
   * @param {Array} tags - Array of tag strings
   * @param {string} organizationId - Organization ID
   * @param {Object} options - Query options
   * @returns {Array} Data sources matching tags
   */
  static async getDataSourcesByTags(tags, organizationId, options = {}) {
    try {
      const { matchAll = false, limit = 50, offset = 0 } = options;
      
      const dataSources = await DataSource.findAll({
        where: {
          organization_id: organizationId
        },
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      // Filter by tags in metadata
      const filtered = dataSources.filter(dataSource => {
        const metadata = JSON.parse(dataSource.metadata || '{}');
        const sourceTags = metadata.tags || [];
        
        if (matchAll) {
          // All specified tags must be present
          return tags.every(tag => sourceTags.includes(tag));
        } else {
          // At least one tag must be present
          return tags.some(tag => sourceTags.includes(tag));
        }
      });

      return filtered;
    } catch (error) {
      throw new Error(`Failed to get data sources by tags: ${error.message}`);
    }
  }

  /**
   * Get all unique tags for an organization
   * @param {string} organizationId - Organization ID
   * @returns {Array} Array of unique tags
   */
  static async getAllTags(organizationId) {
    try {
      const dataSources = await DataSource.findAll({
        where: {
          organization_id: organizationId
        },
        attributes: ['metadata']
      });

      const allTags = new Set();
      
      dataSources.forEach(dataSource => {
        const metadata = JSON.parse(dataSource.metadata || '{}');
        const tags = metadata.tags || [];
        tags.forEach(tag => allTags.add(tag));
      });

      return Array.from(allTags).sort();
    } catch (error) {
      throw new Error(`Failed to get all tags: ${error.message}`);
    }
  }

  /**
   * Get tag statistics for an organization
   * @param {string} organizationId - Organization ID
   * @returns {Object} Tag statistics
   */
  static async getTagStatistics(organizationId) {
    try {
      const dataSources = await DataSource.findAll({
        where: {
          organization_id: organizationId
        },
        attributes: ['metadata', 'type', 'status']
      });

      const tagStats = {};
      const typeStats = {};
      const statusStats = {};

      dataSources.forEach(dataSource => {
        const metadata = JSON.parse(dataSource.metadata || '{}');
        const tags = metadata.tags || [];
        
        // Count tags
        tags.forEach(tag => {
          if (!tagStats[tag]) {
            tagStats[tag] = {
              count: 0,
              types: new Set(),
              statuses: new Set()
            };
          }
          tagStats[tag].count++;
          tagStats[tag].types.add(dataSource.type);
          tagStats[tag].statuses.add(dataSource.status);
        });

        // Count types
        typeStats[dataSource.type] = (typeStats[dataSource.type] || 0) + 1;
        
        // Count statuses
        statusStats[dataSource.status] = (statusStats[dataSource.status] || 0) + 1;
      });

      // Convert Sets to Arrays for JSON serialization
      Object.keys(tagStats).forEach(tag => {
        tagStats[tag].types = Array.from(tagStats[tag].types);
        tagStats[tag].statuses = Array.from(tagStats[tag].statuses);
      });

      return {
        totalDataSources: dataSources.length,
        tagStats,
        typeStats,
        statusStats,
        mostUsedTags: Object.entries(tagStats)
          .sort(([,a], [,b]) => b.count - a.count)
          .slice(0, 10)
          .map(([tag, stats]) => ({ tag, count: stats.count }))
      };
    } catch (error) {
      throw new Error(`Failed to get tag statistics: ${error.message}`);
    }
  }

  /**
   * Search data sources by name, type, or tags
   * @param {string} query - Search query
   * @param {string} organizationId - Organization ID
   * @param {Object} options - Search options
   * @returns {Array} Matching data sources
   */
  static async searchDataSources(query, organizationId, options = {}) {
    try {
      const { limit = 50, offset = 0, types = [], statuses = [] } = options;
      
      const whereClause = {
        organization_id: organizationId,
        [Op.or]: [
          { name: { [Op.iLike]: `%${query}%` } },
          { type: { [Op.iLike]: `%${query}%` } }
        ]
      };

      if (types.length > 0) {
        whereClause.type = { [Op.in]: types };
      }

      if (statuses.length > 0) {
        whereClause.status = { [Op.in]: statuses };
      }

      const dataSources = await DataSource.findAll({
        where: whereClause,
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      // Also search in tags
      const allDataSources = await DataSource.findAll({
        where: {
          organization_id: organizationId,
          ...(types.length > 0 && { type: { [Op.in]: types } }),
          ...(statuses.length > 0 && { status: { [Op.in]: statuses } })
        }
      });

      const tagMatches = allDataSources.filter(dataSource => {
        const metadata = JSON.parse(dataSource.metadata || '{}');
        const tags = metadata.tags || [];
        return tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));
      });

      // Combine and deduplicate results
      const combinedResults = [...dataSources];
      tagMatches.forEach(tagMatch => {
        if (!combinedResults.find(ds => ds.id === tagMatch.id)) {
          combinedResults.push(tagMatch);
        }
      });

      return combinedResults.slice(offset, offset + limit);
    } catch (error) {
      throw new Error(`Failed to search data sources: ${error.message}`);
    }
  }

  /**
   * Bulk update tags for multiple data sources
   * @param {Array} dataSourceIds - Array of data source IDs
   * @param {Array} tagsToAdd - Tags to add
   * @param {Array} tagsToRemove - Tags to remove
   * @param {string} organizationId - Organization ID
   * @returns {Object} Update results
   */
  static async bulkUpdateTags(dataSourceIds, tagsToAdd = [], tagsToRemove = [], organizationId) {
    try {
      const dataSources = await DataSource.findAll({
        where: {
          id: { [Op.in]: dataSourceIds },
          organization_id: organizationId
        }
      });

      const updatePromises = dataSources.map(async (dataSource) => {
        const metadata = JSON.parse(dataSource.metadata || '{}');
        let tags = metadata.tags || [];
        
        // Remove specified tags
        if (tagsToRemove.length > 0) {
          tags = tags.filter(tag => !tagsToRemove.includes(tag));
        }
        
        // Add new tags
        if (tagsToAdd.length > 0) {
          tags = [...new Set([...tags, ...tagsToAdd])];
        }
        
        metadata.tags = tags;
        
        return dataSource.update({
          metadata: JSON.stringify(metadata)
        });
      });

      await Promise.all(updatePromises);

      return {
        updated: dataSources.length,
        dataSourceIds: dataSources.map(ds => ds.id)
      };
    } catch (error) {
      throw new Error(`Failed to bulk update tags: ${error.message}`);
    }
  }

  /**
   * Get data sources grouped by tags
   * @param {string} organizationId - Organization ID
   * @returns {Object} Data sources grouped by tags
   */
  static async getDataSourcesGroupedByTags(organizationId) {
    try {
      const dataSources = await DataSource.findAll({
        where: {
          organization_id: organizationId
        },
        order: [['created_at', 'DESC']]
      });

      const groupedByTags = {};
      const untagged = [];

      dataSources.forEach(dataSource => {
        const metadata = JSON.parse(dataSource.metadata || '{}');
        const tags = metadata.tags || [];
        
        if (tags.length === 0) {
          untagged.push(dataSource);
        } else {
          tags.forEach(tag => {
            if (!groupedByTags[tag]) {
              groupedByTags[tag] = [];
            }
            groupedByTags[tag].push(dataSource);
          });
        }
      });

      return {
        tagged: groupedByTags,
        untagged,
        summary: {
          totalDataSources: dataSources.length,
          taggedCount: dataSources.length - untagged.length,
          untaggedCount: untagged.length,
          uniqueTags: Object.keys(groupedByTags).length
        }
      };
    } catch (error) {
      throw new Error(`Failed to group data sources by tags: ${error.message}`);
    }
  }

  /**
   * Validate tag format
   * @param {Array} tags - Array of tags to validate
   * @returns {Object} Validation result
   */
  static validateTags(tags) {
    const errors = [];
    const validTags = [];
    
    if (!Array.isArray(tags)) {
      return { valid: false, errors: ['Tags must be an array'] };
    }

    tags.forEach((tag, index) => {
      if (typeof tag !== 'string') {
        errors.push(`Tag at index ${index} must be a string`);
        return;
      }
      
      const trimmedTag = tag.trim();
      
      if (trimmedTag.length === 0) {
        errors.push(`Tag at index ${index} cannot be empty`);
        return;
      }
      
      if (trimmedTag.length > 50) {
        errors.push(`Tag at index ${index} cannot exceed 50 characters`);
        return;
      }
      
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedTag)) {
        errors.push(`Tag at index ${index} can only contain letters, numbers, underscores, and hyphens`);
        return;
      }
      
      validTags.push(trimmedTag.toLowerCase());
    });

    // Remove duplicates
    const uniqueValidTags = [...new Set(validTags)];

    return {
      valid: errors.length === 0,
      errors,
      validTags: uniqueValidTags
    };
  }
}

module.exports = DataSourceTagManager;