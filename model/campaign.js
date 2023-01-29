module.exports = function (sequelize, DataType) {
  const Campaign = sequelize.define('Campaign', {
    campId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    campName: {
      type: DataType.STRING
    },
    serviceNo: {
      type: DataType.STRING
    },
    campDescription: {
      type: DataType.STRING
    },
    campValidity: {
      type: DataType.DATE
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
    validFrom: {
      type: DataType.DATE
    },
    validTo: {
      type: DataType.DATE
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'campaign'
  }
  )
  return Campaign
}
