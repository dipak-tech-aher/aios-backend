import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import {
  Account, Address, Customer, Contact, Connection, ConnectionPlan,
  Interaction, Plan, SecurityQuestion, sequelize, BusinessEntity,
  PlanOffer, InteractionTask, User, Kiosk, InteractionTxn, BulkUpload, BulkBillCollection
} from '../model'
import { defaultMessage } from '../utils/constant'
import { get, isEmpty } from 'lodash'
import { QueryTypes, Op } from 'sequelize'
import { camelCaseConversion } from '../utils/string'
import {
  transformAccount, transformAddress, transformContact,
  transformConnection, transformCustomer, transformSecurityQuestion,
  transformCustomerResponse, transformAccountResponse,
  transformServiceResponse, transformPlanResponse, transformConnectionPlanResponse,
  transformPurchaseHistoryResponse, transformCustomerBillData
} from '../transforms/customer-servicce'
import {
  allocateAccessNumber, blockAccessNumber,
  getRealtimeServiceDetails, ocsCustomerStatus, getTicketDetails
} from '../tibco/tibco-utils'
import { findAndUpdateAttachment } from '../attachments/service'
import { createServiceRequestHistory } from '../interaction/interaction-utils'

const COUNTRYCODE_PREFIX = '673'

export class CustomerService {
  constructor() {
    this.responseHelper = new ResponseHelper()
  }

