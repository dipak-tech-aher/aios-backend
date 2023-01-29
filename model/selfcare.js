module.exports = function (sequelize, DataType) {
  const Selfcare = sequelize.define('Selfcare', {
    refNo: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    custName: {
      type: DataType.STRING
    },
    serviceType: {
      type: DataType.STRING
    },
    icNo: {
      type: DataType.INTEGER
    },
    contactNo: {
      type: DataType.INTEGER
    },
    problemCode: {
      type: DataType.STRING
    },
    usageType: {
      type: DataType.STRING
    },
    quota: {
      type: DataType.STRING
    },
    bandwidth: {
      type: DataType.STRING
    },
    remarks: {
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
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'selfcare'
  }
  )
  Selfcare.associate = function (models) { }
  return Selfcare
}
