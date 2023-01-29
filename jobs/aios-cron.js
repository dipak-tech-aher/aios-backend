import {
  processWorkflowEngine, processDeleteTempAttachments,
  processSendNotificationEmail, processRetrieSendNotificationEmail,
  processSendNotificationSMS, processAbandonedChat
} from './job-service'
import { dropThoughtIntegrationJob } from './dropthought-job'
import { logger } from '../config/logger'

const cron = require('node-cron')
// Running job at every minute
export const task = cron.schedule('* * * * *', () => {
  logger.debug('Start BG Task')
  processWorkflowEngine()
  logger.debug('End BG Task')
},
{
  scheduled: false
})

export const SMSEmail = cron.schedule('*/5 * * * *', () => {
  logger.debug('Start SMS Email Task')
  processSendNotificationEmail()
  processSendNotificationSMS()
  logger.debug('End SMS Email Task')
},
{
  scheduled: false
})

// Running job at every 30minute
export const retries = cron.schedule('*/30 * * * *', () => {
  logger.debug('Start Retries BG Task')
  processRetrieSendNotificationEmail()
  processDeleteTempAttachments()
  logger.debug('End Retries BG Task')
},
{
  scheduled: false
})

export const dropThoughtIntegration = cron.schedule('*/10 * * * *', () => {
  logger.debug('Start dropThoughtIntegration')
  dropThoughtIntegrationJob()
  logger.debug('End dropThoughtIntegration')
},
{
  scheduled: false
})

export const processChat = cron.schedule('* * * * *', () => {
  logger.debug('Start process chat')
  processAbandonedChat()
  logger.debug('End process chat')
},
{
  scheduled: false
})
