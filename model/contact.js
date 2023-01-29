module.exports = function (sequelize, DataType) {
  const Contact = sequelize.define('Contact', {
    contactId: {
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
    contactType: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    contactNo: {
      type: DataType.INTEGER
    },
    contactNoPfx: {
      type: DataType.INTEGER
    },
    altContactNo1: {
      type: DataType.INTEGER
    },
    altContactNo2: {
      type: DataType.INTEGER
    },
    email: {
      type: DataType.STRING
    },
    altEmail: {
      type: DataType.STRING
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
    tableName: 'contacts'
  }
  )

  Contact.associate = function (models) {
    models.Contact.belongsTo(models.BusinessEntity, {
      foreignKey: 'contact_type',
      as: 'contactTypeDesc'
    })
  }
  return Contact
}
