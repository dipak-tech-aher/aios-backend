import { logger } from '../config/logger'
import { ResponseHelper, CryptoHelper } from '../utils'
import { defaultMessage } from '../utils/constant'
import { AppConfig, ScreenModule, sequelize } from '../model'

export class ConfigService {
  constructor () {
    this.responseHelper = new ResponseHelper()
    this.cryptoHelper = new CryptoHelper()
  }

  async createConfig (req, res) {
    const t = await sequelize.transaction()
    try {
      let data = req.body
      const userId = req.userId
      logger.debug('Creating data into app-config table')
      if (!data) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      data = {
        ...data,
        createdBy: userId,
        updatedBy: userId
      }
      const response = await AppConfig.create(data, { transaction: t })
      await t.commit()
      logger.debug('App-config data created successfully')
      return this.responseHelper.onSuccess(res, 'App-config data  created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.NOT_FOUND)
      return this.responseHelper.notAuthorized(res, defaultMessage.NOT_FOUND)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getConfig (req, res) {
    try {
      const { name } = req.query
      logger.debug('Fetching data from app-config table')
      const response = await AppConfig.findOne({
        where: { appName: name }
      })
      logger.debug('Successfully fetched data from app-config')
      return this.responseHelper.onSuccess(res, 'Successfully fetched data from app-config', response)
    } catch (error) {
      logger.error(error, defaultMessage.NOT_FOUND)
      return this.responseHelper.notAuthorized(res, defaultMessage.NOT_FOUND)
    }
  }

  async getModuleScreens (req, res) {
    try {
      logger.debug('Fetching list of module screens')
      const response = await ScreenModule.findAll({
        attributes: ['scrModId', 'moduleName', 'screenName', 'api', 'method'],
        order: [['moduleName', 'ASC']]
      })
      logger.debug('Successfully fetched list of module screens')
      return this.responseHelper.onSuccess(res, 'Successfully fetched list of module screens', response)
    } catch (error) {
      logger.error(error, defaultMessage.NOT_FOUND)
      return this.responseHelper.notAuthorized(res, defaultMessage.NOT_FOUND)
    }
  }
}
