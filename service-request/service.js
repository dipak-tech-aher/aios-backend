import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { User, Interaction, InteractionTask, sequelize, BusinessEntity, Account, Connection, Plan } from '../model'
import { defaultMessage } from '../utils/constant'
import { Op, QueryTypes } from 'sequelize'
import { camelCaseConversion } from '../utils/string'
import { transformInteractionTask } from '../transforms/customer-servicce'
import { getTicketDetails } from '../tibco/tibco-utils'
export class ServiceRequestService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createServiceRequest (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new service request')
      let interaction = req.body
      const { userId, roleId, departmentId } = req
      if (!interaction) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      interaction = {
        ...interaction,
        intxnCatType: interaction.intxnType,
        createdBy: userId,
        updatedBy: userId,
        currEntity: departmentId,
        createdEntity: departmentId,
        currRole: roleId
      }
      const response = await Interaction.create(interaction, { transaction: t })
      await t.commit()
      logger.debug('Successfully created service request')
      return this.responseHelper.onSuccess(res, 'Successfully created service request', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while service request'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateServiceRequest (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating service request')
      let interaction = req.body
      const { id } = req.params
      const userId = req.userId
      if (!interaction && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const interactionInfo = await Interaction.findOne({
        where: {
          intxnId: id
        }
      })
      if (!interactionInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      interaction = {
        ...interaction,
        updatedBy: userId
      }
      const response = await Interaction.update(interaction, {
        where: {
          intxnId: id
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Successfully updated service request')
      return this.responseHelper.onSuccess(res, 'Successfully updated service request', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while updating service request'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getServiceRequest (req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting service request by Id: ', id)
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Interaction.findOne({
        include: [
          { model: BusinessEntity, as: 'srType', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'workOrderType', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'cmpProblemDesp', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'inqCauseDesp', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'currStatusDesc', attributes: ['code', 'description'] },
          { model: User, as: 'userId', attributes: ['userId', 'firstName', 'lastName'] },
          { model: User, as: 'userId', attributes: ['userId', 'firstName', 'lastName'] },
          { model: BusinessEntity, as: 'currStatusDesc', attributes: ['code', 'description'] }
        ],
        where: {
          intxnId: id
        }
      })
      if (!response) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      response.dataValues.currStatusDescription = response.dataValues.currStatusDesc.description
      if (response && response.dataValues.externalRefNo1 && response.dataValues.woType && response.dataValues.woType === 'FAULT') {
        const ticketResponse = await getTicketDetails(response.dataValues.externalRefNo1, response.dataValues.intxnType)
        if (ticketResponse === undefined) {
          return this.responseHelper.validationError(res, new Error('Fetching ticket history failed'))
        }
        response.dataValues.realTimeDetails = ticketResponse
      } else {
        response.dataValues.realTimeDetails = {}
      }
      if (response.dataValues.userId) {
        response.dataValues.createdBy = response.dataValues.userId.firstName + ' ' + response.dataValues.userId.lastName
        delete response.dataValues.userId
      }
      logger.debug('Successfully fetch service request data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching service request data')
      return this.responseHelper.onError(res, new Error('Error while fetching service request data'))
    }
  }

  async getServiceRequestList (req, res) {
    try {
      logger.debug('Getting Service Requests for Customer ')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])
      const intxnType = req.query['intxn-type']

      // console.log(customerId, accountId, serviceId, intxnType)

      if (customerId === undefined || isNaN(customerId)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      if ((accountId !== undefined && isNaN(accountId)) || (serviceId !== undefined && isNaN(serviceId)) ||
          (intxnType !== undefined && intxnType === '') || (intxnType !== undefined && !['REQSR', 'REQCOMP', 'REQINQ'].includes(intxnType))) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      let srForServiceFlag = false
      if (accountId || serviceId || intxnType) {
        srForServiceFlag = true
      }

      // console.log(customerId, accountId, serviceId, intxnType, srForServiceFlag)

      if (srForServiceFlag) {
        if (!accountId || !serviceId || !intxnType) {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
      }

      let where
      if (srForServiceFlag) {
        where = {
          customerId: customerId,
          accountId: accountId,
          [Op.or]: {
            connectionId: serviceId,
            existingConnectionId: serviceId
          },
          intxnType: intxnType
        }
      } else {
        where = {
          customerId,
          intxnType: ['REQSR', 'REQCOMP', 'REQINQ']
        }
      }

      // console.log(where)

      const response = await Interaction.findAll({
        logging: console.log,
        attributes: ['intxnId', 'description', 'currStatus', 'problemCode', 'causeCode', 'intxnType', 'woType', 'createdAt'],
        include: [
          { model: User, as: 'userId', attributes: ['userId', 'firstName', 'lastName'] },
          { model: BusinessEntity, as: 'srType', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'workOrderType', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'currStatusDesc', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'cmpProblemDesp', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'inqCauseDesp', attributes: ['code', 'description'] },
          { model: Connection, attributes: ['connectionId', 'identificationNo'] },
          { model: Account, attributes: ['accountId', 'accountNo'] },
          { model: Plan, attributes: ['prodType'] }
        ],
        where: where,
        order: [
          ['intxnId', 'DESC']
        ]
      })

      logger.debug('Successfully fetched service requests for customer')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching service requests')
      return this.responseHelper.onError(res, new Error('Error while fetching service requests'))
    }
  }

  async processBotsServiceRequest (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Processing Service Request Tasks')
      const userId = req.userId
      const reqData = req.body
      if (!reqData && !reqData.intxnId && !reqData.stepName && !reqData.stepStatus) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      if (!['WIP', 'FAILED', 'DONE'].includes(reqData.stepStatus)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      }

      const interaction = await Interaction.findOne({
        where: {
          intxnId: reqData.intxnId
        }
      })
      if (!interaction) {
        logger.debug('Service Request is not found for this id:', reqData.intxnId)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }

      const task = await InteractionTask.findOne({
        where: {
          intxnId: interaction.intxnId,
          taskId: reqData.stepName
        }
      })

      if (!task) {
        logger.debug('Step is not found for this id:', interaction.intxnId)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }

      if (['ERROR', 'RESOLVED', 'CLOSED', 'CLOSED-INCOMPLETE'].includes(task.status)) {
        return this.responseHelper.validationError(res, new Error('Current task status does not allow for BOTS update'))
      }

      if (reqData.stepStatus === 'WIP' && interaction.botProcess !== 'Y') {
        if (interaction.intxnType === 'REQSR') {
          await Interaction.update({
            botProcess: 'Y',
            currStatus: 'WIP',
            updatedBy: userId
          },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          })
        } else if (interaction.intxnType === 'REQCOMP') {
          await Interaction.update({
            botProcess: 'Y',
            updatedBy: userId
          },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          })
        }
      }

      if (reqData.payload) {
        await InteractionTask.update({
          status: reqData.stepStatus,
          payload: reqData.payload,
          updatedBy: userId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
      } else {
        await InteractionTask.update({
          status: reqData.stepStatus,
          updatedBy: userId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
      }

      await t.commit()

      const response = await InteractionTask.findOne({
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        }
      })

      logger.debug('Successfully processed Service Request Task Update')
      return this.responseHelper.onSuccess(res, 'Successfully processed service request data', transformInteractionTask(response))
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while processing service request data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async processTibcoServiceRequest (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Processing service request')
      const userId = req.userId
      const reqData = req.body
      if (!reqData && !reqData.external_ref_sys && !reqData.external_ref_no && !reqData.stepName && !reqData.stepStatus) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const interactionSql = await sequelize.query(`select intxn_id from interaction where 
                            (external_ref_no1 = $externalRefNo and external_ref_sys1 = $externalRefSys) or 
                            (external_ref_no2 = $externalRefNo and external_ref_sys2 = $externalRefSys) or
                            (external_ref_no3 = $externalRefNo and external_ref_sys3 = $externalRefSys) or
                            (external_ref_no4 = $externalRefNo and external_ref_sys4 = $externalRefSys)`, {
        bind: {
          externalRefSys: reqData.external_ref_sys,
          externalRefNo: reqData.external_ref_no
        },
        type: QueryTypes.SELECT
      })

      if (!interactionSql) {
        logger.debug('Service Request is not found for this id:', reqData.externalRefNo)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }

      const interaction = camelCaseConversion(interactionSql[0])

      if (!['WIP', 'FAILED', 'DONE', 'DONE-INCOMPLETE'].includes(reqData.stepStatus)) {
        return this.responseHelper.validationError(res, new Error('Step status is invalid'))
      }

      const task = await InteractionTask.findOne({
        where: {
          intxnId: interaction.intxn_id,
          taskId: reqData.stepName
        }
      })

      if (!task) {
        logger.debug('Step is not found for this id:', interaction.intxn_id)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }

      if (reqData.payload) {
        await InteractionTask.update({
          status: reqData.stepStatus,
          payload: reqData.payload,
          message: (reqData.message) ? reqData.message : null,
          updatedBy: userId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxn_id
          },
          transaction: t
        }
        )
      } else {
        await InteractionTask.update({
          status: reqData.stepStatus,
          message: (reqData.message) ? reqData.message : null,
          updatedBy: userId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxn_id
          },
          transaction: t
        }
        )
      }

      await t.commit()

      const response = await InteractionTask.findOne({
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxn_id
        }
      })

      logger.debug('Successfully processed Service Request Task Update')
      return this.responseHelper.onSuccess(res, 'Successfully processed service request data', transformInteractionTask(response))
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while processing service request data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async searchServiceRequest (req, res) {
    try {
      logger.debug('Search service request')
      const searchParams = req.body
      const { limit = 10, page = 1 } = req.query
      const offSet = ((page - 1) * limit)
      if (!searchParams) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let query
      let response
      // yet to implement for customer name and Account Name
      if (searchParams.searchType && searchParams.searchType === 'ADV_SEARCH') {
        query = `select cu.customer_id, concat(cu.first_name ,' ',cu.last_name) as customer_name,cc.connection_id as service_id,  acc.account_id, 
                  cc.identification_no, concat(acc.first_name, ' ', acc.last_name) as account_name, c2.contact_type
                  from customers as cu 
                  inner join contacts c2 on cu.contact_id  = c2.contact_id
                  inner join accounts acc on acc.customer_id = cu.customer_id
                  inner join connections cc on cc.account_id =acc.account_id
                  inner join interaction i on i.customer_id = cu.customer_id or i.account_id = acc.account_id   or i.connection_id = cc.connection_id   
                  where (i.customer_id =$customerId and i.account_id =$accountId and i.identification_no =$serviceNo) 
                  order by i.customer_id, i.account_id, i.identification_no limit $lmt  offset $pages`
        response = await sequelize.query(query, {
          bind: {
            customerId: searchParams.customerId,
            accountId: searchParams.accountId,
            serviceNo: searchParams.serviceNo,
            lmt: limit,
            pages: offSet
          },
          type: QueryTypes.SELECT
        })
      } else if (searchParams.accessNumber) {
        query = `select cu.customer_id, concat(cu.first_name ,' ',cu.last_name) as customer_name,cc.connection_id as service_id,  acc.account_id, 
                  cc.identification_no, concat(acc.first_name, ' ', acc.last_name) as account_name, c2.contact_type
                  from customers as cu 
                  inner join contacts c2 on cu.contact_id  = c2.contact_id
                  inner join accounts acc on acc.customer_id = cu.customer_id
                  inner join connections cc on cc.account_id =acc.account_id
                  inner join interaction i on i.customer_id = cu.customer_id and i.account_id = acc.account_id   and  i.connection_id = cc.connection_id   
                  where i.identification_no =$searchInput
                  order by i.customer_id, i.account_id, i.identification_no limit $lmt  offset $pages`
        response = await sequelize.query(query, {
          bind: {
            searchInput: searchParams.accessNumber,
            lmt: limit,
            pages: offSet
          },
          type: QueryTypes.SELECT
        })
      }
      response = camelCaseConversion(response)
      logger.debug('Successfully fetch customer data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Customer data')
      return this.responseHelper.onError(res, new Error('Error while fetching Customer data'))
    }
  }
}
