import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { BusinessEntity, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
import { QueryTypes } from 'sequelize'
import { camelCaseConversion } from '../utils/string'

export class BusinessParameterService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createBusinessParameter (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating New Business Parameter')

      let reqData = req.body
      const userId = req.userId
      if (!reqData) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const hasRecord = await BusinessEntity.findOne({
        where: {
          code: reqData.code
        }
      })
      if (hasRecord) {
        return this.responseHelper.conflict(res, new Error(defaultMessage.CONFLICT))
      }
      reqData = {
        ...reqData,
        createdBy: userId,
        updatedBy: userId
      }
      const response = await BusinessEntity.create(reqData, { transaction: t })
      await t.commit()
      logger.debug('Business Parameter created successfully')
      return this.responseHelper.onSuccess(res, 'Business Parameter created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Business Parameter'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateBusinessParameter (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating Business Parameter data')
      let reqData = req.body
      const { code } = req.params
      const userId = req.userId
      if (!reqData && !code) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const hasRecord = await BusinessEntity.findOne({ where: { code } })
      if (!hasRecord) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      reqData = {
        ...reqData,
        updatedBy: userId
      }
      const response = await BusinessEntity.update(reqData, {
        where: {
          code
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Business Parameter data updated successfully')
      return this.responseHelper.onSuccess(res, 'Business Parameter updated successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating Business Parameter data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getBusinessParameter (req, res) {
    try {
      const { code } = req.params
      logger.debug('Fetching Business Parameter By Code')
      if (!code) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await BusinessEntity.findOne({ where: { code } })
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      logger.debug('Successfully fetch Business Parameter data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Business Parameter data', response)
    } catch (error) {
      logger.error(error, 'Error while fetching Business Parameter data')
      return this.responseHelper.onError(res, new Error('Error while fetching Business Parameter data'))
    }
  }

  async getBusinessParameterList (req, res) {
    try {
      const { code } = req.params
      logger.debug('Getting Business Parameter List')
      if (!code) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await BusinessEntity.findAll({
        where: {
          codeType: code
        },
        order: [['code', 'ASC']]
      })
      logger.debug('Successfully fetch Business Parameter List')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Business Parameter List', response)
    } catch (error) {
      logger.error(error, 'Error While fetching Business Parameter List')
      return this.responseHelper.onError(res, new Error('Error While fetching Business Parameter List'))
    }
  }

  async getBusinessParameterCodeTypeList (req, res) {
    try {
      logger.debug('Getting Business Parameter code type  List')

      let response = await sequelize.query(`select distinct be.code_type,tyc.description from business_entity be 
                                        inner join type_code_lu as tyc on be.code_type = tyc.code order by be.code_type `, {
        type: QueryTypes.SELECT
      })
      response = camelCaseConversion(response)
      logger.debug('Successfully fetch Business Parameter code type List')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Business Parameter code type List', response)
    } catch (error) {
      logger.error(error, 'Error While fetching Business Parameter code type List')
      return this.responseHelper.onError(res, new Error('Error While fetching Business Parameter code type List'))
    }
  }
}
