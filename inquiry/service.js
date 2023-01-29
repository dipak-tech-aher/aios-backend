import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Interaction, InteractionTxn, sequelize, Kiosk, Plan, User } from '../model'
import { defaultMessage } from '../utils/constant'
import { transformInquiry, transformUpdateInquiry } from '../transforms/customer-servicce'
import { camelCaseConversion } from '../utils/string'
import { findAndUpdateAttachment } from '../attachments/service'
import { getInquiryAndComplaint } from '../interaction/service'
import { getWorkflowDefinition } from '../workflow/workflow'
import { checkCustomerHasAccess } from '../utils/util'
import { createNotification, createUserNotification, createPopupNotification } from '../notification/notification-service'
import { getUsersByRole } from '../lookup/service'

export class InquirysService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createInquiry (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Inquiry')
      const inquiry = req.body
      const { userId, roleId, departmentId } = req
      if (!inquiry) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      // GETTING WORK FLOW
      const flow = await getWorkflowDefinition(inquiry.inquiryAbout, 'REQINQ')
      if (!flow) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, 'Workflow not found')
      }

      // TRANSFROMING KEY VALUES AS PER DB MODEL
      const data = transformInquiry(inquiry)
      data.createdBy = userId
      data.currRole = roleId
      data.createdEntity = departmentId
      data.currEntity = departmentId
      // FETCHING customer, account, service details for existing customer
      let customer
      if (inquiry.customerId && inquiry.accountId && inquiry.connectionId) {
        customer = await checkCustomerHasAccess(inquiry.customerId, inquiry.accountId, inquiry.connectionId)
        if (!customer) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
        }
        data.identificationNo = customer.account[0].service[0].identificationNo
      }
      // GETTIGN PLAN DATA
      logger.debug('Finding plan data')
      let planDetails
      if (customer && customer !== null && customer !== undefined && customer.account[0].service[0].mappingPayload) {
        planDetails = await Plan.findOne({
          where: {
            planId: customer.account[0].service[0].mappingPayload.plans[0].planId
          }
        })
      }
      if (planDetails) {
        data.planId = planDetails.planId || null
        data.businessEntityCode = planDetails.prodType || null
      } else {
        data.planId = null
        data.businessEntityCode = inquiry.serviceType
      }
      // CREATING NEW INQUIRY RECORD
      const inquiryData = await Interaction.create(data, { transaction: t })

      // CREATING HISTORY ON INQUIRY
      logger.debug('Creating History data')
      const interactionHistory = {
        fromRole: roleId || null,
        toRole: roleId,
        fromUser: userId,
        fromEntity: departmentId,
        toEntity: departmentId,
        intxnId: inquiryData.intxnId,
        intxnStatus: 'NEW',
        flwCreatedBy: userId,
        isFollowup: 'N',
        updatedBy: userId,
        flwId: flow.flwId,
        flwAction: 'START',
        remarks: inquiry.ticketDescription,
        causeCode: inquiry.causeCode
      }
      logger.debug('creating history')
      await InteractionTxn.create(interactionHistory, { transaction: t })
      let response
      if (inquiryData) {
        response = {
          interactionId: inquiryData.intxnId,
          status: inquiryData.currStatus,
          createdDate: inquiryData.createdAt
        }
        // ADDING ATTACHMENT
        if (Array.isArray(inquiry.attachments)) {
          for (const entityId of inquiry.attachments) {
            await findAndUpdateAttachment(entityId, inquiryData.intxnId, 'INQUIRY', t)
          }
        }
        if (data.kioskRefId !== null) {
          const kiosk = {
            status: 'CLOSED'
          }
          await Kiosk.update(kiosk, {
            where: {
              referenceNo: data.kioskRefId
            },
            transaction: t
          }
          )
        }

        // CREATING NOTIFICATION
        logger.debug('Creating notification')
        if (inquiryData.intxnType === 'REQINQ') {
          if (customer && customer.contact && customer.contact.email) {
            const notificationType = 'Email'
            await createNotification(inquiryData.intxnId, customer.contact.email, customer.contact.contactNo, notificationType, t)
          }

          if (customer && customer.contact && customer.contact.contactNo && customer.contact.contactType === 'CNTMOB') {
            const notificationType = 'SMS'
            const mobileNo = customer.contact.contactNoPfx + customer.contact.contactNo
            await createNotification(inquiryData.intxnId, customer.contact.email, mobileNo, notificationType, t)
          }
        }
        const notificationSubject = 'assigned to your department'

        await createPopupNotification(inquiryData.intxnId, roleId, departmentId, null, 'Inquiry', notificationSubject)

        const emailList = await getUsersByRole(roleId, departmentId)
        let emailIds
        emailList.forEach(emailId => {
          emailIds = (emailId.email + ',' + emailIds)
        })
        createUserNotification(inquiryData.intxnId, emailIds, null, roleId, departmentId, null, 'Inquiry', data, t, notificationSubject)
      }
      await t.commit()
      logger.debug('Inquiry created successfully')
      return this.responseHelper.onSuccess(res, 'Inquiry created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Inquiry'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateInquiry (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating Inquiry')
      const inquiry = req.body
      const { id } = req.params
      const { userId, contactNo } = req
      if (!inquiry && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const inquiryInfo = await Interaction.findOne({
        where: {
          intxnId: id
        }
      })
      if (!inquiryInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      if (Array.isArray(inquiry.attachments)) {
        for (const entityId of inquiry.attachments) {
          await findAndUpdateAttachment(entityId, id, 'INQUIRY', t)
        }
      }
      const data = transformUpdateInquiry(inquiry, inquiryInfo)
      data.updatedBy = userId
      data.currRole = inquiry.toRole ? inquiry.toRole : inquiryInfo.currRole
      data.currUser = (inquiry.currStatus === 'CLOSED') ? req.userId : inquiry.toUser ? inquiry.toUser : null
      data.currEntity = inquiry.toEntity ? inquiry.toEntity : inquiryInfo.currEntity
      await Interaction.update(data, {
        where: {
          intxnId: id
        },
        transaction: t
      })
      // Creating Inquiry history
      if (inquiry.toRole) {
        const lastHistroy = await InteractionTxn.findOne({
          where: { intxnId: id },
          order: [
            ['flwCreatedAt', 'DESC']
          ],
          limit: 1
        })
        const interactionHistory = {
          fromRole: lastHistroy.dataValues.toRole,
          toRole: inquiry.toRole,
          fromUser: lastHistroy.dataValues.fromUser ? lastHistroy.dataValues.fromUser : null,
          fromEntity: lastHistroy.dataValues.toEntity,
          toEntity: inquiry.toEntity,
          intxnId: id,
          intxnStatus: inquiry.currStatus,
          remarks: inquiry.additionalRemarks,
          flwCreatedBy: userId,
          isFollowup: 'N',
          updatedBy: userId,
          flwId: inquiry.flwId,
          flwAction: inquiry.transactionName,
          causeCode: inquiry.causeCode
        }
        logger.debug('Creating history')
        await InteractionTxn.create(interactionHistory, { transaction: t })
      }
      // Create notification record
      if (inquiry.currStatus !== 'NEW' && inquiry.currStatus !== 'CLOSED') {
        const notificationSubject = inquiry.toUser ? 'assigned to you' : 'assigned to your department'

        if (inquiry.toUser !== null && inquiry.toUser !== '' && inquiry.toUser !== undefined) {
          const toUserEmail = await User.findOne(
            {
              attributes: ['email'],
              where: {
                userId: inquiry.toUser
              }
            }
          )
          await createPopupNotification(id, data.currRole, data.currEntity, inquiry.toUser, 'Inquiry', notificationSubject)

          await createUserNotification(id, (toUserEmail && toUserEmail.email ? toUserEmail.email : null), contactNo, data.currRole, data.currEntity, inquiry.toUser, 'Inquiry', inquiryInfo, t, notificationSubject)
        } else {
          await createPopupNotification(id, data.currRole, data.currEntity, inquiry.toUser, 'Inquiry', notificationSubject)

          const emailList = await getUsersByRole(data.currRole, data.currEntity)
          let emailIds
          emailList.forEach(emailId => {
            emailIds = (emailId.email + ',' + emailIds)
          })
          createUserNotification(id, emailIds, null, data.currRole, data.currEntity, inquiry.toUser, 'Inquiry', inquiryInfo, t, notificationSubject)
        }
      }
      await t.commit()
      logger.debug('Inquiry Updated Successfully')
      return this.responseHelper.onSuccess(res, 'Inquiry Updated Successfully')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating service request'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getInquiry (req, res) {
    try {
      logger.debug('Getting inquiry details by ID')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let response = await getInquiryAndComplaint(id, 'REQINQ')
      if (response) {
        response = camelCaseConversion(response)
      }
      logger.debug('Successfully fetch inquirys data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch inquiry data', response[0])
    } catch (error) {
      logger.error(error, 'Error while fetching inquiry data')
      return this.responseHelper.onError(res, new Error('Error while fetching inquiry data'))
    }
  }

  async getinquirysList (req, res) {
    try {
      logger.debug('Getting inquirys list')
      const { limit = 10, page = 1 } = req.query
      const response = await Interaction.findAll({
        offset: ((page - 1) * limit),
        limit: limit
      })
      logger.debug('Successfully fetch inquirys list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching inquirys list')
      return this.responseHelper.onError(res, new Error('Error while fetching inquirys list'))
    }
  }
}
