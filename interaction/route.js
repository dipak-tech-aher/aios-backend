import { InteractionService } from './service'
import express from 'express'
import { validateToken } from './../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const InteractionRouter = express.Router()
const interactionService = new InteractionService()

InteractionRouter

  .post('/search', validateToken, validatePermission, interactionService.searchInteraction.bind(interactionService))
  .post('/count', validateToken, validatePermission, interactionService.countInteraction.bind(interactionService))
  .post('/followUp', validateToken, validatePermission, interactionService.addFollowUp.bind(interactionService))
  .put('/assignSelf/:id', validateToken, validatePermission, interactionService.assignToSelf.bind(interactionService))
  .put('/reassign/:id', validateToken, validatePermission, interactionService.reAssign.bind(interactionService))
  .put('/cancellation', validateToken, interactionService.ticketCancellation.bind(interactionService))
  .get('/', validateToken, validatePermission, interactionService.getInteractionList.bind(interactionService))
  .get('/followUp/:id', validateToken, validatePermission, interactionService.getFollowUp.bind(interactionService))
  .get('/history/:id', validateToken, validatePermission, interactionService.getHistory.bind(interactionService))
  .post('/interaction-detail', validateToken, interactionService.getTerminateData.bind(interactionService))
  
module.exports = InteractionRouter
