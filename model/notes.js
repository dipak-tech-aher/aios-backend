module.exports = function (sequelize, DataType) {
  const Notes = sequelize.define('Notes', {
    notesId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    notes: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'NEW'
    },
    createdBy: {
      type: DataType.INTEGER
    }
  },
  {
    timestamps: false,
    underscored: true,
    tableName: 'notes'
  }
  )
  Notes.associate = function (models) { }
  return Notes
}
