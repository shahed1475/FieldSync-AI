const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
        notEmpty: true
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [8, 255]
      }
    },
    first_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 50]
      }
    },
    last_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 50]
      }
    },
    role: {
      type: DataTypes.ENUM('org_admin', 'analyst', 'viewer'),
      defaultValue: 'viewer',
      allowNull: false
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    email_verification_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    password_reset_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    password_reset_expires: {
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
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['email'],
        unique: true
      },
      {
        fields: ['organization_id']
      },
      {
        fields: ['role']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['email_verification_token']
      },
      {
        fields: ['password_reset_token']
      }
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  User.prototype.getFullName = function() {
    return `${this.first_name} ${this.last_name}`;
  };

  User.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    delete values.password;
    delete values.email_verification_token;
    delete values.password_reset_token;
    return values;
  };

  // Associations
  User.associate = (models) => {
    User.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization',
      onDelete: 'CASCADE'
    });

    User.hasMany(models.Query, {
      foreignKey: 'user_id',
      as: 'queries',
      onDelete: 'CASCADE'
    });

    User.hasMany(models.Dashboard, {
      foreignKey: 'user_id',
      as: 'dashboards',
      onDelete: 'CASCADE'
    });

    User.hasMany(models.Insight, {
      foreignKey: 'user_id',
      as: 'insights',
      onDelete: 'CASCADE'
    });
  };

  // Class methods
  User.findByEmail = async function(email) {
    return await this.findOne({
      where: { email: email.toLowerCase() },
      include: [{
        model: sequelize.models.Organization,
        as: 'organization'
      }]
    });
  };

  User.findActiveByEmail = async function(email) {
    return await this.findOne({
      where: { 
        email: email.toLowerCase(),
        is_active: true
      },
      include: [{
        model: sequelize.models.Organization,
        as: 'organization'
      }]
    });
  };

  User.findByOrganization = async function(organizationId, options = {}) {
    return await this.findAll({
      where: { 
        organization_id: organizationId,
        is_active: true,
        ...options.where
      },
      include: [{
        model: sequelize.models.Organization,
        as: 'organization'
      }],
      ...options
    });
  };

  return User;
};