const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DataSource = sequelize.define('DataSource', {
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM(
        'postgresql',
        'mysql',
        'mongodb',
        'api',
        'csv',
        'google_sheets',
        'quickbooks',
        'shopify',
        'stripe'
      ),
      allowNull: false
    },
    connection_string: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    schema: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
    },
    credentials: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
    },
    tags: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'error'),
      defaultValue: 'active'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_connected: {
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
    tableName: 'data_sources',
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
        fields: ['is_active']
      }
    ]
  });

  DataSource.associate = (models) => {
    DataSource.belongsTo(models.Organization, {
      foreignKey: 'org_id',
      as: 'organization'
    });
    
    DataSource.hasMany(models.Query, {
      foreignKey: 'data_source_id',
      as: 'queries',
      onDelete: 'SET NULL'
    });
  };

  return DataSource;
};
