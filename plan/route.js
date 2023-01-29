import { PlanService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const planRouter = express.Router()
const planService = new PlanService()

planRouter
  .post('/', validateToken, validatePermission, planService.createPlan.bind(planService))
  .put('/:id', validateToken, validatePermission, planService.updatePlan.bind(planService))
  .get('/', validateToken, validatePermission, planService.getPlanList.bind(planService))
  .get('/:id', validateToken, validatePermission, planService.getPlan.bind(planService))

module.exports = planRouter
