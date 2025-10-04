const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Dashboard = sequelize.define('Dashboard', {
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
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 100]
      }
    },
    layout: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
    },
    refresh_schedule: {
      type: DataTypes.ENUM('manual', 'hourly', 'daily', 'weekly'),
      defaultValue: 'manual'
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    last_refreshed: {
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
    tableName: 'dashboards',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['org_id']
      },
      {
        fields: ['name']
      },
      {
        fields: ['refresh_schedule']
      },
      {
        fields: ['is_public']
      }
    ]
  });

  Dashboard.associate = (models) => {
    Dashboard.belongsTo(models.Organization, {
      foreignKey: 'org_id',
      as: 'organization'
    });
  };

  return Dashboard;
};