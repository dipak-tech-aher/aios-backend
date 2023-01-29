import { logger } from '../config/logger'
import { tibco } from 'config'
import {
  prepaidSummaryTransformer, postpaidSummaryTransformer,
  fixedLineSummaryTransformer, customerAccountNbrDetailsTransformer, ticketDetailsTransformer,
  prepaidStatusTransformer, postpaidStatusTransformer,
  fixedLineStatusTransformer, customerDetailsTransformer, fixedLineChatDetailsTransformer
} from '../transforms/transform-rules'

const soap = require('soap')
const got = require('got')

const ADD_BALANCE_TRANSACTION_TYPE = 'TT07'
const ADD_BALANCE_TRANSACTION_CODE = 'TT01'
const TOPUP_CURRENCY = 'BND'

export const addBalanceService = async (uniqueRef, accessNbr, refillProfileValue, refillValue, purpose, balanceTxnCode) => {
  const options = {
    endpoint: tibco.soapAPIEndpoint + tibco.addBalanceAPI,
    disableCache: false
  }
  const url = './tibco/tibco.wsdl'

  const args = {
    source: 'PORTAL',
    uuid: uniqueRef,
    balance: {
      msisdn: accessNbr,
      transactionType: ADD_BALANCE_TRANSACTION_TYPE,
      transactionCode: ADD_BALANCE_TRANSACTION_CODE,
      refillProfileValue: refillProfileValue,
      value: refillValue,
      currencyValue: TOPUP_CURRENCY,
      purpose: purpose,
      balancetxncode: balanceTxnCode
    }
  }

  console.log('Invoking Add Balance SOAP API with args ', args)

  // const responseData = {status: true, message: ""}
  // soap.createClient(url, options, function (err, client) {
  //   if (err) {
  //     console.error(err)
  //   } else {
  //     client.setSecurity(new soap.BasicAuthSecurity('Aios', '$Tibc0@Aios$'));
  //     client.addBalance(args, function (err, result, rawResponse, soapHeader, rawRequest) {
  //       if (err) {
  //         console.error(err)
  //       } else {
  //         console.log('result', result)
  //         console.log('rawResponse', rawResponse)
  //         console.log('rawRequest', rawRequest)
  //         console.log('client.lastRequest', client.lastRequest)
  //         console.log('response', JSON.stringify(response, null, 2))

  //         if(result && result.code && result.code.indexOf('SUCCESS' >= 0)) {
  //           responseData.status = true;
  //           responseData.code = result.code;
  //           responseData.message = result.message
  //         } else if(result && result.code) {
  //           responseData.status = false;
  //           responseData.code = result.code;
  //           responseData.message = result.message
  //         } else {
  //           responseData.status = false;
  //           responseData.code = '';
  //           responseData.message = 'TIBCO did not return any code/error message'
  //         }
  //       }
  //     })
  //   }
  // })

  const responseData = {}
  try {
    await soap.createClientAsync(url, options)
      .then((client) => {
        client.setSecurity(new soap.BasicAuthSecurity(tibco.username, tibco.passwd))
        return client.addBalanceAsync(args, options)
      }).then((result) => {
        console.log(result[0])
        if (result && result[0] && result[0].code && result[0].code.indexOf('SUCCESS') >= 0) {
          responseData.status = 'success'
          responseData.message = result[0].message
        } else if (result && result[0]) {
          responseData.status = 'failure'
          if (result[0].code && result[0].message) {
            responseData.message = 'Error during Add Balance ' + result[0].code + ', ' + result[0].message
            logger.error(responseData.message)
          } else {
            responseData.message = 'Error during add balance'
          }
        } else {
          responseData.status = 'failure'
          responseData.message = 'TIBCO did not return any code/error message during Add Balance'
        }
      })
  } catch (error) {
    responseData.status = 'error'
    responseData.message = 'Unexpected error during Add Balance'
    logger.error(error, 'Error during add balance')
  }
  return responseData
}

