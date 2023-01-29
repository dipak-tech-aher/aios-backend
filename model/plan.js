module.exports = function (sequelize, DataType) {
  const Plan = sequelize.define('Plan', {
    planId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    prodType: {
      type: DataType.STRING
    },
    planName: {
      type: DataType.STRING
    },
    bandwidth: {
      type: DataType.INTEGER
    },
    networkType: {
      type: DataType.STRING
    },
    charge: {
      type: DataType.NUMBER
    },
    refillProfileId: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'AC'
    },
    refPlanCode: {
      type: DataType.STRING
    },
    planType: {
      type: DataType.STRING
    },
    validity: {
      type: DataType.STRING
    },
    mrc: {
      type: DataType.STRING
    },
    nrc: {
      type: DataType.STRING
    },
    planCategory: {
      type: DataType.STRING
    },
    prodCatType: {
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
    },
    commPackName: {
      type: DataType.STRING
    },
    ocsDesc: {
      type: DataType.STRING
    },
    serviceCls: {
      type: DataType.STRING
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'plan'
  }
  )

  Plan.associate = function (models) {
    models.Plan.hasMany(models.ConnectionPlan, {
      foreignKey: 'planId'
    })
    models.Plan.hasMany(models.PlanOffer, {
      foreignKey: 'planId',
      as: 'planoffer'
    })
    models.Plan.belongsTo(models.BusinessEntity, {
      foreignKey: 'planType',
      as: 'planTypeDesc'
    })
    models.Plan.belongsTo(models.BusinessEntity, {
      foreignKey: 'planCategory',
      as: 'prodCatTypeDesc'
    })
    models.Plan.belongsTo(models.BusinessEntity, {
      foreignKey: 'prodType',
      as: 'prodTypeDesc'
    })
    models.Plan.belongsTo(models.BusinessEntity, {
      foreignKey: 'networkType',
      as: 'networkTypeDesc'
    })
  }
  return Plan
}
