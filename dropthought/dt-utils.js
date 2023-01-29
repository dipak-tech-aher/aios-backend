import { logger } from '../config/logger'
import { dropthought } from 'config'

const got = require('got')

let instance
export class DTUtils {
  constructor () {
    if (!instance) {
      instance = this
      instance.tokenDetails = {
        accessToken: '',
        refreshToken: ''
      }
    }
    return instance
  }

  async createSurveyParticipant (name, email, contactNo, intxnId, recType, closeDate, serviceType, accessNbr) {
    try {
      logger.debug('Creating survey participant')

      let count = 0

      do {
        if (instance.tokenDetails.accessToken === '' || instance.tokenDetails.refreshToken === '') {
          const loginData = await login()

          if (loginData && loginData.status === 'success') {
            instance.tokenDetails.accessToken = loginData.accessToken
            instance.tokenDetails.refreshToken = loginData.refreshToken
          } else {
            if (loginData) {
              return {
                status: loginData.status,
                message: loginData.message
              }
            } else {
              return {
                status: 'failure',
                message: 'Unable to login to Drop Throught'
              }
            }
          }
        }

        const participantData = await createParticipant(instance.tokenDetails.accessToken, name, email,
          contactNo, intxnId, recType, closeDate, serviceType, accessNbr)

        if (participantData && participantData.status === 'auth-failed' && count === 0 && instance.tokenDetails.refreshToken !== '') {
          const renewData = await renewToken(instance.tokenDetails.refreshToken)

          if (renewData && renewData.status === 'success') {
            instance.tokenDetails.accessToken = renewData.accessToken
            instance.tokenDetails.refreshToken = renewData.refreshToken
          } else {
            instance.tokenDetails.accessToken = ''
            instance.tokenDetails.refreshToken = ''
          }
        } else if (participantData) {
          return participantData
        } else {
          return {
            status: 'failure',
            message: 'Unable to create participant'
          }
        }
        count++
      } while (count < 2)
      return {
        status: 'failure',
        message: 'Unexpected error scenario while creating participant'
      }
    } catch (error) {
      logger.error(error, 'Unexpected error while creating survey participant')
      return {
        status: 'error',
        message: 'Unexpected error while creating survey participant'
      }
    }
  }
}

const login = async () => {
  logger.debug('Attempting Login to DT')

  let response = { status: 'error', message: '' }

  let data

  try {
    try {
      data = await got.post({
        url: dropthought.apiEndPoint + dropthought.login,
        headers: {
          'Content-Type': 'application/json'
        },
        json: {
          email: dropthought.loginEmail,
          password: dropthought.loginPassword
        },
        retry: 0
      })
    } catch (error) {
      logger.error(error, 'Error during Drop Thought Login')
      return handleError(error)
    }

    if (data && data.body) {
      const loginResp = JSON.parse(data.body)

      if (loginResp.success) {
        logger.debug('Login successful')
        response = {
          status: 'success',
          accessToken: loginResp.result.accessToken,
          refreshToken: loginResp.result.refreshToken
        }
      } else {
        response = {
          status: 'failure',
          message: 'Login to Drop Thought not successful'
        }
        logger.debug('Login to Drop Thought not successful')
      }
    } else {
      response = {
        status: 'failure',
        message: 'No response received from Drop Thought for login'
      }
      logger.debug('No response received from Drop Thought for login')
    }
    // response = { status: true, message: '' }
  } catch (error) {
    response = {
      status: 'error',
      message: 'Unexpected error during Drop Thought Login'
    }
    logger.error(error, 'Unexpected error during Drop Thought Login')
  }
  return response
}

const renewToken = async (refreshToken) => {
  logger.debug('Renewing Drop Thought token')

  let response = { status: 'error', message: '' }
  let data

  try {
    try {
      data = await got.post({
        url: dropthought.apiEndPoint + dropthought.renewToken,
        json: {
          refreshToken: refreshToken
        },
        retry: 0
      })
    } catch (error) {
      logger.error(error, 'Error while renewing token')
      return handleError(error)
    }

    if (data && data.body) {
      const renewResp = JSON.parse(data.body)

      if (renewResp && renewResp.accessToken && renewResp.refreshToken && renewResp.accessToken !== '' && renewResp.refreshToken !== '') {
        logger.debug('Renew successful')
        response = {
          status: 'success',
          accessToken: renewResp.accessToken,
          refreshToken: renewResp.refreshToken
        }
      } else {
        response = {
          status: 'failure',
          message: 'Renew token failed'
        }
        logger.debug('Renew token failed')
      }
    } else {
      response = {
        status: 'failure',
        message: 'No response received from Drop Thought for renew token'
      }
      logger.debug('No response received from Drop Thought for renew token')
    }
    // response = { status: true, message: '' }
  } catch (error) {
    response = {
      status: 'error',
      message: 'Unexpected error during renew token'
    }
    logger.error(error, 'Unexpected error during renew token')
  }
  return response
}