export const blockAccessNumber = async (accessNbr, iccid) => {
  try {
    logger.debug('Access Number : ', accessNbr, '  ICCID : ', iccid)
    let response = { status: false, message: '' }
    let responseIccid
    if (iccid !== 'FIXEDLINE') {
      responseIccid = await got.get({
        headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
        url: tibco.apiEndPoint + tibco.iccidValidationAPI + '?iccid=' + iccid,
        retry: 0
      })
    }
    if (iccid === 'FIXEDLINE' || (responseIccid && responseIccid.body)) {
      let iccidResp
      if (iccid !== 'FIXEDLINE') {
        iccidResp = JSON.parse(responseIccid.body)
        console.log('iccidResp', iccidResp)
        console.log('iccidResp.statusCode', iccidResp.statusCode)
      }
      if (iccid === 'FIXEDLINE' || (iccidResp && iccidResp.statusCode === 'SUCCESS-001')) {
        logger.debug('Successfully fetched iccid from Tibco service')
        try {
          logger.debug('Updating access number status to Tibco')
          const reqBody = {
            accessNumber: accessNbr,
            category: '',
            identifier: 'PENDING',
            iccid: iccid
          }
          console.log('Block Access Nbr', reqBody)
          const data = await got.put({
            headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
            url: tibco.apiEndPoint + tibco.accessNumberAPI,
            body: JSON.stringify(reqBody),
            retry: 0
          })
          let blockResp
          if (data && data.body) {
            blockResp = JSON.parse(data.body)
            console.log('blockResp', blockResp)
            console.log('blockResp', blockResp.statusCode)
            if (blockResp && blockResp.statusCode === 'SUCCESS-001') {
              logger.debug('Successfully updated the identifer status')
              response = { status: true, message: '' }
            } else {
              response = { status: false, message: blockResp.statusMsg }
            }
          } else {
            logger.debug('No response received from TIBCO for block access number')
            response = { status: false, message: 'No response received from TIBCO for block access number' }
          }
          // response = { status: true, message: '' }
        } catch (error) {
          logger.error(error, 'Error while Updating the identifer status')
          response = { status: false, message: 'Error while Updating the identifer status' }
        }
      } else {
        logger.debug('ICCID Validation failed')
        response = { status: false, message: iccidResp.statusMsg }
      }
    } else {
      logger.debug('No response received from TIBCO for ICCID Validation')
      response = { status: false, message: 'No response received from TIBCO for ICCID Validation' }
    }

    return response
  } catch (error) {
    logger.error(error, 'Error while blocking the access number')
    return false
  }
}

export const allocateAccessNumber = async (accessNbr, iccid) => {
  try {
    logger.debug('Access Number : ', accessNbr, '  ICCID : ', iccid)
    let response = false
    const reqBody = {
      accessNumber: accessNbr,
      category: '',
      identifier: 'ALLOCATED',
      iccid: iccid
    }
    const data = await got.put({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      url: tibco.apiEndPoint + tibco.accessNumberAPI,
      body: JSON.stringify(reqBody),
      retry: 0
    })
    if (data && data.body) {
      const allocateResp = JSON.parse(data.body)
      console.log('allocateAccessNumber Resp', allocateResp)
      if (allocateResp.statusCode === 'SUCCESS-001') {
        response = true
      } else {
        logger.debug('Unable to allocate access number in TIBCO', allocateResp.statusMsg)
        response = false
      }
    } else {
      logger.debug('No data received from TIBCO during allocation')
      response = false
    }
    return response
  } catch (error) {
    logger.error(error, 'Error while allocating access number to customer')
    return false
  }
}

