import { ResponseHelper } from '../utils/response-helper'
import { logger } from '../config/logger'
import { defaultMessage } from '../utils/constant'
import { isEmpty } from 'lodash'
const responseHelper = new ResponseHelper()

export async function validatePermission (req, res, next) {
  try {
    logger.debug('Validating api permission')
    const { permissions, baseUrl, method, params, originalUrl, query } = req
    const url = baseUrl.split('/api/')[1]
    const userModuleName = url.split('/')[0]
    let userPermissions
    for (const permission of permissions) {
      const modules = Object.keys(permission)
      if (modules[0].toUpperCase() === userModuleName.toUpperCase()) {
        userPermissions = permission[modules]
      }
    }
    let api = originalUrl

    if (!isEmpty(query)) {
      const urlWithoutLimit = originalUrl.substring(0, originalUrl.lastIndexOf('?') + 0)
      if (urlWithoutLimit) {
        api = urlWithoutLimit
      }
    }
    if (!isEmpty(params)) {
      const str = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1)
      if (userModuleName.toUpperCase() === 'BUSINESS-PARAMETER') {
        api = str + ':code'
      } else {
        api = str + ':id'
      }
    }
    if (Array.isArray(userPermissions)) {
      let hasPermission = false
      let accessType
      for (const x of userPermissions) {
        if (x.api === api && x.method === method && x.accessType !== 'deny') {
          hasPermission = true
          accessType = x.accessType
        }
      }
      let hasAccess = false
      if (hasPermission && accessType) {
        if (method === 'POST' && accessType === 'write') {
          hasAccess = true
        } else if (method === 'PUT' && accessType === 'write') {
          hasAccess = true
        } else if (method === 'DELETE' && accessType === 'write') {
          hasAccess = true
        } else if (method === 'GET' && (accessType === 'write' || accessType === 'read')) {
          hasAccess = true
        }
      }
      if (!hasAccess) {
        return responseHelper.accessForbidden(res, new Error(defaultMessage.ACCESS_FORBIDDEN))
      }
    } else {
      return responseHelper.accessForbidden(res, new Error(defaultMessage.ACCESS_FORBIDDEN))
    }
    logger.debug('Successfully validated api permission')
    next()
  } catch (error) {
    logger.debug(error, 'Error while validating api permissions')
    return responseHelper.validationError(res, new Error('Error while validating api permissions'))
  }
}
