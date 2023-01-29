import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Interaction, InteractionTxn, Appointment, Kiosk, sequelize, BusinessEntity, Plan, InteractionTask, User } from '../model'
import { defaultMessage } from '../utils/constant'
import { checkCustomerHasAccess } from '../utils/util'
import { camelCaseConversion } from '../utils/string'
import { getTicketDetails } from '../tibco/tibco-utils'
import { transformComplaint, transformappointment, transformUpdateComplaint } from '../transforms/customer-servicce'
import { findAndUpdateAttachment } from '../attachments/service'
import { getInquiryAndComplaint } from '../interaction/service'
import { getWorkflowDefinition } from '../workflow/workflow'
import { createNotification, createUserNotification, createPopupNotification } from '../notification/notification-service'
import { QueryTypes, Op } from 'sequelize'
import { getUsersByRole } from '../lookup/service'

export class ComplaintsService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createComplaints (req, res) {
    const t = await sequelize.transaction()

    try {
      logger.info('Creating new complaints')
      const complaint = req.body
      const { userId, roleId, departmentId: fromEntity } = req
      if (!complaint) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.info('Checking customer access')
      const customer = await checkCustomerHasAccess(complaint.customerId, complaint.accountId, complaint.serviceId)
      if (!customer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }

      const identificationNo = customer.account[0].service[0].identificationNo

      let planDetails
      if (customer.account[0].service[0].mappingPayload) {
        planDetails = await Plan.findOne({
          where: {
            planId: customer.account[0].service[0].mappingPayload.plans[0].planId
          }
        })
      }

      const hasOpenTicket = await Interaction.findAll({
        where: {
          identificationNo: identificationNo,
          commentType: complaint.problemType,
          commentCause: complaint.problemCause,
          businessEntityCode: planDetails.prodType,
          currStatus: {
            [Op.notIn]: ['CLOSED','CANCELLED'] // 23 jsn 2023 as per basha sugestion at the time of deployement CANCELLED condition added here
          },
          intxnCatType: complaint.ticketType
        }
      })

      if (hasOpenTicket.length > 0) {
        logger.debug('This access number has open tickets with same type and problem')
        return this.responseHelper.onError(res, new Error('This access number has open tickets with same type and problem'))
      }
      // FINDING WORKFLOW
      logger.debug('Finding work flow')      
      const flow = await getWorkflowDefinition(complaint.problemType, complaint.intxnType)
      if (!flow) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.onError(res, new Error('Workflow not found'))
      }

      // GETTIGN woType
      logger.info('GETTING WORK ORDER TYPE')
      let woType
      const problemCausePaylod = await BusinessEntity.findOne({ where: { code: complaint.problemCause } })
      if (problemCausePaylod?.mappingPayload?.complaintType === 'FAULT') {
        woType = 'FAULT'
      } else {
        logger.debug('WORKORDER TYPE NOT FAULT')
        const result =
        await sequelize.query(`select * from business_entity be where be.mapping_payload @> '{"ticketType": "${complaint.ticketType}"}'`,
          { type: QueryTypes.SELECT })
        woType = result[0]?.code || 'COMPLAINT'
      }
      // GETTIGN PLAN DATA
      logger.debug('Finidng paln data')

      // CREATING COMPLAINT
      logger.debug('Creating complaint')
      const complaintData = await createComplaint(complaint, userId, roleId, fromEntity, t, woType, planDetails.planId, planDetails.prodType, identificationNo)
      logger.debug('Finding enitity')

      // CRAEATING INTERACTION HISTORY
      logger.debug('Creating Interaction history data')
      const interactionHistory = {
        fromRole: roleId || null,
        toRole: roleId,
        fromUser: userId,
        fromEntity,
        toEntity: fromEntity,
        intxnId: complaintData.intxnId,
        remarks: complaint.remarks,
        intxnStatus: 'NEW',
        flwCreatedBy: userId,
        isFollowup: 'N',
        updatedBy: userId,
        flwId: flow.flwId,
        flwAction: 'START',
        problemCode: complaint.problemType
      }
      await InteractionTxn.create(interactionHistory, { transaction: t })

      // CRETATING APPOINTMENT
      logger.debug('Creating appointment')
      if (complaint.appointment && complaint.appointment.fromDate !== '') {
        await creatAappointment(complaint.appointment, userId, complaintData.intxnId, t)
      }