export const getRealtimeServiceDetails = async (accessNbr, serviceType, summaryOnlyFlag) => {
  try {
    logger.debug('Fetching service summary for Access Nbr : ', accessNbr)
    let response = {}
    let identifier
    if (serviceType === 'Prepaid' || serviceType === 'Postpaid') {
      identifier = 'MOBILE'
    } else if (serviceType === 'Fixed') {
      identifier = 'FIXEDLINE'
    }
    const reqBody = {
      accessNumber: accessNbr,
      identifier: identifier,
      trackingId: '',
      summaryOnlyFlag: summaryOnlyFlag
    }

    const realtimeResponse = await got.put({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      url: tibco.customerAPIEndPoint + tibco.customerSummaryAPI,
      body: JSON.stringify(reqBody),
      retry: 0
    })

    // const parsedRealtimeData = JSON.parse(realtimeResponse.body)
    const parsedRealtimeData = JSON.parse(realtimeResponse.body)
    logger.debug('Real time response from tibco:-', parsedRealtimeData)
    // const parsedRealtimeData = {}
    // const data = await got.get({
    //   headers: { 'content-type': 'application/json', authorization: '' },
    //   url: tibco.customerAPIEndPoint + tibco.customerSummaryAPI,
    //   body: JSON.stringify(reqBody),
    //   retry: 0
    // })

    // const data = await got.get({
    //   headers: { 'content-type': 'application/json', authorization: '' },
    //   url: 'http://192.168.4.102/customer/customersummary',
    //   body: JSON.stringify(reqBody),
    //   retry: 0
    // })
    if (summaryOnlyFlag === 'false') {
      if (serviceType === 'Fixed') {
        response = fixedLineSummaryTransformer.evaluate(parsedRealtimeData)
        response.serviceNbr = accessNbr
        response.serviceType = serviceType
      } else if (serviceType === 'Postpaid') {
        response = postpaidSummaryTransformer.evaluate(parsedRealtimeData)
        response.serviceNbr = accessNbr
        response.serviceType = serviceType
      } else if (serviceType === 'Prepaid') {
        response = prepaidSummaryTransformer.evaluate(parsedRealtimeData)
        response.serviceNbr = accessNbr
        response.serviceType = serviceType
      }
    } else {
      if (serviceType === 'Fixed') {
        response = fixedLineStatusTransformer.evaluate(parsedRealtimeData)
        response.serviceNbr = accessNbr
        response.serviceType = serviceType
        // response.currentPlanCode = 'NEWTP002'
        console.log(response)
      } else if (serviceType === 'Postpaid') {
        response = postpaidStatusTransformer.evaluate(parsedRealtimeData)
        response.serviceNbr = accessNbr
        response.serviceType = serviceType
        // response.currentPlanCode = 'GSMS1000'
      } else if (serviceType === 'Prepaid') {
        response = prepaidStatusTransformer.evaluate(parsedRealtimeData)
        response.serviceNbr = accessNbr
        response.serviceType = serviceType
      }
    }
    logger.debug('Fetched service summary for Access Nbr : ', accessNbr)
    return response
  } catch (error) {
    console.log(error)
    logger.error(error, 'Error while fetching service summary from TIBCO')
    return {}
  }
}

export const mobileAddBalanceService = async (topupBooster, uuid, accessNbr, offerId,
  purpose, refillProfileValue, balanceTxnCode, value) => {
  try {
    logger.debug('Mobile Add Balance : ', accessNbr)
    let response = {}
    const reqBody = {
      source: tibco.source,
      identifier: topupBooster,
      uuid: uuid,
      balance: {
        msisdn: accessNbr,
        offerId: offerId,
        transactionType: ADD_BALANCE_TRANSACTION_TYPE,
        transactionCode: ADD_BALANCE_TRANSACTION_CODE,
        purpose: purpose,
        currencyValue: TOPUP_CURRENCY,
        refillProfileValue: refillProfileValue,
        balancetxncode: balanceTxnCode,
        value: value
      }
    }

    const url = tibco.addBalanceMobileAPIEndpoint + tibco.addBalanceMobileAPI

    console.log('mobileAddBalanceService Request ', reqBody)
    const data = await got.put({
      url: url,
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      json: reqBody
    })
    // const data = {}
    if (data && data.body) {
      const respData = JSON.parse(data.body)
      console.log('Mobile Add Balance Response', respData)
      if (respData && respData.code && (respData.code.indexOf('SUCCESS') >= 0)) {
        if (topupBooster === 'Booster') {
          if (respData.productId && respData.productId > 0) {
            response.txnReference = respData.productId
            response.status = 'success'
            if (respData.message) {
              response.message = respData.message
            } else {
              response.messsage = 'Success, but no message'
            }
          } else {
            response.status = 'failure'
            if (respData.message) {
              response.message = respData.message
            } else {
              response.messsage = 'Success, but no message'
            }
          }
        } else {
          response.status = 'success'
          if (respData.message) {
            response.message = respData.message
          } else {
            response.messsage = 'Success, but no message'
          }
        }
      } else {
        if (respData.code && respData.message) {
          response = { status: 'failure', messsage: respData.code + ', ' + respData.message }
        } else if (respData.code) {
          response = { status: 'failure', messsage: respData.code + ', failed and no message' }
        } else {
          response = { status: 'failure', messsage: 'Failed and no message' }
        }
      }
    } else {
      logger.debug('No data received from TIBCO MObile Add Balance Service')
      response = { status: 'error', messsage: 'No data received from TIBCO' }
    }
    logger.debug('Fixed Line Add Balance Response', response)
    return response
  } catch (error) {
    logger.error(error, 'Error while invoking Mobile Add Balance Service')
    return { status: 'error', messsage: 'Unexpected error while incoking Mobile Add Balance Service' }
  }
}

