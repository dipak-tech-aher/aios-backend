module.exports = function (sequelize, DataType) {
  const Chat = sequelize.define('Chat', {
    chatId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    contactNo: {
      type: DataType.INTEGER
    },
    emailId: {
      type: DataType.STRING
    },
    customerName: {
      type: DataType.STRING
    },
    botReq: {
      type: DataType.STRING
    },
    startAt: {
      type: DataType.DATE
    },
    endAt: {
      type: DataType.DATE
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'NEW'
    },
    userId: {
      type: DataType.INTEGER
    },
    socketId: {
      type: DataType.STRING
    },
    message: {
      type: DataType.JSONB
    },
    customerInfo: {
      type: DataType.JSONB
    },
    type: {
      type: DataType.STRING
    },
    createdAt: {
      type: DataType.DATE
    },
    updatedAt: {
      type: DataType.DATE
    },
    createdBy: {
      type: DataType.STRING
    },
    updatedBy: {
      type: DataType.STRING
    },
    accessNo: {
      type: DataType.STRING
    },
    idValue: {
      type: DataType.STRING
    },
    category: {
      type: DataType.STRING
    },
    customerCloseAt: {
      type: DataType.DATE
    },
    chatLanguage: {
      type: DataType.STRING
    },
    identifier: {
      type: DataType.STRING
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'chat'
  }
  )
  Chat.associate = function (models) {
    models.Chat.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    })
  }
  return Chat
}
