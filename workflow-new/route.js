import { WorkflowService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { executeWorkFlow } from './workflow'

const workflowNewRouter = express.Router()
const workflowService = new WorkflowService()

workflowNewRouter
  .put('/assign', validateToken, workflowService.assignWorkflowToEntity.bind(workflowService))
  .get('/state', validateToken, workflowService.getWorkflowState.bind(workflowService))
  .put('/state', validateToken, workflowService.updateWorkflowState.bind(workflowService))
  .put('/assign/self', validateToken, workflowService.assignToSelf.bind(workflowService))
  .get('/workflow-execute', workflowService.workflowExcecute.bind(workflowService))
  .post('/', validateToken, workflowService.createWorkflow.bind(workflowService))
  .put('/:id', validateToken, workflowService.updateWorkflow.bind(workflowService))
  .get('/:id', validateToken, workflowService.getWorkflow.bind(workflowService))
  .get('/', validateToken, workflowService.getWorkflowList.bind(workflowService))
  .get('/status/:id', validateToken, workflowService.getWorkflowStatus.bind(workflowService))
  .get('/executeWorkFlow/:id', validateToken, executeWorkFlow)
  .delete('/:id', validateToken, workflowService.deleteWorkflow.bind(workflowService))
  .post('/workflow-mapping-list', validateToken, workflowService.unMappedWorkflowList.bind(workflowService))
  .post('/create-workflow-mapping', validateToken, workflowService.createWorkflowMapping.bind(workflowService))
  .post('/mapped-workflow-list', validateToken, workflowService.listMappedWorkflow.bind(workflowService))
  .put('/update/mapped-workflow', validateToken, workflowService.updatedMappedWorkflow.bind(workflowService))

module.exports = workflowNewRouter
