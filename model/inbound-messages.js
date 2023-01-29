module.exports = function (sequelize, DataType) {
  const InboundMessages = sequelize.define('InboundMessages', {
    inboundId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    smsMessageSid: {
      type: DataType.STRING
    },
    numMedia: {
      type: DataType.STRING
    },
    profileName: {
      type: DataType.STRING
    },
    waId: {
      type: DataType.STRING
    },
    smsStatus: {
      type: DataType.STRING
    },
    body: {
      type: DataType.STRING
    },
    messageTo: {
      type: DataType.STRING
    },
    messageFrom: {
      type: DataType.STRING
    },
    accountSid: {
      type: DataType.STRING
    },
    menuItem: {
      type: DataType.STRING
    },
    menuValue: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING
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
    nextValue: {
      type: DataType.STRING
    },
    chatSource: {
      type: DataType.STRING
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'inbound_messages'
  }
  )

  InboundMessages.associate = function (models) { }
  return InboundMessages
}
