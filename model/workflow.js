module.exports = function (sequelize, DataType) {
  const Workflow = sequelize.define('Workflow', {
    workflowId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    interactionType: {
      type: DataType.STRING
    },
    productType: {
      type: DataType.STRING
    },
    wfDefinition: {
      type: DataType.JSONB
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
    tableName: 'workflow_definition'
  }
  )

  Workflow.associate = function (models) { }
  return Workflow
}
