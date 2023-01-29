import { ReportService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const reportRouter = express.Router()
const reportService = new ReportService()

reportRouter
  .post('/interactions', validateToken, reportService.getOpenOrClosedInteractions.bind(reportService))
  .post('/chats', validateToken, reportService.getChatInteractions.bind(reportService))
  .post('/chat-daily-report-new-customer-req', validateToken, reportService.dailyChatReportNewCustomers.bind(reportService))
  .post('/chat-daily-report-booster-purchase', validateToken, reportService.dailyChatReportBoosterPurchase.bind(reportService))
  .post('/chat-daily-report-counts', validateToken, reportService.dailyChatReportCounts.bind(reportService))

module.exports = reportRouter
