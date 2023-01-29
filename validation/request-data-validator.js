import Ajv from 'ajv/dist/2020'
import SwaggerParser from '@apidevtools/swagger-parser'
import { ResponseHelper } from '../utils/response-helper'
import { defaultMessage } from '../utils/constant'
const swaggerJSON = require('../swagger.json')

const ajv = new Ajv({
  allErrors: true
})

const responseHelper = new ResponseHelper()

let swaggerAPI

export async function aiosValidator (req, res, next) {
  try {
    // console.log('Req body', req.body)

    const data = req.body

    if (!swaggerAPI) {
      const parser = new SwaggerParser()
      swaggerAPI = await parser.dereference(swaggerJSON)
      // const swaggerRefs = parser.$refs
    }

    const contentType = swaggerAPI.paths[req.originalUrl][req.method.toLowerCase()].consumes[0]

    const schema = swaggerAPI.paths[req.originalUrl][req.method.toLowerCase()].requestBody.content[contentType].schema
    const schemaName = schema.title

    let validator = ajv.getSchema(schemaName)
    if (validator === undefined) {
      console.log('Compiling schema....')
      ajv.addSchema(schema, schemaName)
      validator = ajv.getSchema(schemaName)
    }

    if (validator(data)) {
      // next()
      return responseHelper.onSuccess(res, 'Data is valid', validator.errors)
    } else {
      // console.log(JSON.stringify(validator.errors, null, 2))
      const errors = []
      for (const e of validator.errors) {
        errors.push({ attribute: e.instancePath, message: e.message })
      }
      return responseHelper.validationError(res, 'Data is invalid', errors)
    }
  } catch (error) {
    console.log(error, 'Error while validation')
    responseHelper.onError(res, new Error(defaultMessage.ERROR))
  }
}
