import { IccidService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const iccidRouter = express.Router()
const iccidService = new IccidService()

iccidRouter
  .get('/:id', validateToken, iccidService.iccidValidate.bind(iccidService))

module.exports = iccidRouter
