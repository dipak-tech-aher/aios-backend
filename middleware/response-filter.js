import { logger } from '../config/logger'

function processArray (data, attributes) {
  let resp
  if (Array.isArray(attributes)) {
    resp = []
    for (let i = 0; i < data.length; i++) {
      if (Array.isArray(data[i])) {
        resp.push(processArray(data[i], attributes[0]))
      } else {
        resp.push(processObject(data[i], attributes[0]))
      }
    }
  } else if (typeof data === 'object') {
    resp = processObject(data, attributes)
  }
  return resp
}

function processObject (data, attributes) {
  const resp = {}
  for (const key in attributes) {
    const attr = attributes[key]
    const value = data[key]
    if (typeof attr === 'boolean' && attr) {
      resp[key] = value
    } else if (Array.isArray(attr)) {
      resp[key] = processArray(value, attr)
    } else if (typeof attr === 'object') {
      resp[key] = processObject(value, attr)
    }
  }
  return resp
}

export const requestFilter = (req, res, next) => {
  try {
    const { body } = req
    const { requestAttribute } = res.locals
    req.backupData = JSON.parse(JSON.stringify(body))
    if (requestAttribute) {
      req.body = processArray(body, requestAttribute)
    }
    next()
  } catch (error) {
    logger.error('Error while extracting the needed data', error)
  }
}

export const responseFilter = (data, attributes) => {
  try {
    return processArray(data, attributes)
  } catch (error) {
    logger.error('Error while filtering response data', error)
  }
}
