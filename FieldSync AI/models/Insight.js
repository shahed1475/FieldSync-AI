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
    type: {
      type: DataTypes.ENUM('trend', 'anomaly', 'correlation', 'prediction'),
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
    confidence_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      validate: {
        min: 0,
        max: 1
      }
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
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
  };

  return Insight;
};