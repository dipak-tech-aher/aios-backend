import { RoleService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'
const roleRouter = express.Router()
const roleService = new RoleService()

roleRouter
  .post('/', validateToken, validatePermission, roleService.createRole.bind(roleService))
  .put('/:id', validateToken, validatePermission, roleService.updateRole.bind(roleService))
  .get('/:id', validateToken, validatePermission, roleService.getRole.bind(roleService))
  .get('/', validateToken, validatePermission, roleService.getRoleList.bind(roleService))

module.exports = roleRouter
