import { InquirysService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const inquiryRouter = express.Router()
const inquirysService = new InquirysService()

inquiryRouter
  .post('/', validateToken, validatePermission, inquirysService.createInquiry.bind(inquirysService))
  .put('/:id', validateToken, validatePermission, inquirysService.updateInquiry.bind(inquirysService))
  .get('/:id', validateToken, validatePermission, inquirysService.getInquiry.bind(inquirysService))
  .get('/', validateToken, validatePermission, inquirysService.getinquirysList.bind(inquirysService))

module.exports = inquiryRouter
