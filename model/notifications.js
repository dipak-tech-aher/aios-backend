module.exports = function (sequelize, DataType) {
  const Notification = sequelize.define('Notification', {
    notificationId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: {
      type: DataType.STRING
    },
    mobileNo: {
      type: DataType.INTEGER
    },
    notificationType: {
      type: DataType.STRING
    },
    subject: {
      type: DataType.STRING
    },
    body: {
      type: DataType.STRING
    },
    referenceId: {
      type: DataType.INTEGER
    },
    userId: {
      type: DataType.INTEGER
    },
    roleId: {
      type: DataType.INTEGER
    },
    departmentId: {
      type: DataType.STRING
    },
    source: {
      type: DataType.STRING
    },
    createdAt: {
      type: DataType.DATE,
      defaultValue: new Date()
    },
    sentAt: {
      type: DataType.DATE,
      defaultValue: new Date()
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'NEW'
    },
    isViewed: {
      type: DataType.STRING,
      defaultValue: 'N'
    },
    retries: {
      type: DataType.INTEGER,
      defaultValue: 0
    },
    markedusers: {
      type: DataType.JSONB
    }
  },
  {
    timestamps: false,
    underscored: true,
    tableName: 'notifications'
  }
  )

  return Notification
}