  async resolveInteraction(req, res) {
    try {
      logger.debug('Resolving interaction manually')

      let { intxnId } = req.params
      intxnId = Number(intxnId)
      const userId = Number(req.userId)
      const { accessNbr, system, woNbr, failure } = req.body
      if (isNaN(intxnId) || intxnId === undefined || intxnId === 0 || userId === undefined || userId === 0) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const interaction = await Interaction.findOne({
        where: {
          intxnId: intxnId
        }
      })
      if (interaction.woType === 'FAULT') {
        if (!accessNbr || !system || !woNbr || !failure) {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
      }
      if (interaction.woType === 'WONC' || interaction.woType === 'RELOCATE') {
        if (!accessNbr || !system || !woNbr || !failure) {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
      }

      if (interaction.woType === 'BAR' || interaction.woType === 'UNBAR') {
        if (!failure || failure === '') {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
      }

      if (interaction.woType === 'UPGRADE' || interaction.woType === 'DOWNGRADE') { // || !woNbr || woNbr === ''  || !system || system === ''
        if (!failure || failure === '') {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
      }
      if (interaction.woType === 'TERMINATE') {
        if (!accessNbr || !failure) { // || !system || !woNbr ||
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
      }
      if (interaction.woType === 'WONC') {
        if (interaction.currStatus !== 'FAILED' && interaction.currStatus !== 'MANUAL') {
          return this.responseHelper.validationError(res, new Error('Interaction not in MANUAL/FAILED Status'))
        }
      } else if (interaction.woType === 'BAR' || interaction.woType === 'UNBAR' ||
        interaction.woType === 'UPGRADE' || interaction.woType === 'DOWNGRADE' ||
        interaction.woType === 'VASACT' || interaction.woType === 'VASDEACT' ||
        interaction.woType === 'RELOCATE' || interaction.woType === 'TELEPORT' || interaction.woType === 'TERMINATE') {
        if (interaction.currStatus !== 'FAILED') {
          return this.responseHelper.validationError(res, new Error('Interaction not in FAILED Status'))
        }
      } else if (interaction.woType === 'FAULT') {
        const response = await Interaction.findOne({
          where: {
            externalRefNo1: woNbr
          }
        })
        if (response) {
          return this.responseHelper.validationError(res, new Error('The Work Order Number is already exists'))
        }

        // if(woNbr !== interaction.externalRefNo1)
        // {
        //   return this.responseHelper.validationError(res, new Error('There is a mismatch in the Work Order Number'))
        // }
        // if (interaction.currStatus !== 'FAILED') {
        //   return this.responseHelper.validationError(res, new Error('Interaction should be in FAILED Status to perform manual resolution'))
        // }
      } else {
        return this.responseHelper.validationError(res, new Error('Unexpected Work Order Type'))
      }

      const connectionData = await Connection.findOne({
        where: {
          connectionId: interaction.connectionId
        }
      })

      if (interaction.woType === 'WONC' || interaction.woType === 'RELOCATE') {
        if (connectionData.serviceNumberSelection === 'manual' && connectionData.identificationNo !== accessNbr) {
          return this.responseHelper.validationError(res, new Error('Mismatch in Access Number'))
        }
      }

      const planId = connectionData.mappingPayload.plans[0].planId
      const planData = await Plan.findOne({
        where: {
          planId: planId
        }
      })

      let cust360Summary
      if (interaction.woType === 'WONC' || interaction.woType === 'WONC-ACCSER' || interaction.woType === 'WONC-SER' ||
        interaction.woType === 'BAR' || interaction.woType === 'UNBAR' ||
        interaction.woType === 'UPGRADE' || interaction.woType === 'DOWNGRADE' ||
        interaction.woType === 'RELOCATE' || interaction.woType === 'TERMINATE') {
        cust360Summary = await getRealtimeServiceDetails(accessNbr, planData.prodType, 'true')
        if (!cust360Summary || !cust360Summary.connectionStatus) {
          return this.responseHelper.validationError(res, new Error('Unable to retrieve Service Details'))
        }
      }

      // const cust360Summary = {"customerNbr": "666001","accountNbr": "666002","connectionStatus": "CU"}
      // console.log(cust360Summary)

      if (interaction.woType === 'WONC' || interaction.woType === 'WONC-ACCSER' || interaction.woType === 'WONC-SER') {
        return await newConnectionManualResolution(interaction, cust360Summary, connectionData,
          planData, failure, this.responseHelper, res, userId, system, woNbr, accessNbr, req)
      } else if (interaction.woType === 'BAR' || interaction.woType === 'UNBAR') {
        return await barUnBarManualResolution(interaction, cust360Summary, connectionData,
          planData, failure, this.responseHelper, res)
      } else if (interaction.woType === 'UPGRADE' || interaction.woType === 'DOWNGRADE') {
        return await upgradeDowngradeManualResolution(interaction, cust360Summary, connectionData,
          planData, failure, this.responseHelper, res, userId, system, woNbr)
      } else if (interaction.woType === 'VASACT' || interaction.woType === 'VASDEACT') {
        return await activateDeactivateVAS(interaction, failure, this.responseHelper, res, userId, system, woNbr)
      } else if (interaction.woType === 'RELOCATE') {
        return await relocateManualResolution(interaction, cust360Summary, connectionData,
          planData, failure, this.responseHelper, res, userId, system, woNbr, accessNbr, req)
      } else if (interaction.woType === 'TELEPORT') {
        return await teleportManualResolution(interaction, failure, this.responseHelper, res,
          userId, system, woNbr, req)
      } else if (interaction.woType === 'FAULT') {
        return await faultManualResolution(interaction, failure, this.responseHelper, res, userId, system, woNbr, req)
      } else if (interaction.woType === 'TERMINATE') {
        return await terminateManualResolution(interaction, failure, this.responseHelper, res, userId, system, woNbr, req, cust360Summary)
      }
    } catch (error) {
      logger.error(error, 'Error while updating status')
      return this.responseHelper.onError(res, new Error('Error while updating status'))
    }
  }

  async getTaskList(req, res) {
    try {
      logger.debug('Getting task data')
      const { id } = req.params
      logger.debug('Getting task list by Id: ', id)
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await InteractionTask.findAll({
        include: [
          { model: BusinessEntity, as: 'taskIdLookup', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'taskStatusLookup', attributes: ['code', 'description'] },
          { model: Interaction, as: 'data', attributes: ['description', 'curr_status'] }
        ],
        where: {
          intxnId: id
        }
      })

      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      // console.log("Response :", JSON.stringify(response))
      const resp = response.sort(function (a, b) {
        return a.intxnTaskId - b.intxnTaskId
      })
      // response = transformCustomerResponse(response)
      logger.debug('Successfully fetch task list  data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, resp)
    } catch (error) {
      logger.error(error, 'Error while fetching task list')
      return this.responseHelper.onError(res, new Error('Error while fetching task list'))
    }
  }

  async customersummary(req, res) {
    try {
      logger.debug('Getting realtime data')

      // const reqBody = {
      //   accessNumber: req.body.accessNumber,
      //   identifier: req.body.identifier,
      //   trackingId: ''
      // }

      // console.log(tibco.customerAPIEndPoint + tibco.customerSummaryAPI)

      // const response = await got.put({
      //   headers: { 'content-type': 'application/json', authorization: '' },
      //   url: tibco.customerAPIEndPoint + tibco.customerSummaryAPI,
      //   body: JSON.stringify(reqBody),
      //   retry: 0
      // })

      // logger.debug('Got response ', response)
      // console.log(response.body)
      logger.debug('Successfully fetched realtime data')

      // const response = {"ok": "ok"}
      // return res.json(JSON.parse(response.body))
      // return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching realtime data')
      return this.responseHelper.onError(res, new Error('Error while fetching realtime data'))
    }
  }

  async createCustomer(req, res) {
    const t = await sequelize.transaction()
    try {
      let createCustomer = false
      let createAccount = false
      let createService = false
      logger.info('Creating new customer')
      const customer = req.body
      const { userId, roleId, departmentId } = req
      const kioskRefId = get(customer, 'kioskRefId', null)
      const response = {}
      if (!customer) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let addressId
      let contactId
      let customerId
      // Existing Customer, New Account & New Service
      if (customer.customerId) {
        const customerInfo = await Customer.findOne({
          where: {
            customerId: customer.customerId
          }
        })
        if (customerInfo) {
          customerId = customerInfo.customerId
          contactId = customerInfo.contactId
          addressId = customerInfo.addressId
        } else {
          return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
        }
      } else {
        // New Customer, New Account & New Service
        if (Array.isArray(customer.address)) {
          for (const address of customer.address) {
            const data = await createAddress(address, userId, t)
            if (data) {
              addressId = data.addressId
            }
          }
        }
        const data = await createContact(customer, userId, t)
        if (data) {
          contactId = data.contactId
        }
        const customerInfo = await createCustomerData(customer, userId, addressId, contactId, t)
        if (!customerInfo) {
          return this.responseHelper.onError(res, new Error('Error while creating customer'))
        }
        customerId = customerInfo.customerId
        createCustomer = true
        if (Array.isArray(customer.attachments)) {
          for (const entityId of customer.attachments) {
            await findAndUpdateAttachment(entityId, customerId, 'CUSTOMER', t)
          }
        }
      }
      response.customerId = customerId
      const account = []
      if (Array.isArray(customer.account)) {
        for (const accounts of customer.account) {
          let accountAddressId
          let accountContactId
          let accountInfo
          // Existing Account, New Service
          if (accounts.accountId) {
            accountInfo = await Account.findOne({
              where: {
                accountId: accounts.accountId,
                customerId
              }
            })
            if (accountInfo) {
              accountAddressId = accountInfo.addressId
              accountContactId = accountInfo.contactId
              account.push(accountInfo)
            } else {
              return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
            }
          } else {
            // New Account, New Service
            if (accounts.billingAddress && accounts.billingAddress[0].sameAsCustomerAddress === true) {
              accountAddressId = addressId
              // accountContactId = contactId
            } else if (accounts.billingAddress && accounts.billingAddress[0]) {
              const address = await createAddress(accounts.billingAddress[0], userId, t)
              if (address) {
                accountAddressId = address.addressId
              }
            }
            const contact = await createContact(accounts, userId, t)
            if (contact) {
              accountContactId = contact.contactId
            }
            let securityQ
            if (accounts.securityData) {
              securityQ = await createSecurityQuestion(accounts.securityData, t)
            }
            if (accounts.idType === 'Passport' && accounts.idValue) {
              const passportIdExists = await Account.findOne({
                where: {
                  idValue: accounts.idValue
                }
              })
              if (passportIdExists) {
                return this.responseHelper.conflict(res, new Error('Passport id already exist in the system, Please enter valid id'))
              }
            }
            accountInfo = await createAccountData(customer.customerType, accounts, customerId, accountAddressId, accountContactId, userId, securityQ.profileId, t)
            account.push(accountInfo)
            createAccount = true
            // Creating account attachments
            if (Array.isArray(accounts.attachments)) {
              for (const entityId of accounts.attachments) {
                await findAndUpdateAttachment(entityId, accountInfo.accountId, 'ACCOUNT', t)
              }
            }
          }
          // Creating New Service
          if (Array.isArray(accounts.service)) {
            for (const service of accounts.service) {
              let serviceAddressId
              if (Array.isArray(service.installationAddress)) {
                for (const address of service.installationAddress) {
                  if (address.sameAsCustomerAddress === true) {
                    serviceAddressId = accountAddressId
                  } else {
                    const addressInfo = await createAddress(address, userId, t)
                    if (addressInfo) {
                      serviceAddressId = addressInfo.addressId
                    }
                  }
                }
              }
              const plan = await Plan.findOne({
                where: {
                  planId: get(service, 'product', '')
                }
              })
              if (!plan) {
                logger.debug(defaultMessage.NOT_FOUND)
                await t.rollback()
                return this.responseHelper.notFound(res, new Error('Selected plan not available. Please select another plan'))
              }
              const connection = await createConnectionAndPlan(service, serviceAddressId, userId, plan, accountInfo.accountId, t)
              createService = true
              if (connection) {
                response.serviceId = connection.connectionId
                // Calling tibco service to block the access number for this customer

                if (plan.prodType === 'Prepaid' || plan.prodType === 'Postpaid') {
                  if (service.mobile && service.mobile.serviceNumberSelection === 'manual') {
                    if ((service.mobile && service.mobile.accessNbr && service.mobile.gsm)) {
                      const accessNbr = service.mobile.accessNbr
                      let iccid
                      if (service.mobile.gsm.assignSIMLater === 'Y') {
                        iccid = 'dummy'
                      } else {
                        iccid = service.mobile.gsm.iccid
                      }
                      const { status, message } = await blockAccessNumber(accessNbr, iccid)
                      if (!status) {
                        await t.rollback()
                        return this.responseHelper.notFound(res, new Error(message))
                      }
                    } else {
                      await t.rollback()
                      return this.responseHelper.validationError(res, new Error('Required fields missing for blocking access number'))
                    }
                  }
                } else if (plan.prodType === 'Fixed') {
                  if (service.fixed && service.fixed.serviceNumberSelection === 'manual') {
                    if (service.fixed && service.fixed.accessNbr) {
                      const accessNbr = service.fixed.accessNbr
                      const { status, message } = await blockAccessNumber(accessNbr, 'FIXEDLINE')
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

                if (Array.isArray(service.attachments)) {
                  for (const entityId of service.attachments) {
                    await findAndUpdateAttachment(entityId, connection.connectionId, 'SERVICE', t)
                  }
                }
                let woType
                if (createCustomer && createAccount && createService) {
                  woType = 'WONC'
                } else if (createAccount && createService) {
                  woType = 'WONC-ACCSER'
                } else if (createService) {
                  woType = 'WONC-SER'
                }
                const serviceRequest = await createServiceRequest(service, customerId, accountInfo.accountId, plan, userId, serviceAddressId, connection.identificationNo, connection.connectionId, woType, kioskRefId, roleId, t, departmentId)
                if (serviceRequest) {
                  response.serviceRequest = serviceRequest
                  if (kioskRefId !== null) {
                    const kiosk = {
                      status: 'CLOSED'
                    }
                    await Kiosk.update(kiosk, { where: { referenceNo: kioskRefId }, transaction: t })
                  }
                }
              }
            }
          }
        }
      }
      if (!isEmpty(account)) {
        response.accountId = get(account[0], 'accountId', 0)
      }
      await t.commit()
      logger.debug('New customer created successfully')
      return this.responseHelper.onSuccess(res, 'customer created successfully', response)
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

  async updateCustomer(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating customer data')
      const customer = req.body
      const userId = req.userId
      const { id } = req.params
      const response = {}
      if (!customer && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let addressId
      const customerId = id
      // Getting customer info
      const customerInfo = await Customer.findOne({
        where: {
          customerId: id
        }
      })
      if (!customerInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const contactId = customerInfo.contactId
      // If user has address we will update or we will create
      if (customerInfo.addressId && Array.isArray(customer.address)) {
        const address = get(customer, 'address[0]', '')
        addressId = customerInfo.addressId
        if (address) {
          await updateAddress(address, addressId, userId, t)
        }
      } else if (Array.isArray(customer.address)) {
        const address = get(customer, 'address[0]', '')
        if (address) {
          const data = await createAddress(address, userId, t)
          if (data) {
            addressId = data.addressId
          }
        }
      }
      await updateContact(customer, contactId, userId, t)
      // Updating customer data
      const customerData = await updateCustomer(customer, userId, addressId, contactId, customerId, t)
      if (!customerData) {
        return this.responseHelper.onError(res, new Error('Error while updating customer'))
      }
      response.customerId = customerId
      // Updating account data
      if (Array.isArray(customer.account)) {
        for (const accounts of customer.account) {
          let accountAddressId
          let accountContactId
          if (accounts.accountId) {
            response.accountId = accounts.accountId
            const accountInfo = await Account.findOne({
              where: {
                accountId: accounts.accountId,
                customerId
              }
            })
            if (!accountInfo) {
              return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
            }
            // If user has address we will update or we will create
            if (accounts.billingAddress && accounts.billingAddress.sameAsCustomerAddress === 'yes') {
              accountAddressId = accountInfo.addressId
              accountContactId = accountInfo.contactId
              await updateAddress(accounts.billingAddress, accountAddressId, userId, t)
              await updateContact(accounts, accountContactId, userId, t)
            } else if (accounts.billingAddress && accounts.billingAddress.sameAsCustomerAddress === 'no') {
              const address = await createAddress(accounts.billingAddress, userId, t)
              if (address) {
                accountAddressId = address.addressId
              }
              const contact = await createContact(accounts, userId, t)
              if (contact) {
                accountContactId = contact.contactId
              }
            }
            // Updating account data
            await updateAccount(customerInfo.customerType, accounts, customerId, accountAddressId, accountContactId, userId, accounts.accountId, t)

            const securityQuestion = await SecurityQuestion.findOne({
              accountId: accounts.accountId
            })
            // If user has SecurityQuestion we will update or we will create
            if (securityQuestion && accounts.security) {
              await updateSecurityQuestion(accounts.security, accounts.accountId, securityQuestion.profileId)
            } else {
              await createSecurityQuestion(accounts.security, accounts.accountId)
            }
            // Updating service data
            if (Array.isArray(accounts.service)) {
              for (const service of accounts.service) {
                if (service.serviceId) {
                  let serviceAddressId
                  const serviceInfo = await Connection.findOne({
                    where: {
                      connectionId: service.serviceId,
                      accountId: accounts.accountId
                    }
                  })
                  if (!serviceInfo) {
                    return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
                  }
                  const connectionId = service.serviceId
                  // If user has address we will update or we will create
                  if (Array.isArray(service.serviceAddress)) {
                    for (const address of service.serviceAddress) {
                      if (serviceAddressId && address.sameAsBillingAddress === 'yes') {
                        serviceAddressId = serviceInfo.addressId
                        await updateAddress(address, serviceAddressId, userId, t)
                      } else if (address.sameAsBillingAddress === 'no') {
                        const addressInfo = await createAddress(address, userId, t)
                        if (addressInfo) {
                          serviceAddressId = addressInfo.addressId
                        }
                      }
                    }
                  }

                  const planId = get(service, 'product', '')
                  const connectionPlanInfo = await ConnectionPlan.findOne({
                    where: {
                      connectionId
                    }
                  })
                  if (connectionPlanInfo) {
                    // If user has selected new plan then need to update the connection plan table
                    if (planId !== connectionPlanInfo.planId) {
                      const plan = await Plan.findOne({
                        where: {
                          planId: get(service, 'product', '')
                        }
                      })
                      const prodCatalogue = get(service, 'catalog', '')
                      await updateConnectionPlan(plan, userId, connectionId, connectionPlanInfo.connPlanId, prodCatalogue, t)
                    }
                  }
                  // Updating Service data
                  const connection = await updateConnection(service, serviceAddressId, userId, connectionId, accounts.accountId, t)
                  if (connection) {
                    response.serviceId = connection.connectionId
                  }

                  // const serviceRequest = await createServiceRequest(customerId, accountInfo.accountId, plan, userId, t)
                  // if (serviceRequest) {
                  //   response.serviceRequest = serviceRequest
                  // }
                }
              }
            }
          }
        }
      }
      await t.commit()
      logger.debug('Customer data updated successfully')
      return this.responseHelper.onSuccess(res, 'customer updated successfully', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while updating customer'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getCustomer(req, res) {
    try {
      logger.debug('Getting Customer details by ID')
      const { id } = req.params
      // const { serviceId } = req.query
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let response = {}
      const customer = await Customer.findOne({
        include: [{ model: Address, as: 'address' },
        {
          model: Contact,
          as: 'contact',
          include: [
            { model: BusinessEntity, as: 'contactTypeDesc', attributes: ['code', 'description'] }
          ]
        },

        { model: BusinessEntity, as: 'class', attributes: ['code', 'description'] },
        { model: BusinessEntity, as: 'category', attributes: ['code', 'description'] }],
        where: {
          customerId: id
        }
      })
      if (!customer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      response = customer.dataValues
      // Get the single account details
      // let account = await Account.findOne({
      //   include: [{ model: Address, as: 'address' }, { model: Contact, as: 'contact' }],
      //   where: {
      //     customerId: id
      //   }
      // })
      // const accountId = account.accountId
      // if (account) {
      //   const securityQuestion = await SecurityQuestion.findOne({
      //     where: {
      //       refId: accountId
      //     }
      //   })
      //   if (securityQuestion) {
      //     account = {
      //       ...account.dataValues,
      //       securityQuestion
      //     }
      //   }
      //   const whereClause = {
      //     accountId
      //   }
      //   if (serviceId) {
      //     whereClause.connectionId = serviceId
      //   }
      //   // Get the single service details
      //   const service = await Connection.findOne({
      //     include: [
      //       { model: Address, as: 'address' },
      //       {
      //         model: ConnectionPlan,
      //         as: 'conn_plan',
      //         include: [{ model: Plan, as: 'plan' }]
      //       }
      //     ],
      //     where: whereClause
      //   })
      //   if (service) {
      //     account = {
      //       ...account,
      //       service: [service]
      //     }
      //   }
      //   response = {
      //     ...response,
      //     account: [account]
      //   }
      // }
      response = transformCustomerResponse(response)
      logger.debug('Successfully fetch customer data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Customer data')
      return this.responseHelper.onError(res, new Error('Error while fetching Customer data'))
    }
  }

  // async searchCustomer (req, res) {
  //   try {
  //     logger.debug('Search Customer details by ID')
  //     const searchParams = req.body
  //     const { limit = 10, page = 0 } = req.query
  //     const offSet = (page * limit)
  //     if (!searchParams || !searchParams.searchType ||
  //       (searchParams.searchType !== 'QUICK_SEARCH' && searchParams.searchType !== 'ADV_SEARCH')) {
  //       return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
  //     }

  //     if (searchParams.searchType === 'QUICK_SEARCH' &&
  //       (!searchParams.customerQuickSearchInput || searchParams.customerQuickSearchInput === '')) {
  //       return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
  //     }

  //     let response
  //     if (searchParams.searchType === 'QUICK_SEARCH') {
  //       let query = `select cu.customer_id, concat(cu.first_name ,' ',cu.last_name) as customer_name, 
  //                   acc.account_id, cc.connection_id as service_id, cc.identification_no as access_nbr,
  //                   concat(acc.first_name, ' ', acc.last_name) as account_name, c2.contact_type, p.prod_type,
  //                   acc.account_no, cu.crm_customer_no, 
  //                   cu.status as customer_status, 
  //                   be.description as customer_status_desc,
  //                   acc.status as account_status,
  //                   be1.description as account_status_desc, 
  //                   con.email as account_email,con.contact_no as account_contact_no, 
  //                   cc.status as service_status,
  //                   be2.description as service_status_desc
  //                   from customers as cu 
  //                   left join contacts c2 on cu.contact_id  = c2.contact_id
  //                   inner join accounts acc on acc.customer_id = cu.customer_id
  //                   inner join connections cc on cc.account_id =acc.account_id
  //                   left  join contacts as con on con.contact_id  = acc.contact_id
  //                   left  join business_entity be on cu.status = be.code 
  //                   left  join business_entity be1 on acc.status = be1.code 
  //                   left  join business_entity be2 on cc.status = be2.code
  //                   inner join plan p on CAST(cc.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id `

  //       const whereClause = ` where (cast(cu.customer_id as varchar)= CAST($searchInput as varchar) or 
  //                           cast(acc.account_id as varchar) = CAST($searchInput as varchar) or 
  //                           cc.identification_no = CAST($searchInput as varchar) or 
  //                           cu.crm_Customer_no = CAST($searchInput as VARCHAR) or 
  //                           cast(acc.account_no as varchar) = CAST($searchInput as varchar)) 
  //                           and cc.status not in ('PENDING-TELEPORT', 'PENDING-RELOCATE') `
  //       /*
  //       if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
  //         whereClause = whereClause + ' and (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') '
  //       }
  //       */
  //       if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
  //         const filters = searchCustomerWithFilters(searchParams.filters)
  //         if (filters !== '') {
  //           if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
  //             query = query + ' where ' + filters + ' (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') '
  //           } else {
  //             query = query + ' where ' + filters
  //             query = query.substring(0, query.lastIndexOf('and'))
  //           }
  //         }
  //       } else {
  //         query = query + whereClause
  //       }
  //       query = query + ' and p.plan_type = \'BASE\' order by cu.crm_customer_no  ASC, cu.customer_id, acc.account_id, cc.identification_no '
  //       const count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
  //         bind: {
  //           searchInput: searchParams.customerQuickSearchInput
  //         },
  //         type: QueryTypes.SELECT
  //       })
  //       if (req.query.page && req.query.limit) {
  //         query = query + ' limit ' + limit + ' offset ' + offSet
  //       }
  //       let rows = await sequelize.query(query, {
  //         bind: {
  //           searchInput: searchParams.customerQuickSearchInput
  //         },
  //         type: QueryTypes.SELECT
  //       })
  //       rows = camelCaseConversion(rows)

  //       if (rows.length > 0 & count.length > 0) {
  //         response = {
  //           rows,
  //           count: count[0].count
  //         }
  //       }
  //     } else if (searchParams.searchType === 'ADV_SEARCH') {
  //       let query = `select cu.customer_id, concat(cu.first_name ,' ',cu.last_name) as customer_name, 
  //                     acc.account_id, cc.connection_id as service_id, cc.identification_no as access_nbr,
  //                     concat(acc.first_name, ' ', acc.last_name) as account_name, c2.contact_no, p.prod_type,
  //                     acc.account_no, cu.status as customer_status, 
  //                     be.description as customer_status_desc, 
  //                     acc.status as account_status,
  //                     be1.description as account_status_desc, 
  //                     cc.status as service_status, be2.description as service_status_desc,
  //                     acc.id_value, cu.crm_customer_no as customer_no,
  //                     con.email as account_email, con.contact_no as account_contact_no
  //                     from customers as cu 
  //                     inner join contacts c2 on cu.contact_id  = c2.contact_id
  //                     inner join accounts acc on acc.customer_id = cu.customer_id
  //                     inner join connections cc on cc.account_id =acc.account_id
  //                     left  join contacts as con on con.contact_id  = acc.contact_id
  //                     left  join business_entity be on cu.status = be.code 
  //                     left  join business_entity be1 on acc.status = be1.code
  //                     left  join business_entity be2 on cc.status = be2.code 
  //                     inner join plan p on CAST(cc.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id `
  //       let whereClause = ' where cc.status not in (\'PENDING-TELEPORT\', \'PENDING-RELOCATE\') and'
  //       /*
  //       if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
  //         whereClause = whereClause + ' (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') and '
  //       }
  //       */
  //       if (searchParams.customerId && searchParams.customerId !== '' && searchParams.customerId !== undefined) {
  //         whereClause = whereClause + ' cast(cu.customer_id as varchar) like \'%' + searchParams.customerId.toString() + '%\' and '
  //       }
  //       if (searchParams.accountId && searchParams.accountId !== '' && searchParams.accountId !== undefined) {
  //         whereClause = whereClause + ' cast(acc.account_id as varchar) like \'%' + searchParams.accountId.toString() + '%\' and '
  //       }
  //       if (searchParams.customerName && searchParams.customerName !== '' && searchParams.customerName !== undefined) {
  //         whereClause = whereClause + '(cu.first_name Ilike \'%' + searchParams.customerName + '%\' or cu.last_name Ilike \'%' +
  //           searchParams.customerName + '%\' or concat(cu.first_name,\' \',cu.last_name) Ilike \'%' +
  //           searchParams.customerName + '%\') and '
  //       }
  //       if (searchParams.accountName && searchParams.accountName !== '' && searchParams.accountName !== undefined) {
  //         whereClause = whereClause + '(acc.first_name Ilike \'%' + searchParams.accountName + '%\' or acc.last_name Ilike \'%' +
  //           searchParams.accountName + '%\' or concat(acc.first_name,\' \',acc.last_name) Ilike \'%' +
  //           searchParams.accountName + '%\') and '
  //       }
  //       if (searchParams.serviceNumber && searchParams.serviceNumber !== '' && searchParams.serviceNumber !== undefined) {
  //         whereClause = whereClause + ' cast(cc.identification_no as varchar) like \'%' + searchParams.serviceNumber.toString() + '%\' and '
  //       }
  //       if (searchParams.accountNumber && searchParams.accountNumber !== '' && searchParams.accountNumber !== undefined) {
  //         whereClause = whereClause + ' cast(acc.account_no as varchar) like \'%' + searchParams.accountNumber.toString() + '%\' and '
  //       }
  //       if (searchParams.customerNumber && searchParams.customerNumber !== '' && searchParams.customerNumber !== undefined) {
  //         whereClause = whereClause + ' cast(cu.crm_customer_no as varchar) like \'%' + searchParams.customerNumber.toString() + '%\' and '
  //       }
  //       if (searchParams.primaryContactNumber && searchParams.primaryContactNumber !== '' && searchParams.primaryContactNumber !== undefined) {
  //         whereClause = whereClause + ' cast(c2.contact_no as varchar) like \'%' + searchParams.primaryContactNumber.toString() + '%\' and '
  //       }
  //       if (searchParams.idValue && searchParams.idValue !== '' && searchParams.idValue !== undefined) {
  //         whereClause = whereClause + ' cast(acc.id_value as varchar) like \'%' + searchParams.idValue.toString() + '%\' and '
  //       }
  //       if (searchParams.idType && searchParams.idType !== '' && searchParams.idType !== undefined) {
  //         whereClause = whereClause + ' cast(acc.id_type as varchar) like \'%' + searchParams.idType.toString() + '%\' and '
  //       }

  //       // whereClause = whereClause + ' p.plan_type = \'BASE\' order by cu.crm_customer_no ASC, cu.customer_id, acc.account_id, cc.identification_no'

  //       if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
  //         const filters = searchCustomerWithFilters(searchParams.filters)

  //         if (filters !== '') {
  //           if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
  //             query = query + ' where ' + filters + ' (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') '
  //           } else {
  //             query = query + ' where ' + filters
  //           }
  //         }
  //       } else {
  //         query = query + whereClause
  //       }

  //       query = query + ' p.plan_type = \'BASE\' order by cu.crm_customer_no  ASC, cu.customer_id, acc.account_id, cc.identification_no '

  //       const count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
  //         type: QueryTypes.SELECT
  //       })

  //       if (req.query.page && req.query.limit) {
  //         query = query + ' limit ' + limit + ' offset ' + offSet
  //       }
  //       let rows = await sequelize.query(query, {
  //         type: QueryTypes.SELECT
  //       })
  //       rows = camelCaseConversion(rows)

  //       if (rows.length > 0 & count.length > 0) {
  //         response = {
  //           rows,
  //           count: count[0].count
  //         }
  //       }
  //     }
  //     if (!response) {
  //       logger.debug(defaultMessage.NOT_FOUND)
  //       if (searchParams.source === 'INQUIRY') {
  //         return this.responseHelper.notFound(res, new Error('Access Number not found'))
  //       } else if (searchParams.accountNumber || searchParams.serviceNumber) {
  //         return this.responseHelper.notFound(res, new Error('Records Not Found'))
  //       } else {
  //         return this.responseHelper.notFound(res, new Error('Records Not Found'))
  //       }
  //     }
  //     logger.debug('Successfully fetch customer data')
  //     return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
  //   } catch (error) {
  //     logger.error(error, 'Error while fetching Customer data')
  //     return this.responseHelper.onError(res, new Error('Records Not Found'))
  //   }
  // }
  async searchCustomer(req, res) {
    try {
      logger.debug('Search Customer details by ID')
      const searchParams = req.body
      const { limit = 10, page = 0 } = req.query
      const offSet = (page * limit)
      if (!searchParams || !searchParams.searchType ||
        (searchParams.searchType !== 'QUICK_SEARCH' && searchParams.searchType !== 'ADV_SEARCH')) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      if (searchParams.searchType === 'QUICK_SEARCH' &&
        (!searchParams.customerQuickSearchInput || searchParams.customerQuickSearchInput === '')) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let response
      if (searchParams.searchType === 'QUICK_SEARCH') {
        let query = `select cu.customer_id, concat(cu.first_name ,' ',cu.last_name) as customer_name, 
                    acc.account_id, cc.connection_id as service_id, cc.identification_no as access_nbr,
                    concat(acc.first_name, ' ', acc.last_name) as account_name, c2.contact_type, p.prod_type,
                    acc.account_no, cu.crm_customer_no, 
                    cu.status as customer_status, 
                    be.description as customer_status_desc,
                    acc.status as account_status,
                    be1.description as account_status_desc, 
                    con.email as account_email,con.contact_no as account_contact_no, 
                    cc.status as service_status,
                    be2.description as service_status_desc
                    from customers as cu 
                    left join contacts c2 on cu.contact_id  = c2.contact_id
                    inner join accounts acc on acc.customer_id = cu.customer_id
                    inner join connections cc on cc.account_id =acc.account_id
                    left  join contacts as con on con.contact_id  = acc.contact_id
                    left  join business_entity be on cu.status = be.code 
                    left  join business_entity be1 on acc.status = be1.code 
                    left  join business_entity be2 on cc.status = be2.code
                    inner join plan p on CAST(cc.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id `

        const whereClause = ` where (cast(cu.customer_id as varchar)= CAST($searchInput as varchar) or 
                            cast(acc.account_id as varchar) = CAST($searchInput as varchar) or 
                            cc.identification_no = CAST($searchInput as varchar) or 
                            cu.crm_Customer_no = CAST($searchInput as VARCHAR) or 
                            cast(acc.account_no as varchar) = CAST($searchInput as varchar)) 
                            and cc.status not in ('PENDING-TELEPORT', 'PENDING-RELOCATE') `
        /*
        if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
          whereClause = whereClause + ' and (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') '
        }
        */
        if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
          const filters = searchCustomerWithFilters(searchParams.filters)
          if (filters !== '') {
            if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
              query = query + ' where ' + filters + ' (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') '
            } else {
              query = query + ' where ' + filters
              query = query.substring(0, query.lastIndexOf('and'))
            }
          }
        } else {
          query = query + whereClause
        }
        query = query + ' and p.plan_type = \'BASE\' order by cu.crm_customer_no  ASC, cu.customer_id, acc.account_id, cc.identification_no '
        const count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
          bind: {
            searchInput: searchParams.customerQuickSearchInput
          },
          type: QueryTypes.SELECT
        })
        if (req.query.page && req.query.limit) {
          query = query + ' limit ' + limit + ' offset ' + offSet
        }
        let rows = await sequelize.query(query, {
          bind: {
            searchInput: searchParams.customerQuickSearchInput
          },
          type: QueryTypes.SELECT
        })
        rows = camelCaseConversion(rows)

        if (rows.length > 0 & count.length > 0) {
          response = {
            rows,
            count: count[0].count
          }
        }
      } else if (searchParams.searchType === 'ADV_SEARCH') {
        let query = `select cu.customer_id, concat(cu.first_name ,' ',cu.last_name) as customer_name, 
                      acc.account_id, cc.connection_id as service_id, cc.identification_no as access_nbr,
                      concat(acc.first_name, ' ', acc.last_name) as account_name, c2.contact_no, p.prod_type,
                      acc.account_no, cu.status as customer_status, 
                      be.description as customer_status_desc, 
                      acc.status as account_status,
                      be1.description as account_status_desc, 
                      cc.status as service_status, be2.description as service_status_desc,
                      acc.id_value, cu.crm_customer_no as customer_no,
                      con.email as account_email, con.contact_no as account_contact_no
                      from customers as cu 
                      inner join contacts c2 on cu.contact_id  = c2.contact_id
                      inner join accounts acc on acc.customer_id = cu.customer_id
                      inner join connections cc on cc.account_id =acc.account_id
                      left  join contacts as con on con.contact_id  = acc.contact_id
                      left  join business_entity be on cu.status = be.code 
                      left  join business_entity be1 on acc.status = be1.code
                      left  join business_entity be2 on cc.status = be2.code 
                      inner join plan p on CAST(cc.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id `
        let whereClause = ' where cc.status not in (\'PENDING-TELEPORT\', \'PENDING-RELOCATE\') and'
        /*
        if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
          whereClause = whereClause + ' (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') and '
        }
        */
        if (searchParams.customerId && searchParams.customerId !== '' && searchParams.customerId !== undefined) {
          whereClause = whereClause + ' cast(cu.customer_id as varchar) like \'%' + searchParams.customerId.toString() + '%\' and '
        }
        if (searchParams.accountId && searchParams.accountId !== '' && searchParams.accountId !== undefined) {
          whereClause = whereClause + ' cast(acc.account_id as varchar) like \'%' + searchParams.accountId.toString() + '%\' and '
        }
        if (searchParams.customerName && searchParams.customerName !== '' && searchParams.customerName !== undefined) {
          whereClause = whereClause + '(cu.first_name Ilike \'%' + searchParams.customerName + '%\' or cu.last_name Ilike \'%' +
            searchParams.customerName + '%\' or concat(cu.first_name,\' \',cu.last_name) Ilike \'%' +
            searchParams.customerName + '%\') and '
        }
        if (searchParams.accountName && searchParams.accountName !== '' && searchParams.accountName !== undefined) {
          whereClause = whereClause + '(acc.first_name Ilike \'%' + searchParams.accountName + '%\' or acc.last_name Ilike \'%' +
            searchParams.accountName + '%\' or concat(acc.first_name,\' \',acc.last_name) Ilike \'%' +
            searchParams.accountName + '%\') and '
        }
        if (searchParams.serviceNumber && searchParams.serviceNumber !== '' && searchParams.serviceNumber !== undefined) {
          whereClause = whereClause + ' cast(cc.identification_no as varchar) like \'%' + searchParams.serviceNumber.toString() + '%\' or ' +
            ' cast(acc.account_no as varchar) like \'%' + searchParams.serviceNumber.toString() + '%\' and '
        }
        // if (searchParams.accountNumber && searchParams.accountNumber !== '' && searchParams.accountNumber !== undefined) {
        //   whereClause = whereClause + ' cast(acc.account_no as varchar) like \'%' + searchParams.accountNumber.toString() + '%\' and '
        // }
        if (searchParams.customerNumber && searchParams.customerNumber !== '' && searchParams.customerNumber !== undefined) {
          whereClause = whereClause + ' cast(cu.crm_customer_no as varchar) like \'%' + searchParams.customerNumber.toString() + '%\' and '
        }
        if (searchParams.primaryContactNumber && searchParams.primaryContactNumber !== '' && searchParams.primaryContactNumber !== undefined) {
          whereClause = whereClause + ' cast(c2.contact_no as varchar) like \'%' + searchParams.primaryContactNumber.toString() + '%\' and '
        }
        if (searchParams.idValue && searchParams.idValue !== '' && searchParams.idValue !== undefined) {
          whereClause = whereClause + ' cast(acc.id_value as varchar) like \'%' + searchParams.idValue.toString() + '%\' and '
        }
        if (searchParams.idType && searchParams.idType !== '' && searchParams.idType !== undefined) {
          whereClause = whereClause + ' cast(acc.id_type as varchar) like \'%' + searchParams.idType.toString() + '%\' and '
        }

        // whereClause = whereClause + ' p.plan_type = \'BASE\' order by cu.crm_customer_no ASC, cu.customer_id, acc.account_id, cc.identification_no'

        if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
          const filters = searchCustomerWithFilters(searchParams.filters)

          if (filters !== '') {
            if (searchParams.source === 'COMPLAINT' || searchParams.source === 'INQUIRY') {
              query = query + ' where ' + filters + ' (p.prod_type = \'Prepaid\' or p.prod_type = \'Postpaid\' or p.prod_type=\'Fixed\') '
            } else {
              query = query + ' where ' + filters
            }
          }
        } else {
          query = query + whereClause
        }

        query = query + ' p.plan_type = \'BASE\' order by cu.crm_customer_no  ASC, cu.customer_id, acc.account_id, cc.identification_no '

        const count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
          type: QueryTypes.SELECT,
        })

        if (req.query.page && req.query.limit) {
          query = query + ' limit ' + limit + ' offset ' + offSet
        }
        let rows = await sequelize.query(query, {
          type: QueryTypes.SELECT
        })
        rows = camelCaseConversion(rows)

        if (rows.length > 0 & count.length > 0) {
          response = {
            rows,
            count: count[0].count
          }
        }
      }
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        if (searchParams.source === 'INQUIRY') {
          const data = {
            count: 0,
            rows: []
          }
          return this.responseHelper.onSuccess(res, 'No Records found', data)
        } else if (searchParams.accountNumber || searchParams.serviceNumber) {
          return this.responseHelper.notFound(res, new Error('Records Not Found'))
        } else {
          return this.responseHelper.notFound(res, new Error('Records Not Found'))
        }
      }
      logger.debug('Successfully fetch customer data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Customer data')
      return this.responseHelper.onError(res, new Error('Records Not Found'))
    }
  }

  async getAccountIdList(req, res) {
    try {
      logger.debug('Getting accounts id  list details by customer id')
      const { id } = req.params
      let response = {}
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const cusromer = await Customer.findOne({
        attributes: ['customerId'],
        include: [{
          attributes: ['accountId', 'accountNo', 'status'],
          model: Account,
          as: 'account'
        }],
        where: {
          customerId: id
        }
      })
      if (!cusromer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      response = cusromer.dataValues
      logger.debug('Successfully fetch customer accounts id  list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Customer accounts id  list')
      return this.responseHelper.onError(res, new Error('Error while fetching Customer accounts id  list'))
    }
  }

  async getAccounts(req, res) {
    try {
      logger.debug('Getting accounts details by Customer ID')
      const { id } = req?.params
      const accountId = req?.query['account-id']
      if (!accountId || !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const account = await Account.findOne({
        include: [
          { model: Address, as: 'address' },
          {
            model: Contact,
            as: 'contact',
            include: [
              {
                model: BusinessEntity,
                as: 'contactTypeDesc',
                attributes: ['code', 'description']
              }
            ]
          },
          { model: BusinessEntity, as: 'acct_catg', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'acct_class', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'acct_prty', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'id_typ', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'coll_plan', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'prty', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'bill_dlvy_mthd', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'bill_language', attributes: ['code', 'description'] }
        ],
        where: {
          accountId: accountId,
          customerId: id
        }
      })

      if (!account) {
        logger.debug('Account not found for account id', accountId)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const securityQuestion = await SecurityQuestion.findOne({
        include: [
          { model: BusinessEntity, as: 'sec_q', attributes: ['code', 'description'] }
        ],
        where: {
          profileId: account?.sqRefId
        }
      })
      if (securityQuestion) {
        account.securityQuestion = securityQuestion
      } else {
        logger.debug('Security question details not found for ', account?.sqRefId)
      }

      // console.log(JSON.stringify(account, null, 2))
      const accountResponse = transformAccountResponse(account)

      const connections = await Connection.findAll({
        attributes: ['connectionId'],
        where: {
          accountId: accountId
        }
      })
      // console.log('connections', connections)

      const serviceIds = []
      for (const c of connections) {
        serviceIds.push({ serviceId: c?.connectionId })
      }

      if (!connections) {
        logger.debug('Security question details not found for ', account?.sqRefId)
      } else {
        accountResponse.serviceIds = serviceIds
      }
      // console.log(JSON.stringify(account, null, 2))
      logger.debug('Successfully fetch accounts details by Customer ID')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, accountResponse)
    } catch (error) {
      logger.error(error, 'Error while fetching accounts details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while fetching accounts details by Customer ID'))
    }
  }

  async transformPOC(req, res) {
    // const response = await getCustomerSummary('1')
    const response = {}
    this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
  }

  async getServicesList(req, res) {
    try {
      logger.debug('Getting Services by Customer Id and Account Id')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])
      if (!accountId || !customerId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      let where

      if (serviceId && serviceId !== '') {
        where = {
          accountId: accountId,
          connectionId: serviceId
        }
      } else {
        where = {
          accountId: accountId,
          status: {
            [Op.notIn]: ['PD-TR', 'PENDING-TELEPORT', 'PENDING-RELOCATE']
          }
        }
      }

      // console.log('where', where)
      const services = await Connection.findAll({
        include: [
          { model: Address, as: 'address' },
          { model: BusinessEntity, as: 'dep_chrg', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'conn_grp', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'conn_typ', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'crd_prf', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'dlrshp', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'exchCd', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'pymt_mthd', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'serviceStatus', attributes: ['code', 'description'] }
        ],
        where: where
      })

      // console.log(JSON.stringify(services, null, 2))

      if (!services) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const response = []
      for (const svc of services) {
        // console.log('svc.mappingPayload', svc.connectionId, svc.mappingPayload)
        if (svc.mappingPayload && svc.mappingPayload.plans && svc.mappingPayload.plans.length > 0) {
          const planIds = []
          // console.log('svc.mappingPayload.plans', svc.mappingPayload.plans)
          svc.mappingPayload.plans.forEach((e) => planIds.push(e.planId))
          // console.log('planIds', planIds)
          const planDetails = await Plan.findAll({
            include: [
              { model: PlanOffer, as: 'planoffer' }
            ],
            where: {
              planId: planIds,
              planType: 'BASE'
            }
          })
          const planDetailsTransformed = transformPlanResponse(planDetails)
          // let planName
          // let product
          // let networkType
          for (const p of planDetailsTransformed) {
            if (p.planType === 'BASE') {
              svc.product = p.planId
              svc.planName = p.planName
              svc.networkType = p.networkType
              svc.prodType = p.prodType
              const val1 = svc.charge
              svc.depositChg = val1
              svc.charge = p.charge
            }
          }
          delete svc.mappingPayload
          const transformedService = transformServiceResponse(svc)
          transformedService.plans = planDetailsTransformed
          transformedService.realtimeLoaded = false
          transformedService.realtime = {}
          if (transformedService.status === 'PENDING') {
            transformedService.badge = await getServiceBadge(customerId, accountId, transformedService.serviceId)
          } else {
            transformedService.badge = ''
          }
          response.push(transformedService)
        }
      }

      logger.debug('Successfully fetch accounts details by Customer ID')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching accounts details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while fetching accounts details by Customer ID'))
    }
  }

  async getServiceBadge(req, res) {
    try {
      logger.debug('Getting Service Badge by Customer, Account & Service')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])
      if (!accountId || !customerId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      const badge = await getServiceBadge(customerId, accountId, serviceId)

      logger.debug('Successfully fetched badge details')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, { badge: badge })
    } catch (error) {
      logger.error(error, 'Successfully fetched badge details')
      return this.responseHelper.onError(res, new Error('Successfully fetched badge details'))
    }
  }

  async getServiceRealtime(req, res) {
    try {
      logger.debug('Getting Realtime details for Customer Id, Account Id and Service')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])
      if (!accountId || !customerId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      const service = await Connection.findOne({
        where: {
          connectionId: serviceId,
          accountId: accountId
        }
      })

      if (!service) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      let realtime = {}

      if (service.mappingPayload && service.mappingPayload.plans && service.mappingPayload.plans.length > 0) {
        const planDetails = await Plan.findOne({
          where: {
            planId: service.mappingPayload.plans[0].planId,
            planType: 'BASE'
          }
        })

        if (!planDetails) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Plan not found'))
        }
        // console.log('realtime', service.identificationNo, planDetails.prodType)

        realtime = await getRealtimeServiceDetails(service.identificationNo, planDetails.prodType, 'false')
      }
      logger.debug('Successfully fetch accounts details by Customer ID')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, realtime)
    } catch (error) {
      logger.error(error, 'Error while fetching accounts details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while fetching accounts details by Customer ID'))
    }
  }

