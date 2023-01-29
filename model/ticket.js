module.exports = function (sequelize, DataType) {
  const Ticket = sequelize.define('Ticket', {
    ticketId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    ticketType: {
      type: DataType.STRING
    },
    problemType: {
      type: DataType.STRING
    },
    problemCause: {
      type: DataType.STRING
    },
    ticketChannel: {
      type: DataType.STRING
    },
    ticketSource: {
      type: DataType.STRING
    },
    ticketPriority: {
      type: DataType.STRING
    },
    contactPreference: {
      type: DataType.STRING
    },
    remarks: {
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
    tableName: 'ticket'
  }
  )
  Ticket.associate = function (models) { }
  return Ticket
}
