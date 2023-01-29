module.exports = function (sequelize, DataType) {
  const Otp = sequelize.define('Otp', {
    id: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    reference: {
      type: DataType.STRING
    },
    otp: {
      type: DataType.INTEGER
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'ACTIVE'
    },
    sentAt: {
      type: DataType.DATE,
      defaultValue: new Date()
    }
  },
  {
    timestamps: false,
    underscored: true,
    tableName: 'otp'
  }
  )
  Otp.associate = function (models) { }
  return Otp
}
