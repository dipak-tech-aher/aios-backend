module.exports = function (sequelize, DataType) {
  const UserSession = sequelize.define('UserSession', {
    sessionId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    accessToken: {
      type: DataType.JSONB
    },
    userId: {
      type: DataType.INTEGER
    },
    payload: {
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
    },
    permissions: {
      type: DataType.JSONB
    },
    currRole: {
      type: DataType.STRING
    },
    currDept: {
      type: DataType.STRING
    },
    currRoleId: {
      type: DataType.INTEGER
    },
    currDeptId: {
      type: DataType.INTEGER
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'user_session'
  })

  UserSession.associate = function (models) {
    models.UserSession.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    })
  }
  return UserSession
}
