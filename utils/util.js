import { logger } from '../config/logger'
import { Customer, Account, Connection, Contact } from '../model'

export const checkCustomerHasAccess = async (customerId, accountId, serviceId) => {
  logger.info('validating customer has access or not ')
  const response = await Customer.findOne({
    attributes: ['customerId'],
    include: [
      { model: Contact, as: 'contact', attributes: ['email', 'contactNo', 'contactType', 'contactNoPfx'] },
      {
        attributes: ['accountId', 'accountNo'],
        model: Account,
        as: 'account',
        where: {
          accountId
        // status: 'ACTIVE'
        },
        include: [{
          attributes: ['connectionId', 'identificationNo', 'addressId', 'mappingPayload'],
          model: Connection,
          as: 'service',
          where: {
            connectionId: serviceId
          // status: 'ACTIVE'
          }
        }]
      }
    ],
    where: {
      customerId
    }
  })
  return response
}
