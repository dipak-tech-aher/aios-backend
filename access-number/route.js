import { AccessNumberService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const accessNumberRouter = express.Router()
const accessNumberService = new AccessNumberService()

accessNumberRouter
  .get('/', validateToken, accessNumberService.getAccessNumber.bind(accessNumberService))

module.exports = accessNumberRouter
