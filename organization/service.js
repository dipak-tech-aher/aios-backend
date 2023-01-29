import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { BusinessUnit, Address, Contact, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
import { transformAddress, transformResponseAddress } from '../transforms/customer-servicce'
export class OrganizationService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createOrganization (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Organization')
      let organization = req.body
      const userId = req.userId
      let response = {}
      if (!organization) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const unitId = organization.unitName + '.' + organization.parentUnit
      const organizationInfo = await BusinessUnit.findOne({
        where: { unitId }
      })
      if (organizationInfo) {
        logger.debug(defaultMessage.CONFLICT)
        return this.responseHelper.conflict(res, defaultMessage.CONFLICT)
      }

      organization = {
        ...organization,
        unitId,
        createdBy: userId,
        updatedBy: userId
      }
      // If organization has address, creating new address
      if (organization.address) {
        const address = await createAddress(organization.address, userId, t)
        if (address) {
          organization.addressId = address.addressId
          response.address = address
        }
      }
      // If organization has contact, creating new contact
      if (organization.contact) {
        const contact = await createContact(organization.contact, userId, t)
        if (contact) {
          organization.contactId = contact.contactId
          response.contact = contact
        }
      }
      if (organization.parentUnit) {
        const parent = await BusinessUnit.findOne({ where: { unitId: organization.parentUnit } })
        if (!parent) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Selected parent not available.'))
        }
      }
      const data = await BusinessUnit.create(organization, { transaction: t })
      response = {
        ...response,
        ...data.dataValues
      }
      await t.commit()
      logger.debug('Organization created successfully')
      return this.responseHelper.onSuccess(res, 'Organization created successfully', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while creating Organization'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateOrganization (req, res) {
    const t = await sequelize.transaction()

    try {
      logger.debug('Updating Organization')
      let organization = req.body
      const { id } = req.params
      const userId = req.userId
      if (!organization && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const organizationInfo = await BusinessUnit.findOne({
        where: {
          unitId: id
        }
      })
      if (!organizationInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      // If organization has address, updating or creating new address
      if (organizationInfo.addressId && organization.address) {
        await updateAddress(organization.address, organizationInfo.addressId, userId, t)
        organization.addressId = organizationInfo.addressId
      } else if (organization.address) {
        const address = await createAddress(organization.address, userId, t)
        if (address) {
          organization.addressId = address.addressId
        }
      }
      // If organization has contact, updating or creating new contact
      if (organizationInfo.contactId && organization.contact) {
        await updateContact(organization.contact, organizationInfo.contactId, userId, t)
        organization.contactId = organizationInfo.contactId
      } else if (organization.contact) {
        const contact = await createContact(organization.contact, userId, t)
        if (contact) {
          organization.contactId = contact.contactId
        }
      }
      if (organization.parentUnit) {
        const parent = await BusinessUnit.findOne({ where: { unitId: organization.parentUnit } })
        if (!parent) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Selected parent not available.'))
        }
      }
      organization = {
        ...organization,
        updatedBy: userId
      }
      await BusinessUnit.update(organization, { where: { unitId: id }, transaction: t })
      await t.commit()
      logger.debug('Organization data updated successfully')
      return this.responseHelper.onSuccess(res, 'Organization updated successfully')
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while updating Organization data'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getOrganizationList (req, res) {
    try {
      logger.debug('Getting Organization list')
      const response = await BusinessUnit.findAll({
        attributes: ['unitId', 'unitName', 'unitDesc', 'unitType', 'parentUnit', 'status', 'mappingPayload'],
        include: [{
          attributes: ['addressId', ['hno', 'flatHouseUnitNo'], 'block', ['building_name', 'building'],
            'street', 'road', 'district', 'state', ['town', 'village'], ['city', 'cityTown'], 'country', 'postCode'],
          model: Address,
          as: 'address'
        }, {
          attributes: ['contactId', 'title', 'firstName', 'lastName', 'contactType', 'contactNo'],
          model: Contact,
          as: 'contact'
        }]
      })
      logger.debug('Successfully fetch Organization list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Organization list')
      return this.responseHelper.onError(res, new Error('Error while fetching Organization list'))
    }
  }

  async getOrganization (req, res) {
    try {
      logger.debug('Getting Organization details by ID')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await BusinessUnit.findOne({
        attributes: ['unitId', 'unitName', 'unitDesc', 'unitType', 'parentUnit', 'status', 'mappingPayload'],
        include: [{
          attributes: ['addressId', ['hno', 'flatHouseUnitNo'], 'block', ['building_name', 'building'],
            'street', 'road', 'district', 'state', ['town', 'village'], ['city', 'cityTown'], 'country', 'postCode'],
          model: Address,
          as: 'address'
        },
        {
          attributes: ['contactId', 'title', 'firstName', 'lastName', 'contactType', 'contactNo'],
          model: Contact,
          as: 'contact'
        }],
        where: {
          unitId: id
        }
      })
      logger.debug('Successfully fetch Organization data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Organization data')
      return this.responseHelper.onError(res, new Error('Error while fetching Organization data'))
    }
  }
}

const createAddress = async (address, userId, t) => {
  const data = transformAddress(address)
  data.createdBy = userId
  data.updatedBy = userId
  let response = await Address.create(data, { transaction: t })
  response = transformResponseAddress(response)
  return response
}
const createContact = async (data, userId, t) => {
  data.createdBy = userId
  data.createdBy = userId
  const contact = await Contact.create(data, { transaction: t })
  return contact
}

const updateAddress = async (address, addressId, userId, t) => {
  const data = transformAddress(address)
  data.createdBy = userId
  data.addressId = addressId
  await Address.update(data, { where: { addressId }, transaction: t })
}
const updateContact = async (data, contactId, userId, t) => {
  data.userId = userId
  data.contactId = contactId
  await Contact.update(data, { where: { contactId }, transaction: t })
}
