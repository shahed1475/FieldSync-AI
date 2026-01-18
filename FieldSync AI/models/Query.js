const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Query = sequelize.define('Query', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    data_source_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'data_sources',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    natural_language: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [5, 1000]
      }
    },
    sql_generated: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    intent: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    confidence: {
      type: DataTypes.DECIMAL(4, 3),
      allowNull: true,
      validate: {
        min: 0,
        max: 1
      }
    },
    results: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    row_count: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    execution_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending'
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
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
    tableName: 'queries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['org_id']
      },
      {
        fields: ['data_source_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  Query.associate = (models) => {
    Query.belongsTo(models.Organization, {
      foreignKey: 'org_id',
      as: 'organization'
    });
    
    Query.belongsTo(models.DataSource, {
      foreignKey: 'data_source_id',
      as: 'dataSource'
    });

    Query.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return Query;
};
