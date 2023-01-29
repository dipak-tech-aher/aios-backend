import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Workflow } from '../model'
import { defaultMessage } from '../utils/constant'
import { newComplaintWorkflow } from '../workflow/workflow'

export class WorkflowService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createWorkflow (req, res) {
    try {
      logger.info('Creating workflow')
      let workflow = req.body
      const userId = req.userId
      if (!workflow && !workflow.interactionType && !workflow.productType && !workflow.wfDefinition) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      workflow = {
        ...workflow,
        createdBy: userId,
        updatedBy: userId
      }
      const response = await Workflow.create(workflow)
      logger.debug('Successfully created workflow')
      return this.responseHelper.onSuccess(res, 'Successfully created workflow', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating workflow'))
    }
  }

  async updateWorkflow (req, res) {
    try {
      const { id } = req.params
      logger.debug('Updating workflow')
      let workflow = req.body
      const userId = req.userId
      if (!workflow && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const workflowInfo = await Workflow.findOne({
        where: {
          workflowId: id
        }
      })
      if (!workflowInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      workflow = {
        ...workflow,
        updatedBy: userId
      }
      await Workflow.update(workflow, {
        where: {
          workflowId: id
        }
      })
      logger.debug('Successfully updated workflow')
      return this.responseHelper.onSuccess(res, 'Successfully updated workflow')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating workflow'))
    }
  }

  async getWorkflow (req, res) {
    try {
      await newComplaintWorkflow('CT007', 'REQCOMP')
      const { id } = req.params
      logger.debug('Getting workflow by id')
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Workflow.findOne({
        where: {
          workflowId: id
        }
      })
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Successfully fetch workflow data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching workflow data')
      return this.responseHelper.onError(res, new Error('Error while fetching workflow data'))
    }
  }

  async getWorkflowList (req, res) {
    try {
      logger.debug('Getting workflow list')
      const { limit = 10, page = 1 } = req.query
      const response = await Workflow.findAll({
        offset: ((page - 1) * limit),
        limit: limit
      })
      logger.debug('Successfully fetch workflow list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching workflow list')
      return this.responseHelper.onError(res, new Error('Error while fetching workflow list'))
    }
  }
}
