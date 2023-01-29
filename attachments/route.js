import { AttachmentService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'
const attachmeentRouter = express.Router()
const attachmentService = new AttachmentService()

attachmeentRouter
  .post('/', validateToken, validatePermission, attachmentService.createAttachment.bind(attachmentService))
  .get('/', validateToken, validatePermission, attachmentService.getAttachmentList.bind(attachmentService))
  .get('/:id', validateToken, validatePermission, attachmentService.getAttachment.bind(attachmentService))
  .delete('/:id', validateToken, validatePermission, attachmentService.deleteAttachment.bind(attachmentService))

module.exports = attachmeentRouter
