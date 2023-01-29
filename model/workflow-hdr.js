module.exports = function (sequelize, DataType) {
  const WorkflowHdr = sequelize.define('WorkflowHdr', {
    wfHdrId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    wfDefnId: {
      type: DataType.INTEGER
    },
    wfStatus: {
      type: DataType.STRING,
      defaultValue: 'AC'
    },
    entity: {
      type: DataType.STRING
    },
    entityId: {
      type: DataType.STRING
    },
    nextActivityId: {
      type: DataType.STRING
    },
    nextTaskId: {
      type: DataType.STRING
    },
    wfContext: {
      type: (sequelize.options.dialect === 'mssql') ? DataType.STRING : DataType.JSONB,
      get: function () {
        return sequelize.options.dialect === 'mssql' ? JSON.parse(this.getDataValue('wfContext')) : this.getDataValue('wfContext')
      },
      set: function (value) {
        return sequelize.options.dialect === 'mssql' ? this.setDataValue('wfContext', JSON.stringify(value)) : this.setDataValue('wfContext', value)
      }
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
    tableName: 'workflow_hdr'
  }
  )

  WorkflowHdr.associate = function (models) {
    models.WorkflowHdr.hasMany(models.WorkflowTxn, {
      foreignKey: 'wfHdrId',
      as: 'wfTxn'
    })
  }
  return WorkflowHdr
}