export const mobileAddBalanceServiceImagine = async (topupBooster, uuid, accessNbr, offerId,
  purpose, refillProfileValue, balanceTxnCode, value) => {
  try {
    logger.debug('Mobile Add Balance : ', accessNbr)
    let response = {}
    const reqBody = {
      source: tibco.source,
      identifier: topupBooster,
      uuid: uuid,
      balance: {
        msisdn: accessNbr,
        offerId: offerId,
        transactionType: ADD_BALANCE_TRANSACTION_TYPE,
        transactionCode: ADD_BALANCE_TRANSACTION_CODE,
        purpose: purpose,
        currencyValue: TOPUP_CURRENCY,
        refillProfileValue: refillProfileValue,
        balancetxncode: balanceTxnCode,
        value: value
      }
    }
    let url = tibco?.addBalanceMobileAPIEndpointImagine + tibco?.addBalanceMobileAPI

    logger.debug('mobileAddBalanceService Request ', reqBody)
    logger.debug('---------TIBCO ENDPOINT URL ADDBALANCE--------->', url)
    const data = await got.put({
      url: url,
      headers: { Authorization: 'Basic ' + Buffer.from(tibco?.username + ':' + tibco?.passwd).toString('base64') },
      json: reqBody
    })
    if (data && data?.body) {
      const respData = JSON.parse(data?.body)
      logger.debug('Mobile Add Balance Response', respData)
      if (respData && respData?.code && (respData?.code.indexOf('SUCCESS') >= 0)) {
        response.code = respData?.code
        response.status = 'success'
        if (respData?.message) {
          response.message = respData?.message
        } else {
          response.messsage = 'Success, but no message'
        }
      } else {
        if (respData?.code && respData?.message) {
          if (respData.message === 'Below Minimum Balance') {
            response = { status: 'failure_mini_balance', messsage: respData?.code + ', ' + respData?.message }
          } else {
            response = { status: 'failure', messsage: respData?.code + ', ' + respData?.message }
          }
        } else if (respData.code) {
          response = { status: 'failure', messsage: respData?.code + ', failed and no message' }
        } else {
          response = { status: 'failure', messsage: 'Failed and no message' }
        }
      }
    } else {
      logger.debug('No data received from TIBCO MObile Add Balance Service')
      response = { status: 'failure', messsage: 'No data received from TIBCO' }
    }
    logger.debug('Add Balance Response', response)
    return response
  } catch (error) {
    logger.error(error, 'Error while invoking Mobile Add Balance Service')
    return { status: 'failure', messsage: 'Unexpected error while invoking Mobile Add Balance Service' }
  }
}

export const fixedlineAddBalanceService = async (accountNbr, accessNbr, plan) => {
  try {
    logger.debug('Fixed line Add Balance : ', accessNbr)
    let response = {}
    const reqBody = {
      AccountNumber: accountNbr,
      ServiceNumber: accessNbr,
      Plan: plan,
      Source: tibco.source
    }

    const url = tibco.fixedLineAddBalanceEndPoint + tibco.fixedLineAddBalanceAPI

    console.log('fixedlineAddBalanceService Request', reqBody)
    const data = await got.post({
      url: url,
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      json: reqBody
    })
    if (data && data.body) {
      const respData = JSON.parse(data.body)
      // const respData = {"code": "SUCCESS-001", "msg": "Addbalance(Top-up) is successful", BOD: plan + "_1"}

      console.log('Fixed Add Balance Response', respData)
      if (respData && respData.code && (respData.code.indexOf('SUCCESS') >= 0)) {
        if (respData.BOD && respData.BOD !== '') {
          response.txnReference = respData.BOD
          response.status = 'success'
          if (respData.msg) {
            response.message = respData.msg
          } else {
            response.messsage = 'Success, but no message'
          }
        } else {
          response.status = 'failure'
          if (respData.msg) {
            response.message = respData.msg
          } else {
            response.messsage = 'Success, but no message'
          }
        }
      } else {
        if (respData.code && respData.msg) {
          response = { status: 'failure', messsage: respData.code + ', ' + respData.msg }
        } else if (respData.code) {
          response = { status: 'failure', messsage: respData.code + ', failed and no message' }
        } else {
          response = { status: 'failure', messsage: 'Fixed Line Add Balance failed and no message' }
        }
      }
    } else {
      logger.debug('No data received from TIBCO for Fixed Line Add Balance Service')
      response = { status: 'error', messsage: 'No data received from TIBCO for Fixed Line Add Balance' }
    }
    logger.debug('Fixed Line Add Balance Response', response)
    return response
  } catch (error) {
    logger.error(error, 'Error while invoking Fixed Line Add Balance Service')
    return { status: 'error', messsage: '' }
  }
}

