module.exports = function (sequelize, DataType) {
  const BoosterPurchase = sequelize.define('BoosterPurchase', {
    id: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    accessNumber: {
      type: DataType.STRING
    },
    // customerId: {
    //   type: DataType.INTEGER
    // },
    customerName: {
      type: DataType.STRING
    },
    contactNo: {
      type: DataType.INTEGER
    },
    emailId: {
      type: DataType.STRING
    },
    boosterName: {
      type: DataType.STRING
    },
    purchaseDate: {
      type: DataType.DATE
    },
    status: {
      type: DataType.STRING,
    },
    createdAt: {
      type: DataType.DATE
    },
    updatedAt: {
      type: DataType.DATE
    },
    createdBy: {
      type: DataType.STRING
    },
    updatedBy: {
      type: DataType.STRING
    },
  },
    {
      timestamps: true,
      underscored: true,
      tableName: 'booster_purchase'
    }
  )
  BoosterPurchase.associate = function (models) { }
  return BoosterPurchase
}
