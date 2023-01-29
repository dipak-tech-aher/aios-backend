module.exports = function (sequelize, DataType) {
  const Transition = sequelize.define('Transition', {
    transId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    transCode: {
      type: DataType.STRING
    },
    fromUnit: {
      type: DataType.STRING
    },
    fromRole: {
      type: DataType.STRING
    },
    toUnit: {
      type: DataType.STRING
    },
    toRole: {
      type: DataType.STRING
    },
    fromStatus: {
      type: DataType.STRING
    },
    toStatus: {
      type: DataType.STRING
    },
    taskMapping: {
      type: DataType.STRING
    },
    transStatus: {
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
    tableName: 'transitions'
  }
  )

  Transition.associate = function (models) { }
  return Transition
}
