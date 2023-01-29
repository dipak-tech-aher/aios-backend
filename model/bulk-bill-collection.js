module.exports = function (sequelize, DataType) {
  const BulkBillCollection = sequelize.define('BulkBillCollection', {
    collectionId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customerStatus: {
      type: DataType.STRING
    },
    accountStatus: {
      type: DataType.STRING
    },
    accountCreationDate: {
      type: DataType.DATE
    },
    basicCollectionPlanCode: {
      type: DataType.STRING
    },
    billUid: {
      type: DataType.STRING
    },
    billStatus: {
      type: DataType.STRING
    },
    billMonth: {
      type: DataType.STRING
    },
    billAmount: {
      type: DataType.INTEGER
    },
    billDate: {
      type: DataType.DATE
    },
    paidDate: {
      type: DataType.DATE
    },
    dueDate: {
      type: DataType.DATE
    },
    paidAmount: {
      type: DataType.INTEGER
    },
    unpaidAmount: {
      type: DataType.INTEGER
    },
    disputeAmount: {
      type: DataType.INTEGER
    },
    refundAmount: {
      type: DataType.INTEGER
    },
    uploadProcessId: {
      type: DataType.INTEGER
    },
    outstanding: {
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
    tableName: 'bulk_bill_collection'
  }
  )
  return BulkBillCollection
}
