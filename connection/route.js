import { ConnectionService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const connectionRouter = express.Router()
const connectionService = new ConnectionService()

connectionRouter
  .post('/booster', validateToken, validatePermission, connectionService.createBooster.bind(connectionService))
  .get('/booster', validateToken, validatePermission, connectionService.getBoosterList.bind(connectionService))

  .post('/upgrade', validateToken, validatePermission, connectionService.createUpgradeService.bind(connectionService))
  .get('/upgrade', validateToken, validatePermission, connectionService.getUpgradeServiceList.bind(connectionService))

  .post('/downgrade', validateToken, validatePermission, connectionService.createDowngradeService.bind(connectionService))
  .get('/downgrade', validateToken, validatePermission, connectionService.getDowngradeServiceList.bind(connectionService))

  .get('/list', validateToken, connectionService.getIdentificationNumber.bind(connectionService))
  .get('/getTeleportRelocation/:accountId', validateToken, connectionService.getTeleportRelocationData.bind(connectionService))

  .post('/vas', validateToken, validatePermission, connectionService.createVAS.bind(connectionService))
  .delete('/vas', validateToken, validatePermission, connectionService.deactivateVAS.bind(connectionService))

  .put('/bar', validateToken, validatePermission, connectionService.barService.bind(connectionService))
  .put('/unbar', validateToken, validatePermission, connectionService.unBarService.bind(connectionService))

  .put('/teleport-relocate', validateToken, validatePermission, connectionService.teleportRelocateService.bind(connectionService))

  .put('/terminate', validateToken, validatePermission, connectionService.terminateService.bind(connectionService))

  .post('/terminate-list', validateToken, connectionService.getTerminatedIdentificationNumberList.bind(connectionService))

module.exports = connectionRouter
