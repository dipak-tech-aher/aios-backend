module.exports = function (sequelize, DataType) {
  const WorkflowTxn = sequelize.define('WorkflowTxn', {
    wfTxnId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    wfHdrId: {
      type: DataType.INTEGER
    },
    activityId: {
      type: DataType.INTEGER
    },
    taskId: {
      type: DataType.INTEGER
    },
    wfTxnStatus: {
      type: DataType.STRING,
      defaultValue: 'NEW'
    },
    currEntity: {
      type: DataType.STRING
    },
    currRole: {
      type: DataType.STRING
    },
    currUser: {
      type: DataType.INTEGER
    },
    userStatus: {
      type: DataType.STRING
    },
    fromEntity: {
      type: DataType.STRING
    },
    fromRole: {
      type: DataType.STRING
    },
    fromUser: {
      type: DataType.INTEGER
    },
    fromUserStatus: {
      type: DataType.STRING
    },
    txnContext: {
      type: (sequelize.options.dialect === 'mssql') ? DataType.STRING : DataType.JSONB,
      get: function () {
        return sequelize.options.dialect === 'mssql' ? JSON.parse(this.getDataValue('txnContext')) : this.getDataValue('txnContext')
      },
      set: function (value) {
        return sequelize.options.dialect === 'mssql' ? this.setDataValue('txnContext', JSON.stringify(value)) : this.setDataValue('txnContext', value)
      }
    },
    payload: {
      type: (sequelize.options.dialect === 'mssql') ? DataType.STRING : DataType.JSONB,
      get: function () {
        return sequelize.options.dialect === 'mssql' ? JSON.parse(this.getDataValue('txnContext')) : this.getDataValue('payload')
      },
      set: function (value) {
        return sequelize.options.dialect === 'mssql' ? this.setDataValue('payload', JSON.stringify(value)) : this.setDataValue('payload', value)
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
    tableName: 'workflow_txn'
  }
  )

  WorkflowTxn.associate = function (models) {
    models.WorkflowTxn.belongsTo(models.BusinessEntity, {
      foreignKey: 'wfTxnStatus',
      as: 'txnStatus'
    })
  }
  return WorkflowTxn
}