export const ocsBarUnBarSubscription = async (invokeType, accessNbr, trackingId) => {
  try {
    logger.debug('OCS ' + invokeType + ' invoke : ', accessNbr)
    let response = false
    const reqBody = {
      msisdn: accessNbr,
      source: tibco.source,
      trackingId: trackingId
    }

    let url
    if (invokeType === 'BAR') {
      url = tibco.ocsBarEndPoint + tibco.ocsBarAPI
    }
    if (invokeType === 'UNBAR') {
      url = tibco.ocsUnBarEndPoint + tibco.ocsUnBarAPI
    }

    const data = await got.put({
      url: url,
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      json: reqBody
    })
    // 'ERROR-001' for technical errors.
    // 'ERROR-ECMS-010' for OCS related erros..
    // 'ERROR-002' for Business validation error
    if (data && data.body) {
      const respData = JSON.parse(data.body)
      if (respData && respData.code) {
        console.log(invokeType + ' Resp Data', respData)
        if (respData.code.indexOf('SUCCESS') >= 0) {
          response = { status: 'success', message: (respData.code + (respData.message) ? respData.message : '') }
        } else if (respData.code === 'ERROR-001') {
          response = { status: 'error', message: (respData.code + (respData.message) ? respData.message : '') }
        } else {
          response = { status: 'failure', message: (respData.code + (respData.message) ? respData.message : '') }
        }
      } else {
        response = { status: 'failure', message: (respData.code + (respData.message) ? respData.message : '') }
      }
    } else {
      response = { status: 'failure', message: 'OCS ' + invokeType + ' failed without response' }
    }
    return response
  } catch (error) {
    logger.error(error, 'Error while invoking OCS Bar/UnBar')
    return { status: 'error', message: 'Unexpected error while invoking OCS' }
  }
}

export const getCustomerAccountNbr = async (accessNbr, serviceType) => {
  try {
    logger.debug('Fetching Customer And Account Number for : ', accessNbr)
    let response = {}
    let identifier
    if (serviceType === 'Prepaid' || serviceType === 'Postpaid') {
      identifier = 'MOBILE'
    } else if (serviceType === 'Fixed') {
      identifier = 'FIXEDLINE'
    }
    const reqBody = {
      accessNumber: accessNbr,
      identifier: identifier,
      trackingId: ''
    }

    const realtimeResponse = await got.put({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      url: tibco.customerAPIEndPoint + tibco.customerSummaryAPI,
      body: JSON.stringify(reqBody),
      retry: 0
    })

    // const parsedRealtimeData = JSON.parse(realtimeResponse.body)
    const parsedRealtimeData = JSON.parse(realtimeResponse.body)
    // console.log('parsedRealtimeData', parsedRealtimeData)
    // const parsedRealtimeData = {}
    // const data = await got.get({
    //   headers: { 'content-type': 'application/json', authorization: '' },
    //   url: tibco.customerAPIEndPoint + tibco.customerSummaryAPI,
    //   body: JSON.stringify(reqBody),
    //   retry: 0
    // })

    // const data = await got.get({
    //   headers: { 'content-type': 'application/json', authorization: '' },
    //   url: 'http://192.168.4.102/customer/customersummary',
    //   body: JSON.stringify(reqBody),
    //   retry: 0
    // })

    response = customerAccountNbrDetailsTransformer.evaluate(parsedRealtimeData)

    logger.debug('Fetched service summary for Access Nbr : ', accessNbr)
    return response
  } catch (error) {
    logger.error(error, 'Error while fetching Customer Nbr and Account Nbr from TIBCO')
    return {}
  }
}

