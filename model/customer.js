module.exports = function (sequelize, DataType, models) {
  const Customer = sequelize.define('Customer', {
    customerId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
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
      type: DataType.STRING
    },
    idValue: {
      type: DataType.STRING
    },
    contactId: {
      type: DataType.INTEGER
    },
    custType: {
      type: DataType.STRING
    },
    donotemail: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'ACTIVE'
    },
    crmCustomerNo: {
      type: DataType.STRING
    },
    customerCat: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    customerClass: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    addressId: {
      type: DataType.INTEGER
    },
    priority: {
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
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'customers'
  }
  )
  Customer.associate = function (models) {
    models.Customer.belongsTo(models.Address, {
      foreignKey: 'addressId',
      as: 'address'
    })
    models.Customer.belongsTo(models.Contact, {
      foreignKey: 'contactId',
      as: 'contact'
    })
    models.Customer.hasMany(models.Account, {
      foreignKey: 'customerId',
      as: 'account'
    })
    models.Customer.belongsTo(models.BusinessEntity, {
      foreignKey: 'customer_class',
      as: 'class'
    })
    models.Customer.belongsTo(models.BusinessEntity, {
      foreignKey: 'customer_cat',
      as: 'category'
    })
  }
  return Customer
}
