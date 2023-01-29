import { CatalogService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const catalogRouter = express.Router()
const catalogService = new CatalogService()

catalogRouter
  .post('/', validateToken, validatePermission, catalogService.createCatalog.bind(catalogService))
  .put('/:id', validateToken, validatePermission, catalogService.updateCatalog.bind(catalogService))
  .get('/:id', validateToken, validatePermission, catalogService.getCatalog.bind(catalogService))
  .post('/list', validateToken, validatePermission, catalogService.getCatalogList.bind(catalogService))
  .post('/bulk', validateToken, validatePermission, catalogService.createCatalogBulk.bind(catalogService))

module.exports = catalogRouter
