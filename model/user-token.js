module.exports = function (sequelize, DataType) {
  const UserToken = sequelize.define('UserToken', {
    id: {
      type: DataType.INTEGER,
      primaryKey: true
    },
    userId: {
      type: DataType.STRING
    },
    token: {
      type: DataType.STRING
    },
    createdAt: {
      type: DataType.DATE
    },
    status: {
      type: DataType.STRING
    },
    updatedAt: {
      type: DataType.DATE
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'user_tokens'
  })

  return UserToken
}