  async getActiveBoostersforService(req, res) {
    try {
      logger.debug('Getting topups for a service')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])

      if (!accountId || !customerId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const service = await Connection.findOne({
        where: {
          connectionId: serviceId,
          accountId: accountId
        }
      })

      if (!service) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      let realtime = {}

      if (service.mappingPayload && service.mappingPayload.plans && service.mappingPayload.plans.length > 0) {
        const planDetails = await Plan.findOne({
          where: {
            planId: service.mappingPayload.plans[0].planId,
            planType: 'BASE'
          }
        })

        if (!planDetails) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Plan not found'))
        }
        // console.log('realtime', service.identificationNo, planDetails.prodType)

        realtime = await getRealtimeServiceDetails(service.identificationNo, planDetails.prodType, 'false')
      }
      const offers = (realtime && realtime.offers) ? realtime.offers : null
      const offerIds = []; const txnRefnum = []; const response = []
      if (Array.isArray(offers)) {
        // offers.forEach(e => { offerIds.push(e.offerId); txnRefnum.push(e.productId) })
        const planItems = await Plan.findAll({
          include: [{
            model: PlanOffer, as: 'planoffer'
          }
          ],
          where: {
            planType: 'BOOSTER'
          }
        })
        const planResponse = transformPlanResponse(planItems)
        planResponse.forEach(e => {
          for (let i = 0; i < offers.length; i++) {
            // console.log('respone of e==>',offers[i].offerId,'::',e.offers[0].offerId)
            if (offers[i].offerId === e.offers[0].offerId) {
              // console.log('inside if of e==>',e.offers[0].planId)

              const loadValues = {
                planId: e.planId,
                prodType: e.prodType,
                planName: e.planName,
                bandwidth: null,
                networkType: null,
                charge: e.charge,
                validity: e.validity ? e.validity : null,
                refillProfileId: e.refillProfileId,
                planType: 'BOOSTER',
                quota: e.offers[0].quota,
                value: offers[i].value ? offers[i].value : '',
                units: e.offers[0].units,
                offerType: e.offers[0].offerType,
                txnReference: offers[i].productId ? offers[i].productId : '',
                startDate: offers[i].startDate ? offers[i].startDate : '',
                expiryDate: offers[i].expiryDate ? offers[i].expiryDate : '',
                UsageType: offers[i].usageType ? offers[i].usageType : '',
                AccumulatedUsage: offers[i].accumulatedUsage ? offers[i].accumulatedUsage : '',
                Limit: offers[i].Limit ? offers[i].Limit : '',
                status: (new Date(offers[i].expiryDate) >= new Date(offers[i].startDate)) ? 'ACTIVE' : 'INACTIVE'
              }
              response.push(loadValues)
            }
          }
        })
      }
      // console.log(response)
      logger.debug('Successfully fetch accounts details by Customer ID')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching accounts details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while fetching accounts details by Customer ID'))
    }
  }

  /*
  async getActiveBoostersforService (req, res) {
    try {
      logger.debug('Getting topups for a service')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])
      let realtime = req.query.realtime
      console.log('realtime ',realtime)
      if (!accountId || !customerId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      if (realtime !== undefined && realtime !== 'true' && realtime !== 'false') {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      } else {
        if (realtime === undefined) {
          realtime = true
        } else {
          realtime = eval(realtime)
        }
      }

      const connectionPlanDetails = await ConnectionPlan.findAll({
        include: [
          {
            model: Plan,
            as: 'plan',
            include: [
              { model: PlanOffer, as: 'planoffer' }
            ],
            where: {
              planType: 'BOOSTER'
            }

          }
        ],
        where: {
          connectionId: serviceId,
          status: ['ACTIVE']
        },
        order: [
          ['connPlanId', 'DESC']
        ]
      })
        //console.log('connectionPlanDetails ',connectionPlanDetails)
      if (!connectionPlanDetails) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const response = transformConnectionPlanResponse(connectionPlanDetails)

      logger.debug('Successfully fetch accounts details by Customer ID')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching accounts details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while fetching accounts details by Customer ID'))
    }
  }
*/
  async getPurchaseHistoryforService(req, res) {
    try {
      logger.debug('Getting purchase history for a service')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])

      let limit = Number(req.query.limit)
      let offset = Number(req.query.offset)

      let realtime = req.query.realtime
      if (!accountId || !customerId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      if (realtime !== undefined && realtime !== 'true' && realtime !== 'false') {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      } else {
        if (realtime === undefined) {
          realtime = true
        } else {
          realtime = eval(realtime)
        }
      }

      if (limit === undefined || isNaN(limit)) {
        limit = 10
      }

      if (offset === undefined || isNaN(offset)) {
        offset = 0
      }

      // console.log('limit', limit, 'offset', offset)

      const connectionPlanDetails = await ConnectionPlan.findAndCountAll({
        attributes: ['connPlanId', 'planId', 'connectionId', 'status', 'createdAt', 'createdBy'],
        include: [
          {
            model: Plan,
            as: 'plan',
            attributes: ['planId', 'planName', 'prodType', 'planType', 'charge'],
            include: [
              { model: PlanOffer, as: 'planoffer' }
            ],
            where: {
              [Op.and]: [
                sequelize.literal(' plan_type IN (\'BOOSTER\', \'TOPUP\') ')
              ]
            }
          },
          { model: BusinessEntity, as: 'connPlanStatus', attributes: ['code', 'description'] },
          { model: User, as: 'createdByUser', attributes: ['title', 'firstName', 'lastName'] }
        ],
        where: {
          connectionId: serviceId
        },
        order: [
          [sequelize.literal(` "ConnectionPlan"."created_at" desc limit ${limit} offset ${offset} `)]
        ]
      })

      // console.log(JSON.stringify(connectionPlanDetails, null, 2))

      // const connectionPlanDetails = await ConnectionPlan.findAll({
      //   limit: 5,
      //   offset: 1,
      //   attributes: ['connPlanId', 'connectionId', 'status', 'createdAt', 'createdBy'],
      //   include: [
      //     {
      //       model: Plan,
      //       as: 'plan',
      //       attributes: ['planName', 'prodType', 'planType', 'charge'],
      //       include: [
      //         { model: BusinessEntity, as: 'planTypeLookup', attributes: ['code', 'description'] },
      //         { model: PlanOffer, as: 'planoffer' }
      //       ],
      //       where: {
      //         planType: ['TOPUP', 'BOOSTER']
      //       }
      //     },
      //     { model: BusinessEntity, as: 'connPlanStatus', attributes: ['code', 'description'] },
      //     { model: User, as: 'createdByUser', attributes: ['title', 'firstName', 'lastName'] },
      //   ],
      //   where: {
      //     connectionId: serviceId
      //   },
      //   order: [
      //     ['createdAt', 'DESC']
      //   ]
      // })

      if (!connectionPlanDetails) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }

      const response = {
        rows: transformPurchaseHistoryResponse(connectionPlanDetails.rows),
        count: connectionPlanDetails.count
      }

      // for (let svc of services) {
      //   //console.log('svc.mappingPayload', svc.connectionId, svc.mappingPayload)
      //   if (svc.mappingPayload && svc.mappingPayload.plans && svc.mappingPayload.plans.length > 0) {
      //     const planIds = []
      //     //console.log('svc.mappingPayload.plans', svc.mappingPayload.plans)
      //     svc.mappingPayload.plans.forEach((e) => planIds.push(e.planId))
      //     //console.log('planIds', planIds)
      //     const planDetails = await Plan.findAll({
      //       include: [
      //         { model: PlanOffer, as: 'planoffer' }
      //       ],
      //       where: {
      //         planId: planIds,
      //         planType: 'BASE'
      //       }
      //     })
      //     const planDetailsTransformed = transformPlanResponse(planDetails)
      //     let planName
      //     let product
      //     let networkType
      //     for (let p of planDetailsTransformed) {
      //       if (p.planType === 'BASE') {
      //         svc.product = p.planId
      //         svc.planName = p.planName
      //         svc.networkType = p.networkType
      //         svc.prodType = p.prodType
      //         svc.charge = p.charge
      //       }
      //     }
      //     delete svc.mappingPayload
      //     const transformedService = transformServiceResponse(svc)
      //     transformedService.plans = planDetailsTransformed
      //     response.push(transformedService)
      //   }
      // }
      // console.log('Getting realtime ', customerId, accountId, realtime)
      // for (const s of response) {
      //   if(realtime) {
      //   //s.realtime = await getRealtimeServiceDetails(s.accessNbr, s.prodType)
      //   } else {
      //     s.realtime = {}
      //   }
      // }

      logger.debug('Successfully fetch accounts details by Customer ID')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching accounts details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while fetching accounts details by Customer ID'))
    }
  }

  async getActiveVAS(req, res) {
    try {
      logger.debug('Getting current VAS for a service')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])
      let realtime = req.query.realtime
      if (!accountId || !customerId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      if (realtime !== undefined && realtime !== 'true' && realtime !== 'false') {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      } else {
        if (realtime === undefined) {
          realtime = true
        } else {
          realtime = eval(realtime)
        }
      }

      const connectionPlanDetails = await ConnectionPlan.findAll({
        include: [
          {
            model: Plan,
            as: 'plan',
            include: [
              { model: PlanOffer, as: 'planoffer' }
            ],
            where: {
              planType: 'VAS',
              status: 'AC'
            }
          }
        ],
        where: {
          connectionId: serviceId,
          status: ['PENDING', 'ACTIVE']
        }
      })

      if (!connectionPlanDetails) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const response = transformConnectionPlanResponse(connectionPlanDetails)
      response.realtime = {}
      // for (let svc of services) {
      //   //console.log('svc.mappingPayload', svc.connectionId, svc.mappingPayload)
      //   if (svc.mappingPayload && svc.mappingPayload.plans && svc.mappingPayload.plans.length > 0) {
      //     const planIds = []
      //     //console.log('svc.mappingPayload.plans', svc.mappingPayload.plans)
      //     svc.mappingPayload.plans.forEach((e) => planIds.push(e.planId))
      //     //console.log('planIds', planIds)
      //     const planDetails = await Plan.findAll({
      //       include: [
      //         { model: PlanOffer, as: 'planoffer' }
      //       ],
      //       where: {
      //         planId: planIds,
      //         planType: 'BASE'
      //       }
      //     })
      //     const planDetailsTransformed = transformPlanResponse(planDetails)
      //     let planName
      //     let product
      //     let networkType
      //     for (let p of planDetailsTransformed) {
      //       if (p.planType === 'BASE') {
      //         svc.product = p.planId
      //         svc.planName = p.planName
      //         svc.networkType = p.networkType
      //         svc.prodType = p.prodType
      //         svc.charge = p.charge
      //       }
      //     }
      //     delete svc.mappingPayload
      //     const transformedService = transformServiceResponse(svc)
      //     transformedService.plans = planDetailsTransformed
      //     response.push(transformedService)
      //   }
      // }
      // console.log('Getting realtime ', customerId, accountId, realtime)
      // for (const s of response) {
      //   if(realtime) {
      //   //s.realtime = await getRealtimeServiceDetails(s.accessNbr, s.prodType)
      //   } else {
      //     s.realtime = {}
      //   }
      // }

      logger.debug('Successfully fetch VAS by Customer ID')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while VAS details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while VAS details by Customer ID'))
    }
  }

  async getPendingPlans(req, res) {
    try {
      logger.debug('Getting pending plans')
      let { customerId } = req.params
      customerId = Number(customerId)
      const accountId = Number(req.query['account-id'])
      const serviceId = Number(req.query['service-id'])

      if (!accountId || !customerId || !serviceId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      // console.log(JSON.stringify(customer, null, 2))

      const connectionPlanDetails = await ConnectionPlan.findAll({
        include: [
          {
            model: Plan,
            as: 'plan',
            include: [
              { model: PlanOffer, as: 'planoffer' }
            ],
            where: {
              planType: 'BASE'
            }
          }
        ],
        where: {
          connectionId: serviceId,
          status: ['PENDING']
        }
      })

      let response = {}

      if (!connectionPlanDetails) {
        logger.debug('No pending connection plan found')
        return this.responseHelper.notFound(res, new Error('No pending connection plan found'))
      } else {
        const connectionData = await Connection.findOne({
          where: {
            connectionId: serviceId
          }
        })
        if (!connectionData) {
          logger.debug('Unable to find connection data')
          return this.responseHelper.notFound(res, new Error('Unable to find connection data'))
        }

        console.log(JSON.stringify(connectionData, null, 2))
        const basePlan = await Plan.findOne({ where: { planId: connectionData.mappingPayload.plans[0].planId } })
        if (!basePlan) {
          logger.debug('Unable to find base plan')
          return this.responseHelper.notFound(res, new Error('Unable to find base plan'))
        }

        response = transformConnectionPlanResponse(connectionPlanDetails)
        for (const r of response) {
          if (r.charge > basePlan.charge) {
            r.upgradeDowngrade = 'upgrade'
          }
          if (r.charge < basePlan.charge) {
            r.upgradeDowngrade = 'downgrade'
          }
        }
      }

      // for (let svc of services) {
      //   //console.log('svc.mappingPayload', svc.connectionId, svc.mappingPayload)
      //   if (svc.mappingPayload && svc.mappingPayload.plans && svc.mappingPayload.plans.length > 0) {
      //     const planIds = []
      //     //console.log('svc.mappingPayload.plans', svc.mappingPayload.plans)
      //     svc.mappingPayload.plans.forEach((e) => planIds.push(e.planId))
      //     //console.log('planIds', planIds)
      //     const planDetails = await Plan.findAll({
      //       include: [
      //         { model: PlanOffer, as: 'planoffer' }
      //       ],
      //       where: {
      //         planId: planIds,
      //         planType: 'BASE'
      //       }
      //     })
      //     const planDetailsTransformed = transformPlanResponse(planDetails)
      //     let planName
      //     let product
      //     let networkType
      //     for (let p of planDetailsTransformed) {
      //       if (p.planType === 'BASE') {
      //         svc.product = p.planId
      //         svc.planName = p.planName
      //         svc.networkType = p.networkType
      //         svc.prodType = p.prodType
      //         svc.charge = p.charge
      //       }
      //     }
      //     delete svc.mappingPayload
      //     const transformedService = transformServiceResponse(svc)
      //     transformedService.plans = planDetailsTransformed
      //     response.push(transformedService)
      //   }
      // }
      // console.log('Getting realtime ', customerId, accountId, realtime)
      // for (const s of response) {
      //   if(realtime) {
      //   //s.realtime = await getRealtimeServiceDetails(s.accessNbr, s.prodType)
      //   } else {
      //     s.realtime = {}
      //   }
      // }

      logger.debug('Successfully fetch accounts details by Customer ID')
      this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching accounts details by Customer ID')
      return this.responseHelper.onError(res, new Error('Error while fetching accounts details by Customer ID'))
    }
  }

  async getServicesSummary(req, res) {
    try {
      const { customerId } = req.params

      logger.info('Fetching service highlights for customer ', customerId)

      if (!customerId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const serviceSummary = []
      const data = await sequelize.query(`select cu.customer_id, ac.account_id, c.connection_id, c.identification_no, p.prod_type
                                            from customers cu 
                                           inner join accounts ac on cu.customer_id = ac.customer_id 
                                           inner join connections c on c.account_id  = ac.account_id
                                           inner join connection_plan cp on c.connection_id = cp.connection_id 
                                           inner join plan p on cp.plan_id = p.plan_id
                                           where cu.customer_id = $custId LIMIT 5`, {
        bind: {
          custId: customerId
        },
        type: QueryTypes.SELECT
      })
      if (!isEmpty(data)) {
        for (const r of data) {
          const summary = await getRealtimeServiceDetails(r.identification_no, r.prod_type)
          serviceSummary.push(summary)
        }
      }
      logger.debug('Successfully fetched service highlights for customer ', customerId)
      return this.responseHelper.onSuccess(res, 'Successfully fetched services summary', serviceSummary)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while fetching services summary'))
      }
    }
  }

  async bulkCustomerBillCheck(req, res) {
    try {
      logger.info('Fetching customer billing data')
      const customerData = req.body.data
      const outstanding = []
      const noOutstanding = []
      const validationFailed = []
      const completedAccounts = []
      const response = {
        outstanding,
        noOutstanding,
        validationFailed
      }
      for (const customer of customerData) {
        const connectionData = await Account.findAll({
          attributes: [],
          include: [
            { model: Contact, as: 'contact', attributes: ['contactNo'] },
            { model: Connection, as: 'service', attributes: ['identificationNo', 'mappingPayload'] }
          ],
          where: { accountNo: customer.accountNo }
        })
        if (connectionData) {
          logger.info('Connect data found')
          for (const connection of connectionData) {
            for (const plan of connection.service) {
              if (completedAccounts.includes(customer.customerNo + '-' + customer.accountNo)) {
                continue
              }
              let planData
              if (plan?.mappingPayload?.plans[0]?.planId) {
                logger.info('Connection has mapping payload')
                planData = await Plan.findOne({
                  attributes: ['prodType'],
                  where: { planId: plan.mappingPayload.plans[0].planId }
                })
              } else {
                logger.info('NO mapping payload')
                const result = {
                  remark: 'No plan found',
                  accountNo: customer.accountNo,
                  customerNo: customer.customerNo
                }
                // console.log('validationFailed', customer.accountNo)
                validationFailed.push(result)
              }
              if (planData) {
                logger.info('Plan data found', plan.identificationNo, planData.prodType)
                const customerSummary = await getRealtimeServiceDetails(plan.identificationNo, planData.prodType, 'false')
                // console.log(customerSummary)
                logger.info('Received response from tibco')
                // console.log('customerSummary?.serviceStatus', customerSummary?.serviceStatus)
                if (customerSummary?.serviceStatus === '') {
                  // console.log('customerSummary?.serviceStatus not available')
                  const result = {
                    remark: 'Access number not available',
                    accountNo: customer.accountNo,
                    customerNo: customer.customerNo,
                    accesNo: plan.identificationNo
                  }
                  // console.log('validationFailed', customer.accountNo)
                  validationFailed.push(result)
                } else {
                  const transfomrcustomerSummary = transformCustomerBillData(customerSummary)
                  logger.info('Transformation done', transfomrcustomerSummary)
                  // console.log(transfomrcustomerSummary)
                  if (transfomrcustomerSummary) {
                    if (customerSummary.outstandingAmount > 0) {
                      const data = {
                        accountNo: customer.accountNo,
                        customerNo: customer.customerNo,
                        contactNo: connection.contact.contactNo,
                        outstandingAmount: customerSummary.outstandingAmount,
                        remark: 'Outstanding found',
                        accessNbr: plan.identificationNo
                      }
                      // console.log('outstanding', customer.accountNo)
                      outstanding.push(data)
                    } else if (customerSummary.outstandingAmount < 0.01) {
                      transfomrcustomerSummary.accountNo = customer.accountNo
                      transfomrcustomerSummary.customerNo = customer.customerNo
                      transfomrcustomerSummary.remark = 'No outstanding found'
                      // console.log('noOutstanding', customer.accountNo)
                      noOutstanding.push(transfomrcustomerSummary)
                    } else {
                      // console.log('validationFailed', customer.accountNo)
                      validationFailed.push({
                        remark: 'Unable to determine outstanding',
                        accountNo: customer.accountNo,
                        customerNo: customer.customerNo
                      })
                    }
                  }
                }
              } else {
                const result = {
                  remark: 'No plan found',
                  accountNo: customer?.accountNo,
                  customerNo: customer?.customerNo
                }
                // console.log('validationFailed', customer.accountNo)
                validationFailed.push(result)
              }
              // console.log('Pushing', customer.customerNo + '-' + customer.accountNo)
              completedAccounts.push(customer.customerNo + '-' + customer.accountNo)
            }
          }
        } else {
          const result = {
            remark: 'No plan found',
            accountNo: customer?.accountNo,
            customerNo: customer?.customerNo
          }
          // console.log('validationFailed', customer.accountNo)
          validationFailed.push(result)
        }
      }
      // if (!outstanding.length > 0 && !noOutstanding.length > 0) {
      //   logger.info('No customer billing data found')
      //   return this.responseHelper.notFound(res, 'No customer billing data found')
      // }
      logger.info('Successfully fetched customer billing data')
      return this.responseHelper.onSuccess(res, 'Successfully fetched customer billing data', response)
    } catch (error) {
      logger.info(error, 'Error while fecthing customer billing data')
      return this.responseHelper.onError(res, new Error('Error while fecthing customer billing data'))
    }
  }

  async createBulkBillCollectionRecords(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating bulk bill records')
      const bulkData = req.body
      const { userId } = req
      if (!Array.isArray(bulkData?.outstanding) && !Array.isArray(bulkData?.noOutstanding)) {
        logger.info('outstanding and no outstanding must be array')
        return this.responseHelper.onError(res, 'outstanding and no outstanding must be array')
      }

      logger.info('Checking outstanding and no outstanding')
      const bullCollectionData = []
      if (bulkData.outstanding.length > 0) {
        for (const each of bulkData.outstanding) {
          logger.info('Outstanding data found')
          each.outstanding = 'Y'
          bullCollectionData.push(each)
        }
      }
      if (bulkData.noOutstanding.length > 0) {
        logger.info('No outstanding data found')
        for (const each of bulkData.noOutstanding) {
          each.outstanding = 'N'
          bullCollectionData.push(each)
        }
      }
      logger.info('Forming bulk record table data')
      const bulkUploadData = {
        bulkUploadType: bulkData?.bulkUploadType || 'CALL_COLLECTION',
        noOfRecordsAttempted: bulkData?.outstanding.length + bulkData?.noOutstanding.length,
        successfullyUploaded: bulkData?.noOutstanding.length,
        failed: bulkData?.outstanding.length,
        payload: { callCollection: bullCollectionData },
        createdBy: userId,
        updatedBy: userId
      }
      logger.info('Creating bulk record in table')
      const bulkUploadRecord = await BulkUpload.create(bulkUploadData, { transaction: t })
      if (!bulkUploadRecord) {
        logger.info('Failed to create bulk transaction data')
        return this.responseHelper.onError(res, 'Failed to create bulk transaction data')
      }

      // logger.info('Creating bulk collection record')
      // const createBillBulkData = await BulkBillCollection.bulkCreate(bullCollectionData, { transaction: t })
      await t.commit()
      // if (!createBillBulkData) {
      //   logger.info('Failed to create bulk collection data')
      //   return this.responseHelper.onError(res, 'Failed to create bulk collection data')
      // }
      logger.info('Finding bulk record data')
      const bulkTransactionData = await BulkUpload.findOne({
        include: [{ model: User, as: 'createdByDetails', attributes: ['firstName', 'lastName'] }],
        where: { uploadProcessId: bulkUploadRecord.uploadProcessId }
      })
      logger.info('Succesfully created bulk data')
      return this.responseHelper.onSuccess(res, 'Succesfully created bulk data', bulkTransactionData)
    } catch (error) {
      logger.info(error, 'Error while creating bulk record')
      return this.responseHelper.onError(res, 'Error while creating bulk record')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getBulkRecordbyId(req, res) {
    try {
      logger.info('Geeting bulk record data')
      const { id } = req.params
      if (!id) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await BulkUpload.findOne({
        include: [
          { model: User, as: 'createdByDetails', attributes: ['firstName', 'lastName'] },
          { model: BulkBillCollection, as: 'billCollectionDetails' }
        ],
        where: { uploadProcessId: id }
      })
      if (!response) {
        logger.info('No data found')
        return this.responseHelper.notFound(res, 'No data found')
      }
      logger.info('Sucessfully fetched Bulk record data')
      return this.responseHelper.onSuccess(res, 'Sucessfully fetched Bulk record data', response)
    } catch (error) {
      logger.info('Error while getting bulk record data')
      return this.responseHelper.onError(res, 'Error while getting bulk record data')
    }
  }

  async listBulkData(req, res) {
    try {
      logger.info('Getting list of bulk records')
      const { limit = 10, page = 0 } = req.query
      const offSet = (page * limit)
      const searchParams = req.body
      let bulkWhereCondition
      let whereCreatedBy
      if (searchParams.processId || searchParams.uploadType || searchParams.uploadedDate) {
        bulkWhereCondition = {}
      }
      if (searchParams.processId) {
        bulkWhereCondition.uploadProcessId = searchParams.processId
      }
      if (searchParams.uploadType) {
        bulkWhereCondition.bulkUploadType = searchParams.uploadType
      }
      if (searchParams.uploadedBy) {
        whereCreatedBy = {
          [Op.and]: sequelize.where(
            sequelize.fn('concat', sequelize.fn('UPPER', sequelize.col('first_name')), ' ',
              sequelize.fn('UPPER', sequelize.col('last_name'))),
            {
              [Op.like]: `%${searchParams.uploadedBy.toUpperCase()}%`
            }
          )
        }
      }
      if (searchParams.uploadedDate) {
        bulkWhereCondition.createdAt =
          { createdAt: sequelize.where(sequelize.fn('date', sequelize.col('Contract.start_date')), '=', searchParams.startDate) }
      }

      const filters = searchParams.filters
      if (filters && Array.isArray(filters) && filters.length > 0) {
        for (const record of filters) {
          if (record.value) {
            if (record.id === 'uploadProcessId') {
              bulkWhereCondition = {}
              bulkWhereCondition.uploadProcessId = {
                [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('BulkUpload.upload_process_id'), 'varchar'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'createdByDetails') {
              whereCreatedBy = {
                [Op.and]: sequelize.where(
                  sequelize.fn('concat', sequelize.fn('UPPER', sequelize.col('first_name')), ' ',
                    sequelize.fn('UPPER', sequelize.col('last_name'))),
                  {
                    [record.filter === 'contains' ? Op.like : Op.notLike]: `%${searchParams.uploadedBy.toUpperCase()}%`
                  }
                )
              }
            }
          }
        }
      }

      const response = await BulkUpload.findAndCountAll({
        include: [
          {
            model: User,
            as: 'createdByDetails',
            attributes: ['firstName', 'lastName'],
            where: whereCreatedBy,
            subQuery: false
          },
          { model: BusinessEntity, as: 'bulkUploadTypeDescription', attributes: ['description'] }
        ],
        where: bulkWhereCondition,
        offset: offSet,
        limit: limit
      })
      if (!response) {
        logger.info('No data found')
        return this.responseHelper.notFound(res, 'No data found')
      }
      for (const r of response.rows) {
        if (r.bulkUploadType === 'CALL_COLLECTION') {
          const outstanding = []
          const noOutstanding = []
          for (const each of r.payload.callCollection) {
            if (each.outstanding === 'Y') {
              outstanding.push(each)
            } else if (each.outstanding === 'N') {
              noOutstanding.push(each)
            }
          }
          r.payload = {
            outstanding,
            noOutstanding
          }
        }
      }
      logger.info('Sucessfully fetched bulk reocrds')
      return this.responseHelper.onSuccess(res, 'Sucessfully fetched bulk reocrds', response)
    } catch (error) {
      logger.info(error, 'Error while getting bulk bulk records')
      return this.responseHelper.onError(res, 'Error while getting bulk records')
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

const updateAddress = async (address, addressId, userId, t) => {
  logger.info('Updating Address')
  const data = transformAddress(address)
  data.updatedBy = userId
  data.addressId = addressId
  const response = await Address.update(data, {
    where: {
      addressId
    },
    transaction: t
  })
  return response
}

const createContact = async (data, userId, t) => {
  logger.info('Creating new contact')
  const contact = transformContact(data)
  contact.createdBy = userId
  contact.updatedBy = userId

  const response = await Contact.create(contact, { transaction: t })
  return response
}

const updateContact = async (data, contactId, userId, t) => {
  logger.info('updating contact')
  const contact = transformContact(data)
  contact.updatedBy = userId
  contact.contactId = contactId
  const response = await Contact.update(contact, {
    where: {
      contactId
    },
    transaction: t
  })
  return response
}

const createCustomerData = async (data, userId, addressId, contactId, t) => {
  logger.info('Creating new customer data')
  let customer = transformCustomer(data)
  customer = {
    ...customer,
    status: 'PENDING',
    createdBy: userId,
    updatedBy: userId,
    contactId,
    addressId
  }
  const response = await Customer.create(customer, { transaction: t })
  return response
}

const updateCustomer = async (data, userId, addressId, contactId, customerId, t) => {
  logger.info('Updating customer data')
  let customer = transformCustomer(data)
  customer = {
    ...customer,
    updatedBy: userId,
    contactId,
    addressId,
    customerId
  }
  const response = await Customer.update(customer, {
    where: {
      customerId
    },
    transaction: t
  })
  return response
}

const createAccountData = async (customerType, data, customerId, accountAddressId, accountContactId, userId, securityProfileId, t) => {
  logger.info('Creating new account')
  let account = transformAccount(customerType, data)
  account = {
    ...account,
    status: 'PENDING',
    sqRefId: securityProfileId,
    createdBy: userId,
    updatedBy: userId,
    contactId: accountContactId,
    addressId: accountAddressId,
    customerId
  }
  const response = await Account.create(account, { transaction: t })
  return response
}

const updateAccount = async (customerType, data, customerId, accountAddressId, accountContactId, userId, accountId, t) => {
  logger.info('updating account')
  let account = transformAccount(customerType, data)
  account = {
    ...account,
    updatedBy: userId,
    contactId: accountContactId,
    addressId: accountAddressId,
    customerId,
    accountId
  }
  const response = await Account.update(account, {
    where: {
      accountId
    },
    transaction: t
  })
  return response
}

const createSecurityQuestion = async (data, t) => {
  logger.info('Creating new security question')
  const securityQuestion = transformSecurityQuestion(data)
  const response = await SecurityQuestion.create(securityQuestion, { transaction: t })
  return response
}

const updateSecurityQuestion = async (data, accountId, profileId, t) => {
  logger.info('updating security question')
  const securityQuestion = transformSecurityQuestion(data)
  securityQuestion.refId = accountId
  securityQuestion.profileId = profileId
  const response = await SecurityQuestion.update(securityQuestion, {
    where: {
      profileId
    },
    transaction: t
  })
  return response
}

const createConnectionAndPlan = async (data, addressId, userId, plan, accountId, t) => {
  logger.info('Creating new connection and connection plan')
  let connection = transformConnection(data, plan)
  const mappingPayload = {
    plans: [
      {
        planId: plan.planId
      }
    ]
  }
  connection = {
    ...connection,
    status: 'PENDING',
    addressId,
    accountId,
    mappingPayload,
    createdBy: userId,
    updatedBy: userId
  }
  const response = await Connection.create(connection, { transaction: t })

  const connectionPlan = {
    bandwidth: get(plan, 'bandwidth', ''),
    status: 'ACTIVE',
    // quota: get(plan, 'quota', ''),
    prodCatalogue: get(data, 'catalog', ''),
    connectionId: get(response, 'connectionId'),
    createdBy: userId,
    updatedBy: userId,
    planId: plan.planId
  }
  const connectionPlanInfo = await ConnectionPlan.create(connectionPlan, { transaction: t })
  response.connectionPlan = connectionPlanInfo
  return response
}

const updateConnection = async (data, addressId, userId, connectionId, accountId, t) => {
  logger.info('Updating connection')
  let connection = transformConnection(data)
  connection = {
    ...connection,
    addressId,
    connectionId,
    accountId,
    updatedBy: userId
  }
  const response = await Connection.update(connection, {
    where: {
      connectionId
    },
    transaction: t
  })
  return response
}

const updateConnectionPlan = async (plan, userId, connectionId, connPlanId, prodCatalogue, t) => {
  logger.info('Updating connection plan')
  const connectionPlan = {
    connPlanId,
    bandwidth: get(plan, 'bandwidth', ''),
    status: 'ACTIVE',
    // quota: get(plan, 'quota', ''),
    prodCatalogue,
    connectionId,
    createdBy: userId,
    updatedBy: userId,
    planId: plan.planId
  }
  await ConnectionPlan.update(connectionPlan, {
    where: {
      connPlanId
    },
    transaction: t
  })
}

const createServiceRequest = async (data, customerId, accountId, plan, userId, addressId, identificationNo, serviceId, woType, kioskRefId, roleId, t, departmentId) => {
  logger.info('Creating new ServiceRequest')
  const interaction = {
    description: 'New connection',
    currStatus: 'CREATED',
    assignedDate: new Date(),
    intxnType: 'REQSR',
    intxnCatType: 'REQSR',
    createdEntity: departmentId,
    currEntity: departmentId,
    currRole: roleId,
    woType: woType,
    businessEntityCode: plan.prodType,
    expctdDateCmpltn: new Date(),
    isBotReq: 'Y',
    botProcess: 'N',
    customerId,
    accountId,
    planId: plan.planId,
    createdBy: userId,
    updatedBy: userId,
    addressId,
    identificationNo,
    connectionId: serviceId,
    kioskRefId
  }
  const response = await Interaction.create(interaction, { transaction: t })
  return response
}

const newConnectionManualResolution = async (interaction, cust360Summary, connectionData,
  planData, failure, respHelper, res, userId, system, woNbr, accessNbr, req) => {
  if (!cust360Summary || !cust360Summary.customerNbr || !cust360Summary.accountNbr) {
    return respHelper.validationError(res, new Error('Unable to retrieve Customer Number and Account Number from TIBCO'))
  }

  if (cust360Summary.connectionStatus !== 'CU') {
    return respHelper.validationError(res, new Error('Interaction cannot be resolved as Service Status is not current(CU) in Cerillion'))
  }

  if (connectionData.assignSimLater === 'Y' &&
    (!cust360Summary.iccid || cust360Summary.iccid === '' || !cust360Summary.imsi || cust360Summary.imsi === '')) {
    return respHelper.validationError(res, new Error('ICCID/IMSI missing, but SIM is set to be assigned later'))
  }

  let iccid
  if (planData.prodType === 'Fixed') {
    iccid = 'FIXEDLINE'
  } else {
    if (connectionData.assignSimLater === 'Y') {
      iccid = cust360Summary.iccid
    } else {
      iccid = connectionData.iccid
    }
  }
  if (connectionData.connectionSelection === 'auto') {
    await blockAccessNumber(accessNbr, iccid)
  }

  const status = await allocateAccessNumber(accessNbr, iccid)
  // const status = true
  if (status) {
    const interactionData = {}
    // let found = false
    if (!interaction.externalRefSys1 || interaction.externalRefSys1 === system) {
      interactionData.externalRefNo1 = woNbr
      interactionData.externalRefSys1 = system
      // found = true
    } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === system) {
      interactionData.externalRefNo2 = woNbr
      interactionData.externalRefSys2 = system
      // found = true
    } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === system) {
      interactionData.externalRefNo3 = woNbr
      interactionData.externalRefSys3 = system
      // found = true
    } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === system) {
      interactionData.externalRefNo4 = woNbr
      interactionData.externalRefSys4 = system
      // found = true
    }

    // console.log('planData.prodType', planData.prodType)
    const t = await sequelize.transaction()
    try {
      if (planData.prodType === 'Fixed') {
        // console.log('Processing fixed')

        if (interaction.woType === 'WONC') {
          await Customer.update({
            crmCustomerNo: cust360Summary.customerNbr,
            updatedBy: userId
          },
            {
              where: {
                customerId: interaction.customerId
              },
              transaction: t
            }
          )
        }
        if (interaction.woType === 'WONC' || interaction.woType === 'WONC-ACCSER') {
          await Account.update({
            accountNo: cust360Summary.accountNbr,
            updatedBy: userId
          },
            {
              where: {
                accountId: interaction.accountId
              },
              transaction: t
            }
          )
        }
        if (connectionData.connectionSelection === 'auto') {
          await Connection.update({
            identificationNo: cust360Summary.accessNbr,
            updatedBy: userId
          },
            {
              where: {
                connectionId: interaction.connectionId
              },
              transaction: t
            }
          )
        }

        await createServiceRequestHistory(interaction, t, req)

        await Interaction.update({
          ...interactionData,
          currStatus: 'WIP',
          resolutionReason: failure,
          updatedBy: userId
        },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )

        if (interaction.woType === 'WONC') {
          await InteractionTask.update({
            status: 'RESOLVED',
            updatedBy: userId
          },
            {
              where: {
                taskId: 'CREATECUSTACCT',
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
        }

        if (interaction.woType === 'WONC-ACCSER') {
          await InteractionTask.update({
            status: 'RESOLVED',
            updatedBy: userId
          },
            {
              where: {
                taskId: 'CREATEACCT',
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
        }

        await InteractionTask.update({
          status: 'RESOLVED',
          updatedBy: userId
        },
          {
            where: {
              taskId: 'CREATESERVICE',
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )
      } else {
        // console.log('Processing not fixed')
        if (interaction.woType === 'WONC') {
          await Customer.update({
            crmCustomerNo: cust360Summary.customerNbr,
            status: 'ACTIVE',
            updatedBy: userId
          },
            {
              where: {
                customerId: interaction.customerId
              },
              transaction: t
            }
          )
        }

        if (interaction.woType === 'WONC' || interaction.woType === 'WONC-ACCSER') {
          await Account.update({
            accountNo: cust360Summary.accountNbr,
            status: 'ACTIVE',
            updatedBy: userId
          },
            {
              where: {
                accountId: interaction.accountId
              },
              transaction: t
            }
          )
        }

        const serviceAttributes = {}
        if (connectionData.assignSimLater === 'Y') {
          serviceAttributes.iccid = iccid
          serviceAttributes.imsi = cust360Summary.imsi
        }

        if (connectionData.connectionSelection === 'auto') {
          serviceAttributes.identificationNo = accessNbr
        }

        await Connection.update({
          ...serviceAttributes,
          status: 'ACTIVE',
          updatedBy: userId
        },
          {
            where: {
              connectionId: interaction.connectionId
            },
            transaction: t
          }
        )

        await createServiceRequestHistory(interaction, t, req)

        await Interaction.update({
          ...interactionData,
          currStatus: 'CLOSED',
          resolutionReason: failure,
          updatedBy: userId
        },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )

        await InteractionTask.update({
          status: 'CLOSED',
          updatedBy: userId
        },
          {
            where: {
              taskId: 'CLOSESR',
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )
      }
      t.commit()
      logger.debug('Successfully updated the status')
      return respHelper.onSuccess(res, 'The SR has been successfully resolved', {})
    } catch (error) {
      logger.error(error, 'Error updating statuses')
      return respHelper.onError(res, error)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else {
    logger.debug('Error while allocating access number')
    return respHelper.onError(res, new Error('An error occurred while allocating the Access Number in TIBCO'))
  }
}

const barUnBarManualResolution = async (interaction, cust360Summary, connectionData,
  planData, failure, respHelper, res) => {
  if ((planData.prodType === 'Fixed' || planData.prodType === 'Postpaid') && interaction.woType === 'BAR') {
    if (!cust360Summary || !cust360Summary.serviceLevel || cust360Summary.serviceLevel.trim() !== 'BSER') {
      return respHelper.validationError(res, new Error('Service Request cannot be resolved at this time, Bar provisioning not complete in Cerillion'))
    }
  }

  if ((planData.prodType === 'Fixed' || planData.prodType === 'Postpaid') && interaction.woType === 'UNBAR') {
    if (!cust360Summary || !cust360Summary.serviceLevel || cust360Summary.serviceLevel.trim() !== 'FULL') {
      return respHelper.validationError(res, new Error('Service Request cannot be resolved at this time, UnBar provisioning not complete in Cerillion'))
    }
  }

  if (planData.prodType === 'Prepaid' || planData.prodType === 'Postpaid') {
    let accessNbr
    if (connectionData.identificationNo.length <= 7) {
      accessNbr = COUNTRYCODE_PREFIX + connectionData.identificationNo
    } else {
      accessNbr = connectionData.identificationNo
    }

    const resp = await ocsCustomerStatus(interaction.intxnId, accessNbr)
    // const resp = {status: 'TEMPORARY BLOCKED', message: ''}
    if (interaction.woType === 'BAR') {
      if (resp.status.toUpperCase() !== 'TEMPORARY BLOCKED') {
        let msg
        if (!resp.message || resp.message === '') {
          msg = 'OCS Bar ACtivity is not complete'
        } else {
          msg = resp.message
        }
        return respHelper.validationError(res, new Error('Service Request cannot be resolved at this time, ' + msg))
      }
    }
    if (interaction.woType === 'UNBAR') {
      if (resp.status.toUpperCase() !== 'ACTIVATED') {
        let msg
        if (!resp.message || resp.message === '') {
          msg = 'OCS UnBar ACtivity is not complete'
        } else {
          msg = resp.message
        }
        return respHelper.validationError(res, new Error('Service Request cannot be resolved at this time, ' + msg))
      }
    }
  }

  const t = await sequelize.transaction()
  try {
    if (interaction.woType === 'BAR') {
      await Connection.update({
        status: 'TOS',
        updatedBy: 1
      },
        {
          where: {
            connectionId: interaction.connectionId
          },
          transaction: t
        }
      )
    }

    if (interaction.woType === 'UNBAR') {
      await Connection.update({
        status: 'ACTIVE',
        updatedBy: 1
      },
        {
          where: {
            connectionId: interaction.connectionId
          },
          transaction: t
        }
      )
    }

    await Interaction.update(
      {
        currStatus: 'CLOSED',
        resolutionReason: failure
      },
      {
        where: {
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    await t.commit()

    return respHelper.onSuccess(res, 'Service Request ' + interaction.intxnId + ' resolved successfully', {})
  } catch (error) {
    logger.error(error, 'processBarUnBar - Error in updating interaction - ' + interaction.intxnId)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const upgradeDowngradeManualResolution = async (interaction, cust360Summary, connectionData, planData,
  failure, respHelper, res, userId, system, woNbr) => {
  if (planData.prodType !== 'Fixed' && planData.prodType !== 'Postpaid') {
    return respHelper.validationError(res, new Error('Service Type not support for Upgrade/Downgrade'))
  }

  const newPlanData = await Plan.findOne({
    where: {
      planId: interaction.planId
    }
  })

  if (!cust360Summary || !cust360Summary.currentPlanCode || cust360Summary.currentPlanCode === '' ||
    cust360Summary.currentPlanCode !== newPlanData.refPlanCode) {
    return respHelper.validationError(res, new Error('Service Request cannot be resolved at this time, Plan Change is not complete in Cerillion'))
  }

  const interactionData = {}
  // let found = false
  if (!interaction.externalRefSys1 || interaction.externalRefSys1 === system) {
    interactionData.externalRefNo1 = woNbr
    interactionData.externalRefSys1 = system
    // found = true
  } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === system) {
    interactionData.externalRefNo2 = woNbr
    interactionData.externalRefSys2 = system
    // found = true
  } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === system) {
    interactionData.externalRefNo3 = woNbr
    interactionData.externalRefSys3 = system
    // found = true
  } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === system) {
    interactionData.externalRefNo4 = woNbr
    interactionData.externalRefSys4 = system
    // found = true
  }

  const t = await sequelize.transaction()
  try {
    const oldPlanId = planData.planId

    connectionData.mappingPayload.plans[0].planId = interaction.planId

    await Connection.update({
      mappingPayload: connectionData.mappingPayload,
      updatedBy: userId
    },
      {
        where: {
          connectionId: interaction.connectionId
        },
        transaction: t
      }
    )

    await ConnectionPlan.update({
      status: 'ACTIVE',
      updatedBy: userId
    },
      {
        where: {
          connectionId: interaction.connectionId,
          planId: interaction.planId
        },
        transaction: t
      })

    await ConnectionPlan.update({
      status: 'INACTIVE',
      updatedBy: userId
    },
      {
        where: {
          connectionId: interaction.connectionId,
          planId: oldPlanId
        },
        transaction: t
      })

    await InteractionTask.update({
      status: 'CLOSED',
      updatedBy: userId
    },
      {
        where: {
          taskId: 'CLOSESR',
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    await Interaction.update(
      {
        ...interactionData,
        currStatus: 'CLOSED',
        resolutionReason: failure,
        userId: userId
      },
      {
        where: {
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    await t.commit()

    return respHelper.onSuccess(res, 'Service Request ' + interaction.intxnId + ' resolved successfully', {})
  } catch (error) {
    logger.error(error, 'processBarUnBar - Error in updating interaction - ' + interaction.intxnId)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const getServiceBadge = async (customerId, accountId, serviceId) => {
  // console.log('getServiceBadge', customerId, accountId, serviceId)
  const interactions = await Interaction.findAll({
    attributes: ['intxnId', 'description', 'currStatus', 'intxnType', 'woType', 'createdAt'],
    include: [
      { model: BusinessEntity, as: 'srType', attributes: ['code', 'description'] },
      { model: BusinessEntity, as: 'workOrderType', attributes: ['code', 'description'] }
    ],
    where: {
      customerId: customerId,
      accountId: accountId,
      [Op.or]: {
        connectionId: serviceId,
        existingConnectionId: serviceId
      },
      currStatus: {
        [Op.notIn]: ['CLOSED', 'CANCELLED', 'UNFULFILLED']
      },
      woType: ['WONC', 'BAR', 'UNBAR', 'UPGRADE', 'DOWNGRADE', 'WONC', 'RELOCATE', 'TELEPORT', 'TERMINATE'],
      intxnType: 'REQSR'
    },
    order: [
      ['intxnId', 'DESC']
    ]
  })

  let bar
  let unbar
  // let upgrade
  // let downgrade
  let newConn
  let teleport
  let relocate
  let terminate
  // let planData
  for (const intr of interactions) {
    if (intr.woType === 'BAR') {
      bar = true
    } else if (intr.woType === 'UNBAR') {
      unbar = true
    } else if (intr.woType === 'UPGRADE') {
      // planData = await Plan.findOne({
      //   where: {
      //     planId: intr.planId
      //   }
      // })
      // upgrade = true
    } else if (intr.woType === 'DOWNGRADE') {
      // downgrade = true
      // planData = await Plan.findOne({
      //   where: {
      //     planId: intr.planId
      //   }
      // })
    } else if (intr.woType === 'WONC' || intr.woType === 'WONC-ACCSER' || intr.woType === 'WONC-SER') {
      newConn = true
    } else if (intr.woType === 'TELEPORT') {
      teleport = true
    } else if (intr.woType === 'RELOCATE') {
      relocate = true
    } else if (intr.woType === 'TERMINATE') {
      terminate = true
    }
  }

  // console.log('getServiceBadge-----------------------------------------------', bar, unbar, newConn, teleport, relocate, terminate)

  if (bar) {
    return 'BAR'
  } else if (unbar) {
    return 'UNBAR'
    // } else if(upgrade) {
    //   return 'Upgrading to ' + planData.planName
    // } else if(downgrade) {
    //   return 'Downgrading to ' + planData.planName
  } else if (newConn) {
    return 'WONC'
  } else if (teleport) {
    return 'TELEPORT'
  } else if (relocate) {
    return 'RELOCATE'
  } else if (terminate) {
    return 'TERMINATE'
  } else {
    return ''
  }
}

const activateDeactivateVAS = async (interaction, failure, respHelper, res, userId, system, woNbr) => {
  console.log('activateDeactivateVAS', interaction.intxnId, interaction.planIdList)

  const interactionData = {}
  // let found = false
  if (!interaction.externalRefSys1 || interaction.externalRefSys1 === system) {
    interactionData.externalRefNo1 = woNbr
    interactionData.externalRefSys1 = system
    // found = true
  } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === system) {
    interactionData.externalRefNo2 = woNbr
    interactionData.externalRefSys2 = system
    // found = true
  } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === system) {
    interactionData.externalRefNo3 = woNbr
    interactionData.externalRefSys3 = system
    // found = true
  } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === system) {
    interactionData.externalRefNo4 = woNbr
    interactionData.externalRefSys4 = system
    // found = true
  }

  const t = await sequelize.transaction()
  try {
    if (interaction.planIdList && interaction.planIdList !== '') {
      const planIds = interaction.planIdList.split(',')

      let status
      if (interaction.woType === 'VASACT') {
        status = 'ACTIVE'
      }

      if (interaction.woType === 'VASDEACT') {
        status = 'INACTIVE'
      }

      for (const p of planIds) {
        // console.log(4, p, interaction.connectionId)
        const connPlanResp = await ConnectionPlan.update({
          status: status,
          updatedBy: 1
        },
          {
            where: {
              connectionId: interaction.connectionId,
              planId: p,
              status: 'PENDING'
            },
            transaction: t
          })
        console.log(JSON.stringify(connPlanResp, null, 2))
        if (connPlanResp[0] !== 1) {
          if (interaction.woType === 'VASACT') {
            return respHelper.validationError(res, new Error('VAS Activation for Plan ' + p + ' failed.'))
          }
          if (interaction.woType === 'VASACT') {
            return respHelper.validationError(res, new Error('VAS De-Activation for Plan ' + p + ' failed.'))
          }
        }
      }

      await InteractionTask.update({
        status: 'CLOSED',
        updatedBy: userId
      },
        {
          where: {
            taskId: 'CLOSESR',
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )

      await Interaction.update(
        {
          ...interactionData,
          currStatus: 'CLOSED',
          resolutionReason: failure,
          userId: userId
        },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )

      await t.commit()
      return respHelper.onSuccess(res, 'Service Request ' + interaction.intxnId + ' resolved successfully', {})
    } else {
      return respHelper.validationError(res, new Error('Unable to find VAS Plans for activation/de-activation'))
    }
  } catch (error) {
    logger.error(error, 'processBarUnBar - Error in updating interaction - ' + interaction.intxnId)
    this.responseHelper.onError(res, new Error('Unexpected error manually resolving VAS Activation/De-Activation'))
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const relocateManualResolution = async (interaction, cust360Summary, connectionData,
  planData, failure, respHelper, res, userId, system, woNbr, accessNbr, req) => {
  if (cust360Summary.connectionStatus !== 'CU') {
    return respHelper.validationError(res, new Error('Interaction cannot be resolved as Service Status is not current(CU) in Cerillion'))
  }

  if (connectionData.connectionSelection === 'auto') {
    await blockAccessNumber(accessNbr, 'FIXEDLINE')
  }

  const status = await allocateAccessNumber(accessNbr, 'FIXEDLINE')
  // const status = true
  if (status) {
    const interactionData = {}
    // let found = false
    if (!interaction.externalRefSys1 || interaction.externalRefSys1 === system) {
      interactionData.externalRefNo1 = woNbr
      interactionData.externalRefSys1 = system
      // found = true
    } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === system) {
      interactionData.externalRefNo2 = woNbr
      interactionData.externalRefSys2 = system
      // found = true
    } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === system) {
      interactionData.externalRefNo3 = woNbr
      interactionData.externalRefSys3 = system
      // found = true
    } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === system) {
      interactionData.externalRefNo4 = woNbr
      interactionData.externalRefSys4 = system
      // found = true
    }

    // console.log('planData.prodType', planData.prodType)
    const t = await sequelize.transaction()
    try {
      if (connectionData.connectionSelection === 'auto') {
        await Connection.update({
          identificationNo: accessNbr,
          updatedBy: userId
        },
          {
            where: {
              connectionId: interaction.connectionId
            },
            transaction: t
          }
        )
      }

      await createServiceRequestHistory(interaction, t, req)

      await Interaction.update({
        ...interactionData,
        currStatus: 'WIP',
        resolutionReason: failure,
        updatedBy: userId
      },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )

      await InteractionTask.update({
        status: 'RESOLVED',
        updatedBy: userId
      },
        {
          where: {
            taskId: 'CREATERELOCATE',
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )

      t.commit()
      logger.debug('Successfully updated the status')
      return respHelper.onSuccess(res, 'The SR has been successfully resolved', {})
    } catch (error) {
      logger.error(error, 'Error updating statuses')
      return respHelper.onError(res, error)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else {
    logger.debug('Error while allocating access number')
    return respHelper.onError(res, new Error('An error occurred while allocating the Access Number in TIBCO'))
  }
}

const teleportManualResolution = async (interaction, failure, respHelper, res, userId, system, woNbr, req) => {
  logger.debug('teleportManualResolution: resolving teleport request manually')

  const interactionData = {}
  // let found = false
  if (!interaction.externalRefSys1 || interaction.externalRefSys1 === system) {
    interactionData.externalRefNo1 = woNbr
    interactionData.externalRefSys1 = system
    // found = true
  } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === system) {
    interactionData.externalRefNo2 = woNbr
    interactionData.externalRefSys2 = system
    // found = true
  } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === system) {
    interactionData.externalRefNo3 = woNbr
    interactionData.externalRefSys3 = system
    // found = true
  } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === system) {
    interactionData.externalRefNo4 = woNbr
    interactionData.externalRefSys4 = system
    // found = true
  }

  // console.log('planData.prodType', planData.prodType)
  const t = await sequelize.transaction()
  try {
    await createServiceRequestHistory(interaction, t, req)

    await Interaction.update({
      ...interactionData,
      currStatus: 'WIP',
      resolutionReason: failure,
      updatedBy: userId
    },
      {
        where: {
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    await InteractionTask.update({
      status: 'RESOLVED',
      updatedBy: userId
    },
      {
        where: {
          taskId: 'CREATETELEPORT',
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    t.commit()
    logger.debug('Successfully updated the status')
    return respHelper.onSuccess(res, 'The SR has been successfully resolved', {})
  } catch (error) {
    logger.error(error, 'Error updating statuses')
    return respHelper.onError(res, error)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const faultManualResolution = async (interaction, failure, respHelper, res, userId, system, woNbr, req) => {
  logger.debug('faultManualResolution: resolving fault manually')
  const { accessNbr } = req.body
  try {
    const task = await InteractionTask.findOne({
      where: {
        intxnId: interaction.intxnId,
        taskId: 'CREATEFAULT'
      }
    })

    if (!task || !task.status || task.status !== 'ERROR') {
      return respHelper.validationError(res, new Error('Fault Task must be in ERROR status to allow manual resolution'))
    }
  } catch (error) {
    logger.error(error, 'Error verifying if task status is valid')
    return respHelper.validationError(res, new Error('Unexpected error while verifying if task status is valid'))
  }
  let ticketResponse
  try {
    ticketResponse = await getTicketDetails(woNbr, interaction.intxnType)
    if (!ticketResponse || !ticketResponse.ticketNumber || ticketResponse.ticketNumber === '') {
      return respHelper.validationError(res, new Error('Workorder Number not found in OMS'))
    }
    console.log('Access Number : ', ticketResponse.accessNumber, accessNbr)
    if (ticketResponse.accessNumber !== accessNbr) {
      logger.error('Error verifying Access Number in OMS')
      return this.responseHelper.validationError(res, new Error('Mismatch in Access Number'))
    }
  } catch (error) {
    logger.error(error, 'Error verifying Work Order Number in OMS')
    return respHelper.validationError(res, new Error('Unexpected error while validating Work Order Number in OMS'))
  }
  const interactionData = {}
  // let found = false
  if (!interaction.externalRefSys1 || interaction.externalRefSys1 === system) {
    interactionData.externalRefNo1 = woNbr
    interactionData.externalRefSys1 = system
    // found = true
  } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === system) {
    interactionData.externalRefNo2 = woNbr
    interactionData.externalRefSys2 = system
    // found = true
  } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === system) {
    interactionData.externalRefNo3 = woNbr
    interactionData.externalRefSys3 = system
    // found = true
  } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === system) {
    interactionData.externalRefNo4 = woNbr
    interactionData.externalRefSys4 = system
    // found = true
  }

  // console.log('planData.prodType', planData.prodType)
  const t = await sequelize.transaction()
  try {
    const intxnHist = await InteractionTxn.findOne({
      where: {
        intxnId: interaction.intxnId,
        flwAction: 'START'
      }
    })

    await InteractionTxn.create({
      intxnId: interaction.intxnId,
      fromEntity: req.departmentId,
      fromRole: req.roleId,
      fromUser: userId,
      toEntity: req.departmentId,
      toRole: req.roleId,
      toUser: userId,
      intxnStatus: 'RESOLVED',
      flwId: intxnHist.flwId,
      flwCreatedBy: userId,
      flwAction: 'Manual',
      isFollowup: 'N'
    },
      {
        transaction: t
      })

    await Interaction.update({
      ...interactionData,
      currStatus: 'ASSIGNED',
      resolutionReason: failure,
      updatedBy: userId
    },
      {
        where: {
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    await InteractionTask.update({
      status: 'RESOLVED',
      updatedBy: userId
    },
      {
        where: {
          taskId: 'CREATEFAULT',
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    t.commit()
    logger.debug('Successfully updated the status')
    return respHelper.onSuccess(res, 'The Fault has been successfully resolved', {})
  } catch (error) {
    logger.error(error, 'Error updating statuses')
    return respHelper.onError(res, error)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const searchCustomerWithFilters = (filters) => {
  let query = ''
  for (const record of filters) {
    if (record.value) {
      if (record.id === 'customerNo') {
        if (record.filter === 'contains') {
          query = query + ' cu.crm_customer_no Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' cu.crm_customer_no not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'customerName') {
        if (record.filter === 'contains') {
          query = query + ' (cu.first_name Ilike \'%' + record.value + '%\' or cu.last_name Ilike \'%' + record.value + '%\' or concat(cu.first_name,\' \',cu.last_name) Ilike \'%' + record.value + '%\')'
        } else {
          query = query + '(cu.first_name not Ilike \'%' + record.value + '%\' or cu.last_name not Ilike \'%' + record.value + '%\' or concat(cu.first_name,\' \',cu.last_name) not Ilike \'%' + record.value + '%\')'
        }
      } else if (record.id === 'accountNo') {
        if (record.filter === 'contains') {
          query = query + ' cast(acc.account_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(acc.account_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'accountName') {
        if (record.filter === 'contains') {
          query = query + ' (acc.first_name Ilike \'%' + record.value + '%\' or acc.last_name Ilike \'%' + record.value + '%\' or concat(acc.first_name,\' \',acc.last_name) Ilike \'%' + record.value + '%\')'
        } else {
          query = query + ' (acc.first_name not Ilike \'%' + record.value + '%\' or acc.last_name not Ilike \'%' + record.value + '%\' or concat(acc.first_name,\' \',acc.last_name) not Ilike \'%' + record.value + '%\')'
        }
      } else if (record.id === 'serviceNo') {
        if (record.filter === 'contains') {
          query = query + ' cast(cc.identification_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(cc.identification_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'serviceType') {
        if (record.filter === 'contains') {
          query = query + '  p.prod_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + '  p.prod_type not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'contactNo') {
        if (record.filter === 'contains') {
          query = query + ' cast(c2.contact_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(c2.contact_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'idNo') {
        if (record.filter === 'contains') {
          query = query + '  acc.id_value Ilike \'%' + record.value + '%\''
        } else {
          query = query + '  acc.id_value not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'status') {
        if (record.filter === 'contains') {
          query = query + '  be2.description Ilike \'%' + record.value + '%\''
        } else {
          query = query + '  be2.description not Ilike \'%' + record.value + '%\''
        }
      }
      query = query + ' and '
    }
  }
  // query = query.substring(0, query.lastIndexOf('and'))
  return query
}

const terminateManualResolution = async (interaction, failure, responseHelper, res, userId, system, woNbr, req, cust360Summary) => {
  logger.debug('terminateManualResolution: resolving fault manually')
  const interactionData = {}
  // let found = false
  if (!interaction.externalRefSys1 || interaction.externalRefSys1 === system) {
    interactionData.externalRefNo1 = woNbr
    interactionData.externalRefSys1 = system
    // found = true
  } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === system) {
    interactionData.externalRefNo2 = woNbr
    interactionData.externalRefSys2 = system
    // found = true
  } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === system) {
    interactionData.externalRefNo3 = woNbr
    interactionData.externalRefSys3 = system
    // found = true
  } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === system) {
    interactionData.externalRefNo4 = woNbr
    interactionData.externalRefSys4 = system
    // found = true
  }

  // console.log('planData.prodType', planData.prodType)
  const t = await sequelize.transaction()
  try {
    if (cust360Summary.connectionStatus !== 'RE' || cust360Summary.connectionStatus !== 'PD') {
      return responseHelper.onError(res, new Error('The service is not in Recovery status in Cerillion'))
    }
    await createServiceRequestHistory(interaction, t, req)

    await Interaction.update({
      ...interactionData,
      currStatus: 'CLOSED',
      resolutionReason: failure,
      updatedBy: userId
    },
      {
        where: {
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    await InteractionTask.update({
      status: 'RESOLVED',
      updatedBy: userId
    },
      {
        where: {
          taskId: 'CREATETERMINATE',
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    t.commit()
    logger.debug('Successfully updated the status')
    return responseHelper.onSuccess(res, 'The SR has been successfully resolved', {})
  } catch (error) {
    logger.error(error, 'Error updating status')
    return responseHelper.onError(res, error)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}
