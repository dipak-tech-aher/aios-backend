import { ServiceRequestService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const serviceRequestRouter = express.Router()
const serviceRequestService = new ServiceRequestService()

serviceRequestRouter

  .post('/', validateToken, validatePermission, serviceRequestService.createServiceRequest.bind(serviceRequestService))
  .put('/update/:id', validateToken, validatePermission, serviceRequestService.updateServiceRequest.bind(serviceRequestService))
  .get('/list/:customerId', validateToken, validatePermission, serviceRequestService.getServiceRequestList.bind(serviceRequestService))
  .get('/:id', validateToken, validatePermission, serviceRequestService.getServiceRequest.bind(serviceRequestService))
  .post('/search', validateToken, validatePermission, serviceRequestService.searchServiceRequest.bind(serviceRequestService))

  // bots api to update the service request status and create task
  .put('/intxn', validateToken, serviceRequestService.processBotsServiceRequest.bind(serviceRequestService))
  // Tibco api to update the service request status and create task
  .put('/extref', validateToken, serviceRequestService.processTibcoServiceRequest.bind(serviceRequestService))

module.exports = serviceRequestRouter
