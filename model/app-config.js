module.exports = function (sequelize, DataType) {
  const AppConfig = sequelize.define('AppConfig', {
    appId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    appName: {
      type: DataType.STRING
    },
    image: {
      type: DataType.TEXT
    },
    config: {
      type: DataType.JSONB
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
    tableName: 'app_config'
  })

  AppConfig.associate = function (models) { }
  return AppConfig
}
