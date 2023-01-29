module.exports = function (sequelize, DataType) {
  const Account = sequelize.define('Account', {
    accountId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    accountCat: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    accountClass: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    accountPriority: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    title: {
      type: DataType.STRING
    },
    firstName: {
      type: DataType.STRING
    },
    lastName: {
      type: DataType.STRING
    },
    gender: {
      type: DataType.STRING
    },
    birthDate: {
      type: DataType.DATE
    },
    regDate: {
      type: DataType.DATE
    },
    registeredNo: {
      type: DataType.STRING
    },
    idType: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    idValue: {
      type: DataType.STRING
    },
    customerId: {
      type: DataType.INTEGER
    },
    accountNo: {
      type: DataType.INTEGER
    },
    contactId: {
      type: DataType.INTEGER
    },
    addressId: {
      type: DataType.INTEGER
    },
    baseCollPlan: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'ACTIVE'
    },
    priority: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    noOfCopies: {
      type: DataType.INTEGER
    },
    billDeliveryMthd: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    billLang: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    accountType: {
      type: DataType.STRING
    },
    sqRefId: {
      type: DataType.INTEGER
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
    tableName: 'accounts'
  }
  )
  Account.associate = function (models) {
    models.Account.belongsTo(models.Address, {
      foreignKey: 'addressId',
      as: 'address'
    })
    models.Account.belongsTo(models.Contact, {
      foreignKey: 'contactId',
      as: 'contact'
    })
    models.Account.hasMany(models.Connection, {
      foreignKey: 'accountId',
      as: 'service'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'account_cat',
      as: 'acct_catg'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'account_class',
      as: 'acct_class'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'account_priority',
      as: 'acct_prty'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'id_type',
      as: 'id_typ'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'base_coll_plan',
      as: 'coll_plan'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'priority',
      as: 'prty'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'bill_delivery_mthd',
      as: 'bill_dlvy_mthd'
    })
    models.Account.belongsTo(models.BusinessEntity, {
      foreignKey: 'bill_lang',
      as: 'bill_language'
    })
  }
  return Account
}