export const getCustomerDetails = async (accessNbr, serviceType, trackingId) => {
  try {
    logger.debug('Fetching Customer And Account Number for : ', accessNbr)
    let response = {}
    let identifier
    if (serviceType === 'Prepaid' || serviceType === 'Postpaid' || serviceType === 'PREPAID' || serviceType === 'POSTPAID') {
      identifier = 'MOBILE'
    } else if (serviceType === 'Fixed' || serviceType === 'FIXED' || serviceType === 'FIXEDLINE') {
      identifier = 'FIXEDLINE'
    }

    const reqBody = {
      accessNumber: accessNbr,
      identifier: identifier,
      trackingId: trackingId
    }
    const realtimeResponse = await got.put({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      url: tibco.customerAPIEndPoint + tibco.customerSummaryAPI,
      body: JSON.stringify(reqBody),
      retry: 0
    })
    // console.log('realtimeResponse::::::',realtimeResponse.body)
    const parsedRealtimeData = JSON.parse(realtimeResponse.body)
    if (identifier === 'MOBILE') {
      response = customerDetailsTransformer.evaluate(parsedRealtimeData)
    } else if (identifier === 'FIXEDLINE') {
      response = fixedLineChatDetailsTransformer.evaluate(parsedRealtimeData)
    }

    // console.log('response::::::',response)

    logger.debug('Fetched service summary for Access Nbr : ', accessNbr)
    return response
  } catch (error) {
    logger.error(error, 'Error while fetching Customer Nbr and Account Nbr from TIBCO')
    return {}
  }
}

export const getAccessNumberList = async (reqBody) => {
  try {
    logger.debug('Request Body : ', reqBody)

    const response = await got.put({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      url: tibco.apiEndPoint + tibco.accessNumberAPI,
      body: JSON.stringify(reqBody),
      retry: 0
    })
    if (response) {
      logger.debug('Successfully fetched the access number list')
      logger.debug('response : ', JSON.parse(response.body))
      let resp = {}
      resp = JSON.parse(response.body)

      const respData = resp.accessNumberDetails
      // console.log("Array : "+  typeof(respData))
      // console.log("Array : "+  JSON.stringify(respData))
      const array = []
      if (resp.statusCode === 'SUCCESS-001') {
        respData.forEach((element, id) => {
          array.push({ label: element.accessNumber, category: element.category })
        })
      }
      // console.log("Array : "+ JSON.stringify(array))
      return array
    }
  } catch (error) {
    logger.error(error, 'Error while getting the access number list')
  }
}

export const validateIccid = async (iccid) => {
  try {
    logger.debug('ICCID : ', iccid)

    const responseIccid = await got.get({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      url: tibco.apiEndPoint + tibco.iccidValidationAPI + '?iccid=' + iccid,
      retry: 0
    })
    console.log('ICCID : ', responseIccid)
    if (responseIccid) {
      logger.debug('Successfully validated ICCID ')
      logger.debug('response : ', JSON.parse(responseIccid.body))
      let resp = {}
      resp = JSON.parse(responseIccid.body)
      // console.log("response : ",typeof(responseIccid.body))
      return resp
    }
  } catch (error) {
    logger.error(error, 'Error while validating ICCID')
  }
}

export const getTicketDetails = async (ticketId, intnxType) => {
  // console.log("Hi 2")
  try {
    logger.debug('Fetching data through ticket id : ', ticketId, 'Interaction Type : ', intnxType)
    let ticket = ''
    if (ticketId.length === 5) {
      if (intnxType === 'REQCOMP') {
        ticket = 'TKT01' + ticketId
      } else if (intnxType === 'REQSR') {
        ticket = 'SRQ01' + ticketId
      }
    } else {
      ticket = ticketId
      /* if (intnxType === 'REQCOMP') {
        ticket = 'TKT0' + ticketId
      } else if (intnxType === 'REQSR') {
        ticket = 'SRQ0' + ticketId
      } */
    }

    let response = {}
    const plainCredential = tibco.username + ':' + tibco.passwd
    // Encode with base64
    const encodedCredential = Buffer.from(plainCredential).toString('base64')
    const authorizationField = 'Basic ' + encodedCredential
    // console.log("Base 64 : ",authorizationField)
    // console.log("ticket : ",ticket)
    const realtimeResponse = await got.get({
      headers: { 'content-type': 'application/json', authorization: authorizationField },
      url: tibco.ticketApiEndPoint + tibco.ticketDetailsAPI + '?ticketid=' + ticketId + '&source=' + tibco.source,
      retry: 0
    })

    if (realtimeResponse && realtimeResponse.body) {
      // console.log("response1",realtimeResponse)
      // console.log("Response : ",realtimeResponse);
      const parsedRealtimeData = JSON.parse(realtimeResponse.body)

      if (parsedRealtimeData && parsedRealtimeData.code.indexOf('SUCCESS') >= 0) {
        // console.log("response1",parsedRealtimeData)
        response = ticketDetailsTransformer.evaluate(parsedRealtimeData)
        // console.log('Response : ', response)
      }
    }

    logger.debug('Fetched ticket details for id', ticketId)
    return response
  } catch (error) {
    logger.error(error, 'Error while fetching ticket details from TIBCO')
    return {}
  }
}

