module.exports = function (sequelize, DataType) {
  const DTIntegration = sequelize.define('DTIntegration', {
    intxnId: {
      type: DataType.INTEGER,
      primaryKey: true
    },
    callResult: {
      type: DataType.JSONB
    },
    callStatus: {
      type: DataType.STRING
    },
    callMessage: {
      type: DataType.JSONB
    },
    callTime: {
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
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'intg_dropthought_results'
  }
  )
  DTIntegration.associate = function (models) {
    models.DTIntegration.belongsTo(models.Interaction, {
      foreignKey: 'intxnId'
    })
  }
  return DTIntegration
}
