import { logger } from '../config/logger'
import { validateIccid } from '../tibco/tibco-utils'
import { ResponseHelper } from '../utils'
import { defaultMessage } from '../utils/constant'

export class IccidService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async iccidValidate (req, res) {
    try {
      const { id } = req.params
      logger.debug('Validate ICCID by Id: ', id)
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await validateIccid(id)
      logger.debug('Successfully validated ICCID')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while validating iccid')
      return this.responseHelper.onError(res, new Error('Error while validating iccid'))
    }
  }
}
