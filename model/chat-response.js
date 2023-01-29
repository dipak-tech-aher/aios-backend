module.exports = function (sequelize, DataType) {
    const ChatResponse = sequelize.define('ChatResponse', {
      chatId: {
        type: DataType.STRING,
        primaryKey: true
      },
      menuSeqNo: {
        type: DataType.INTEGER
      },
      menuId: {
        type: DataType.STRING
      },
      menuDescription: {
        type: DataType.STRING
      },
      menuTitle: {
        type: DataType.STRING
      },
      menuDescriptionMalay: {
        type: DataType.STRING
      },
      menuTitleMalay: {
        type: DataType.STRING
      },
      menuStatus: {
        type: DataType.STRING
      },
      createdAt: {
        type: DataType.DATE
      },
      updatedAt: {
        type: DataType.DATE
      },
      createdBy: {
        type: DataType.INTEGER
      },
      updateBy: {
        type: DataType.INTEGER
      },
    },
    {
      timestamps: true,
      underscored: true,
      tableName: 'chat_response'
    }
    )
    ChatResponse.associate = function (models) {
      // models.ChatResponse.belongsTo(models.BusinessEntity, {
      //   foreignKey: 'code',
      //   as: 'chatresponse'
      // })
    }
    return ChatResponse
  }
  