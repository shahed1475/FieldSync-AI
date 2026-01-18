const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Insight = sequelize.define('Insight', {
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
    query_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    dashboard_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    data_source_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('trend', 'anomaly', 'correlation', 'prediction', 'pattern', 'forecast', 'outlier', 'spike', 'drop', 'volatility', 'seasonal', 'alert', 'performance'),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [10, 500]
      }
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('new', 'acknowledged', 'investigating', 'resolved', 'dismissed'),
      defaultValue: 'new'
    },
    confidence: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      validate: {
        min: 0,
        max: 100
      }
    },
    confidence_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      validate: {
        min: 0,
        max: 1
      }
    },
    actionable: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    recommendation: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
    },
    detected_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_detected: {
      type: DataTypes.DATE,
      allowNull: true
    },
    detection_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_acknowledged: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    acknowledged_at: {
      type: DataTypes.DATE,
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
    tableName: 'insights',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['org_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['severity']
      },
      {
        fields: ['is_acknowledged']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  Insight.associate = (models) => {
    Insight.belongsTo(models.Organization, {
      foreignKey: 'org_id',
      as: 'organization'
    });

    Insight.belongsTo(models.Query, {
      foreignKey: 'query_id',
      as: 'query'
    });

    Insight.belongsTo(models.Dashboard, {
      foreignKey: 'dashboard_id',
      as: 'dashboard'
    });

    Insight.belongsTo(models.DataSource, {
      foreignKey: 'data_source_id',
      as: 'dataSource'
    });
  };

  return Insight;
};
