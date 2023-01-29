module.exports = function (sequelize, DataType) {
  const BusinessEntity = sequelize.define('BusinessEntity', {
    code: {
      type: DataType.STRING,
      primaryKey: true
    },
    description: {
      type: DataType.STRING
    },
    codeType: {
      type: DataType.STRING
    },
    mappingPayload: {
      type: DataType.JSONB
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'AC'
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
    tableName: 'business_entity'
  }
  )

  BusinessEntity.associate = function (models) { }
  return BusinessEntity
}