      logger.debug('Uploading attachments')
      if (Array.isArray(complaint.attachments)) {
        for (const entityId of complaint.attachments) {
          await findAndUpdateAttachment(entityId, complaintData.intxnId, 'COMPLAINT', t)
        }
      }
      logger.debug('Creating notification')
      if (complaintData.intxnType === 'REQCOMP' && complaintData.intxnCatType === 'CATCOMP') {
        if (customer.contact && customer.contact.email) {
          const notificationType = 'Email'
          await createNotification(complaintData.intxnId, customer.contact.email, customer.contact.contactNo, notificationType, t)
        }
        if (customer && customer.contact && customer.contact.contactNo && customer.contact.contactType === 'CNTMOB') {
          const notificationType = 'SMS'
          const mobileNo = customer.contact.contactNoPfx + customer.contact.contactNo
          await createNotification(complaintData.intxnId, customer.contact.email, mobileNo, notificationType, t)
        }
      }
      const source = complaint.intxnType === 'REQCOMP' ? 'Complaint' : 'Service Request'
      logger.debug('Creating notification')
      const notificationSubject = 'assigned to your department'

      await createPopupNotification(complaintData.intxnId, roleId, req.departmentId, null, source, notificationSubject)

      const emailList = await getUsersByRole(roleId, req.departmentId)
      let emailIds
      emailList.forEach(emailId => {
        emailIds = (emailId.email + ',' + emailIds)
      })
      createUserNotification(complaintData.intxnId, emailIds, null, roleId, req.departmentId, null, source, complaintData, t, notificationSubject)

      let response
      if (complaintData) {
        response = {
          interactionId: complaintData.intxnId,
          status: complaintData.currStatus,
          createdDate: complaintData.createdAt
        }
      }
      await t.commit()
      logger.debug('Complaint created successfully')
      return this.responseHelper.onSuccess(res, 'Complaint Created Successfully', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while creating complaint'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateComplaint (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating complaint')
      const complaint = req.body
      const { id } = req.params
      const { userId, contactNo } = req
      if (!complaint && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const complaintInfo = await Interaction.findOne({
        where: { intxnId: id }
      })
      if (!complaintInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      if (Array.isArray(complaint.attachments)) {
        for (const entityId of complaint.attachments) {
          await findAndUpdateAttachment(entityId, id, 'COMPLAINT', t)
        }
      }
      // UPDATING COMPLAINT
      logger.debug('Updating complaint')
      if (complaint.currStatus) {
        const data = transformUpdateComplaint(complaint, complaintInfo)
        data.updatedBy = userId
        data.currRole = complaint.toRole ? complaint.toRole : complaintInfo.currRole
        data.currUser = (complaint.currStatus === 'CLOSED') ? req.userId : complaint.toUser ? complaint.toUser : null
        data.currEntity = complaint.toEntity ? complaint.toEntity : complaintInfo.currEntity
        data.currStatus = complaint.currStatus
        data.assignedDate = Date.now()
        data.surveyReq = (complaint.currStatus === 'CLOSED') ? complaintInfo.surveyReq : complaint.surveyReq
        await Interaction.update(data, {
          where: { intxnId: id }, transaction: t
        })
        // Create notification record
        if (complaint.currStatus !== 'NEW' && complaint.currStatus !== 'CLOSED') {
          const source = complaint.intxnType === 'REQCOMP' ? 'Complaint' : 'Service Request'
          const notificationSubject = complaint.toUser ? 'assigned to you' : 'assigned to your department'

          if (complaint.toUser !== null && complaint.toUser !== '' && complaint.toUser !== undefined) {
            const toUserEmail = await User.findOne(
              {
                attributes: ['email'],
                where: {
                  userId: complaint.toUser
                }
              }
            )
            await createPopupNotification(id, data.currRole, data.currEntity, complaint.toUser, source, notificationSubject)
            await createUserNotification(id, (toUserEmail && toUserEmail.email ? toUserEmail.email : null), contactNo, data.currRole, data.currEntity, complaint.toUser, source, complaintInfo, t, notificationSubject)
          } else {
            await createPopupNotification(id, data.currRole, data.currEntity, complaint.toUser, source, notificationSubject)
            const emailList = await getUsersByRole(data.currRole, data.currEntity)
            let emailIds
            emailList.forEach(emailId => {
              emailIds = (emailId.email + ',' + emailIds)
            })
            createUserNotification(id, emailIds, null, data.currRole, data.currEntity, complaint.toUser, source, complaintInfo, t, notificationSubject)
          }
        }
      }

      // CREATING TRANSACTION HISTORY
      logger.debug('Creating interaction history')
      if (complaint.toRole) {
        const lastHistroy = await InteractionTxn.findOne({
          where: { intxnId: id },
          order: [
            ['flwCreatedAt', 'DESC']
          ],
          limit: 1
        })
        const interactionHistory = {
          fromRole: lastHistroy.dataValues.toRole,
          toRole: complaint.toRole,
          fromUser: lastHistroy.dataValues.fromUser ? lastHistroy.dataValues.fromUser : null,
          fromEntity: lastHistroy.dataValues.toEntity,
          toEntity: complaint.toEntity,
          intxnId: id,
          intxnStatus: complaint.currStatus,
          flwCreatedBy: userId,
          isFollowup: 'N',
          updatedBy: userId,
          flwId: complaint.flwId,
          remarks: complaint.additionalRemarks,
          flwAction: (complaint?.flow === 'CONTINUE') ? complaint.transactionName : complaint.flow ? complaint.flow : complaint.transactionName,
          problemCode: complaint.problemType
        }
        logger.debug('Creating history')
        await InteractionTxn.create(interactionHistory, { transaction: t })
      }
      // CREATING/EDITING APPOINTMENT
      logger.debug('Creating/updating appointment')
      if (complaint.appointment && complaint.appointment.fromDate !== '') {
        const appointment = complaint.appointment
        if (!appointment.appointmentId) {
          await creatAappointment(appointment, userId, id, t)
        } else {
          await editAppointment(appointment, userId, id, t)
        }
      }

      await t.commit()
      logger.debug('Complaint Updated Successfully')
      return this.responseHelper.onSuccess(res, 'Complaint Updated Successfully')
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while updating complaint'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getComplaints (req, res) {
    try {
      logger.debug('Getting complaint details by ID')
      const { id } = req.params
      const { type } = req.query
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let response = await getInquiryAndComplaint(id, type)
      if (!response[0]) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      if (response && response[0].external_ref_no1) {
        const ticketResponse = await getTicketDetails(response[0].external_ref_no1, response[0].intxn_type)
        if (ticketResponse === undefined) {
          return this.responseHelper.validationError(res, new Error('Fetching ticket history failed'))
        }
        response[0].realTimeDetails = ticketResponse
      } else response[0].realTimeDetails = {}

      response[0].latestAppointment = await Appointment.findOne({
        where: {
          intxnId: id
        },
        order: [['toTime', 'DESC']]
      })

      if (response && response[0] && response[0].wo_type === 'FAULT') {
        const task = await InteractionTask.findOne({
          where: {
            intxnId: id,
            taskId: 'CREATEFAULT'
          }
        })

        if (task && task.status) {
          logger.debug('Setting task Status')
          response[0].taskStatus = task.status
        } else {
          response[0].taskStatus = ''
        }
      }

      response = camelCaseConversion(response)
      logger.debug('Successfully fetch complaints data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch complaint data', response[0])
    } catch (error) {
      logger.error(error, 'Error while fetching complaint data')
      return this.responseHelper.onError(res, new Error('Error while fetching complaint data'))
    }
  }

  async getComplaintsList (req, res) {
    try {
      const { accessNumber } = req.query
      logger.debug('Getting complaints list')
      let response
      if (accessNumber) {
        response = await Interaction.findAll({
          where: {
            identificationNo: accessNumber
          }
        })
      } else {
        const { limit = 10, page = 1 } = req.query
        response = await Interaction.findAll({
          offset: ((page - 1) * limit),
          limit: limit
        })
      }
      logger.debug('Successfully fetch complaints list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching complaints list')
      return this.responseHelper.onError(res, new Error('Error while fetching complaints list'))
    }
  }

  async getAppointment (req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting Appointment list')
      let response
      if (id) {
        response = await Appointment.findAll({
          where: {
            intxnId: id
          },
          order: [['toTime', 'DESC']]
        })
      }
      logger.debug('Successfully fetch Appointment list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Appointment list')
      return this.responseHelper.onError(res, new Error('Error while fetching Appointment list'))
    }
  }
}

