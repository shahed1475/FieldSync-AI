const crypto = require('crypto');
const { QueryCache } = require('../models');

// Query caching middleware
const cacheQuery = (ttlMinutes = 60) => {
  return async (req, res, next) => {
    try {
      // Generate cache key from request
      const cacheKey = generateCacheKey(req);
      
      // Check if cached result exists
      const cachedResult = await getCachedResult(cacheKey);
      
      if (cachedResult) {
        // Update hit count
        await QueryCache.increment('hit_count', {
          where: { query_hash: cacheKey }
        });
        
        console.log(`Cache HIT for key: ${cacheKey}`);
        return res.json({
          success: true,
          data: cachedResult.results,
          cached: true,
          cache_hit_count: cachedResult.hit_count + 1,
          timestamp: new Date().toISOString()
        });
      }
      
      // Store original res.json to intercept response
      const originalJson = res.json;
      
      res.json = function(data) {
        // Cache successful responses
        if (data && data.success !== false) {
          cacheResult(cacheKey, data, ttlMinutes).catch(error => {
            console.error('Cache storage error:', error);
          });
        }
        
        // Call original res.json
        originalJson.call(this, data);
      };
      
      console.log(`Cache MISS for key: ${cacheKey}`);
      next();
      
    } catch (error) {
      console.error('Cache middleware error:', error);
      // Continue without caching on error
      next();
    }
  };
};

// Generate cache key from request
const generateCacheKey = (req) => {
  const keyData = {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined,
    orgId: req.user?.orgId
  };
  
  const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
  return crypto.createHash('md5').update(keyString).digest('hex');
};

// Get cached result
const getCachedResult = async (cacheKey) => {
  try {
    const cached = await QueryCache.findOne({
      where: {
        query_hash: cacheKey,
        expiry: {
          [require('sequelize').Op.gt]: new Date()
        }
      }
    });
    
    return cached;
  } catch (error) {
    console.error('Cache retrieval error:', error);
    return null;
  }
};

// Cache result
const cacheResult = async (cacheKey, data, ttlMinutes) => {
  try {
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + ttlMinutes);
    
    await QueryCache.upsert({
      query_hash: cacheKey,
      results: data,
      expiry: expiryDate,
      hit_count: 0
    });
    
    console.log(`Cached result for key: ${cacheKey}, expires: ${expiryDate}`);
  } catch (error) {
    console.error('Cache storage error:', error);
  }
};

// Clear expired cache entries
const clearExpiredCache = async () => {
  try {
    const deletedCount = await QueryCache.destroy({
      where: {
        expiry: {
          [require('sequelize').Op.lt]: new Date()
        }
      }
    });
    
    console.log(`Cleared ${deletedCount} expired cache entries`);
    return deletedCount;
  } catch (error) {
    console.error('Cache cleanup error:', error);
    return 0;
  }
};

// Clear cache by pattern
const clearCacheByPattern = async (pattern) => {
  try {
    const { Op } = require('sequelize');
    const deletedCount = await QueryCache.destroy({
      where: {
        query_hash: {
          [Op.like]: `%${pattern}%`
        }
      }
    });
    
    console.log(`Cleared ${deletedCount} cache entries matching pattern: ${pattern}`);
    return deletedCount;
  } catch (error) {
    console.error('Cache pattern clear error:', error);
    return 0;
  }
};

// Get cache statistics
const getCacheStats = async () => {
  try {
    const { Op, fn, col } = require('sequelize');
    
    const stats = await QueryCache.findAll({
      attributes: [
        [fn('COUNT', col('query_hash')), 'total_entries'],
        [fn('SUM', col('hit_count')), 'total_hits'],
        [fn('AVG', col('hit_count')), 'avg_hits_per_entry']
      ],
      raw: true
    });
    
    const expiredCount = await QueryCache.count({
      where: {
        expiry: {
          [Op.lt]: new Date()
        }
      }
    });
    
    return {
      ...stats[0],
      expired_entries: expiredCount,
      active_entries: stats[0].total_entries - expiredCount
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return {
      total_entries: 0,
      total_hits: 0,
      avg_hits_per_entry: 0,
      expired_entries: 0,
      active_entries: 0
    };
  }
};

// Cache invalidation middleware for data modifications
const invalidateCache = (patterns = []) => {
  return async (req, res, next) => {
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = async function(data) {
      // Invalidate cache on successful data modifications
      if (data && data.success !== false && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
        try {
          for (const pattern of patterns) {
            await clearCacheByPattern(pattern);
          }
          
          // Also clear cache entries related to the organization
          if (req.user?.orgId) {
            await clearCacheByPattern(req.user.orgId);
          }
        } catch (error) {
          console.error('Cache invalidation error:', error);
        }
      }
      
      // Call original res.json
      originalJson.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  cacheQuery,
  clearExpiredCache,
  clearCacheByPattern,
  getCacheStats,
  invalidateCache,
  generateCacheKey,
  getCachedResult,
  cacheResult
};