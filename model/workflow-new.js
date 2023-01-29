module.exports = function (sequelize, DataType) {
  const WorkflowNew = sequelize.define('WorkflowNew', {
    workflowId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    interactionType: {
      type: DataType.STRING
    },
    productType: {
      type: DataType.STRING
    },
    workflowName: {
      type: DataType.STRING
    },
    wfDefinition: {
      type: (sequelize.options.dialect === 'mssql') ? DataType.STRING : DataType.JSONB,
      get: function () {
        return sequelize.options.dialect === 'mssql' ? JSON.parse(this.getDataValue('wfDefinition')) : this.getDataValue('wfDefinition')
      },
      set: function (value) {
        return sequelize.options.dialect === 'mssql' ? this.setDataValue('wfDefinition', JSON.stringify(value)) : this.setDataValue('wfDefinition', value)
      }
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
    tableName: 'workflow_defn_new'
  }
  )

  WorkflowNew.associate = function (models) {
    models.WorkflowNew.belongsTo(models.BusinessEntity, {
      foreignKey: 'interactionType',
      as: 'intxnTypeDesc'
    })
    models.WorkflowNew.belongsTo(models.BusinessEntity, {
      foreignKey: 'productType',
      as: 'productTypeDesc'
    })
    models.WorkflowNew.belongsTo(models.BusinessEntity, {
      foreignKey: 'status',
      as: 'statusDesc'
    })
    models.WorkflowNew.belongsTo(models.User, {
      foreignKey: 'updatedBy',
      as: 'updatedByName'
    })
    models.WorkflowNew.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'createdByName'
    })
  }
  return WorkflowNew
}
