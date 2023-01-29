import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import {
  Plan, PlanOffer, ConnectionPlan, Connection,
  Interaction, InteractionTask, sequelize, Address
} from '../model'
import { defaultMessage } from '../utils/constant'
import { Op, QueryTypes } from 'sequelize'
import { camelCaseConversion } from '../utils/string'
import { checkCustomerHasAccess } from '../utils/util'
import {
  mobileAddBalanceService, fixedlineAddBalanceService,
  ocsBarUnBarSubscription, blockAccessNumber
} from '../tibco/tibco-utils'
import { transformPlanResponse, transformAddress } from '../transforms/customer-servicce'
import { get } from 'lodash'

const COUNTRYCODE_PREFIX = '673'

export class ConnectionService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createBooster (req, res) {
    let t1
    let t2
    try {
      logger.debug('Creating Booster')
      const reqData = req.body
      const userId = req.userId
      const customerId = Number(reqData.customerId)
      const accountId = Number(reqData.accountId)
      const serviceId = Number(reqData.serviceId)
      const booster = reqData.booster
      const topUpPaymentType = reqData.topUpPaymentType
      const topUpPaymentMethod = reqData.topUpPaymentMethod

      if (!reqData || !customerId || !accountId || !serviceId ||
        !booster || !Array.isArray(booster) || !(booster.length > 0)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const customer = await checkCustomerHasAccess(customerId, accountId, serviceId)
      if (!customer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const basePlan = await Plan.findOne({ where: { planId: customer.account[0].service[0].mappingPayload.plans[0].planId } })

      if (!basePlan) {
        logger.debug('Base plan not found')
        return this.responseHelper.notFound(res, new Error('Base plan not found.'))
      }

      // if (basePlan.prodType !== 'Prepaid' && basePlan.prodType !== 'Fixed') {
      //   return this.responseHelper.notFound(res, new Error('Service Type - ' + basePlan.prodType + ', is not supported.'))
      // }

      if ((basePlan.prodType === 'Prepaid') &&
        (!topUpPaymentMethod || topUpPaymentMethod === '')) {
        return this.responseHelper.notFound(res, new Error('Payment Method is mandatory'))
      }
      if ((basePlan.prodType === 'Prepaid') &&
      (topUpPaymentMethod === 'TOPUP_OTHERS') && (!topUpPaymentType || topUpPaymentType === '')) {
        return this.responseHelper.notFound(res, new Error('Payment Type is mandatory'))
      }
      const plans = {}
      for (const bs of booster) {
        const plan = await Plan.findOne({
          include: [
            { model: PlanOffer, as: 'planoffer' }
          ],
          where: { planId: bs.planId }
        })
        if (!plan) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Selected plan is not available.'))
        } else {
          plans[bs.planId] = plan
        }
      }

      const response = {}
      let errorFlag
      let message

      for (const bs of booster) {
        errorFlag = true
        const plan = plans[bs.planId]
        t1 = await sequelize.transaction()
        let connPlan
        try {
          connPlan = await ConnectionPlan.create({
            connectionId: serviceId,
            prodCatalogue: plan.planCategory,
            planId: plan.planId,
            quota: plan.quota,
            bandwidth: plan.bandwidth,
            status: 'PENDING',
            createdBy: userId,
            updatedBy: userId,
            paymentMethod: topUpPaymentMethod,
            paymentType: topUpPaymentType
          },
          {
            transaction: t1
          })

          if (connPlan) {
            await t1.commit()
          } else {
            await t1.rollback()
            errorFlag = true
            message = 'Error while setting booster/topup to PENDING'
            logger.error(message)
            break
          }
        } catch (error) {
          await t1.rollback()
          message = 'Unexpected error while setting booster/topup to PENDING'
          logger.error(error, message)
          errorFlag = true
          break
        }

        t2 = await sequelize.transaction()
        try {
          // Calling Tibco service to buy a booster in synchronously
          let purpose
          let balanceTxnCode
          if (basePlan.prodType === 'Prepaid') {
            if (topUpPaymentType === 'MAIN_BALANCE') {
              purpose = 'D'
              balanceTxnCode = 'MA'
            } else {
              purpose = 'V'
              balanceTxnCode = 'CA'
            }
          }

          if (basePlan.prodType === 'Postpaid') {
            purpose = 'D'
            balanceTxnCode = 'MA'
          }

          let accessNbr
          if (customer.account[0].service[0].identificationNo.length <= 7) {
            accessNbr = COUNTRYCODE_PREFIX + customer.account[0].service[0].identificationNo
          } else {
            accessNbr = customer.account[0].service[0].identificationNo
          }

          let tibcoResponse
          if (basePlan.prodType === 'Prepaid' || basePlan.prodType === 'Postpaid') {
            let boosterTopupType

            if (plan.planType === 'TOPUP') {
              boosterTopupType = 'Topup'
            }

            if (plan.planType === 'BOOSTER') {
              boosterTopupType = 'Booster'
            }

            // console.log(JSON.stringify(plan, null, 2), plan.planoffer[0].offerId)

            tibcoResponse = await mobileAddBalanceService(
              boosterTopupType,
              connPlan.connPlanId,
              accessNbr,
              plan.planoffer[0].offerId,
              purpose,
              plan.refillProfileId,
              balanceTxnCode,
              plan.charge
            )
          } else if (basePlan.prodType === 'Fixed') {
            tibcoResponse = await fixedlineAddBalanceService(
              customer.account[0].accountNo,
              accessNbr,
              plan.refillProfileId
            )
          }
          const topupStatus = tibcoResponse.status
          message = tibcoResponse.messsage
          // const topupStatus = 'success'
          // message = 'Ok'
          if (topupStatus === 'success') {
            let status
            let cpUpdateData
            if (plan.planType === 'BOOSTER') {
              cpUpdateData = {
                status: 'ACTIVE',
                txnReference: tibcoResponse.txnReference
              }
            } else if (plan.planType === 'TOPUP') {
              cpUpdateData = {
                status: 'COMPLETE'
              }
            }
            await ConnectionPlan.update(
              cpUpdateData,
              {
                where: {
                  connPlanId: connPlan.connPlanId
                },
                transaction: t2
              })
            if (plan.planType === 'BOOSTER') {
              message = 'Requested Booster processed successfully.'
            } else {
              message = 'Requested Topup for $' + plan.charge + ' processed successfully. Topups can be viewed in Purchase History'
            }
            await t2.commit()
            errorFlag = false
            break
          } else {
            if (message === '') {
              message = 'Unexpected error processing Booster/Topup'
            }
            await ConnectionPlan.update({
              status: 'FAILED'
            },
            {
              where: {
                connPlanId: connPlan.connPlanId
              },
              transaction: t2
            })
            await t2.commit()
            errorFlag = true
            break
          }
        } catch (error) {
          t2.rollback()
          message = 'Uexpected error processing booster/topup'
          logger.error(error, message)
          errorFlag = true
          break
        }
      }
      if (!errorFlag) {
        return this.responseHelper.onSuccess(res, message, response)
      } else {
        logger.debug('message', message)
        return this.responseHelper.onError(res, new Error(message))
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Unexpected error while processing booster/topup'))
      }
    }
  }

