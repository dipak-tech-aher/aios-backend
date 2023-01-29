module.exports = function (sequelize, DataType) {
  const Steps = sequelize.define('Steps', {
    id: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    stepSeq: {
      type: DataType.STRING
    },
    stepName: {
      type: DataType.STRING
    },
    stepStatus: {
      type: DataType.STRING
    },
    message: {
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
    tableName: 'bots_steps'
  })

  Steps.associate = function (models) { }
  return Steps
}
