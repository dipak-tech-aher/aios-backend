import { CustomerService } from './service'
import express from 'express'
import { validateToken } from './../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'
const customerRouter = express.Router()
const customerService = new CustomerService()

customerRouter
  .post('/', validateToken, validatePermission, customerService.createCustomer.bind(customerService))
  .post('/account', validateToken, validatePermission, customerService.createCustomer.bind(customerService))
  .post('/service', validateToken, validatePermission, customerService.createCustomer.bind(customerService))

  .put('/:id', validateToken, customerService.updateCustomer.bind(customerService))

  .get('/:id', validateToken, validatePermission, customerService.getCustomer.bind(customerService))
  .get('/account/:id', validateToken, validatePermission, customerService.getAccounts.bind(customerService))
  .get('/account-id-list/:id', validateToken, validatePermission, customerService.getAccountIdList.bind(customerService))
  .get('/services-list/:customerId', validateToken, validatePermission, customerService.getServicesList.bind(customerService))
  .get('/service-details/:customerId', validateToken, validatePermission, customerService.getServicesList.bind(customerService))
  .get('/service-badge/:customerId', validateToken, validatePermission, customerService.getServiceBadge.bind(customerService))
  .get('/service-realtime/:customerId', validateToken, validatePermission, customerService.getServiceRealtime.bind(customerService))
  .get('/active-boosters/:customerId', validateToken, validatePermission, customerService.getActiveBoostersforService.bind(customerService))
  .get('/purchase-history/:customerId', validateToken, validatePermission, customerService.getPurchaseHistoryforService.bind(customerService))
  .get('/vas/:customerId', validateToken, validatePermission, customerService.getActiveVAS.bind(customerService))
  .get('/pending-plans/:customerId', validateToken, validatePermission, customerService.getPendingPlans.bind(customerService))

  .post('/search', validateToken, validatePermission, customerService.searchCustomer.bind(customerService))
  .post('/transform-poc', customerService.transformPOC.bind(customerService))
  .post('/customersummary', validateToken, customerService.customersummary.bind(customerService))

  .get('/interaction/:id', validateToken, validatePermission, customerService.getTaskList.bind(customerService))
  .put('/interaction/resolve/:intxnId', validateToken, validatePermission, customerService.resolveInteraction.bind(customerService))

  .post('/bulk-billing-data', validateToken, customerService.bulkCustomerBillCheck.bind(customerService))
  .post('/create-bill-bulk-data', validateToken, customerService.createBulkBillCollectionRecords.bind(customerService))
  .get('/bulk-data/:id', validateToken, customerService.getBulkRecordbyId.bind(customerService))
  .post('/list-bulk-data/', validateToken, customerService.listBulkData.bind(customerService))

module.exports = customerRouter
 