const createParticipant = async (accessToken, name, email, contactNo, intxnId, recType, closeDate, serviceType, accessNbr) => {
  logger.debug('Creating survey pariticipant')

  let response = { httpStatusCode: -1, status: 'error', message: '' }

  let data

  try {
    const dJson = {
      data: [
        name,
        email,
        contactNo,
        intxnId,
        recType,
        closeDate,
        serviceType,
        accessNbr
      ],
      header: dropthought.header,
      created_by: dropthought.createdBy
    }
    try {
      // console.log('DT Payload ', {
      //     data: [
      //         name,
      //         email,
      //         contactNo,
      //         intxnId,
      //         recType,
      //         closeDate,
      //         serviceType,
      //         accessNbr
      //     ],
      //     header: dropthought.header,
      //     created_by: dropthought.createdBy
      // })

      data = await got.post({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken
        },
        url: dropthought.apiEndPoint + dropthought.createParticipant,
        json: dJson,
        retry: 0
      })
    } catch (error) {
      logger.error(error, 'Error during create participant')
      return handleError(error)
    }

    // data = {
    //     body: {
    //         "result": [
    //             {
    //                 "id": 2,
    //                 "data": "[\"Imagine-1\", \"sudhakar.dropthought.com\", \"112233\", \"Img1000\", \"Service Request\", \"Ser_Type-1\", \"Ser100\"]",
    //                 "header": "[\"Account Name\", \"Primary Email ID\", \"Primary Contact Number\", \"Ticket ID\", \"Ticket Type\", \"Service Type\", \"Service Number\"]",
    //                 "meta_data": "[\"NAME\", \"EMAIL\", \"PHONE\", \"String\", \"String\", \"String\", \"String\"]",
    //                 "question_metadata": null,
    //                 "participant_uuid": "e4cb6d2a-d02e-4204-8178-931abe7fb091",
    //                 "created_by": 355,
    //                 "created_time": "2020-11-03 08:42:56.0",
    //                 "modified_by": null,
    //                 "modified_time": null
    //             }
    //         ],
    //         "success": true
    //     }
    // }

    if (data && data.body) {
      const participantResp = JSON.parse(data.body)

      if (participantResp && participantResp.success) {
        logger.debug('Create Participant Successful')
        response = {
          status: 'success',
          result: participantResp.result,
          data: dJson
        }
      } else if (participantResp && participantResp.success === false) {
        response = {
          status: 'failure',
          message: 'Create Participant failed',
          dtResponse: participantResp,
          data: dJson
        }
        logger.debug('Create Participant failed')
      } else {
        response = {
          status: 'failure',
          message: 'Create Participant failed',
          data: dJson
        }
        logger.debug('Create Participant failed')
      }
    } else {
      response = {
        status: 'failure',
        message: 'No response received from Drop Thought for create participant'
      }
      logger.debug('No response received from Drop Thought for create participant')
    }
    // response = { status: true, message: '' }
  } catch (error) {
    response = {
      status: 'error',
      message: 'Unexpected error during create participant'
    }
    logger.error(error, 'Unexpected error during create participant')
  }
  return response
}

const handleError = (error) => {
  let statusCode
  let message

  if (error.response) {
    if (error.response.statusCode) {
      statusCode = error.response.statusCode
    }
    if (error.response.body) {
      const parsed = JSON.parse(error.response.body)
      if (parsed && parsed.message) {
        message = (statusCode) ? statusCode + '-' + parsed.message : parsed.message
      } else {
        message = (statusCode) ? statusCode + '-' + 'Error during Drop Thought Login, but no error message' : 'Error during Drop Thought Login, but no error message'
      }
    } else {
      message = (statusCode) ? statusCode + '-' + 'Error during Drop Thought Login, but no error message' : 'Error during Drop Thought Login, but no error message'
    }
  } else {
    message = (statusCode) ? statusCode + '-' + 'Error during Drop Thought Login, but no error message' : 'Error during Drop Thought Login, but no error message'
  }
  if (statusCode === 401) {
    return {
      status: 'auth-failed',
      message: message
    }
  } else {
    return {
      status: 'error',
      message: message
    }
  }
}
