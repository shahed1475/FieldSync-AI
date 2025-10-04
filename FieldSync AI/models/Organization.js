const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 100]
      }
    },
    subscription_tier: {
      type: DataTypes.ENUM('free', 'pro', 'enterprise'),
      defaultValue: 'free',
      allowNull: false
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
    tableName: 'organizations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['name']
      },
      {
        fields: ['subscription_tier']
      }
    ]
  });

  Organization.associate = (models) => {
    Organization.hasMany(models.DataSource, {
      foreignKey: 'org_id',
      as: 'dataSources',
      onDelete: 'CASCADE'
    });
    
    Organization.hasMany(models.Query, {
      foreignKey: 'org_id',
      as: 'queries',
      onDelete: 'CASCADE'
    });
    
    Organization.hasMany(models.Dashboard, {
      foreignKey: 'org_id',
      as: 'dashboards',
      onDelete: 'CASCADE'
    });
    
    Organization.hasMany(models.Insight, {
      foreignKey: 'org_id',
      as: 'insights',
      onDelete: 'CASCADE'
    });
  };

  return Organization;
};