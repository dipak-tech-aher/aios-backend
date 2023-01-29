import { DashboardService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const dashboardRouter = express.Router()
const dashboardService = new DashboardService()

dashboardRouter
  .get('/counts', validateToken, validatePermission, dashboardService.getInteractionCounts.bind(dashboardService))
  .get('/todo', validateToken, validatePermission, dashboardService.getInteractionToDo.bind(dashboardService))
  .post('/salesDashboard', validateToken, dashboardService.getSalesDashboardCounts.bind(dashboardService))
  .post('/salesDashboardGraph', validateToken, dashboardService.getSalesDashboardGraphData.bind(dashboardService))
  .post('/salesDashboardDailyCount', validateToken, dashboardService.salesDashboardDailyCount.bind(dashboardService))
  .post('/salesDashboardData', validateToken, dashboardService.getSalesDashboard.bind(dashboardService))
  .post('/sales', validateToken, dashboardService.getSalesData.bind(dashboardService))

module.exports = dashboardRouter
