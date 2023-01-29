import { OrganizationService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'
const organizationRouter = express.Router()
const organizationService = new OrganizationService()

organizationRouter
  .post('/', validateToken, validatePermission, organizationService.createOrganization.bind(organizationService))
  .put('/:id', validateToken, validatePermission, organizationService.updateOrganization.bind(organizationService))
  .get('/', validateToken, validatePermission, organizationService.getOrganizationList.bind(organizationService))
  .get('/:id', validateToken, validatePermission, organizationService.getOrganization.bind(organizationService))

module.exports = organizationRouter
