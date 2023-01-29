module.exports = function (sequelize, DataType) {
  const InteractionTxn = sequelize.define('InteractionTxn', {
    txnId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    intxnId: {
      type: DataType.INTEGER
    },
    fromEntity: {
      type: DataType.STRING
    },
    fromRole: {
      type: DataType.INTEGER
    },
    fromUser: {
      type: DataType.INTEGER
    },
    toEntity: {
      type: DataType.STRING
    },
    toRole: {
      type: DataType.INTEGER
    },
    toUser: {
      type: DataType.INTEGER
    },
    intxnStatus: {
      type: DataType.STRING
    },
    flwId: {
      type: DataType.STRING
    },
    flwCreatedAt: {
      type: DataType.DATE,
      defaultValue: DataType.NOW
    },
    flwCreatedBy: {
      type: DataType.INTEGER
    },
    flwAction: {
      type: DataType.STRING
    },
    priorityCode: {
      type: DataType.STRING
    },
    businessEntityCode: {
      type: DataType.STRING
    },
    problemCode: {
      type: DataType.STRING
    },
    natureCode: {
      type: DataType.STRING
    },
    causeCode: {
      type: DataType.STRING
    },
    isFlwBypssd: {
      type: DataType.STRING
    },
    slaCode: {
      type: DataType.STRING
    },
    expctdDateCmpltn: {
      type: DataType.DATE
    },
    remarks: {
      type: DataType.TEXT
    },
    isFollowup: {
      type: DataType.STRING
    }
  },
  {
    timestamps: false,
    underscored: true,
    tableName: 'interaction_txn'
  }
  )

  InteractionTxn.associate = function (models) {
    models.InteractionTxn.belongsTo(models.BusinessUnit, {
      foreignKey: 'fromEntity',
      as: 'fromEntityName'
    })
    models.InteractionTxn.belongsTo(models.BusinessUnit, {
      foreignKey: 'toEntity',
      as: 'toEntityName'
    })
    models.InteractionTxn.belongsTo(models.Role, {
      foreignKey: 'toRole',
      as: 'toRoleName'
    })
    models.InteractionTxn.belongsTo(models.Role, {
      foreignKey: 'fromRole',
      as: 'fromRoleName'
    })
    models.InteractionTxn.belongsTo(models.User, {
      foreignKey: 'flwCreatedBy',
      as: 'flwCreatedby'
    })
    models.InteractionTxn.belongsTo(models.BusinessEntity, {
      foreignKey: 'intxnStatus',
      as: 'statusDescription'
    })
  }
  return InteractionTxn
}
