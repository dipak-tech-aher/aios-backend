import { dbProperties } from 'config'

const fs = require('fs')
const path = require('path')
const Sequelize = require('sequelize')

const { database, username, password, dialect, host, port } = dbProperties

const sequelize = new Sequelize(database, username, password, {
  host,
  port,
  dialect,
  logging: false,
  pool: {
    max: 100,
    min: 0,
    acquire: 100 * 1000,
    idle: 300000
  }
})
const basename = path.basename(__filename)
const db = {}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js')
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes)
    db[model.name] = model
  })

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db)
  }
})

db.sequelize = sequelize
db.Sequelize = Sequelize

module.exports = db
