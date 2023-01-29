module.exports = function (sequelize, DataType) {
  const Lead = sequelize.define('Lead', {
    leadId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    custName: {
      type: DataType.STRING
    },
    custCat: {
      type: DataType.STRING
    },
    contactNo: {
      type: DataType.INTEGER
    },
    emailId: {
      type: DataType.STRING
    },
    serviceType: {
      type: DataType.STRING
    },
    productEnquired: {
      type: DataType.STRING
    },
    contactPreference: {
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
    tableName: 'leads'
  }
  )
  Lead.associate = function (models) { }
  return Lead
}
