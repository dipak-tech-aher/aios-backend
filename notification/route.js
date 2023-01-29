import { NotificationService } from './service'
import express from 'express'
import { validateToken, DTAuthVerification } from '../utils/authentication-helper'

const notificationRouter = express.Router()
const notificationService = new NotificationService()

notificationRouter
  .put('/', validateToken, notificationService.updateNotificationStatus.bind(notificationService))
  .get('/', validateToken, notificationService.getNotificationList.bind(notificationService))
  .get('/count', validateToken, notificationService.getNotificationCount.bind(notificationService))
  .post('/dt-emailsms', DTAuthVerification, notificationService.createDTSMSEmailNotification.bind(notificationService))

module.exports = notificationRouter
