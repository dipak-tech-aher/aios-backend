import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Lead } from '../model'
import { defaultMessage } from '../utils/constant'

export class LeadService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createLead (req, res) {
    try {
      logger.info('Creating new lead')
      let lead = req.body
      const userId = req.userId
      if (!lead) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      lead = {
        ...lead,
        createdBy: userId,
        updatedBy: userId
      }
      const response = await Lead.create(lead)
      logger.debug('Successfully created lead')
      return this.responseHelper.onSuccess(res, 'Successfully created lead', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating lead'))
    }
  }

  async updateLead (req, res) {
    try {
      const { id } = req.params
      logger.debug('Updating lead:', id)
      let lead = req.body
      const userId = req.userId
      if (!lead && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const leadInfo = await Lead.findOne({
        where: {
          leadId: id
        }
      })
      if (!leadInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      lead = {
        ...lead,
        updatedBy: userId
      }
      await Lead.update(lead, {
        where: {
          leadId: id
        }
      })
      logger.debug('Successfully updated lead')
      return this.responseHelper.onSuccess(res, 'Successfully updated lead')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating lead'))
    }
  }

  async getLead (req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting lead details by Id:', id)
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Lead.findOne({
        where: {
          leadId: id
        }
      })
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Successfully fetch lead data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching lead data')
      return this.responseHelper.onError(res, new Error('Error while fetching lead data'))
    }
  }

  async getLeadList (req, res) {
    try {
      logger.debug('Getting lead list')
      const response = await Lead.findAll({
        attributes: ['leadId', 'custName', 'custCat', 'contactNo', 'emailId', 'serviceType',
          'productEnquired', 'contactPreference', 'remarks']
      })
      logger.debug('Successfully fetch lead list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching lead data')
      return this.responseHelper.onError(res, new Error('Error while fetching lead data'))
    }
  }
}
