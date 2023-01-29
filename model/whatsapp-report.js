module.exports = function (sequelize, DataType) {
  const WhatsAppReport = sequelize.define('WhatsAppReport', {
    reportId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    whatsappNumber: {
      type: DataType.STRING
    },
    contactNumber: {
      type: DataType.INTEGER
    },
    accessNumber: {
      type: DataType.STRING
    },
    serviceType: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'CREATED'
    },
    createdBy: {
      type: DataType.INTEGER
    },
    createdAt: {
      type: DataType.DATE
    },
    endAt: {
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
    tableName: 'whatsapp_report'
  }
  )

  WhatsAppReport.associate = function (models) {
    models.WhatsAppReport.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'createdByName'
    })
    models.WhatsAppReport.belongsTo(models.User, {
      foreignKey: 'updatedBy',
      as: 'updatedByName'
    })
    models.WhatsAppReport.hasMany(models.WhatsAppReportDtl, {
      foreignKey: 'reportId',
      as: 'whatsAppReportDetails'
    })
    models.WhatsAppReport.belongsTo(models.BusinessEntity, {
      foreignKey: 'status',
      as: 'statusDesc'
    })
  }
  return WhatsAppReport
}
