import { LeadService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const leadRouter = express.Router()
const leadService = new LeadService()

leadRouter
  .post('/', validateToken, leadService.createLead.bind(leadService))
  .put('/:id', validateToken, leadService.updateLead.bind(leadService))
  .get('/', validateToken, leadService.getLeadList.bind(leadService))
  .get('/:id', validateToken, leadService.getLead.bind(leadService))

module.exports = leadRouter
