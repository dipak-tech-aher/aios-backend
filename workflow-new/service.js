import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { WorkflowNew, BusinessEntity, User, WorkflowHdr, WorkflowTxn, WorkflowMapping, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
import { assignWFToEntity, getWFState, updateWFState, assignToSelf, startWorkFlowEngine } from '../jobs/workflow-engine'

export class WorkflowService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createWorkflow (req, res) {
    const t = await sequelize.transaction()
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
      const response = await WorkflowNew.create(workflow, { transaction: t })
      await t.commit()
      logger.debug('Successfully created workflow')
      return this.responseHelper.onSuccess(res, 'Successfully created workflow', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating workflow'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateWorkflow (req, res) {
    const t = await sequelize.transaction()
    try {
      const { id } = req.params
      logger.debug('Updating workflow')
      const workflow = req.body
      const userId = req.userId
      if (!workflow && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const workflowInfo = await WorkflowNew.findOne({ where: { workflowId: id } })
      if (!workflowInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      workflow.updatedBy = userId
      await WorkflowNew.update(workflow, { where: { workflowId: id }, transaction: t })
      await t.commit()
      logger.debug('Successfully updated workflow')
      return this.responseHelper.onSuccess(res, 'Successfully updated workflow')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating workflow'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getWorkflow (req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting workflow by id')
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await WorkflowNew.findOne({ where: { workflowId: id } })
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

  async getWorkflowStatus (req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting workflow status by workflow hdr id', id)
      if (!id || isNaN(id)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const wfHdrId = Number(id)
      const response = await WorkflowHdr.findOne({
        attributes: ['wfHdrId', 'wfDefnId', 'wfStatus'],
        include: [{
          model: WorkflowTxn,
          as: 'wfTxn',
          attributes: ['wfTxnId', 'wfHdrId', 'activityId', 'taskId', 'wfTxnStatus', 'updatedAt'],
          include: [{ model: BusinessEntity, as: 'txnStatus', attributes: ['code', 'description'] }]
        }],
        where: { wfHdrId }
      })
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Successfully fetch workflow status data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching workflow status data')
      return this.responseHelper.onError(res, new Error('Error while fetching workflow status data'))
    }
  }

  async getWorkflowList (req, res) {
    try {
      logger.debug('Getting workflow list')
      const { limit = 10, page = 1 } = req.query
      const response = await WorkflowNew.findAndCountAll({
        attributes: ['workflowId', 'interactionType', 'productType', 'status', 'updatedBy', 'updatedAt', 'workflowName'],
        include: [
          { model: BusinessEntity, as: 'intxnTypeDesc', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'productTypeDesc', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'statusDesc', attributes: ['code', 'description'] },
          { model: User, as: 'updatedByName', attributes: ['firstName', 'lastName'] }
        ],
        order: [
          ['workflowId', 'DESC']
        ],
        offset: (page * limit),
        limit: Number(limit),
        where: {
          status: 'AC'
        }
      })
      logger.debug('Successfully fetch workflow list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching workflow list')
      return this.responseHelper.onError(res, new Error('Error while fetching workflow list'))
    }
  }

  async getWorkflowState (req, res) {
    try {
      const { entityId, entity } = req.query
      logger.debug('Fetching workflow state')
      if (!entityId || !entity) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await getWFState(entityId, entity)
      logger.debug('Successfully fetch workflow roles')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching workflow roles')
      return this.responseHelper.onError(res, new Error('Error while fetching workflow roles'))
    }
  }

  async updateWorkflowState (req, res) {
    const t = await sequelize.transaction()
    try {
      const { entityId, entity } = req.query
      const reqData = req.body
      logger.debug('Updating workflow state')
      if (!reqData || !entityId || !entity) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      await updateWFState(entityId, entity, reqData, t)
      await t.commit()
      logger.debug('Successfully workflow state')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS)
    } catch (error) {
      logger.error(error, 'Error while updating workflow state')
      return this.responseHelper.onError(res, new Error('Error while updating workflow state'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async assignWorkflowToEntity (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Assiging  to Entity')
      const reqData = req.body
      if (!reqData || !reqData.entityId || !reqData.entity || !reqData.defnId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      await assignWFToEntity(reqData.entityId, reqData.entity, reqData.defnId, t)
      await t.commit()
      logger.debug('Successfully Assigned')
      return this.responseHelper.onSuccess(res, 'Successfully Assigned')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while Assigning WF'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async assignToSelf (req, res) {
    const t = await sequelize.transaction()
    try {
      const reqData = req.body
      const { userId } = req
      logger.debug('Assign to self')
      if (!reqData || !reqData.entityId || !reqData.entity) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      reqData.userId = userId
      await assignToSelf(reqData, t)
      await t.commit()
      logger.debug('Successfully assigned to self')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS)
    } catch (error) {
      logger.error(error, 'Error while updating assigned to self')
      return this.responseHelper.onError(res, new Error('Error while updating assigned to self'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async unMappedWorkflowList (req, res) {
    try {
      logger.info('Getting unmapped workflow list')
      const maps = req.body
      const { editMapped } = req.query

      logger.info('Fetching workflows')
      const workFlows = await WorkflowNew.findAll({
        attributes: { exclude: ['wfDefinition'] },
        include: [
          { model: User, as: 'createdByName', attributes: ['firstName', 'lastName'] },
          { model: BusinessEntity, as: 'statusDesc', attributes: ['description'] }
        ],
        where: { status: 'AC' },
        order: [['workflowId', 'ASC']]
      })
      if (!workFlows) {
        logger.info('No work flow found')
        return this.responseHelper.notFound(res, 'No workflow found')
      }
      if (editMapped) {
        logger.info('Sucessfully fetched unmapped workflow list')
        return this.responseHelper.onSuccess(res, 'Sucessfully fetched unmapped workflow list', workFlows)
      }

      logger.info('Checking validtions')
      if (!maps || !maps.module) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const validation = workflowMappingValidation(maps, this.responseHelper, res)
      if (validation) {
        return validation
      }

      logger.info('Fetching mapped workflows')
      const mappedWorkFlow = await WorkflowMapping.findAll({ where: { status: 'AC', module: maps.module } })
      if (!mappedWorkFlow) {
        logger.info(' No worklfow mapped ')
        return this.responseHelper.onSuccess(res, 'Sucessfully fetched unmapped workflow list', workFlows)
      }

      logger.info('Filtering mapped workflows as per req body')
      const filteredMappedWorkFlow = []
      for (const mWF of mappedWorkFlow) {
        const mapping = mWF.mapping
        if (maps.module === 'HELPDESK') {
          if (mapping.serviceType === maps.serviceType) {
            filteredMappedWorkFlow.push(mWF)
          }
        } else if (maps.module === 'INTXN') {
          if (mapping.serviceType === maps.serviceType && mapping.interactionType === maps.interactionType &&
             mapping.priority === maps.priority && mapping.customerType === maps.customerType) {
            filteredMappedWorkFlow.push(mWF)
          }
        }
      }
      if (filteredMappedWorkFlow.length > 0) {
        logger.info(' No mapped workflow as per req body ')
        return this.responseHelper.notFound(res, new Error('Workflow exist with request combination'))
      }

      logger.info('Sucessfully fetched not mapped workflows')
      return this.responseHelper.onSuccess(res, 'Sucessfully fetched not mapped workflows', workFlows)
    } catch (error) {
      logger.info('Error while getting not unmapped workflow list')
      return this.responseHelper.onError(res, 'Error while getting not unmapped workflow list')
    }
  }

  async createWorkflowMapping (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating workflow mapping')
      const { userId } = req
      const mappings = req.body
      logger.info('Checking validtions')
      if (!mappings || !mappings.module || !mappings.templateMapName || !mappings.workflowId) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const validation = workflowMappingValidation(mappings, this.responseHelper, res)
      if (validation) {
        return validation
      }
      const duplicatNameValidation = await WorkflowMapping.findOne({
        attributes: ['mappingName'],
        where: {
          mappingName: sequelize.where(sequelize.fn('LOWER', sequelize.col('mapping_name')), '=', mappings.templateMapName.toLowerCase()),
          status: 'AC'
        }
      })
      if (duplicatNameValidation) {
        logger.info('Duplicate mapping name found')
        return this.responseHelper.validationError(res, new Error('Given name already exist'))
      }
      const findWorkflow = await WorkflowNew.findOne({ where: { workflowId: mappings.workflowId } })
      if (!findWorkflow) {
        logger.info(`No workflow found with id: ${mappings.workflowId}`)
        return this.responseHelper.notFound(res, `No workflow found with id: ${mappings.workflowId}`)
      }
      logger.info('Fetching mapped workflows')
      const mappedWorkFlow = await WorkflowMapping.findAll({ where: { workflowId: mappings.workflowId, status: 'AC' } })
      if (mappedWorkFlow) {
        logger.info('Filtering mapped workflows as per req body')
        const filteredMappedWorkFlow = []
        for (const mWF of mappedWorkFlow) {
          const mapping = mWF.mapping
          if (mappings.module === 'HELPDESK') {
            if (mapping.serviceType === mappings.serviceType) {
              filteredMappedWorkFlow.push(mWF)
            }
          } else if (mappings.module === 'INTXN') {
            if (mapping.serviceType === mappings.serviceType && mapping.interactionType === mappings.interactionType &&
             mapping.priority === mappings.priority && mapping.customerType === mappings.customerType) {
              filteredMappedWorkFlow.push(mWF)
            }
          }
        }
        if (filteredMappedWorkFlow.length > 0) {
          logger.info('Workflow already mapped with request combinations')
          return this.responseHelper.validationError(res, 'Workflow already mapped with request combinations')
        }
      }
      const mappingWorkflowData = {
        workflowId: mappings.workflowId,
        mappingName: mappings.templateMapName,
        module: mappings.module,
        status: 'AC',
        createdBy: userId,
        updatedBy: userId
      }
      if (mappings.module === 'HELPDESK') {
        mappingWorkflowData.mapping = {
          serviceType: mappings.serviceType
        }
      } else if (mappings.module === 'INTXN') {
        mappingWorkflowData.mapping = {
          serviceType: mappings.serviceType,
          interactionType: mappings.interactionType,
          priority: mappings.priority,
          customerType: mappings.customerType
        }
      }
      const createMapping = await WorkflowMapping.create(mappingWorkflowData, { transaction: t })
      await t.commit()
      logger.info('Sucessfully mapped workflow')
      return this.responseHelper.onSuccess(res, 'Sucessfully mapped workflow', createMapping)
    } catch (error) {
      logger.info(error, 'Error while creating workflow mapping')
      return this.responseHelper.onError(res, 'Error while creating workflow mapping')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async listMappedWorkflow (req, res) {
    try {
      logger.info('Fetching mapped workflow list')
      const { limit = 10, page = 0 } = req.query
      const searchInput = req.body
      const offSet = (page * limit)
      const where = { status: 'AC' }
      if (searchInput.mappingName) {
        where.mappingName = searchInput.mappingName
      }
      const workflowList = await WorkflowMapping.findAndCountAll({
        attributes: { exclude: ['updatedBy', 'updatedAt'] },
        include: [
          { model: BusinessEntity, as: 'moduleDescription', attributes: ['description'] },
          { model: User, as: 'createdByName', attributes: ['firstName', 'lastName'] }
        ],
        where,
        limit,
        offSet,
        order: [['mappingId', 'DESC']]
      })
      if (!workflowList) {
        logger.info('No workflow found')
        return this.responseHelper.notFound(res, 'No workflow found')
      }
      const codeType = ['WORKFLOW_MODULE', 'TICKET_CHANNEL', 'PROD_TYPE', 'INTXN_TYPE', 'CUSTOMER_TYPE']
      const lookups = await BusinessEntity.findAll({ attributes: ['code', 'description'], where: { codeType } })
      for (const workflow of workflowList.rows) {
        if (workflow.mapping) {
          for (const key in workflow.mapping) {
            let bElookup = lookups.filter(e => { return e.code === workflow.mapping[key] })
            bElookup = bElookup[0]?.dataValues?.description
            workflow.mapping[`${key}Description`] = bElookup
          }
        }
      }
      logger.info('Sucessfully fetched workflow list')
      return this.responseHelper.onSuccess(res, 'Sucessfully fetched workflow list', workflowList)
    } catch (error) {
      logger.info(error, 'No mapped workflow found')
      return this.responseHelper.onError(res, 'No mapped workflow found')
    }
  }

  async updatedMappedWorkflow (req, res) {
    try {
      logger.info('Updating workflow mapping')
      const updateData = req.body
      const { userId } = req
      if (Array.isArray(updateData.delete) && !updateData.delete.length > 0) {
        if (!updateData.workflowId && !updateData.mappingId) {
          logger.info('No data found to update workflow mapping')
          return this.responseHelper.validationError(res, 'No data found to update workflow mapping')
        }
      }
      if (Array.isArray(updateData.delete) && updateData.delete.length > 0) {
        logger.info('Found delete ids')
        await WorkflowMapping.update({ status: 'IN' }, { where: { mappingId: updateData.delete } })
      }
      if (updateData.workflowId && updateData.mappingId) {
        const findrequestMapping = await WorkflowMapping.findOne({ where: { mappingId: updateData.mappingId } })
        if (!findrequestMapping) {
          logger.info('No mapped workflow found with Id:' + updateData.mappingId)
          return this.responseHelper.notFound(res, 'No mapped workflow found with Id:' + updateData.mappingId)
        }
        const mappingData = {
          workflowId: updateData.workflowId,
          updatedBy: userId
        }
        await WorkflowMapping.update(mappingData, { where: { mappingId: updateData.mappingId } })
      }
      logger.info('Sucessfully updated mapped workflow')
      return this.responseHelper.onSuccess(res, 'Sucessfully updated mapped workflow')
    } catch (error) {
      logger.info(error, 'Error while updating workflow mapping')
      return this.responseHelper.onError(res, 'Error while updating workflow mapping')
    }
  }

  async deleteWorkflow (req, res) {
    try {
      const { id } = req.params
      const userId = req.userId

      logger.debug('Delete workflow by id')
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const workflow = await WorkflowNew.findOne({ where: { workflowId: id } })
      const workflowMappingValidation = await WorkflowMapping.findOne({ where: { workflowId: id } })
      if (!workflow) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }

      if (workflowMappingValidation) {
        logger.debug('Workflow is mapped with ' + workflowMappingValidation.mappingName + ' Template')
        return this.responseHelper.onError(res, new Error('Workflow is mapped with ' + workflowMappingValidation.mappingName + ' Template'))
      }

      const workflowData = {
        status: 'IN',
        updatedBy: userId
      }
      const response = await WorkflowNew.update(workflowData, { where: { workflowId: id } })

      logger.debug('Successfully Deleted workflow data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while Deleting workflow data')
      return this.responseHelper.onError(res, new Error('Error while Deleting workflow data'))
    }
  }

  async workflowExcecute (req, res) {
    try {
      logger.debug('Start Workflow Execute')
      startWorkFlowEngine()
      logger.debug('Workflow Execute Started')
      return this.responseHelper.onSuccess(res, 'Workflow Execution Started')
    } catch (error) {
      logger.error(error, 'Error while Deleting workflow data')
      return this.responseHelper.onError(res, new Error('Error while Deleting workflow data'))
    }
  }
}

const workflowMappingValidation = (maps, responseHelper, res) => {
  if (maps.module === 'INTXN') {
    if (!maps.serviceType || !maps.interactionType || !maps.priority || !maps.customerType) {
      logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
      return responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
    } else if (maps.module === 'HELPDESK') {
      if (!maps.serviceType) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
    }
  }
}
