import { defaultMessage, defaultStatusCode } from './constant'
import { responseFilter } from '../middleware/response-filter'
import { isEmpty } from 'lodash'
let instance

export class ResponseHelper {
  constructor (value) {
    if (!instance) {
      instance = this
    }
    return instance
  }

  onSuccess (res, message, data, statusCode) {
    const { responseAttribute } = res.locals
    if (data && !isEmpty(responseAttribute)) {
      data = responseFilter(data, responseAttribute)
    }
    return res.json({
      status: statusCode || defaultStatusCode.SUCCESS,
      message,
      data,
      refreshToken: res.refreshToken
    })
  }

  notAuthorized (res, error, message = defaultMessage.NOT_AUTHORIZED) {
    return res.status(defaultStatusCode.NOT_AUTHORIZED).send({
      message: error.message || message,
      refreshToken: res.refreshToken
    })
  }

  accessForbidden (res, error, message = defaultMessage.ACCESS_FORBIDDEN) {
    return res.status(defaultStatusCode.ACCESS_FORBIDDEN).send({
      message: error.message || message,
      refreshToken: res.refreshToken
    })
  }

  validationError (res, error, data, message = defaultMessage.VALIDATION_ERROR) {
    return res.status(defaultStatusCode.UN_PROCESSIBLE_ENTITY).send({
      message: error.message || message,
      data,
      refreshToken: res.refreshToken
    })
  }

  onError (res, error, message = defaultMessage.ERROR) {
    return res.status(error.statusCode || defaultStatusCode.ERROR).send({
      message: error.message || message,
      refreshToken: res.refreshToken
    })
  }

  notFound (res, error, message = defaultMessage.NOT_FOUND) {
    return res.status(error.statusCode || defaultStatusCode.NOT_FOUND).send({
      message: error.message || message,
      refreshToken: res.refreshToken
    })
  }

  conflict (res, error, message = defaultMessage.CONFLICT) {
    return res.status(error.statusCode || defaultStatusCode.CONFLICT).send({
      message: error.message || message,
      refreshToken: res.refreshToken
    })
  }

  unprocessibleEntity (res, error, message = defaultMessage.UN_PROCESSIBLE_ENTITY) {
    return res.status(error.statusCode || defaultStatusCode.UN_PROCESSIBLE_ENTITY).send({
      message: error.message || message,
      refreshToken: res.refreshToken
    })
  }
}
