import { ComplaintsService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const complaintsRouter = express.Router()
const complaintsService = new ComplaintsService()

complaintsRouter
  .post('/', validateToken, complaintsService.createComplaints.bind(complaintsService))
  .put('/:id', validateToken, complaintsService.updateComplaint.bind(complaintsService))
  .get('/:id', validateToken, complaintsService.getComplaints.bind(complaintsService))
  .get('/appointment/:id', validateToken, complaintsService.getAppointment.bind(complaintsService))
  .get('/', validateToken, complaintsService.getComplaintsList.bind(complaintsService))

module.exports = complaintsRouter
