module.exports = function (sequelize, DataType) {
  const Address = sequelize.define('Address', {
    addressId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    addressType: {
      type: DataType.STRING
    },
    hno: {
      type: DataType.STRING
    },
    block: {
      type: DataType.STRING
    },
    buildingName: {
      type: DataType.STRING
    },
    street: {
      type: DataType.STRING
    },
    road: {
      type: DataType.STRING
    },
    city: {
      type: DataType.STRING
    },
    town: {
      type: DataType.STRING
    },
    state: {
      type: DataType.STRING
    },
    district: {
      type: DataType.STRING
    },
    country: {
      type: DataType.STRING
    },
    latitude: {
      type: DataType.STRING
    },
    longitude: {
      type: DataType.STRING
    },
    postCode: {
      type: DataType.STRING
    },
    zone: {
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
    tableName: 'address'
  }
  )

  Address.associate = function (models) { }
  return Address
}
