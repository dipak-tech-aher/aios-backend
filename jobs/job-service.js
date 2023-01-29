import { logger } from '../config/logger'
import {
  sequelize, Attachment, Interaction, InteractionTask,
  Customer, Account, Connection, Plan, ConnectionPlan,
  BusinessEntity, Notification, Chat
} from '../model/index'
import differenceInMinutes from 'date-fns/differenceInMinutes'
import { Op } from 'sequelize'
import { isEmpty } from 'lodash'
import { workflowDefinitions } from './workflow-sample'
import {
  getRealtimeServiceDetails, blockAccessNumber, allocateAccessNumber,
  ocsBarUnBarSubscription, ocsCustomerStatus, getTicketDetails
} from '../tibco/tibco-utils'
import { systemUserId, abandonedChatTimeout } from 'config'
import { EmailHelper, SMSHelper } from '../utils'

const emailHelper = new EmailHelper()

const smsHelper = new SMSHelper()

const COUNTRYCODE_PREFIX = '673'

export const processWorkflowEngine = async () => {
  // logger.debug('Processing Service Requests')
  try {
    // Fetching all NEW and WIP records from the table
    const interactions = await Interaction.findAll({
      where: {
        currStatus: { [Op.notIn]: ['FAILED', 'CLOSED', 'DONE', 'UNFULFILLED', 'PEND-CLOSE'] },
        woType: ['WONC', 'WONC-ACCSER', 'WONC-SER', 'TERMINATE', 'BAR', 'UNBAR', 'UPGRADE', 'DOWNGRADE', 'VASACT', 'VASDEACT', 'RELOCATE', 'TELEPORT', 'FAULT', 'TERMINATE'],
        intxnType: ['REQSR', 'REQCOMP'],
        intxnId: {
          [Op.gt]: 0
        }
      }
    })
    if (!isEmpty(interactions)) {
      for (const interaction of interactions) {
        if (interaction.intxnType === 'REQSR') {
          if (interaction.currStatus === 'CREATED') {
            await processCreatedInteraction(interaction)
          } else if (interaction.currStatus === 'WIP') {
            await processWIPInteraction(interaction)
          } else {
            // Fetching all the task which are belongs to interaction id
            // continue
            const tasks = await InteractionTask.findAll({
              include: [
                { model: BusinessEntity, as: 'taskIdLookup', attributes: ['code', 'description', 'mappingPayload'] },
                { model: Interaction, as: 'data', attributes: ['description', 'curr_status'] }
              ],
              where: {
                intxnId: interaction.intxnId
              }
            })
            if (!isEmpty(tasks)) {
              let completeStatus = 0
              let failedStatus = false
              let WIPStatus = false
              // If task found and all task status is CLOSED then update integration status as CLOSED
              // If task found and one task status is FAILED then update integration status as FAILED
              for (const task of tasks) {
                if (task.status === 'DONE' || task.status === 'DONE-INCOMPLETE') {
                  completeStatus = completeStatus + 1
                } else if (task.status === 'FAILED') {
                  failedStatus = true
                } else if (task.status === 'WIP') {
                  WIPStatus = true
                }
              }
              let status
              if (completeStatus === tasks.length && !failedStatus) {
                status = 'DONE'
              } else if (completeStatus !== tasks.length && WIPStatus) {
                status = 'WIP'
              } else if (failedStatus) {
                status = 'FAILED'
              }
              if (status) {
                interaction.currStatus = status
                await Interaction.update(interaction.dataValues, { where: { intxnId: interaction.intxnId } })
                logger.debug('Service request data updated successfully')
              }
            }
          }
        } else if (interaction.intxnType === 'REQCOMP') {
          if (interaction.isBotReq === 'N') {
            await processCreatedInteraction(interaction)
          } else if (interaction.isBotReq === 'Y') {
            await processWIPInteraction(interaction)
          }
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error while updating service request')
  }
}

export const processDeleteTempAttachments = async () => {
  // logger.debug('Deleting temporary attachments ')
  try {
    await Attachment.destroy({
      where: {
        status: 'TEMP',
        createdAt: {
          [Op.lt]: new Date(),
          [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000)
        }
      }
    })
    // logger.debug('Successfully deleted the temporary attachments')
  } catch (error) {
    logger.error(error, 'Successfully deleted the temporary attachments')
  }
}

const processCreatedInteraction = async (interaction) => {
  try {
    const connectionData = await Connection.findOne({
      where: {
        connectionId: interaction.connectionId
      }
    })

    for (const wd of workflowDefinitions) {
      if (wd.woType === interaction.woType && wd.intxnType === interaction.intxnType) {
        const t = await sequelize.transaction()
        try {
          for (const step of wd.steps) {
            if (step.stepName === 'SETMANUAL' && connectionData.assignSimLater !== 'Y') {
              continue
            }
            const taskData = {
              intxnId: interaction.intxnId,
              taskId: step.stepName,
              status: step.status,
              createdBy: systemUserId,
              updatedBy: systemUserId
            }

            await InteractionTask.create(taskData, { transaction: t })
          }
          if (interaction.intxnType === 'REQSR') {
            await Interaction.update({ currStatus: 'NEW' }, {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            })
          } else if (interaction.intxnType === 'REQCOMP') {
            await Interaction.update({ isBotReq: 'Y' }, {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            })
          }
          await t.commit()
        } catch (error) {
          logger.error(error, 'Error creating tasks for Workflow definition')
        } finally {
          if (t && !t.finished) {
            await t.rollback()
          }
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Unexpected error creating tasks for Workflow definition')
  }
}

const processWIPInteraction = async (interaction) => {
  const tasks = await InteractionTask.findAll({
    include: [
      { model: BusinessEntity, as: 'taskIdLookup', attributes: ['code', 'description', 'mappingPayload'] }
    ],
    where: {
      intxnId: interaction.intxnId
    },
    order: [
      ['intxnTaskId', 'ASC']
    ]
  })
  // const taskCount = tasks.length
  // let closedTaskCount = 0
  // const tasksList = []
  for (const task of tasks) {
    logger.debug(interaction.woType, task.taskId)
    if ((interaction.woType === 'WONC' && task.taskId === 'CREATECUSTACCT') ||
      (interaction.woType === 'WONC-ACCSER' && task.taskId === 'CREATEACCT')) {
      await processCreateCustAndAccount(interaction, task)
    }
    if ((interaction.woType === 'WONC' || interaction.woType === 'WONC-ACCSER' || interaction.woType === 'WONC-SER') && task.taskId === 'CREATESERVICE') {
      await processCreateService(interaction, task)
    }
    if ((interaction.woType === 'WONC' || interaction.woType === 'WONC-ACCSER') && task.taskId === 'SETMANUAL') {
      await processSetManual(interaction, task, tasks)
    }
    if ((interaction.woType === 'BAR' || interaction.woType === 'UNBAR') && task.taskId === 'CREATEBARUNBAR') {
      await processTaskPayload(interaction, task)
    }
    if ((interaction.woType === 'BAR' || interaction.woType === 'UNBAR') && task.taskId === 'PROCESSBARUNBAR') {
      await processBarUnBar(interaction, task, tasks)
    }
    if ((interaction.woType === 'BAR' || interaction.woType === 'UNBAR') && task.taskId === 'RETRY') {
      await processRetry(interaction, task, tasks)
    }
    if (interaction.woType === 'UPGRADE' && task.taskId === 'CREATEPLANCHNG') {
      await processTaskPayload(interaction, task)
    }
    if (interaction.woType === 'DOWNGRADE' && task.taskId === 'CREATEPLANCHNG') {
      await processTaskPayload(interaction, task)
    }
    if (interaction.woType === 'TERMINATE' && task.taskId === 'CREATETERMINATE') {
      await processTaskPayload(interaction, task)
    }
    if (interaction.woType === 'TERMINATE' && task.taskId === 'CLOSESR') {
      await terminateService(interaction, task, tasks)
    }
    if (interaction.woType === 'VASACT' && (task.taskId === 'CREATEVASCER' || task.taskId === 'CREATEVASOMS')) {
      await processTaskPayload(interaction, task)
    }
    if (interaction.woType === 'VASDEACT' && (task.taskId === 'CREATEVASCER' || task.taskId === 'CREATEVASOMS')) {
      await processTaskPayload(interaction, task)
    }
    if (interaction.woType === 'RELOCATE' && task.taskId === 'CREATERELOCATE') {
      await processCreateService(interaction, task)
    }
    if (interaction.woType === 'TELEPORT' && task.taskId === 'CREATETELEPORT') {
      await processTaskPayload(interaction, task)
    }
    if (task.taskId === 'CLOSESR') {
      await processCloseSR(interaction, task, tasks)
    }
    if (interaction.woType === 'FAULT' && task.taskId === 'CREATEFAULT') {
      await processFaultPayload(interaction, task)
    }

    if (task.status === 'WIP') {
      break
    }
    if (task.status === 'CLOSED' || task.status === 'CLOSED-INCOMPLETE') {
      // closedTaskCount++
      continue
    }

    if (task.status === 'DONE' || task.status === 'DONE-INCOMPLETE' || task.status === 'FAILED') {
      // Need to check with Ilango what to implement here - Eswar
    }
  }
}

const processCreateCustAndAccount = async (interaction, task) => {
  logger.debug('processCreateCustAndAccount', interaction.intxnId, task.taskId, task.status)

  if (task.status === 'NEW' || task.status === 'WIP' || task.status === 'CLOSED' || task.status === 'RESOLVED') {
    return true
  }

  if (task.status === 'FAILED') {
    const t = await sequelize.transaction()
    try {
      let message
      if (!task.payload || !task.payload.remarks) {
        message = 'Task status is FAILED, but source system did not return any error message'
      } else {
        message = 'Task failed. Please check BOTS response for details.'
      }

      await InteractionTask.update({
        status: 'ERROR',
        message: message,
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, 'processCreateCustAndAccount - Error in updating interaction and task status for failed task - ' + task.intxnTaskId + ', ' + interaction.intxnId)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else if (!task.payload || (interaction.woType === 'WONC' && !task.payload.customerNbr) || !task.payload.accountNbr ||
    (interaction.woType === 'WONC' && task.payload.customerNbr === '') || task.payload.accountNbr === '') {
    let message
    if (!task.payload || !task.payload.remarks) {
      message = 'Data returned by BOTS is missing all required fields'
    } else {
      message = 'Task error. Please check BOTS response for details'
    }

    const t = await sequelize.transaction()
    try {
      await InteractionTask.update({
        status: 'ERROR',
        message: message,
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, '1 - Error updating task in processCreateCustAndAccount')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else {
    const t = await sequelize.transaction()
    try {
      if (interaction.woType === 'WONC') {
        await updateCustAndAcctNbr(interaction.customerId, interaction.accountId,
          task.payload.customerNbr, task.payload.accountNbr, t)
      }

      if (interaction.woType === 'WONC-ACCSER') {
        await updateAcctNbr(interaction.accountId, task.payload.accountNbr, t)
      }

      await InteractionTask.update({
        status: 'CLOSED',
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, '2 - Error updating task in processCreateCustAndAccount')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }
}

const processCreateService = async (interaction, task) => {
  logger.debug('processCreateService', interaction.intxnId, task.taskId, task.status)

  if (task.status === 'NEW' || task.status === 'WIP' || task.status === 'CLOSED' || task.status === 'RESOLVED') {
    return false
  }

  if (task.status === 'FAILED') {
    const t = await sequelize.transaction()
    try {
      let message
      if (!task.payload || !task.payload.remarks) {
        message = 'Task status is FAILED, but source system did not return any error message'
      } else {
        message = 'Task failed. Please check BOTS response for details'
      }

      await InteractionTask.update({
        status: 'ERROR',
        message: message,
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, 'processCreateService - Error in updating interaction and task status for failed task - ' + task.intxnTaskId + ', ' + interaction.intxnId)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else {
    const { connectionData, planData } = await getConnectionAndPlan(interaction)

    if (connectionData.connectionSelection === 'auto' && (!task.payload || !task.payload.accessNbr || task.payload.accessNbr === '' ||
      !task.payload.external_ref_sys || !task.payload.external_ref_no ||
      task.payload.external_ref_sys === '' || task.payload.external_ref_no === '')) {
      const t = await sequelize.transaction()
      try {
        let message
        if (!task.payload) {
          message = 'Payload is missing'
        } else {
          if (!task.payload.remarks) {
            message = 'Payload is not valid. It may be missing required fields or may not be in the right format'
          } else {
            message = 'Task error. Please check BOTS response for details'
          }
        }
        await InteractionTask.update({
          status: 'ERROR',
          message: message,
          updatedBy: systemUserId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
        await Interaction.update(
          { currStatus: 'FAILED' },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )
        await t.commit()
      } catch (error) {
        logger.error(error, '1 - Error updating task in processCreateService')
      } finally {
        if (t && !t.finished) {
          await t.rollback()
        }
      }
    } else if (connectionData.connectionSelection === 'manual' && (!task.payload || !task.payload.external_ref_sys || !task.payload.external_ref_no ||
      task.payload.external_ref_sys === '' || task.payload.external_ref_no === '')) {
      const t = await sequelize.transaction()
      try {
        await InteractionTask.update({
          status: 'ERROR',
          message: '2 - Task update data is invalid and cannot be processed further - processCreateService',
          updatedBy: systemUserId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
        await Interaction.update(
          { currStatus: 'FAILED' },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )
        await t.commit()
      } catch (error) {
        logger.error(error, '1 - Error updating task in processCreateService')
      } finally {
        if (t && !t.finished) {
          await t.rollback()
        }
      }
    } else {
      let iccid
      if (planData.prodType === 'Fixed') {
        iccid = 'FIXEDLINE'
      } else {
        iccid = connectionData.iccid
      }

      let accessNbr

      if (connectionData.connectionSelection === 'auto') {
        accessNbr = task.payload.accessNbr
        await blockAccessNumber(accessNbr, iccid)
      } else {
        accessNbr = connectionData.identificationNo
      }

      const status = await allocateAccessNumber(accessNbr, iccid)
      // const status = true

      if (status) {
        const t = await sequelize.transaction()
        try {
          if (connectionData.connectionSelection === 'auto') {
            await Connection.update({
              identificationNo: task.payload.accessNbr,
              updatedBy: systemUserId
            },
            {
              where: {
                connectionId: interaction.connectionId
              },
              transaction: t
            }
            )
          }
          const interactionData = {}
          let found = false
          if (!interaction.externalRefSys1 || interaction.externalRefSys1 === task.payload.external_ref_sys) {
            interactionData.externalRefNo1 = task.payload.external_ref_no
            interactionData.externalRefSys1 = task.payload.external_ref_sys
            found = true
          } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === task.payload.external_ref_sys) {
            interactionData.externalRefNo2 = task.payload.external_ref_no
            interactionData.externalRefSys2 = task.payload.external_ref_sys
            found = true
          } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === task.payload.external_ref_sys) {
            interactionData.externalRefNo3 = task.payload.external_ref_no
            interactionData.externalRefSys3 = task.payload.external_ref_sys
            found = true
          } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === task.payload.external_ref_sys) {
            interactionData.externalRefNo4 = task.payload.external_ref_no
            interactionData.externalRefSys4 = task.payload.external_ref_sys
            found = true
          }
          if (found) {
            await Interaction.update(
              interactionData,
              {
                where: {
                  intxnId: interaction.intxnId
                },
                transaction: t
              }
            )
            await InteractionTask.update({
              status: 'CLOSED',
              updatedBy: systemUserId
            },
            {
              where: {
                intxnTaskId: task.intxnTaskId,
                intxnId: interaction.intxnId
              },
              transaction: t
            }
            )
          } else {
            await InteractionTask.update({
              status: 'ERROR',
              message: 'processCreateService - No empty external references found to update',
              updatedBy: systemUserId
            },
            {
              where: {
                intxnTaskId: task.intxnTaskId,
                intxnId: interaction.intxnId
              },
              transaction: t
            }
            )
            await Interaction.update(
              { currStatus: 'FAILED' },
              {
                where: {
                  intxnId: interaction.intxnId
                },
                transaction: t
              }
            )
          }
          await t.commit()
        } catch (error) {
          logger.error(error, 'processCreateService - Error while updating external references')
        } finally {
          if (t && !t.finished) {
            await t.rollback()
          }
        }
      } else {
        const t = await sequelize.transaction()
        try {
          await InteractionTask.update({
            status: 'ERROR',
            message: 'Unable to allocate access number in TIBCO',
            updatedBy: systemUserId
          },
          {
            where: {
              intxnTaskId: task.intxnTaskId,
              intxnId: interaction.intxnId
            },
            transaction: t
          }
          )
          await Interaction.update(
            { currStatus: 'FAILED' },
            {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
          await t.commit()
        } catch (error) {
          logger.error(error, 'Error while allocating access number in TIBCO')
        } finally {
          if (t && !t.finished) {
            await t.rollback()
          }
        }
      }
    }
  }
}

const processSetManual = async (interaction, task, tasks) => {
  console.log('processSetManual', interaction.intxnId, task.taskId, task.status)

  if (task.status === 'CLOSED') {
    return true
  }

  let taskCloseCount = 0
  let taskCount = 0

  for (const t of tasks) {
    if (t.intxnTaskId >= task.intxnTaskId) {
      break
    }
    if (t.status === 'CLOSED') {
      taskCloseCount++
    }
    taskCount++
  }

  if (taskCloseCount !== taskCount) {
    return true
  }

  const { planData } = await getConnectionAndPlan(interaction)

  if (['Fixed'].includes(planData.planType)) {
    if (['NEW', 'WIP'].includes(task.status)) {
      return true
    }
  }
  const t = await sequelize.transaction()
  try {
    await InteractionTask.update({
      status: 'CLOSED',
      message: 'This interaction needs to be resolved manually',
      updatedBy: systemUserId
    },
    {
      where: {
        intxnTaskId: task.intxnTaskId,
        intxnId: interaction.intxnId
      },
      transaction: t
    }
    )
    await Interaction.update(
      { currStatus: 'MANUAL' },
      {
        where: {
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )
    await t.commit()
  } catch (error) {
    logger.error(error, 'processCreateService - Error in updating interaction and task status for failed task - ' + task.intxnTaskId + ', ' + interaction.intxnId)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const processBarUnBar = async (interaction, task, tasks) => {
  console.log('processBarUnBar', interaction.intxnId, task.taskId, task.status)

  if (task.status === 'CLOSED') {
    return true
  }

  let taskCloseCount = 0
  let taskCount = 0

  for (const t of tasks) {
    if (t.intxnTaskId >= task.intxnTaskId) {
      break
    }
    if (t.status === 'CLOSED') {
      taskCloseCount++
    }
    taskCount++
  }

  if (taskCloseCount !== taskCount) {
    return true
  }

  const { connectionData, planData } = await getConnectionAndPlan(interaction)

  const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  // const realtimeStatus = {serviceLevel: 'UNBAR'}

  console.log('realtimeStatus', realtimeStatus)
  if (interaction.woType === 'BAR') {
    if (!realtimeStatus || !realtimeStatus.serviceLevel || realtimeStatus.serviceLevel.trim() !== 'BSER') {
      return true
    }
  }

  if (interaction.woType === 'UNBAR') {
    if (!realtimeStatus || !realtimeStatus.serviceLevel || realtimeStatus.serviceLevel.trim() !== 'FULL') {
      return true
    }
  }

  let message
  if (planData.prodType === 'Prepaid' || planData.prodType === 'Postpaid') {
    const ocsResp = await ocsBarUnBarSubscription(interaction.woType, connectionData.identificationNo, interaction.intxnId)
    // const ocsResp = {status: true}
    console.log('ProcessBarUnbarocsResp', ocsResp)

    if (ocsResp && ocsResp.status !== undefined && ocsResp.status === 'success') {
      message = 'OCS invocation succeeded'
    } else if (ocsResp && ocsResp.status !== undefined && ocsResp.status === 'failure') {
      message = ocsResp.message
      const t1 = await sequelize.transaction()
      try {
        await InteractionTask.update({
          status: 'ERROR',
          message: message,
          updatedBy: systemUserId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t1
        }
        )
        await Interaction.update(
          { currStatus: 'FAILED' },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t1
          }
        )
        await t1.commit()
      } catch (error) {
        logger.error(error, 'Error while setting Bar/UnBar task to manual resolution')
      } finally {
        if (t1 && !t1.finished) {
          await t1.rollback()
        }
      }
      return true
    }
  } else {
    return true
  }

  const t = await sequelize.transaction()
  try {
    if (interaction.woType === 'BAR') {
      deActivateService(interaction, t)
    }

    if (interaction.woType === 'UNBAR') {
      activateService(interaction, t)
    }

    await InteractionTask.update({
      status: 'CLOSED',
      message: message,
      updatedBy: systemUserId
    },
    {
      where: {
        intxnTaskId: task.intxnTaskId,
        intxnId: interaction.intxnId
      },
      transaction: t
    }
    )

    await Interaction.update(
      { currStatus: 'CLOSED' },
      {
        where: {
          intxnId: interaction.intxnId
        },
        transaction: t
      }
    )

    await t.commit()
  } catch (error) {
    logger.error(error, 'processBarUnBar - Error in updating interaction and task status for failed task - ' + task.intxnTaskId + ', ' + interaction.intxnId)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const processRetry = async (interaction, task, tasks) => {
  console.log('processRetry', interaction.intxnId, task.taskId, task.status)

  if (task.status === 'CLOSED' || task.status === 'ERROR') {
    return true
  }

  try {
    const retryTime = task.taskIdLookup.mappingPayload[interaction.woType]

    const currentRetryCount = task.retryCount + 1

    // const currentRetryCount = 1

    const currentTime = new Date()

    const timeDiff = (currentTime.getTime() - task.createdAt.getTime()) / (1000 * 60)
    // const timeDiff = 999

    console.log(task.createdAt.getTime(), currentTime.getTime(), retryTime.length, currentRetryCount, retryTime[currentRetryCount - 1])

    const { connectionData } = await getConnectionAndPlan(interaction)

    let taskData
    let interactionData
    let checkOCSStatus
    let skip = false

    if (currentRetryCount <= retryTime.length) {
      if (timeDiff >= retryTime[currentRetryCount - 1]) {
        try {
          checkOCSStatus = await checkOCS(interaction, connectionData)
        } catch (error) {
          checkOCSStatus = false
          logger.error(error, 'Unexpected error checking OCS Customer Status')
        }
        if (checkOCSStatus === true) {
          taskData = {
            status: 'CLOSED',
            message: 'Closing Request as during OCS Customer Status Check found service to be in ' + interaction.woType + ' Status after ' + currentRetryCount + ' attempt(s).',
            retryCount: currentRetryCount,
            updatedBy: systemUserId
          }
          interactionData = {
            currStatus: 'CLOSED',
            updatedBy: systemUserId
          }
        } else {
          try {
            const ocsResp = await ocsBarUnBarSubscription(interaction.woType, connectionData.identificationNo, interaction.intxnId)
            console.log('Retry ocsResp', ocsResp)
            if (ocsResp && ocsResp.status !== undefined) {
              if (ocsResp.status === 'success') {
                taskData = {
                  status: 'CLOSED',
                  message: 'OCS ' + interaction.woType + ' completed in ' + currentRetryCount + ' attempt(s).',
                  retryCount: currentRetryCount,
                  updatedBy: systemUserId
                }
                interactionData = {
                  currStatus: 'CLOSED',
                  updatedBy: systemUserId
                }
              } else {
                taskData = {
                  status: (currentRetryCount >= retryTime.length) ? 'ERROR' : 'WIP',
                  message: ocsResp.message + ' after ' + currentRetryCount + ' attempt(s).' +
                    ((currentRetryCount < retryTime.length) ? ' System will try again.' : ' All attempts done, system will not try again.'),
                  retryCount: currentRetryCount,
                  updatedBy: systemUserId
                }
                if (currentRetryCount >= retryTime.length) {
                  interactionData = {
                    currStatus: 'FAILED',
                    updatedBy: systemUserId
                  }
                }
              }
            } else {
              taskData = {
                status: (currentRetryCount >= retryTime.length) ? 'ERROR' : 'WIP',
                message: 'No response from OCS after ' + currentRetryCount + ' attempt(s)' +
                  ((currentRetryCount < retryTime.length) ? ' System will try again.' : ' All attempts done, system will not try again.'),
                retryCount: currentRetryCount,
                updatedBy: systemUserId
              }
              if (currentRetryCount >= retryTime.length) {
                interactionData = {
                  currStatus: 'FAILED',
                  updatedBy: systemUserId
                }
              }
            }
          } catch (error) {
            taskData = {
              status: (currentRetryCount >= retryTime.length) ? 'ERROR' : 'WIP',
              message: 'Unexpected error invoking OCS during ' + currentRetryCount + ' attempt(s)' +
                ((currentRetryCount < retryTime.length) ? ' System will try again.' : ' All attempts done, system will not try again.'),
              retryCount: currentRetryCount,
              updatedBy: systemUserId
            }
            if (currentRetryCount >= retryTime.length) {
              interactionData = {
                currStatus: 'FAILED',
                updatedBy: systemUserId
              }
            }
          }
          // const ocsResp = { status: 'failure', message: 'OCS Error' }
        }
      } else {
        skip = true
      }
    } else {
      taskData = {
        status: (currentRetryCount >= retryTime.length) ? 'ERROR' : 'WIP',
        message: 'No response from OCS after ' + currentRetryCount + ' attempt(s)' +
          ((currentRetryCount < retryTime.length) ? ' System will try again.' : ' All attempts done, system will not try again.'),
        retryCount: currentRetryCount,
        updatedBy: systemUserId
      }
      interactionData = {
        currStatus: 'FAILED',
        updatedBy: systemUserId
      }
    }
    if (!skip) {
      const t = await sequelize.transaction()
      try {
        await InteractionTask.update(taskData,
          {
            where: {
              intxnTaskId: task.intxnTaskId,
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )
        if (interactionData) {
          await Interaction.update(interactionData,
            {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
          if (interactionData.currStatus === 'CLOSED') {
            await Connection.update({
              status: ((interaction.woType === 'BAR') ? 'TOS' : 'ACTIVE'),
              updatedBy: systemUserId
            },
            {
              where: {
                connectionId: interaction.connectionId
              },
              transaction: t
            }
            )
          }
        }
        await t.commit()
      } catch (error) {
        logger.error(error, 'Unexpected error updating data, while process BAR/UNBAR Retry Step')
      } finally {
        if (t && !t.finished) {
          await t.rollback()
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error while processing retry for ' + interaction.woType)
  }
}

const processCloseSR = async (interaction, task, tasks) => {
  console.log('processCloseSR', interaction.intxnId, task.taskId, task.status)

  if (task.status === 'CLOSED' || task.status === 'CLOSED-INCOMPLETE') {
    return true
  }

  let taskCloseCount = 0
  let taskCount = 0

  for (const t of tasks) {
    if (t.intxnTaskId >= task.intxnTaskId) {
      break
    }
    if (t.status === 'CLOSED' || t.status === 'RESOLVED') {
      taskCloseCount++
    }
    taskCount++
  }

  if (taskCloseCount !== taskCount) {
    return true
  }

  const { connectionData, planData } = await getConnectionAndPlan(interaction)

  if (['Fixed'].includes(planData.planType)) {
    if (['NEW', 'WIP'].includes(task.status)) {
      return true
    }
  }

  if (task.status === 'FAILED') {
    const t = await sequelize.transaction()
    try {
      let message
      if (!task.payload || !task.payload.remarks) {
        message = 'Task status is FAILED, but source system did not return any error message'
      } else {
        message = 'Task failed. Please check BOTS response for details'
      }

      await InteractionTask.update({
        status: 'ERROR',
        message: message,
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, 'processCloseSR - Error in updating interaction and task status for failed task - ' + task.intxnTaskId + ', ' + interaction.intxnId)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else if (task.status === 'DONE-INCOMPLETE') {
    const t = await sequelize.transaction()
    try {
      let done = false
      let message = ''
      if (interaction.woType === 'WONC') {
        done = await deActivateNewCustomer(interaction, t)
        message = 'New customer, account and service de-activated as service request is unfulfilled'
      } else if (interaction.woType === 'WONC-ACCSER') {
        done = await deActivateNewAcctService(interaction, t)
        message = 'New Account and service de-activated as service request is unfulfilled'
      } else if (interaction.woType === 'WONC-SER') {
        done = await deActivateNewService(interaction, t)
        message = 'New Service de-activated as service request is unfulfilled'
      }
      if (done) {
        await Interaction.update({
          currStatus: 'UNFULFILLED',
          updatedBy: systemUserId
        },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
        await InteractionTask.update({
          status: 'CLOSED-INCOMPLETE',
          message: message,
          updatedBy: systemUserId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
        await t.commit()
      } else {
        await t.rollback()
      }
    } catch (error) {
      logger.error(error, 'Error updating task in processCloseSR')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else if (((task.status === 'DONE' || task.status === 'NEW') && ['Prepaid', 'Postpaid'].includes(planData.prodType)) ||
    ((task.status === 'DONE') && ['Fixed'].includes(planData.prodType))) {
    const t = await sequelize.transaction()
    try {
      let done = false
      let message = ''
      if (interaction.woType === 'WONC') {
        done = await activateNewCustomer(connectionData, planData, interaction, t)
        message = 'New customer, account and service activated successfully'
      } else if (interaction.woType === 'WONC-ACCSER') {
        done = await activateNewAcctService(connectionData, planData, interaction, t)
        message = 'New Account and service activated successfully'
      } else if (interaction.woType === 'WONC-SER') {
        done = await activateNewService(connectionData, planData, interaction, t)
        message = 'New Service activated successfully'
      } else if (interaction.woType === 'UPGRADE' || interaction.woType === 'DOWNGRADE') {
        console.log('Processing Upgrade')
        done = await activatePlan(connectionData, planData, interaction, t)
        message = 'New plan activated successfully'
      } else if (interaction.woType === 'VASACT' || interaction.woType === 'VASDEACT') {
        console.log('Processing ' + interaction.woType)
        done = await activateDeactivateVAS(interaction, t)
        message = interaction.woType + ' completed successfully'
      } else if (interaction.woType === 'TELEPORT' || interaction.woType === 'RELOCATE') {
        console.log('Processing ' + interaction.woType)
        done = await switchService(connectionData, planData, interaction, t)
        message = interaction.woType + ' completed successfully'
      } else if (interaction.woType === 'TERMINATE') {
        console.log('Processing ' + interaction.woType)
        done = await terminateService(interaction, task, tasks)
        message = interaction.woType + ' completed successfully'
      }
      if (done) {
        await Interaction.update({
          currStatus: 'CLOSED',
          updatedBy: systemUserId
        },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
        await InteractionTask.update({
          status: 'CLOSED',
          message: message,
          updatedBy: systemUserId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
        await t.commit()
      } else {
        await t.rollback()
      }
    } catch (error) {
      logger.error(error, 'Error updating task in processCloseSR')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }
}

const updateCustAndAcctNbr = async (customerId, accountId, customerNbr, accountNbr, t) => {
  await Customer.update({
    crmCustomerNo: customerNbr,
    updatedBy: systemUserId
  },
  {
    where: {
      customerId: customerId
    },
    transaction: t
  }
  )
  await Account.update({
    accountNo: accountNbr,
    updatedBy: systemUserId
  },
  {
    where: {
      accountId: accountId
    },
    transaction: t
  }
  )
}

const updateAcctNbr = async (accountId, accountNbr, t) => {
  await Account.update({
    accountNo: accountNbr,
    updatedBy: systemUserId
  },
  {
    where: {
      accountId: accountId
    },
    transaction: t
  }
  )
}

const getConnectionAndPlan = async (interaction) => {
  const connectionData = await Connection.findOne({
    where: {
      connectionId: interaction.connectionId
    }
  })
  const planId = connectionData.mappingPayload.plans[0].planId
  const planData = await Plan.findOne({
    where: {
      planId: planId
    }
  })

  return { connectionData: connectionData, planData: planData }
}

const processTaskPayload = async (interaction, task) => {
  logger.debug('processTaskPayload', interaction.intxnId, interaction.woType, task.taskId, task.status)

  if (task.status === 'NEW' || task.status === 'WIP' || task.status === 'CLOSED') {
    return false
  }

  if (task.status === 'FAILED') {
    const t = await sequelize.transaction()
    try {
      let message
      if (!task.payload || !task.payload.remarks) {
        message = 'Task status is FAILED, but source system did not return any error message'
      } else {
        message = 'Task failed. Please check BOTS response for details'
      }

      await InteractionTask.update({
        status: 'ERROR',
        message: message,
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, 'processTaskPayload - Error in updating interaction and task status for failed task - ' + task.intxnTaskId + ', ' + interaction.intxnId)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else {
    // const { connectionData, planData } = await getConnectionAndPlan(interaction)

    if (!task.payload || !task.payload.external_ref_sys || !task.payload.external_ref_no ||
      task.payload.external_ref_sys === '' || task.payload.external_ref_no === '') {
      const t = await sequelize.transaction()
      try {
        await InteractionTask.update({
          status: 'ERROR',
          message: 'processBarService - Task update data is invalid and cannot be processed further',
          updatedBy: systemUserId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        }
        )
        await Interaction.update(
          { currStatus: 'FAILED' },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )
        await t.commit()
      } catch (error) {
        logger.error(error, 'processTaskPayload - Task update data is invalid and cannot be processed further')
      } finally {
        if (t && !t.finished) {
          await t.rollback()
        }
      }
    } else {
      const t = await sequelize.transaction()
      try {
        const interactionData = {}
        let found = false
        if (!interaction.externalRefSys1 || interaction.externalRefSys1 === task.payload.external_ref_sys) {
          interactionData.externalRefNo1 = task.payload.external_ref_no
          interactionData.externalRefSys1 = task.payload.external_ref_sys
          found = true
        } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === task.payload.external_ref_sys) {
          interactionData.externalRefNo2 = task.payload.external_ref_no
          interactionData.externalRefSys2 = task.payload.external_ref_sys
          found = true
        } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === task.payload.external_ref_sys) {
          interactionData.externalRefNo3 = task.payload.external_ref_no
          interactionData.externalRefSys3 = task.payload.external_ref_sys
          found = true
        } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === task.payload.external_ref_sys) {
          interactionData.externalRefNo4 = task.payload.external_ref_no
          interactionData.externalRefSys4 = task.payload.external_ref_sys
          found = true
        }

        if (found) {
          await Interaction.update(
            interactionData,
            {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
          await InteractionTask.update({
            status: 'CLOSED',
            updatedBy: systemUserId
          },
          {
            where: {
              intxnTaskId: task.intxnTaskId,
              intxnId: interaction.intxnId
            },
            transaction: t
          }
          )
        } else {
          await InteractionTask.update({
            status: 'ERROR',
            message: 'processTaskPayload - No empty external references found to update',
            updatedBy: systemUserId
          },
          {
            where: {
              intxnTaskId: task.intxnTaskId,
              intxnId: interaction.intxnId
            },
            transaction: t
          }
          )
          await Interaction.update(
            { currStatus: 'FAILED' },
            {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
        }
        await t.commit()
      } catch (error) {
        logger.error(error, 'processTaskPayload - Error while updating external references')
      } finally {
        if (t && !t.finished) {
          await t.rollback()
        }
      }
    }
  }
}

const activateNewCustomer = async (connectionData, planData, interaction, t) => {
  const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  // const realtimeStatus = {connectionStatus: 'CU'}
  console.log('activateNewCustomer', interaction.intxnId, realtimeStatus.connectionStatus)

  if (realtimeStatus && realtimeStatus.connectionStatus === 'CU') {
    await Customer.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        customerId: interaction.customerId
      },
      transaction: t
    })

    await Account.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        accountId: interaction.accountId
      },
      transaction: t
    })

    await Connection.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.connectionId
      },
      transaction: t
    })

    return true
  } else {
    return false
  }
}

const activateNewAcctService = async (connectionData, planData, interaction, t) => {
  const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  // const realtimeStatus = {connectionStatus: 'CU'}

  console.log('activateNewAcctService', interaction.intxnId, realtimeStatus.connectionStatus)

  if (realtimeStatus && realtimeStatus.connectionStatus === 'CU') {
    await Account.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        accountId: interaction.accountId
      },
      transaction: t
    })

    await Connection.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.connectionId
      },
      transaction: t
    })

    return true
  } else {
    return false
  }
}

const activateNewService = async (connectionData, planData, interaction, t) => {
  const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  // const realtimeStatus = {connectionStatus: 'CU'}

  console.log('activateNewService', interaction.intxnId, realtimeStatus.connectionStatus)

  if (realtimeStatus && realtimeStatus.connectionStatus === 'CU') {
    await Connection.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.connectionId
      },
      transaction: t
    })

    return true
  } else {
    return false
  }
}

const deActivateService = async (interaction, t) => {
  await Connection.update({
    status: 'TOS',
    updatedBy: systemUserId
  },
  {
    where: {
      connectionId: interaction.connectionId
    },
    transaction: t
  }
  )
}

const activateService = async (interaction, t) => {
  await Connection.update({
    status: 'ACTIVE',
    updatedBy: systemUserId
  },
  {
    where: {
      connectionId: interaction.connectionId
    },
    transaction: t
  }
  )
}

const activatePlan = async (connectionData, planData, interaction, t) => {
  const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  console.log('activatePlan', interaction.intxnId, realtimeStatus.currentPlanCode)
  if (!realtimeStatus.currentPlanCode || realtimeStatus.currentPlanCode === undefined) {
    await Interaction.update({ currStatus: 'FAILED' }, { where: { intxnId: interaction.intxnId } })
    const update = {
      status: 'ERROR',
      message: 'Unable to retrive service details'
    }
    await InteractionTask.update(update, { where: { intxnId: interaction.intxnId, taskId: 'CLOSESR' } })
  }
  const newPlanData = await Plan.findOne({
    where: {
      planId: interaction.planId
    }
  })

  if (connectionData && connectionData.mappingPayload &&
    connectionData.mappingPayload.plans && connectionData.mappingPayload.plans[0].planId &&
    newPlanData.refPlanCode === realtimeStatus.currentPlanCode) {
    console.log('Switching plans')

    const oldPlanId = connectionData.mappingPayload.plans[0].planId

    connectionData.mappingPayload.plans[0].planId = interaction.planId

    await Connection.update({
      mappingPayload: connectionData.mappingPayload,
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.connectionId
      },
      transaction: t
    }
    )

    await ConnectionPlan.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.connectionId,
        planId: interaction.planId
      },
      transaction: t
    })

    await ConnectionPlan.update({
      status: 'INACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.connectionId,
        planId: oldPlanId
      },
      transaction: t
    })

    return true
  } else {
    console.log('Plan change not yet done')
    return false
  }
}

const terminateService = async (interaction, task, tasks) => {
  console.log('processTerminate', interaction.intxnId, task.taskId, task.status)
  const t = await sequelize.transaction()
  if (task.status === 'CLOSED') {
    return true
  }

  let taskCloseCount = 0
  let taskCount = 0

  for (const t of tasks) {
    if (t.intxnTaskId >= task.intxnTaskId) {
      break
    }
    if (t.status === 'CLOSED') {
      taskCloseCount++
    }
    taskCount++
  }

  if (taskCloseCount !== taskCount) {
    return true
  }

  const { connectionData, planData } = await getConnectionAndPlan(interaction)

  const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  // const realtimeStatus = {serviceLevel: 'UNBAR'}

  console.log('realtimeStatus', realtimeStatus)
  if (interaction.woType === 'TERMINATE') {
    if (realtimeStatus?.serviceLevel?.trim() === 'RE') {
      await deActivateNewService(interaction, t)
      await InteractionTask.update({
        status: 'CLOSED',
        message: 'Termination Successful',
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await Interaction.update(
        { currStatus: 'CLOSED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
    } else {
      await InteractionTask.update({
        status: 'ERROR',
        message: 'The service is not in Recovery status in Cerillion',
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )

      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
    }
  }

  await t.commit()
}

const checkOCS = async (interaction, connectionData) => {
  let accessNbr
  if (connectionData.identificationNo.length <= 7) {
    accessNbr = COUNTRYCODE_PREFIX + connectionData.identificationNo
  } else {
    accessNbr = connectionData.identificationNo
  }

  const resp = await ocsCustomerStatus(interaction.intxnId, accessNbr)
  // const resp = {status: 'TEMPORARY BLOCKED', message: ''}
  if (interaction.woType === 'BAR') {
    if (resp.status.toUpperCase() === 'TEMPORARY BLOCKED') {
      return true
    }
  }
  if (interaction.woType === 'UNBAR') {
    if (resp.status.toUpperCase() === 'ACTIVATED') {
      return true
    }
  }

  return false
  // const t = await sequelize.transaction()
  // try {
  //   if (interaction.woType === 'BAR') {
  //     await Connection.update({
  //       status: 'TOS',
  //       updatedBy: systemUserId
  //     },
  //     {
  //       where: {
  //         connectionId: interaction.connectionId
  //       },
  //       transaction: t
  //     }
  //     )
  //   }

  //   if (interaction.woType === 'UNBAR') {
  //     await Connection.update({
  //       status: 'ACTIVE',
  //       updatedBy: systemUserId
  //     },
  //     {
  //       where: {
  //         connectionId: interaction.connectionId
  //       },
  //       transaction: t
  //     }
  //     )
  //   }

  //   await Interaction.update(
  //     {
  //       currStatus: 'CLOSED',
  //       resolutionReason: failure
  //     },
  //     {
  //       where: {
  //         intxnId: interaction.intxnId
  //       },
  //       transaction: t
  //     }
  //   )

  //   await t.commit()

  //   return true
  // } catch (error) {
  //   t.rollback()
  //   logger.error(error, 'processBarUnBar - Error in updating interaction - ' + interaction.intxnId)
  //   return false
  // }
}

const activateDeactivateVAS = async (interaction, t) => {
  // const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  // const realtimeStatus = { currentPlanCode: 'GSM111' }
  // console.log('activateDeactivateVAS', interaction.intxnId, interaction.planIdList, realtimeStatus.currentPlanCode)

  if (interaction.planIdList && interaction.planIdList !== '') {
    const planIds = interaction.planIdList.split(',')

    let status
    if (interaction.woType === 'VASACT') {
      console.log(2)
      status = 'ACTIVE'
    }

    if (interaction.woType === 'VASDEACT') {
      console.log(3)
      status = 'INACTIVE'
    }

    for (const p of planIds) {
      console.log(4, p, interaction.connectionId)
      const connPlanResp = await ConnectionPlan.update({
        status: status,
        updatedBy: systemUserId
      },
      {
        where: {
          connectionId: interaction.connectionId,
          planId: p,
          status: 'PENDING'
        },
        transaction: t
      })
      console.log(JSON.stringify(connPlanResp, null, 2))
      if (connPlanResp[0] !== 1) {
        return false
      }
    }
    return true
  } else {
    return false
  }
}

const switchService = async (connectionData, planData, interaction, t) => {
  const realtimeStatus = await getRealtimeServiceDetails(connectionData.identificationNo, planData.prodType, 'true')
  // const realtimeStatus = {connectionStatus: 'CU'}

  console.log('switchService', interaction.intxnId, realtimeStatus.connectionStatus)

  if (realtimeStatus && realtimeStatus.connectionStatus === 'CU') {
    await Connection.update({
      status: 'ACTIVE',
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.connectionId
      },
      transaction: t
    })

    await Connection.update({
      status: 'PD-TR',
      updatedBy: systemUserId
    },
    {
      where: {
        connectionId: interaction.existingConnectionId
      },
      transaction: t
    })

    return true
  } else {
    return false
  }
}

const deActivateNewCustomer = async (interaction, t) => {
  console.log('deActivateNewCustomer', interaction.intxnId)

  await Customer.update({
    status: 'ACTIVE',
    updatedBy: systemUserId
  },
  {
    where: {
      customerId: interaction.customerId
    },
    transaction: t
  })

  await Account.update({
    status: 'ACTIVE',
    updatedBy: systemUserId
  },
  {
    where: {
      accountId: interaction.accountId
    },
    transaction: t
  })

  await Connection.update({
    status: 'PD',
    updatedBy: systemUserId
  },
  {
    where: {
      connectionId: interaction.connectionId
    },
    transaction: t
  })

  return true
}

const deActivateNewAcctService = async (interaction, t) => {
  console.log('deActivateNewAcctService', interaction.intxnId)

  await Account.update({
    status: 'ACTIVE',
    updatedBy: systemUserId
  },
  {
    where: {
      accountId: interaction.accountId
    },
    transaction: t
  })

  await Connection.update({
    status: 'PD',
    updatedBy: systemUserId
  },
  {
    where: {
      connectionId: interaction.connectionId
    },
    transaction: t
  })

  return true
}

const deActivateNewService = async (interaction, t) => {
  console.log('deActivateNewService', interaction.intxnId)

  await Connection.update({
    status: 'PD',
    updatedBy: systemUserId
  },
  {
    where: {
      connectionId: interaction.connectionId
    },
    transaction: t
  })

  return true
}

const processFaultPayload = async (interaction, task) => {
  logger.debug('processFaultPayload', interaction.intxnId, interaction.woType, task.taskId, task.status)

  if (task.status === 'NEW' || task.status === 'WIP' || task.status === 'ERROR' || task.status === 'CLOSED' || task.status === 'RESOLVED') {
    return false
  }

  if (task.status === 'FAILED') {
    const t = await sequelize.transaction()
    try {
      let message
      if (!task.payload || !task.payload.remarks) {
        message = 'Task status is FAILED, but BOTS did not return any error message'
      } else {
        message = 'Task failed. Please check BOTS response for details'
      }

      await InteractionTask.update({
        status: 'ERROR',
        message: message,
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      }
      )
      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, 'processFaultPayload - Error in updating interaction and task status for failed task - ' + task.intxnTaskId + ', ' + interaction.intxnId)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else if (!task.payload || !task.payload.external_ref_sys || !task.payload.external_ref_no ||
    task.payload.external_ref_sys === '' || task.payload.external_ref_no === '') {
    const t = await sequelize.transaction()
    try {
      await InteractionTask.update({
        status: 'ERROR',
        message: 'processFaultPayload - Task update data is invalid and cannot be processed further',
        updatedBy: systemUserId
      },
      {
        where: {
          intxnTaskId: task.intxnTaskId,
          intxnId: interaction.intxnId
        },
        transaction: t
      })
      await Interaction.update(
        { currStatus: 'FAILED' },
        {
          where: {
            intxnId: interaction.intxnId
          },
          transaction: t
        }
      )
      await t.commit()
    } catch (error) {
      logger.error(error, 'processFaultPayload - Task update data is invalid and cannot be processed further')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  } else {
    const t = await sequelize.transaction()
    try {
      const ticketResponse = await getTicketDetails(task.payload.external_ref_no, interaction.intxnType)
      if (!ticketResponse || !ticketResponse.ticketNumber || ticketResponse.ticketNumber === '') {
        await InteractionTask.update({
          status: 'ERROR',
          message: 'processFaultPayload - Ticket Number provided by BOTS not found in OMS',
          updatedBy: systemUserId
        },
        {
          where: {
            intxnTaskId: task.intxnTaskId,
            intxnId: interaction.intxnId
          },
          transaction: t
        })
        await Interaction.update(
          { currStatus: 'FAILED' },
          {
            where: {
              intxnId: interaction.intxnId
            },
            transaction: t
          }
        )
      } else {
        const interactionData = {}
        let found = false
        if (!interaction.externalRefSys1 || interaction.externalRefSys1 === task.payload.external_ref_sys) {
          interactionData.externalRefNo1 = task.payload.external_ref_no
          interactionData.externalRefSys1 = task.payload.external_ref_sys
          found = true
        } else if (!interaction.externalRefSys2 || interaction.externalRefSys2 === task.payload.external_ref_sys) {
          interactionData.externalRefNo2 = task.payload.external_ref_no
          interactionData.externalRefSys2 = task.payload.external_ref_sys
          found = true
        } else if (interaction.externalRefSys3 || interaction.externalRefSys3 === task.payload.external_ref_sys) {
          interactionData.externalRefNo3 = task.payload.external_ref_no
          interactionData.externalRefSys3 = task.payload.external_ref_sys
          found = true
        } else if (!interaction.externalRefSys4 || interaction.externalRefSys4 === task.payload.external_ref_sys) {
          interactionData.externalRefNo4 = task.payload.external_ref_no
          interactionData.externalRefSys4 = task.payload.external_ref_sys
          found = true
        }

        if (found) {
          await Interaction.update(
            interactionData,
            {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
          await InteractionTask.update({
            status: 'CLOSED',
            updatedBy: systemUserId
          },
          {
            where: {
              intxnTaskId: task.intxnTaskId,
              intxnId: interaction.intxnId
            },
            transaction: t
          }
          )
        } else {
          await InteractionTask.update({
            status: 'ERROR',
            message: 'processFaultPayload - No empty external references found to update',
            updatedBy: systemUserId
          },
          {
            where: {
              intxnTaskId: task.intxnTaskId,
              intxnId: interaction.intxnId
            },
            transaction: t
          })
          await Interaction.update(
            { currStatus: 'FAILED' },
            {
              where: {
                intxnId: interaction.intxnId
              },
              transaction: t
            }
          )
        }
      }
      await t.commit()
    } catch (error) {
      logger.error(error, 'processFaultPayload - Error while updating external references')
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }
}

export const processSendNotificationEmail = async () => {
  try {
    const notifications = await Notification.findAll({
      where: {
        status: 'NEW',
        notificationType: 'Email'
      }
    })
    if (Array.isArray(notifications)) {
      for (const notification of notifications) {
        const response = await emailHelper.sendMail({
          to: [notification.email],
          subject: notification.subject,
          message: notification.body
        })
        let data
        if (response) {
          data = {
            status: 'SENT'
          }
        } else {
          data = {
            status: 'RETRY',
            retries: notification.retries + 1
          }
        }
        if (data) {
          await Notification.update(data, {
            where: {
              notificationId: notification.notificationId
            }
          })
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error while sending notification email')
  }
}

export const processRetrieSendNotificationEmail = async () => {
  try {
    const notifications = await Notification.findAll({
      where: {
        retries: {
          [Op.lte]: 3
        },
        status: {
          [Op.or]: ['RETRY']
        },
        notificationType: 'Email'
      }
    })
    if (Array.isArray(notifications)) {
      for (const notification of notifications) {
        const response = await emailHelper.sendMail({
          to: [notification.email],
          subject: notification.subject,
          message: notification.body
        })
        let data
        if (response) {
          data = {
            status: 'SENT'
          }
        } else {
          data = {
            status: 'RETRY',
            retries: notification.retries + 1
          }
        }
        if (data) {
          if (data.retries === 3) {
            data = {
              status: 'FAILED'
            }
          }
          await Notification.update(data, {
            where: {
              notificationId: notification.notificationId
            }
          })
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error while retrie sending notification email')
  }
}

export const processSendNotificationSMS = async () => {
  try {
    const notifications = await Notification.findAll({
      where: {
        status: 'NEW',
        notificationType: 'SMS'
      }
    })
    if (Array.isArray(notifications)) {
      for (const notification of notifications) {
        const response = await smsHelper.sendSMS({
          to: notification.mobileNo,
          message: notification.body
        })
        let data
        if (response.data[0].status === 'OK') {
          data = {
            status: 'SENT'
          }
        } else {
          data = {
            status: 'FAILED'
          }
        }
        if (data) {
          await Notification.update(data, {
            where: {
              notificationId: notification.notificationId
            }
          })
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error while sending notification sms')
  }
}

export const processAbandonedChat = async () => {
  const t = await sequelize.transaction()
  try {
    const chats = await Chat.findAll({ where: { status: ['NEW'] } })
    if (chats && !isEmpty(chats)) {
      const chatList = []
      for (const chat of chats) {
        if (differenceInMinutes(new Date(), chat?.createdAt) >= abandonedChatTimeout) {
          chatList.push(chat.chatId)
        }
      }
      await Chat.update({ status: 'ABANDONED' }, {
        where: {
          chatId: chatList,
          status:'NEW'
        },
        transaction: t
      })
      await t.commit()
    }
  } catch (error) {
    logger.error(error, 'Error while sending notification sms')
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}
