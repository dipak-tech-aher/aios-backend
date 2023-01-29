module.exports = function (sequelize, DataType) {
  const Role = sequelize.define('Role', {
    roleId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    roleName: {
      type: DataType.STRING
    },
    roleDesc: {
      type: DataType.STRING
    },
    isAdmin: {
      type: DataType.STRING
    },
    parentRole: {
      type: DataType.INTEGER
    },
    status: {
      type: DataType.STRING
    },
    mappingPayload: {
      type: DataType.JSONB
    },
    createdBy: {
      type: DataType.INTEGER
    },
    createdAt: {
      type: DataType.DATE
    },
    updatedBy: {
      type: DataType.INTEGER
    },
    updatedAt: {
      type: DataType.DATE
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'roles'
  }
  )

  Role.associate = function (models) { }
  return Role
}
