import { WhatsAppService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
const whatsAppRouter = express.Router()
const whatsAppService = new WhatsAppService()

whatsAppRouter
  .post('/count', validateToken, whatsAppService.getWhatsAppCounts.bind(whatsAppService))
  .post('/count-details', validateToken, whatsAppService.getWhatsAppCountsDetails.bind(whatsAppService))
  .post('/search', validateToken, whatsAppService.getWhatsAppReports.bind(whatsAppService))
  .post('/history', validateToken, whatsAppService.getWhatsAppHistory.bind(whatsAppService))
  .post('/graph/day', validateToken, whatsAppService.getWhatsAppGraphDataByDay.bind(whatsAppService))
  .post('/graph/time', validateToken, whatsAppService.getWhatsAppGraphDataByTime.bind(whatsAppService))
  .post('/graph/complaint', validateToken, whatsAppService.getWhatsAppGraphComplaintData.bind(whatsAppService))
  .post('/graph/followup', validateToken, whatsAppService.getWhatsAppGraphFollowUpData.bind(whatsAppService))

module.exports = whatsAppRouter
