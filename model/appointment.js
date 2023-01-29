module.exports = function (sequelize, DataType) {
  const Appointment = sequelize.define('Appointment', {
    appointmentId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    intxnId: {
      type: DataType.INTEGER
    },
    remarks: {
      type: DataType.STRING
    },
    appointmentType: {
      type: DataType.STRING
    },
    contactPerson: {
      type: DataType.STRING
    },
    contactNo: {
      type: DataType.INTEGER
    },
    fromDate: {
      type: DataType.DATE
    },
    fromTime: {
      type: DataType.TIME
    },
    toDate: {
      type: DataType.DATE
    },
    toTime: {
      type: DataType.TIME
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
    tableName: 'appointment'
  }
  )
  return Appointment
}
