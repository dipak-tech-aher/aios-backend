module.exports = function (sequelize, DataType) {
  const Interaction = sequelize.define('Interaction', {
    intxnId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    parentIntxn: {
      type: DataType.INTEGER
    },
    subject: {
      type: DataType.STRING
    },
    description: {
      type: DataType.TEXT
    },
    currStatus: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    currUser: {
      type: DataType.STRING
    },
    identificationNo: {
      type: DataType.STRING
    },
    planId: {
      type: DataType.INTEGER
    },
    planIdList: {
      type: DataType.STRING
    },
    assignedDate: {
      type: DataType.DATE
    },
    intxnType: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    intxnCatType: {
      type: DataType.STRING
    },
    businessEntityCode: {
      type: DataType.INTEGER
    },
    problemCode: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    natureCode: {
      type: DataType.STRING
    },
    causeCode: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    clearCode: {
      type: DataType.STRING
    },
    woType: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    externalRefNo1: {
      type: DataType.STRING
    },
    externalRefNo2: {
      type: DataType.STRING
    },
    externalRefNo3: {
      type: DataType.STRING
    },
    externalRefNo4: {
      type: DataType.STRING
    },
    externalRefSys1: {
      type: DataType.STRING
    },
    externalRefSys2: {
      type: DataType.STRING
    },
    externalRefSys3: {
      type: DataType.STRING
    },
    externalRefSys4: {
      type: DataType.STRING
    },
    commentType: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    commentCause: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    priorityCode: {
      type: DataType.STRING
    },
    createdEntity: {
      type: DataType.STRING
    },
    currEntity: {
      type: DataType.STRING
    },
    currRole: {
      type: DataType.STRING
    },
    customerId: {
      type: DataType.INTEGER
    },
    accountId: {
      type: DataType.INTEGER
    },
    addressId: {
      type: DataType.INTEGER
    },
    sourceCode: {
      type: DataType.STRING
    },
    chnlCode: {
      type: DataType.STRING
    },
    termType: {
      type: DataType.STRING
    },
    slaCode: {
      type: DataType.STRING
    },
    alertType: {
      type: DataType.STRING
    },
    lastAlertDate: {
      type: DataType.DATE
    },
    cntPrefer: {
      type: DataType.STRING
    },
    assetId: {
      type: DataType.STRING
    },
    uid: {
      type: DataType.STRING
    },
    expctdDateCmpltn: {
      type: DataType.DATE
    },
    isRebound: {
      type: DataType.STRING
    },
    services: {
      type: DataType.STRING
    },
    billAmt: {
      type: DataType.INTEGER
    },
    isValid: {
      type: DataType.STRING
    },
    arRefNo: {
      type: DataType.STRING
    },
    refIntxnId: {
      type: DataType.STRING
    },
    surveyReq: {
      type: DataType.STRING
    },
    isBotReq: {
      type: DataType.STRING
    },
    botProcess: {
      type: DataType.STRING
    },
    connectionId: {
      type: DataType.INTEGER
    },
    existingConnectionId: {
      type: DataType.INTEGER
    },
    reasonCode: {
      type: DataType.STRING
    },
    kioskRefId: {
      type: DataType.INTEGER,
      defaultValue: null
    },
    terminateReason: {
      type: DataType.STRING
    },
    refundDeposit: {
      type: DataType.STRING
    },
    contractFeesWaiver: {
      type: DataType.STRING
    },
    location: {
      type: DataType.STRING
    },
    createdBy: {
      type: DataType.INTEGER,
      references: {
        model: 'User',
        key: 'code'
      }
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
    cancelledAt: {
      type: DataType.DATE
    },
    cancelledBy: {
      type: DataType.INTEGER
    },
    cancelledReason: {
      type: DataType.STRING
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'interaction'
  }
  )
  Interaction.associate = function (models) {
    models.Interaction.hasMany(models.InteractionTxn, {
      foreignKey: 'intxnId'
    })
    models.Interaction.belongsTo(models.BusinessEntity, {
      foreignKey: 'intxnType',
      as: 'srType'
    })
    models.Interaction.belongsTo(models.BusinessEntity, {
      foreignKey: 'woType',
      as: 'workOrderType'
    })
    models.Interaction.belongsTo(models.BusinessEntity, {
      foreignKey: 'currStatus',
      as: 'currStatusDesc'
    })
    models.Interaction.belongsTo(models.Connection, {
      foreignKey: 'connectionId'
    })
    models.Interaction.belongsTo(models.Account, {
      foreignKey: 'accountId'
    })
    models.Interaction.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'userId'
    })
    models.Interaction.belongsTo(models.BusinessEntity, {
      foreignKey: 'commentCause',
      as: 'cmpProblemDesp'
    })
    models.Interaction.belongsTo(models.BusinessEntity, {
      foreignKey: 'commentType',
      as: 'inqCauseDesp'
    })
    models.Interaction.belongsTo(models.Plan, {
      foreignKey: 'planId'
    })
  }
  return Interaction
}
