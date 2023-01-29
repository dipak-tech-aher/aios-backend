import { KioskService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const kioskRouter = express.Router()
const kioskService = new KioskService()

kioskRouter
  .post('/', validateToken, kioskService.findCutomer.bind(kioskService))
  .post('/createKiosk', validateToken, kioskService.createKiosk.bind(kioskService))
  .put('/cancelKiosk/:referenceNo', validateToken, kioskService.cancelKiosk.bind(kioskService))
  .get('/', validateToken, kioskService.getKioskList.bind(kioskService))
  .get('/:referenceNo', validateToken, validatePermission, kioskService.getKioskById.bind(kioskService))
  .put('/:referenceNo', validateToken, kioskService.assignToSelf.bind(kioskService))

module.exports = kioskRouter
