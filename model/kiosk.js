module.exports = function (sequelize, DataType) {
  const Kiosk = sequelize.define('Kiosk', {
    referenceNo: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customerId: {
      type: DataType.INTEGER
    },
    accountId: {
      type: DataType.INTEGER
    },
    connectionId: {
      type: DataType.INTEGER
    },
    problemType: {
      type: DataType.STRING
    },
    product: {
      type: DataType.STRING
    },
    title: {
      type: DataType.STRING
    },
    firstName: {
      type: DataType.STRING
    },
    lastName: {
      type: DataType.STRING
    },
    contactNo: {
      type: DataType.INTEGER
    },
    usage: {
      type: DataType.INTEGER
    },
    speed: {
      type: DataType.INTEGER
    },
    payload: {
      type: DataType.JSONB
    },
    assignedUser: {
      type: DataType.INTEGER
    },
    assignedEntity: {
      type: DataType.STRING
    },
    assignedRole: {
      type: DataType.INTEGER
    },
    status: {
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
    remarks: {
      type: DataType.STRING
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'kiosk'
  }
  )
  return Kiosk
}
