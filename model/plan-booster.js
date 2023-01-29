module.exports = function (sequelize, DataType) {
    const BoosterPlans = sequelize.define('BoosterPlans', {
      planId: {
        type: DataType.INTEGER,
        primaryKey: true,
        // autoIncrement: true
      },
      productCode: {
        type: DataType.STRING
      },
      productDesc: {
        type: DataType.STRING
      },
      productComercialName: {
        type: DataType.STRING
      },
      productGroup: {
        type: DataType.STRING
      },
      serviceType: {
        type: DataType.STRING
      },
      refillId: {
        type: DataType.STRING
      },
      status: {
        type: DataType.STRING,
        defaultValue: 'AC'
      },
      price: {
        type: DataType.STRING
      },
      chargeType: {
        type: DataType.STRING
      },
      offerId: {
        type: DataType.STRING
      },
      unit: {
        type: DataType.STRING
      },
      createdBy: {
        type: DataType.INTEGER
      },
      createdAt: {
        type: DataType.DATE
      },
      updatedby: {
        type: DataType.INTEGER
      },
      updatedAt: {
        type: DataType.DATE
      }
    },
    {
      timestamps: true,
      underscored: true,
      tableName: 'booster_plans'
    }
    )
    BoosterPlans.associate = function (models) {
        // models.ChatResponse.belongsTo(models.BusinessEntity, {
        //   foreignKey: 'code',
        //   as: 'chatresponse'
        // })
      }
    return BoosterPlans
  }
  