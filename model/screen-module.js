module.exports = function (sequelize, DataType) {
  const ScreenModule = sequelize.define('ScreenModule', {
    scrModId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    moduleName: {
      type: DataType.STRING
    },
    screenName: {
      type: DataType.STRING
    },
    api: {
      type: DataType.STRING
    },
    method: {
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
    tableName: 'screen_module_mapping'
  }
  )

  ScreenModule.associate = function (models) { }
  return ScreenModule
}