// TRANSFORMATIONS

const createComplaint = async (complaint, userId, roleId, department, t, woType, planId, prodType, identificationNo) => {
  const data = transformComplaint(complaint)
  data.currRole = roleId
  data.createdBy = userId
  data.createdEntity = department
  data.currEntity = department
  data.currUser = (woType === 'FAULT') ? userId : null
  data.currStatus = (woType === 'FAULT') ? 'ASSIGNED' : 'NEW'
  data.woType = woType
  data.identificationNo = identificationNo
  data.assignedDate = Date.now()
  data.businessEntityCode = prodType || null
  data.planId = planId || null
  data.problemCode = data.problemCode ? data.problemCode : data.problemType
  const complaintData = await Interaction.create(data, { transaction: t })

  if (data.kioskRefId !== null) {
    const kiosk = {
      status: 'CLOSED'
    }
    await Kiosk.update(kiosk, {
      where: {
        referenceNo: data.kioskRefId
      },
      transaction: t
    })
  }
  return complaintData
}

const creatAappointment = async (appointment, userId, id, t) => {
  const data = transformappointment(appointment)
  data.intxnId = id
  data.createdBy = userId
  await Appointment.create(data, { transaction: t })
}

const editAppointment = async (appointment, userId, id, t) => {
  const data = transformappointment(appointment)
  data.intxnId = id
  data.updatedBy = userId
  await Appointment.update(data,
    {
      where: {
        appointmentId: appointment.appointmentId
      },
      transaction: t
    })
}
