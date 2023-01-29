module.exports = function (sequelize, DataType) {
  const BulkUpload = sequelize.define('BulkUpload', {
    uploadProcessId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    bulkUploadType: {
      type: DataType.STRING
    },
    noOfRecordsAttempted: {
      type: DataType.STRING
    },
    successfullyUploaded: {
      type: DataType.INTEGER
    },
    failed: {
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
    payload: {
      type: DataType.JSONB
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'bulk_upload'
  }
  )
  BulkUpload.associate = function (models) {
    models.BulkUpload.hasMany(models.BulkBillCollection, {
      foreignKey: 'uploadProcessId',
      as: 'billCollectionDetails'
    })
    models.BulkUpload.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'createdByDetails'
    })
    models.BulkUpload.belongsTo(models.BusinessEntity, {
      foreignKey: 'bulkUploadType',
      as: 'bulkUploadTypeDescription'
    })
  }

  return BulkUpload
}
