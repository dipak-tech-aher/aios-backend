
import { ResponseHelper } from '../utils'
import { QueryTypes } from 'sequelize'
import { logger } from '../config/logger'
import { Notification, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
import { camelCaseConversion } from '../utils/string'

export class NotificationService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async getNotificationList (req, res) {
    try {
      logger.debug('Getting notification list by type')
      const { userId, roleId, departmentId } = req
      const count = `select count(*) from (
      select notification_id, subject, reference_id, created_at, source, is_viewed, markedusers,user_id
      from notifications n where user_id = ${userId} and role_id = ${roleId} and department_id = '${departmentId}' 
      and notification_type='Popup'
      union
      select notification_id, subject, reference_id, created_at, source,is_viewed, markedusers,user_id
      from notifications n where role_id = ${roleId} and department_id = '${departmentId}' and user_id is null 
      and notification_type='Popup'   
      )t
      where not exists (select 'x' from notifications where  markedusers->'users' @> '[${userId}]' and notification_id=t.notification_id)`
      const data = `select notification_id, subject, reference_id, created_at, source, is_viewed, markedusers from (
        select notification_id, subject, reference_id, created_at, source, is_viewed, markedusers,user_id
        from notifications n where user_id = ${userId} and role_id = ${roleId} and department_id = '${departmentId}'
        and notification_type='Popup'
        union
        select notification_id, subject, reference_id, created_at, source,is_viewed, markedusers,user_id
        from notifications n where role_id = ${roleId} and department_id = '${departmentId}' and user_id is null
        and notification_type='Popup'
        )t order by notification_id desc`
      let responseData = await sequelize.query(data, { type: QueryTypes.SELECT })
      let responseCount = await sequelize.query(count, { type: QueryTypes.SELECT })
      responseData = camelCaseConversion(responseData)
      responseCount = camelCaseConversion(responseCount)

      const response = {
        row: responseData,
        count: responseCount[0].count
      }

      logger.debug('Successfully fetch notifications data')
      return this.responseHelper.onSuccess(res, 'Notification fetched sucessfully', response)
    } catch (error) {
      logger.error(error, 'Error while fetching notifications data')
      return this.responseHelper.onError(res, new Error('Error while fetching notifications data'))
    }
  }

  async updateNotificationStatus (req, res) {
    try {
      logger.debug('Updating notification status as viewed')
      const { userId, roleId, departmentId } = req
      const notificationId = req.body
      if (!notificationId && !Array.isArray(notificationId) && notificationId.length <= 0) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      // const data = {
      //   isViewed: 'Y'
      // }
      // await Notification.update(data, {
      //   where: {
      //     notificationId,
      //     userId,
      //     roleId,
      //     departmentId
      //   }
      // })
      for (const n of notificationId) {
        const notice = await Notification.findOne({ attributes: ['markedusers'], where: { notificationId: n } })
        let data
        if (notice?.users) {
          data = {
            markedusers: { users: [...notice.users, userId] }
          }
        } else {
          data = {
            markedusers: { users: [userId] }
          }
        }

        await Notification.update(data, {
          where: {
            notificationId: n,
            roleId,
            departmentId
          }
        })
      }
      logger.debug('Successfully updated notifications status')
      return this.responseHelper.onSuccess(res, 'Successfully updated notifications status')
    } catch (error) {
      logger.error(error, 'Error while updating notifications status')
      return this.responseHelper.onError(res, new Error('Error while updating notifications status'))
    }
  }

  async createDTSMSEmailNotification (req, res) {
    logger.debug('Creating Email and SMS notification for Drop Thought')

    const response = {
      result: {}
    }

    try {
      const data = req.body

      if (data) {
        response.result.message = JSON.stringify(data)
      } else {
        response.result.message = ''
      }

      if (data && data.messages && data.messages.length > 0) {
        const messagesCount = data.messages.length
        let processedCount = 0

        logger.debug('Processing Drop Thought messages - ' + messagesCount)

        const t = await sequelize.transaction()
        for (const m of data.messages) {
          let email = ''
          let sms = ''
          if (m.email) {
            email = 'Y'
          }
          if (m.sms) {
            sms = 'Y'
          }

          if (m.email && m.email.to && m.email.to.trim() !== '' &&
              m.email.body && m.email.body.trim() !== '') {
            await Notification.create({
              email: m.email.to,
              subject: (m.email.subject && m.email.subject.trim() !== '') ? m.email.subject.trim() : 'NA',
              body: m.email.body.trim(),
              notificationType: 'Email',
              status: 'NEW'
            },
            {
              transaction: t
            })
            email = 'P'
          }

          if (m.sms && m.sms.toNumber && m.sms.toNumber.trim() !== '' && !isNaN(m.sms.toNumber) &&
            m.sms.message && m.sms.message.trim() !== '') {
            await Notification.create({
              mobileNo: Number(m.sms.toNumber),
              subject: 'NA',
              body: m.sms.message.trim(),
              notificationType: 'SMS',
              status: 'NEW'
            },
            {
              transaction: t
            })
            sms = 'P'
          }
          if (sms !== 'Y' && email !== 'Y') {
            processedCount++
          } else {
            break
          }
        }

        if (processedCount === messagesCount) {
          await t.commit()
          response.result.status = 'Success'
          logger.debug('Processed Drop Thought messages - ' + processedCount)
        } else {
          t.rollback()
          response.result.status = 'Failed'
          logger.debug('Failed Processing Drop Thought messages')
        }
      } else {
        response.result.status = 'Failed'
        logger.debug('No Drop Thought messages to process')
      }
    } catch (error) {
      if (!response.result.message) {
        response.result.message = ''
      }
      response.result.status = 'Failed'
      logger.error(error, 'Error while creating Drop Throught SMS and EMails')
    }
    res.json(response)
  }

  async getNotificationCount (req, res) {
    try {
      logger.debug('Getting notification count')
      const { userId, roleId, departmentId } = req
      const response = await Notification.findAll({
        attributes: ['notificationId', 'source', 'referenceId', 'isViewed', 'createdAt', 'subject'],
        where: {
          userId,
          roleId,
          departmentId,
          isViewed: 'N'
        },
        order: [['notificationId', 'DESC']]
      })
      logger.debug('Successfully fetch notifications count')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching notifications count')
      return this.responseHelper.onError(res, new Error('Error while fetching notifications count'))
    }
  }
}
