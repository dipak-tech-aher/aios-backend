module.exports = function (sequelize, DataType) {
  const InteractionTask = sequelize.define('InteractionTask', {
    intxnTaskId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    intxnId: {
      type: DataType.INTEGER,
      references: {
        model: 'Interaction',
        key: 'intxn_id'
      }
    },
    taskId: {
      type: DataType.INTEGER,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    status: {
      type: DataType.STRING
    },
    message: {
      type: DataType.STRING
    },
    payload: {
      type: DataType.JSONB
    },
    retryCount: {
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
    tableName: 'interaction_task'
  }
  )
  InteractionTask.associate = function (models) {
    models.InteractionTask.belongsTo(models.BusinessEntity, {
      foreignKey: 'task_id',
      as: 'taskIdLookup'
    })
    models.InteractionTask.belongsTo(models.BusinessEntity, {
      foreignKey: 'status',
      as: 'taskStatusLookup'
    })
    models.InteractionTask.belongsTo(models.Interaction, {
      foreignKey: 'intxn_id',
      as: 'data'
    })
  }
  return InteractionTask
}
