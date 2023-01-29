// import jwtDecode from 'jwt-decode'
import { isBefore, isAfter } from 'date-fns'
import { logger } from '../config/logger'
import { ResponseHelper, CryptoHelper } from './'
import { defaultMessage } from './constant'
import { UserSession, UserToken } from '../model'

const responseHelper = new ResponseHelper()
const cryptoHelper = new CryptoHelper()

export async function validateToken (req, res, next) {
  try {
    const { authorization } = req.headers
    if (!(authorization)) {
      logger.error(defaultMessage.NOT_AUTHORIZED)
      return responseHelper.notAuthorized(res, new Error('Your session has expired. Please try again'))
    }
    let decodedToken
    try {
      decodedToken = cryptoHelper.verifyJWT(authorization)
    } catch (error) {
      logger.error(error, 'JWT Token signature error')
      return responseHelper.notAuthorized(res, new Error(defaultMessage.NOT_AUTHORIZED))
    }
    const decryptedToken = cryptoHelper.decrypt(decodedToken)
    if (!decryptedToken) {
      logger.error(defaultMessage.NOT_AUTHORIZED)
      return responseHelper.notAuthorized(res, new Error(defaultMessage.NOT_AUTHORIZED))
    }
    const user = await UserSession.findOne({
      where: { sessionId: decryptedToken.sid }
    })
    if (!user) {
      logger.error(defaultMessage.NOT_AUTHORIZED)
      return responseHelper.notAuthorized(res, new Error(defaultMessage.NOT_AUTHORIZED))
    }
    // const rawData = {
    //   userId: decryptedToken.id,
    //   sessionId: decryptedToken.sid
    // }
    const date = new Date()
    const currentTime = new Date(date.getTime())
    const expireTime = new Date(decryptedToken.expiresIn)
    const fiveMinutesAgo = new Date(expireTime.getTime() - 5000 * 60)
    if (isAfter(currentTime, expireTime)) {
      // skiping the expireTime for logout
      const originalUrl = req.originalUrl.split('/api/users/')[1]
      if (originalUrl && originalUrl.split('/')[0] === 'logout') {
        next()
      }
      logger.debug('Access Token got expired')
      return responseHelper.notAuthorized(res, new Error('Your session has expired. Please try again'))
    } else if ((isBefore(fiveMinutesAgo, expireTime)) && (isAfter(expireTime, fiveMinutesAgo))) {
      // res.refreshToken = cryptoHelper.createAccessToken(rawData)
      // logger.debug('Generating New Access Token')
    }
    logger.debug('Successfully verified user')
    req.userId = decryptedToken.id
    req.roleId = user.currRoleId
    req.roleName = user.currRole
    req.department = user.currDept
    req.departmentId = user.currDeptId
    req.permissions = user.permissions
    req.email = user.payload.email
    req.contactNo = user.payload.contactNo
    next()
  } catch (error) {
    logger.error(error, 'Error while validating token')
    responseHelper.notAuthorized(res, new Error(defaultMessage.NOT_AUTHORIZED))
  }
}

export async function DTAuthVerification (req, res, next) {
  try {
    const { user, apikey } = req.headers
    if (!(apikey)) {
      logger.error(defaultMessage.NOT_AUTHORIZED)
      return responseHelper.notAuthorized(res, new Error('User not authorized'))
    }
    const tokenDetails = await UserToken.findOne({
      where: { token: apikey, userId: user, status: 'AC' }
    })
    if (!tokenDetails) {
      logger.error(defaultMessage.NOT_AUTHORIZED)
      return responseHelper.notAuthorized(res, new Error(defaultMessage.NOT_AUTHORIZED))
    }
    next()
  } catch (error) {
    logger.error(error, 'Error while validating token')
    responseHelper.notAuthorized(res, new Error(defaultMessage.NOT_AUTHORIZED))
  }
}
