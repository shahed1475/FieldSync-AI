const { DataTypes, Op } = require('sequelize');

module.exports = (sequelize) => {
  const QueryCache = sequelize.define('QueryCache', {
    query_hash: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false
    },
    results: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    expiry: {
      type: DataTypes.DATE,
      allowNull: false
    },
    hit_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'query_cache',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['expiry']
      },
      {
        fields: ['hit_count']
      }
    ]
  });

  // Static method to clean expired cache entries
  QueryCache.cleanExpired = async function() {
    const now = new Date();
    const deletedCount = await this.destroy({
      where: {
        expiry: {
          [Op.lt]: now
        }
      }
    });
    return deletedCount;
  };

  // Static method to get cached result
  QueryCache.getCached = async function(queryHash) {
    const cached = await this.findByPk(queryHash);
    if (!cached) return null;
    
    // Check if expired
    if (new Date() > cached.expiry) {
      await cached.destroy();
      return null;
    }
    
    // Increment hit count
    await cached.increment('hit_count');
    return cached.results;
  };

  // Static method to set cache
  QueryCache.setCache = async function(queryHash, results, ttlMinutes = 60) {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + ttlMinutes);
    
    return await this.upsert({
      query_hash: queryHash,
      results,
      expiry,
      hit_count: 0
    });
  };

  return QueryCache;
};