  async getBoosterList (req, res) {
    try {
      logger.info('Fetching Booster list')
      const { 'customer-id': customerId, 'account-id': accountId, 'service-id': serviceId } = req.query
      if (!customerId && !serviceId && !accountId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const customer = await checkCustomerHasAccess(customerId, accountId, serviceId)
      if (!customer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      let planId = 0
      if (Array.isArray(customer.account)) {
        if (Array.isArray(customer.account[0].service)) {
          planId = customer.account[0].service[0].dataValues.planId
        }
      }
      let response = await sequelize.query(`SELECT plan_id, plan_name FROM plan
                      WHERE plan_type = 'TOPUP' 
                      and prod_type = (select prod_type from plan where plan_id =$planId)`, {
        bind: {
          planId: planId
        },
        type: QueryTypes.SELECT
      })
      response = camelCaseConversion(response)
      logger.debug('Successfully fetch Booster list')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Booster list', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while fething Booster list'))
      }
    }
  }

  async createUpgradeService (req, res) {
    await createUpgradeDowngradeService(req, res, this.responseHelper, 'UPGRADE')
  }

  async getIdentificationNumber (req, res) {
    try {
      const response = await Connection.findAll({
        attributes: ['identificationNo']
      })
      logger.debug('Successfully fetch connection record ')
      return this.responseHelper.onSuccess(res, 'Successfully fetch connection record ', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while fething connection record'))
    }
  }

  async getTerminatedIdentificationNumberList (req, res) {
    try {
      const array = req.body
      const sql = "select c.identification_no, i.wo_type  from connections c join interaction i on i.identification_no = c.identification_no where i.wo_type = 'TERMINATE' and c.identification_no in  ('" + array.join("','") + "')"
      const result = await sequelize.query(sql, { type: QueryTypes.SELECT })
      logger.debug('Successfully fetch connection record ')
      return this.responseHelper.onSuccess(res, 'Successfully fetch connection record ', result)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while fething connection record'))
    }
  }

  async createDowngradeService (req, res) {
    await createUpgradeDowngradeService(req, res, this.responseHelper, 'DOWNGRADE')
  }

  async getUpgradeServiceList (req, res) {
    await getUpgradeDowngradeList(req, res, this.responseHelper, 'upgrade')
  }

  async getDowngradeServiceList (req, res) {
    await getUpgradeDowngradeList(req, res, this.responseHelper, 'downgrade')
  }

  async createVAS (req, res) {
    activateDeActivateVAS(req, res, this.responseHelper, 'VAS')
  }

  async deactivateVAS (req, res) {
    activateDeActivateVAS(req, res, this.responseHelper, 'DEACTIVATEVAS')
  }

  async barService (req, res) {
    barUnbar(req, res, 'BAR', this.responseHelper)
  }

  async unBarService (req, res) {
    barUnbar(req, res, 'UNBAR', this.responseHelper)
  }

  async teleportRelocateService (req, res) {
    const t = await sequelize.transaction()
    const response = {}
    try {
      logger.debug('Creating Teleport/Relocate')
      const reqData = req.body
      const customerId = Number(reqData.customerId)
      const accountId = Number(reqData.accountId)
      const serviceId = Number(reqData.serviceId)
      const { userId, roleId, departmentId } = req

      if (!reqData || !customerId || !accountId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const oldAccessNumber = await Connection.findOne({ where: { connectionId: serviceId } })
      const customer = await checkCustomerHasAccess(customerId, accountId, serviceId)
      if (!customer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }

      const interaction = await Interaction.findOne({
        attributes: ['intxnId', 'description', 'currStatus', 'intxnType', 'woType', 'createdAt'],
        where: {
          customerId: customerId,
          accountId: accountId,
          connectionId: serviceId,
          currStatus: {
            [Op.notIn]: ['CLOSED', 'CANCELLED', 'UNFULFILLED']
          },
          intxnType: 'REQSR',
          woType: ['WONC', 'TERMINATE', 'BAR', 'UNBAR', 'TELEPORT', 'RELOCATE', 'WONC-SER', 'WONC-ACCSER']
        }
      })

      if (interaction) {
        // return this.responseHelper.validationError(res, new Error('Serivce Request ' + interaction.intxnId +  ' is in ' + interaction.currStatus + ' status. Cannot proceed with Teleport/Relocate'))
      }

      const basePlan = await Plan.findOne({ where: { planId: customer.account[0].service[0].mappingPayload.plans[0].planId } })

      if (!basePlan) {
        logger.debug('Base plan not found')
        return this.responseHelper.notFound(res, new Error('Base plan not found.'))
      }

      const currentConnection = await Connection.findOne({
        where: {
          connectionId: customer.account[0].service[0].connectionId,
          status: 'ACTIVE'
        }
      })

      if (!currentConnection) {
        logger.debug('Current Connection not found')
        return this.responseHelper.notFound(res, new Error('Current Connection not found.'))
      }

      const currentConnPlanDetails = await ConnectionPlan.findOne({
        where: {
          connectionId: customer.account[0].service[0].connectionId,
          planId: basePlan.planId
        }
      })

      if (!currentConnPlanDetails) {
        logger.debug('Current Connection Plan not found')
        return this.responseHelper.notFound(res, new Error('Current Connection Plan not found.'))
      }

      let addressId

      const address = {
        flatHouseUnitNo: reqData.flatHouseUnitNo,
        block: reqData.block,
        building: reqData.building,
        street: reqData.street,
        road: reqData.road,
        district: reqData.district,
        state: reqData.state,
        village: reqData.village,
        cityTown: reqData.cityTown,
        country: reqData.country,
        postCode: reqData.postCode
      }

      const data = await createAddress(address, userId, t)
      if (data) {
        addressId = data.addressId
      }

      const newConnectionData = {
        connectionName: get(currentConnection, 'connectionName'),
        connectionType: get(currentConnection, 'connectionType'),
        isPorted: get(currentConnection, 'isPorted'),
        donor: get(currentConnection, 'donor'),
        paymentMethod: get(currentConnection, 'paymentMethod'),
        creditProf: get(currentConnection, 'creditProf', ''),
        status: (reqData.teleportRelocate === 'RELOCATE') ? 'PENDING-RELOCATE' : 'PENDING-TELEPORT',
        // exchngCode: get(currentConnection, 'exchngCode'),
        exchngCode: (reqData.teleportRelocate === 'RELOCATE') ? reqData.exchangeCode : currentConnection.exchngCode,
        identificationNo: ((reqData.teleportRelocate === 'RELOCATE') ? ((reqData.serviceNumberSelection === 'manual') ? reqData.accessNbr : null) : currentConnection.identificationNo),
        connectionSelection: (reqData.teleportRelocate === 'RELOCATE') ? reqData.serviceNumberSelection : currentConnection.connectionSelection,
        connectionGrp: (reqData.teleportRelocate === 'RELOCATE') ? reqData.serviceNumberGroup : currentConnection.connectionGrp,
        deposit: get(currentConnection, 'deposit'),
        charge: get(currentConnection, 'charge'),
        excludeReason: get(currentConnection, 'excludeReason'),
        addressId: addressId,
        accountId: get(currentConnection, 'accountId'),
        mappingPayload: get(currentConnection, 'mappingPayload'),
        createdBy: userId,
        updatedBy: userId
      }

      const newConnectionDataResp = await Connection.create(newConnectionData, { transaction: t })

      const newConnPlanData = {
        bandwidth: get(currentConnPlanDetails, 'bandwidth'),
        status: 'ACTIVE',
        // quota: get(plan, 'quota', ''),
        prodCatalogue: get(currentConnPlanDetails, 'prodCatalogue'),
        connectionId: get(newConnectionDataResp, 'connectionId'),
        createdBy: userId,
        updatedBy: userId,
        planId: basePlan.planId
      }

      const newConnPlanDataResp = await ConnectionPlan.create(newConnPlanData, { transaction: t })

      if (basePlan.prodType === 'Fixed') {
        if (reqData.serviceNumberSelection === 'manual') {
          if (reqData.accessNbr) {
            const accessNbr = reqData.accessNbr
            const { status, message } = await blockAccessNumber(accessNbr, 'FIXEDLINE')
            // const status = true
            if (!status) {
              await t.rollback()
              return this.responseHelper.notFound(res, new Error(message))
            }
          } else {
            await t.rollback()
            return this.responseHelper.validationError(res, new Error('Required fields missing for blocking access number'))
          }
        }
      }

      let woType

      if (reqData.teleportRelocate === 'TELEPORT') {
        woType = 'TELEPORT'
      } else {
        woType = 'RELOCATE'
      }

      const customerData = {
        customerId: customer.customerId,
        account: [
          {
            accountId: customer.account[0].accountId,
            service: [
              {
                identificationNo: (reqData.teleportRelocate === 'RELOCATE' && reqData.serviceNumberSelection === 'manual') ? reqData.accessNbr : oldAccessNumber.identificationNo || null,
                addressId: addressId,
                connectionId: get(newConnectionDataResp, 'connectionId'),
                existingConnectionId: get(currentConnection, 'connectionId')
              }
            ]
          }
        ]
      }

      const serviceRequest = await createServiceRequest(customerData, { prodType: basePlan.prodType, planId: basePlan.planId }, userId, t, woType, roleId, departmentId)
      if (serviceRequest) {
        response.serviceRequest = serviceRequest
      }

      await t.commit()
      logger.debug('Teleport/Relocate initiated successfully')
      return this.responseHelper.onSuccess(res, 'Teleport/Relocate initiated successfully', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while creating customer'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getTeleportRelocationData (req, res) {
    try {
      const { accountId } = req.params
      let { type } = req.query
      if (['RELOCATE', 'TELEPORT'].includes(type)) {
        type = `'PENDING-${type}'`
      }
      const query = `select 
                      c.* as connection_data,
                      a.* as address_data, 
                      be.description as connection_grp, 
                      be2.description as exchng_code 
                      from connections c 
                      left join address a on c.address_id  = a.address_id 
                      left join accounts a2 on c.account_id = a2.account_id 
                      left join business_entity be on c.connection_grp = be.code
                      left join business_entity be2 on c.exchng_code = be.code 
                      where a2.account_id =${accountId} 
                      and c.status = ${type}
                      order by a.created_at desc`
      console.log(query)
      let response = await sequelize.query(query, {
        type: QueryTypes.SELECT
      })
      if (!response) {
        return this.responseHelper.onSuccess(res, 'No reocrds found ')
      }
      response = camelCaseConversion(response)
      logger.debug('Successfully fetch connection record ')
      return this.responseHelper.onSuccess(res, 'Successfully fetch connection record ', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while fething connection record'))
    }
  }

  async terminateService (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Terminating service')
      const reqData = req.body
      const { userId, roleId, departmentId } = req
      const customerId = Number(reqData.customerId)
      const accountId = Number(reqData.accountId)
      const serviceId = Number(reqData.serviceId)

      if (!reqData || !customerId || !accountId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const customer = await checkCustomerHasAccess(customerId, accountId, serviceId)
      if (!customer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const interaction = await Interaction.findOne({
        attributes: ['intxnId', 'description', 'currStatus', 'intxnType', 'woType', 'createdAt'],
        where: {
          customerId: customer.customerId,
          accountId: customer.account[0].accountId,
          connectionId: customer.account[0].service[0].connectionId,
          currStatus: {
            [Op.notIn]: ['CLOSED', 'CANCELLED', 'UNFULFILLED']
          },
          woType: 'TERMINATE',
          intxnType: 'REQSR'
        }
      })
      if (interaction) {
        return this.responseHelper.validationError(res, new Error('Serivce Request ' + interaction.intxnId + ' for TERMINATE alread exists in ' + interaction.currStatus + ' status. Please resolve it manually.'))
      }
      let response = {}
      const basePlan = await Plan.findOne({ where: { planId: customer.account[0].service[0].mappingPayload.plans[0].planId } })
      reqData.prodType = basePlan.prodType
      reqData.planId = basePlan.planId
      const serviceRequest = await createServiceRequest(customer, reqData, userId, t, 'TERMINATE', roleId, departmentId)
      if (serviceRequest) {
        response = {
          intxnId: serviceRequest.intxnId
        }
      }
      await t.commit()
      logger.debug('Service Request ' + serviceRequest.intxnId + ' for Terminate initiated successfully')
      return this.responseHelper.onSuccess(res, 'Service Request ' + serviceRequest.intxnId + ' for Terminate initiated successfully', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while initiating Terminate service'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }
}

const createServiceRequest = async (customer, srData, userId, t, type, roleId, departmentId) => {
  logger.info('Creating new ServiceRequest for ', type)

  let interaction = {
    intxnType: 'REQSR',
    intxnCatType: 'REQSR',
    assignedDate: (new Date()),
    identificationNo: customer.account[0].service[0].identificationNo,
    customerId: customer.customerId,
    accountId: customer.account[0].accountId,
    botProcess: 'N',
    currUser: userId,
    createdEntity: departmentId,
    currEntity: departmentId,
    currRole: roleId,
    createdBy: userId,
    updatedBy: userId,
    addressId: customer.account[0].service[0].addressId,
    connectionId: customer.account[0].service[0].connectionId
  }
  if (type === 'BOOSTER') {
    interaction = {
      ...interaction,
      planId: srData.planId,
      businessEntityCode: srData.prodType,
      isBotReq: 'N',
      description: 'Booster',
      woType: 'BOOSTER',
      currStatus: 'WIP'
    }
  } else if (type === 'UPGRADE') {
    interaction = {
      ...interaction,
      isBotReq: 'Y',
      planId: srData.planId,
      businessEntityCode: srData.planCategory,
      description: 'Upgrade connection',
      woType: 'UPGRADE',
      currStatus: 'CREATED'
    }
  } else if (type === 'DOWNGRADE') {
    interaction = {
      ...interaction,
      isBotReq: 'Y',
      planId: srData.planId,
      businessEntityCode: srData.planCategory,
      description: 'Downgrade connection',
      woType: 'DOWNGRADE',
      currStatus: 'CREATED'
    }
  } else if (type === 'VAS') {
    interaction = {
      ...interaction,
      isBotReq: 'Y',
      businessEntityCode: srData.prodType,
      planIdList: srData.planList,
      description: 'VAS Activation',
      woType: 'VASACT',
      currStatus: 'CREATED'
    }
  } else if (type === 'DEACTIVATEVAS') {
    interaction = {
      ...interaction,
      isBotReq: 'Y',
      businessEntityCode: srData.prodType,
      planIdList: srData.planList,
      description: 'VAS Deactivation',
      woType: 'VASDEACT',
      currStatus: 'CREATED'
    }
  } else if (type === 'BAR') {
    interaction = {
      ...interaction,
      isBotReq: (srData.prodType === 'Prepaid') ? 'N' : 'Y',
      businessEntityCode: srData.reason,
      planId: srData.planId,
      reasonCode: srData.reason,
      description: 'Bar Service',
      woType: 'BAR',
      currStatus: (srData.prodType === 'Prepaid') ? 'WIP' : 'CREATED'
    }
  } else if (type === 'UNBAR') {
    interaction = {
      ...interaction,
      isBotReq: (srData.prodType === 'Prepaid') ? 'N' : 'Y',
      businessEntityCode: srData.reason,
      planId: srData.planId,
      reasonCode: srData.reason,
      description: 'UnBar Service',
      woType: 'UNBAR',
      currStatus: (srData.prodType === 'Prepaid') ? 'WIP' : 'CREATED'
    }
  } else if (type === 'TELEPORT') {
    interaction = {
      ...interaction,
      isBotReq: 'Y',
      planId: srData.planId,
      businessEntityCode: srData.prodType,
      description: 'Teleport Service',
      woType: 'TELEPORT',
      currStatus: 'CREATED',
      existingConnectionId: customer.account[0].service[0].existingConnectionId
    }
  } else if (type === 'RELOCATE') {
    interaction = {
      ...interaction,
      isBotReq: 'Y',
      planId: srData.planId,
      businessEntityCode: srData.prodType,
      description: 'Relocate Service',
      woType: 'RELOCATE',
      currStatus: 'CREATED',
      existingConnectionId: customer.account[0].service[0].existingConnectionId
    }
  } else if (type === 'TERMINATE') {
    interaction = {
      ...interaction,
      isBotReq: 'Y',
      businessEntityCode: srData.prodType,
      planId: srData.planId,
      reasonCode: srData.reason,
      description: 'Terminate Service',
      woType: 'TERMINATE',
      currStatus: 'CREATED',
      contractFeesWaiver: srData.contractFeesWaiver,
      refundDeposit: srData.refundDeposit,
      terminateReason: srData.terminationReason
    }
  }

  const response = await Interaction.create(interaction, { transaction: t, logging: console.log })
  return response
}

const updateServiceStatus = async (data, t) => {
  const connectionId = data.account[0].service[0].connectionId
  const connection = {
    connectionId,
    status: 'PENDING'
  }
  await Connection.update(connection, {
    where: {
      connectionId
    },
    transaction: t
  })
}

const barUnbar = async (req, res, action, respHelper) => {
  const t = await sequelize.transaction()
  try {
    logger.debug('Starting ' + action + ' of specified service')
    const reqData = req.body
    let userId = req.userId
    const { roleId, departmentId } = req
    userId = Number(userId)
    if (!(!isNaN(userId) && userId !== 0 && reqData && reqData.customerId &&
      reqData.serviceId && reqData.accountId && reqData.reason)) {
      return respHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
    }
    const customer = await checkCustomerHasAccess(reqData.customerId, reqData.accountId, reqData.serviceId)
    if (!customer) {
      logger.debug(defaultMessage.NOT_FOUND)
      return respHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
    }

    const interaction = await Interaction.findOne({
      attributes: ['intxnId', 'description', 'currStatus', 'intxnType', 'woType', 'createdAt'],
      where: {
        customerId: customer.customerId,
        accountId: customer.account[0].accountId,
        connectionId: customer.account[0].service[0].connectionId,
        currStatus: {
          [Op.notIn]: ['CLOSED', 'CANCELLED', 'UNFULFILLED']
        },
        woType: action,
        intxnType: 'REQSR'
      }
    })

    if (interaction) {
      return respHelper.validationError(res, new Error('Serivce Request ' + interaction.intxnId + ' for ' + action + ' alread exists in ' + interaction.currStatus + ' status. Please resolve it manually.'))
    }

    const basePlan = await Plan.findOne({ where: { planId: customer.account[0].service[0].mappingPayload.plans[0].planId } })

    await updateServiceStatus(customer, t)
    const serviceReqData = await createServiceRequest(customer, { reason: reqData.reason, prodType: basePlan.prodType, planId: basePlan.planId }, userId, t, action, roleId, departmentId)
    await t.commit()

    let outcome
    if (basePlan.prodType === 'Prepaid') {
      outcome = await invokeOCS(action, customer.account[0].service[0].identificationNo,
        serviceReqData.intxnId, customer.account[0].service[0].connectionId, userId)
      if (outcome.status) {
        logger.debug(outcome.message)
        return respHelper.onSuccess(res, outcome.message, serviceReqData)
      } else {
        logger.debug(outcome.message)
        return respHelper.onError(res, new Error(outcome.message))
      }
    } else {
      logger.debug(action + ' initiated successfully')
      return respHelper.onSuccess(res, 'Service Request ' + serviceReqData.intxnId + ' for ' + action + ' initiated successfully', serviceReqData)
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      respHelper.notFound(res, defaultMessage.NOT_FOUND)
    } else {
      logger.error(error, defaultMessage.ERROR)
      return respHelper.onError(res, new Error('Error while initiating ' + action))
    }
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const invokeOCS = async (action, identificationNo, intxnId, connectionId, userId) => {
  const t = await sequelize.transaction()

  try {
    const ocsResp = await ocsBarUnBarSubscription(action, identificationNo, intxnId)

    if (ocsResp && ocsResp.status !== undefined) {
      if (ocsResp.status === 'success') {
        await Connection.update({
          status: (action === 'BAR') ? 'TOS' : 'ACTIVE',
          updatedBy: userId
        },
        {
          where: {
            connectionId: connectionId
          },
          transaction: t
        }
        )
        await Interaction.update(
          {
            currStatus: 'CLOSED',
            updatedBy: userId
          },
          {
            where: {
              intxnId: intxnId
            },
            transaction: t
          }
        )
        await t.commit()
        return { status: true, message: 'Service Request - ' + intxnId + ' for ' + action + ' Service completed successfully' }
      } else if (ocsResp.status === 'failure') {
        await Interaction.update(
          {
            currStatus: 'FAILED',
            updatedBy: userId
          },
          {
            where: {
              intxnId: intxnId
            },
            transaction: t
          }
        )

        await t.commit()
        return { status: false, message: 'Service Request - ' + intxnId + ' needs to be resolved manually as ' + action + ' Service failed - ' + ocsResp.message }
      } else {
        await InteractionTask.create({
          intxnId: intxnId,
          taskId: 'RETRY',
          status: 'NEW',
          retryCount: 0,
          createdBy: userId,
          updatedBy: userId
        },
        {
          transaction: t
        })
        await t.commit()
        return { status: false, message: 'Service Request - ' + intxnId + ' for ' + action + ' Service failed, system will retry request. Please check back later' }
      }
    } else {
      await InteractionTask.create({
        intxnId: intxnId,
        taskId: 'RETRY',
        status: 'NEW',
        retryCount: 0,
        createdBy: userId,
        updatedBy: userId
      },
      {
        transaction: t
      })

      await t.commit()
      return { status: false, message: 'Service Request - ' + intxnId + ' for ' + action + ' Service failed, system will retry request. Please check back later' }
    }
  } catch (error) {
    logger.error(error, 'Error while invoking OCS to Bar/Unbar prepaid connection')
    return { status: false, message: 'Service Request - ' + intxnId + ' for ' + action + ' Service failed, Please contact support' }
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const getUpgradeDowngradeList = async (req, res, resHelper, type) => {
  try {
    logger.info('Getting upgrading Service list')
    const { 'customer-id': customerId, 'account-id': accountId, 'service-id': serviceId } = req.query
    if (!customerId || !serviceId || !accountId) {
      return resHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
    }

    const currentConnection = await Connection.findOne({
      where: {
        connectionId: serviceId
      }
    })

    const planId = currentConnection.mappingPayload.plans[0].planId
    const currentPlan = await Plan.findOne({
      include: [
        { model: PlanOffer, as: 'planoffer' }
      ],
      where: {
        planId: planId
      }
    })

    const availablePlans = await Plan.findAll({
      include: [
        { model: PlanOffer, as: 'planoffer' }
      ],
      where: {
        planType: 'BASE',
        planCategory: currentPlan.planCategory,
        prodType: currentPlan.prodType,
        status: 'AC'
      },
      order: [
        ['charge', 'ASC']
      ]
    })

    const currentPlanData = transformPlanResponse(currentPlan)
    const availablePlansData = transformPlanResponse(availablePlans)
    const selectedPlans = []
    // console.log('availablePlansData', JSON.stringify(availablePlansData, null, 2))
    for (const p of availablePlansData) {
      let selectPlan = false
      if (p.planId === currentPlanData.planId) {
        continue
      }
      if (type === 'upgrade') {
        if (p.charge && currentPlanData.charge && (p.charge > currentPlanData.charge)) {
          selectPlan = true
        }
      } else {
        if (p.charge && currentPlanData.charge && (p.charge < currentPlanData.charge)) {
          selectPlan = true
        }
      }
      // console.log('currentPlanData', JSON.stringify(currentPlanData, null, 2))
      // console.log(currentPlanData.planName, currentPlanData.offers, p.planName, p.offers)
      // if(p.offers && currentPlanData.offers) {
      //   for(let o1 of p.offers) {
      //     for(let o2 of currentPlanData.offers) {
      //        //console.log(currentPlanData.planName, o2.quota, p.planName, o1.quota)
      //       if((o1.offerType === o2.offerType) && (o1.quota > o2.quota)) {
      //         selectPlan = true
      //       }
      //     }
      //   }
      // }
      if (selectPlan) {
        selectedPlans.push(p)
      }
    }

    logger.debug('Fetching Upgrade Service list successfully')
    return resHelper.onSuccess(res, 'Fetching Upgrade Service list successfully', selectedPlans)
  } catch (error) {
    if (error.response && error.response.status === 404) {
      resHelper.notFound(res, defaultMessage.NOT_FOUND)
    } else {
      logger.error(error, defaultMessage.ERROR)
      return resHelper.onError(res, new Error('Error while getting upgrading Service list'))
    }
  }
}

const createUpgradeDowngradeService = async (req, res, respHelper, type) => {
  const t = await sequelize.transaction()
  try {
    logger.debug(type + ' Service')
    const reqData = req.body
    const { userId, roleId, departmentId } = req
    if (!reqData && reqData.customerId && reqData.serviceId && reqData.accountId) {
      return respHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
    }
    const customer = await checkCustomerHasAccess(reqData.customerId, reqData.accountId, reqData.serviceId)
    if (!customer) {
      logger.debug(defaultMessage.NOT_FOUND)
      return respHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
    }
    const response = []
    if (Array.isArray(reqData.upgrade)) {
      for (const bs of reqData.upgrade) {
        const plan = await Plan.findOne({
          where: {
            planId: bs.planId,
            prodType: { [Op.ne]: 'Prepaid' }
          }
        })
        if (!plan) {
          logger.debug('Selected plan not available. Please select another plan')
          return respHelper.notFound(res, new Error('Selected plan not available. Please select another plan'))
        }

        const basePlan = await Plan.findOne({ where: { planId: customer.account[0].service[0].mappingPayload.plans[0].planId } })

        if (!basePlan) {
          logger.debug('Unable to locate current plan')
          return respHelper.notFound(res, new Error('Unable to locate current plan'))
        }

        if (plan.prodType !== basePlan.prodType && plan.planCategory !== basePlan.planCategory) {
          logger.debug('Selected plan is not in the same plan category as curent plan')
          return respHelper.notFound(res, new Error('Selected plan is not in the same plan category as curent plan'))
        }

        const connectionPlanDetails = await ConnectionPlan.findOne({
          attributes: ['connPlanId', 'planId', 'connectionId', 'status', 'createdAt', 'createdBy'],
          include: [
            {
              model: Plan,
              as: 'plan',
              attributes: ['planId', 'planName', 'prodType', 'planType', 'charge'],
              where: {
                planType: 'BASE'
              }
            }
          ],
          where: {
            connectionId: customer.account[0].service[0].connectionId,
            status: 'PENDING'
          },
          logging: console.log
        })

        if (connectionPlanDetails) {
          logger.debug('A plan upgrade/downgrade in pendig state found. Please resolve it first')
          return respHelper.notFound(res, new Error('A plan upgrade/downgrade in pending state found. Please resolve it first'))
        }

        const interaction = await Interaction.findOne({
          attributes: ['intxnId', 'description', 'currStatus', 'intxnType', 'woType', 'createdAt'],
          where: {
            customerId: customer.customerId,
            accountId: customer.account[0].accountId,
            connectionId: customer.account[0].service[0].connectionId,
            currStatus: {
              [Op.notIn]: ['CLOSED', 'CANCELLED', 'UNFULFILLED']
            },
            woType: ['UPGRADE', 'DOWNGRADE'],
            intxnType: 'REQSR'
          }
        })

        if (interaction) {
          return respHelper.validationError(res, new Error('A Serivce Request ' + interaction.intxnId + ' for ' + interaction.woType + ' already exists in ' + interaction.currStatus + ' status. Please resolve it first.'))
        }

        const data = {
          connectionId: reqData.serviceId,
          prodCatalogue: plan.planCategory,
          planId: plan.planId,
          bandwidth: plan.bandwidth,
          status: 'PENDING',
          createdBy: userId,
          updatedBy: userId
        }
        const upgradeDowngrade = await ConnectionPlan.create(data, { transaction: t })
        let upgradeDowngradeData = {}
        if (upgradeDowngrade) {
          const serviceRequest = await createServiceRequest(customer, plan, userId, t, type, roleId, departmentId)
          if (serviceRequest) {
            upgradeDowngradeData = {
              ...upgradeDowngrade.dataValues,
              service: serviceRequest
            }
          }
          response.push(upgradeDowngradeData)
        }
      }
    }
    await t.commit()
    logger.debug('Upgrading Service successfully')
    return respHelper.onSuccess(res, 'Upgrading Service successfully', response)
  } catch (error) {
    if (error.response && error.response.status === 404) {
      respHelper.notFound(res, defaultMessage.NOT_FOUND)
    } else {
      logger.error(error, defaultMessage.ERROR)
      return respHelper.onError(res, new Error('Error while Upgrading Service'))
    }
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const activateDeActivateVAS = async (req, res, resHelper, type) => {
  const t = await sequelize.transaction()
  try {
    logger.debug(type + ' VAS')

    const reqData = req.body
    const { userId, roleId, departmentId } = req
    const customerId = Number(reqData.customerId)
    const accountId = Number(reqData.accountId)
    const serviceId = Number(reqData.serviceId)
    const vas = reqData.vas

    if (!reqData || !customerId || !accountId || !serviceId ||
      !vas || !Array.isArray(vas) || !(vas.length > 0)) {
      return resHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
    }

    const customer = await checkCustomerHasAccess(reqData.customerId, reqData.accountId, reqData.serviceId)
    if (!customer) {
      logger.debug(defaultMessage.NOT_FOUND)
      return resHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
    }

    const basePlan = await Plan.findOne({ where: { planId: customer.account[0].service[0].mappingPayload.plans[0].planId } })

    if (!basePlan) {
      logger.debug('Base plan not found')
      return resHelper.notFound(res, new Error('Base plan not found.'))
    }

    const plans = {}
    for (const v of reqData.vas) {
      const plan = await Plan.findOne({
        where: {
          planId: v.planId,
          status: 'AC',
          planType: 'VAS',
          prodType: {
            [Op.eq]: basePlan.prodType
          }
        }
      })
      if (!plan) {
        logger.debug(plan.planName + ' is not available. Please select another plan')
        return resHelper.notFound(res, new Error(plan.planName + ' is not available. Please select another plan'))
      } else {
        const connPlan = await ConnectionPlan.findOne({
          where: {
            planId: v.planId,
            connectionId: reqData.serviceId,
            status: ['ACTIVE', 'PENDING']
          }
        })

        if (!plan) {
          logger.debug(plan.planName + ' is already in ' + connPlan.status + ' status')
          return resHelper.notFound(res, new Error(plan.planName + ' is already in ' + connPlan.status + ' status'))
        } else {
          plans[plan.planId] = plan
        }
      }
    }

    let response = {}
    const srData = {}
    const planIds = []
    for (const vs of reqData.vas) {
      const plan = plans[vs.planId]
      const data = {
        connectionId: reqData.serviceId,
        prodCatalogue: plan.prodType,
        planId: plan.planId,
        quota: plan.quota,
        bandwidth: plan.bandwidth,
        status: 'PENDING',
        createdBy: userId,
        updatedBy: userId
      }
      await ConnectionPlan.create(data, { transaction: t })
      planIds.push(vs.planId)
    }

    srData.prodType = basePlan.prodType
    srData.planList = planIds.join()

    const serviceRequest = await createServiceRequest(customer, srData, userId, t, type, roleId, departmentId)
    if (serviceRequest) {
      response = {
        intxnId: serviceRequest.intxnId
      }
    }

    await t.commit()
    logger.debug('Service Request ' + serviceRequest.intxnId + ' for VAS ' + type + 'initiated successfully')
    return resHelper.onSuccess(res, 'Service Request ' + serviceRequest.intxnId + ' for VAS ' + type + 'initiated successfully', response)
  } catch (error) {
    if (error.response && error.response.status === 404) {
      resHelper.notFound(res, defaultMessage.NOT_FOUND)
    } else {
      logger.error(error, defaultMessage.ERROR)
      return resHelper.onError(res, new Error('Error while initiating VAS ' + type))
    }
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const createAddress = async (address, userId, t) => {
  logger.info('Creating Address')
  const data = transformAddress(address)
  data.createdBy = userId
  data.updatedBy = userId
  const response = await Address.create(data, { transaction: t })
  return response
}