export const ocsCustomerStatus = async (uuid, msisdn) => {
  try {
    logger.debug('ocsCustomerStatus : ', msisdn)

    const queryString = '?source=' + tibco.source + '&uuid=' + uuid + '&msisdn=' + msisdn

    console.log(tibco.ocsCustomerSummaryEndPoint + tibco.ocsCustomerSummaryAPI + queryString)

    const ocsSummary = await got.get({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
      url: tibco.ocsCustomerSummaryEndPoint + tibco.ocsCustomerSummaryAPI + queryString,
      retry: 0
    })
    if (ocsSummary) {
      const resp = JSON.parse(ocsSummary.body)
      console.log('ocsResp : ', resp)
      if (resp.SuccessResponse) {
        return { status: resp.SuccessResponse.subscriberStatus, message: '' }
      } else if (resp.ErrorResponse) {
        return {
          status: '',
          message: ((resp.ErrorResponse.code) ? resp.ErrorResponse.code : '') + '-' + ((resp.ErrorResponse.message) ? resp.ErrorResponse.message : '') === ''
        }
      } else {
        return { status: '', message: 'Invalid Response from OCS for Customer Summary' }
      }
    } else {
      return { status: '', message: 'Empty Response from OCS for Customer Summary' }
    }
  } catch (error) {
    logger.error(error, 'Error while fetching OCS Customer Summary')
    return { status: '', message: 'Unexpected error fetching Customer Summary from OCS' }
  }
}


export const getOMSTickets = async (ticketId) => {
  const accessToken = await authenticateUNN()
  const reqBody = {
    workFlowName: 'APITKTCoreTicketTS',
    workFlowParams: {
      methodName: 'GlobleSearchTicketTS',
      strId: 'SASRQ',
      strSrvcNum: ticketId,
      strToken: accessToken,
      strUserId: 'AIOS2'
    }
  }
  const response = await got.post({
    headers: { 'content-type': 'application/json' },
    url: unnProperties.URL,
    body: JSON.stringify(reqBody),
    retry: 0
  })
  if (response && response.body) {
    const data = JSON.parse(response.body)
    if (data.responseStatus === 'SUCCESS') {
      const result = data.grid_array.filter(e => e.customerDetails)
      return result[0]
    }
  }
}

export const editOMSOnQCPass = async (ticketId) => {
  const accessToken = await authenticateUNN()
  const reqBody = {
    "workFlowName": "APITKTCoreTicketTS",
    "workFlowParams": {
      "methodName": "SubmitEditTktsTS",
      "strApplicationId": ticketId,
      "strTicketId": ticketId,
      "strStatusCode": "QC-PASS",
      "strComment": "AIOS closing ticket in OMS",
      "strToken": accessToken,
      "strUserId": "AIOS2"
    }
  }
  const response = await got.post({
    headers: { 'content-type': 'application/json' },
    url: unnProperties.URL,
    body: JSON.stringify(reqBody),
    retry: 0
  })
  if (response && response.body) {
    const data = JSON.parse(response.body)
    return data.responseStatus
  } else {
    return 'FAILURE'
  }
}

const authenticateUNN = async () => {
  logger.debug('Authenticating UNN service')
  const loginResponse = await got.post({
    headers: { 'content-type': 'application/json' },
    url: unnProperties.URL,
    body: JSON.stringify(unnCredentials),
    retry: 0
  })
  if (loginResponse && loginResponse.body) {
    const response = JSON.parse(loginResponse.body)
    if (response.responseStatus === 'SUCCESS') {
      return response.hdrcache[0].strToken
    }
  } else {
    logger.debug('Unable to reach UNN service')
  }
  return null
}
