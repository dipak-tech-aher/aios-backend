module.exports = function (sequelize, DataType) {
  const TableCode = sequelize.define('TableCode', {
    codeType: {
      type: DataType.STRING
    },
    code: {
      type: DataType.STRING
    },
    description: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'AC'
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
    tableName: 'type_code_lu'
  }
  )

  TableCode.associate = function (models) { }
  return TableCode
}
