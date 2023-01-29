// import c from 'config'
import { logger } from '../config/logger'
import { getAccessNumberList } from '../tibco/tibco-utils'
import { ResponseHelper } from '../utils'
import { defaultMessage } from '../utils/constant'
// import accessData from './access-number-sample.json'

export class AccessNumberService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async getAccessNumber (req, res) {
    try {
      // const { id } = req.params
      // const { id ,category } = req.params
      const { id, category } = req.query
      logger.debug('Getting access number details by Id: ', id)
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let reqBody = {}
      if (category === '') {
        reqBody =
        {
          accessNumber: id,
          identifier: 'UNALLOCATED'
        }
      } else {
        reqBody =
        {
          accessNumber: id,
          category: category,
          identifier: 'UNALLOCATED'
        }
      }

      const array = await getAccessNumberList(reqBody)
      logger.debug('Got : ', array)
      // this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, array)
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, array)
    } catch (error) {
      logger.error(error, 'Error while fetching Access Number data')
      return this.responseHelper.onError(res, new Error('Error while fetching Access Number data'))
    }
  }
}
