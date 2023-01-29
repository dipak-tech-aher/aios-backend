import { BusinessParameterService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const businessParameterRouter = express.Router()
const businessParameterService = new BusinessParameterService()

businessParameterRouter
  .post('/', validateToken, validatePermission, businessParameterService.createBusinessParameter.bind(businessParameterService))
  .put('/:code', validateToken, validatePermission, businessParameterService.updateBusinessParameter.bind(businessParameterService))
  .get('/code-types', validateToken, validatePermission, businessParameterService.getBusinessParameterCodeTypeList.bind(businessParameterService))
  .get('/:code', validateToken, validatePermission, businessParameterService.getBusinessParameter.bind(businessParameterService))
  .get('/list/:code', validateToken, validatePermission, businessParameterService.getBusinessParameterList.bind(businessParameterService))

module.exports = businessParameterRouter
