module.exports = function (sequelize, DataType) {
  const AddressLookup = sequelize.define('AddressLookup', {
    postCode: {
      type: DataType.STRING,
      primaryKey: true
    },
    admUnit1: {
      type: DataType.STRING,
      field: 'adm_unit1'
    },
    district: {
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
    tableName: 'address_lookup'
  }
  )

  AddressLookup.associate = function (models) { }
  return AddressLookup
}
