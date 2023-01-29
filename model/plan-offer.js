module.exports = function (sequelize, DataType) {
  const PlanOffer = sequelize.define('PlanOffer', {
    planOfferId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    planId: {
      type: DataType.INTEGER
    },
    quota: {
      type: DataType.INTEGER
    },
    offerId: {
      type: DataType.STRING
    },
    units: {
      type: DataType.STRING
    },
    offerType: {
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
    tableName: 'plan_offer_mapping'
  }
  )

  PlanOffer.associate = function (models) {
    models.PlanOffer.belongsTo(models.BusinessEntity, {
      foreignKey: 'offerType',
      as: 'offerTypeDesc'
    })
  }

  return PlanOffer
}
