module.exports = function (sequelize, DataType) {
  const ConnectionPlan = sequelize.define('ConnectionPlan', {
    connPlanId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    connectionId: {
      type: DataType.INTEGER
    },
    prodCatalogue: {
      type: DataType.STRING
    },
    planId: {
      type: DataType.INTEGER,
      references: {
        model: 'plan',
        key: 'plan_id'
      }
    },
    quota: {
      type: DataType.INTEGER
    },
    bandwidth: {
      type: DataType.INTEGER
    },
    paymentType: {
      type: DataType.STRING
    },
    paymentMethod: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'ACTIVE'
    },
    txnReference: {
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
    tableName: 'connection_plan'
  }
  )

  ConnectionPlan.associate = function (models) {
    models.ConnectionPlan.belongsTo(models.Plan, {
      foreignKey: 'plan_id',
      as: 'plan'
    })
    models.ConnectionPlan.belongsTo(models.BusinessEntity, {
      foreignKey: 'status',
      as: 'connPlanStatus'
    })
    models.ConnectionPlan.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'createdByUser'
    })
  }
  return ConnectionPlan
}
