module.exports = function (sequelize, DataType) {
  const SecurityQuestion = sequelize.define('SecurityQuestion', {
    profileId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    profileName: {
      type: DataType.STRING,
      references: {
        model: 'BusinessEntity',
        key: 'code'
      }
    },
    profileValue: {
      type: DataType.STRING
    },
    refId: {
      type: DataType.INTEGER
    }
  },
  {
    timestamps: false,
    underscored: true,
    tableName: 'security_question'
  }
  )

  SecurityQuestion.associate = function (models) {
    models.SecurityQuestion.belongsTo(models.BusinessEntity, {
      foreignKey: 'profile_name',
      as: 'sec_q'
    })
  }
  return SecurityQuestion
}
