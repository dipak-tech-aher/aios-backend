import { WorkflowService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { executeWorkFlow } from './workflow'

const workflowRouter = express.Router()
const workflowService = new WorkflowService()

workflowRouter

  .post('/', validateToken, workflowService.createWorkflow.bind(workflowService))
  .put('/:id', validateToken, workflowService.updateWorkflow.bind(workflowService))
  .get('/:id', validateToken, workflowService.getWorkflow.bind(workflowService))
  .get('/', validateToken, workflowService.getWorkflowList.bind(workflowService))
  .get('/executeWorkFlow/:id', validateToken, executeWorkFlow)

module.exports = workflowRouter
