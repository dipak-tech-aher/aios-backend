import { logger } from '../config/logger'
import { WorkflowNew, WorkflowTxn, WorkflowHdr, sequelize, Role, BusinessEntity, BusinessUnit, InboundMessages, Interaction } from '../model'
import { QueryTypes, Op } from 'sequelize'
import { formateSelectQuery, formateInsertQuery, formateUpdateQuery } from './query-builder'
import { systemUserId } from 'config'
import { isEmpty } from 'lodash'
import jsonata from 'jsonata'
import { camelCaseConversion } from '../utils/string'
const Got = require('got')

export const startWorkFlowEngine = async () => {
  logger.debug('Starting WorkFlow Engine >>>>>>>')
  // const workflowHrd = await WorkflowHdr.findAll({
  //   where: {
  //     [Op.or]: [{ wfStatus: 'CREATED', entity: 'Interaction' }, { wfStatus: 'USER_WAIT' }, { wfStatus: 'SYS_WAIT' }]
  //   }
  // })
  let workflowHrd = await sequelize.query(`select * from workflow_hdr wh where wf_hdr_id not in (select wf_hdr_id from workflow_txn wt where wt.wf_txn_status in ('USER_WAIT','SYS_WAIT'))
  and wf_status in ('CREATED','USER_WAIT','SYS_WAIT') and entity= 'Interaction'`, {
    type: QueryTypes.SELECT,
    raw: true
  })
  workflowHrd = camelCaseConversion(workflowHrd)
  if (Array.isArray(workflowHrd) && workflowHrd.length > 0) {
    for (const wfHdr of workflowHrd) {
      // Finding the wfJSON for current wfHdr id
      logger.debug('Processing Entity ID : ', wfHdr.entityId)
      let interactionStatus
      try {
        interactionStatus = await Interaction.findOne({ where: { intxnId: wfHdr.entityId, currStatus: 'CLOSED' } })
      } catch (err) {
        interactionStatus = null
      }
      if (interactionStatus) {
        const wftxnData = {
          wfTxnStatus: 'DONE'
        }
        const wfStatus = {
          wfStatus: 'DONE'
        }
        await WorkflowTxn.update(wftxnData, { where: { wfHdrId: wfHdr.wfHdrId, wfTxnStatus: { [Op.ne]: 'DONE' } } })
        await WorkflowHdr.update(wfStatus, { where: { wfHdrId: wfHdr.wfHdrId } })
        // }
        continue
      }
      const wfDfn = await WorkflowNew.findOne({ where: { workflowId: wfHdr.wfDefnId } })
      // Finding WFJSON have definitions and process or not
      if (wfDfn.wfDefinition && wfDfn.wfDefinition.definitions && wfDfn.wfDefinition.definitions.process) {
        // console.log('wfHdr obj', JSON.stringify(wfHdr, null, 2))
        // console.log('Checking start activity', wfHdr.wfStatus, wfHdr.nextActivityId)
        if (wfHdr.wfStatus === 'CREATED') {
          if (!wfHdr.nextActivityId) {
            // Performing start step for new record
            await processStartStep(wfHdr, wfDfn.wfDefinition)
          } else if (wfHdr.nextActivityId) {
            // console.log('wfHdr.wfContext.........', wfHdr.wfContext)
            // If already wf started and continuing remaining tasks
            await continueWFExecution(wfDfn.wfDefinition, wfHdr.nextActivityId, wfHdr.wfContext)
          }
        } else if (wfHdr.wfStatus === 'USER_WAIT') {
          // code for user wait
        } else if (wfHdr.wfStatus === 'SYS_WAIT') {
          // code for system wait
        }
      } else {
        logger.debug('Workflow JSON not found in workflow definition table')
      }
    }
  } else {
    logger.debug('No records to execute the workflow hdr')
  }
}

export const startWorkFlowEngineManual = async (entityId) => {
  logger.debug('Manual WorkFlow Engine Run >>>>>>>')
  const wfHdr = await WorkflowHdr.findOne({
    where: {
      [Op.or]: [{ wfStatus: 'MANUAL_RUN', entity: 'Interaction' }],
      entityId: entityId
    }
  })

  // Finding the wfJSON for current wfHdr id
  logger.debug('Processing Entity ID : ', entityId)

  const wfDfn = await WorkflowNew.findOne({ where: { workflowId: wfHdr.wfDefnId } })

  // Finding WFJSON have definitions and process or not
  if (wfDfn.wfDefinition && wfDfn.wfDefinition.definitions && wfDfn.wfDefinition.definitions.process) {
    if (wfHdr.wfStatus === 'MANUAL_RUN') {
      if (!wfHdr.nextActivityId) {
        await processStartStep(wfHdr, wfDfn.wfDefinition)
      } else if (wfHdr.nextActivityId) {
        await continueWFExecution(wfDfn.wfDefinition, wfHdr.nextActivityId, wfHdr.wfContext)
      }
    }
  } else {
    logger.debug('Workflow JSON not found in workflow definition table')
  }
}

export const processStartStep = async (wfHdr, wfJson) => {
  logger.debug('Performing start step for new record')
  const t = await sequelize.transaction()
  try {
    const process = wfJson.definitions.process
    if (process) {
      const activities = process.activities
      const transitions = process.transitions
      // Finding START activitie and  current Activiti Id from the activities array
      const startActivity = activities.find(e => e.type === 'START')
      if (startActivity) {
        const startActivityId = startActivity.activityId
        const startActivityPrefix = startActivity.activityContextPrefix
        // Finding transition and next activiti id based on start Activiti Id in the transitions array
        const transition = transitions.find(e => e.from === startActivityId)
        if (transition) {
          const nextActivityId = transition.to
          let inputContext
          // Storing the activitie id's in context
          const context = {
            [startActivityPrefix]: startActivityPrefix
          }

          const hasStartRec = await WorkflowTxn.findOne({ where: { wfHdrId: wfHdr.wfHdrId, activityId: startActivityId } })
          if (!hasStartRec) {
            inputContext = {
              context,
              entity: wfHdr.entityId,
              entityType: wfHdr.entityType
            }
            // Inserting data into WorkflowTxn table
            const wfTxnData = {
              wfHdrId: wfHdr.wfHdrId,
              activityId: startActivityId,
              taskId: null, // No task id for the start step
              wfTxnStatus: 'DONE',
              txnContext: inputContext,
              createdBy: systemUserId,
              updatedBy: systemUserId
            }
            const wfTxn = await WorkflowTxn.create(wfTxnData, { transaction: t })
            if (wfTxn) {
              // updating the wfHdr table
              inputContext.wfHdrId = wfHdr.wfHdrId
              inputContext.context.entity = wfHdr.entityId
              inputContext.context.entityType = wfHdr.entityType
              const data = {
                nextActivityId,
                wfContext: inputContext
              }
              await WorkflowHdr.update(data, { where: { wfHdrId: wfHdr.wfHdrId }, transaction: t })
            }
          } else {
            logger.debug('Start activiti is already Exists')
          }
          logger.debug('Successfully processed start step')
        } else {
          logger.debug('No transitions found for start activitie')
          return false
        }
      } else {
        logger.debug('No start activitie found')
        return false
      }
    } else {
      logger.debug('No process found in the wfDefinition ')
    }
    await t.commit()
  } catch (error) {
    logger.error(error, 'Error while processing start step')
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}
const continueWFExecution = async (wfJson, currentActivityId, inputContext) => {
  // logger.debug('Continue workflow Execution')
  // logger.debug('Continue workflow Execution....................', currentActivityId)
  const t = await sequelize.transaction()
  try {
    const hasWaitRecord = await findUserWaitRecordById(currentActivityId, inputContext.wfHdrId)
    if (hasWaitRecord) {
      logger.debug('A - Some task are in wait state or not yet done, So can`t prcess End step now')
    } else {
      const activities = wfJson.definitions.process.activities
      const transitions = wfJson.definitions.process.transitions
      // console.log('currentActivityId.........', currentActivityId)
      // console.log('activities.........', activities)
      // console.log('transitions.........', transitions)
      // Finding tasks based on nextActivityId in the activities array
      const currentActivity = activities.find(e => e.activityId === currentActivityId)
      const activityPrefix = currentActivity.activityContextPrefix
      // inputContext.context[activityPrefix] = activityPrefix
      if (currentActivity.type === 'END') {
        // update the status as closed
        await processEndStep(currentActivity.activityId, inputContext)
      } else if (currentActivity.type === 'DECISION') {
        // console.log('im in descision...', currentActivity.activityId);
        let decision = false
        let transitionId
        for (const rule01 of currentActivity.condition) {
          if (rule01.ruleType === 'DEFAULT') {
            decision = true
            transitionId = rule01.transitionId
          }
          // console.log('log 1', rule01.rules)
          for (const rule02 of rule01.rules) {
            // console.log('log 2', rule02.rules)
            for (const rule03 of rule02.rules) {
              //  console.log('log 3', rule03)
              if (rule03.rules && typeof (rule03) === 'object') {
                const resultArray = []
                // console.log('log 4', rule03.rules)
                for (const rule04 of rule03.rules) {
                  let decisionRules = false
                  //   console.log('rules04 ----->>>>>', rule04, rule04.id)
                  if (rule04.valueType === 'EXPR') {
                    const expression = jsonata(rule04.value)
                    rule04.value = expression.evaluate(inputContext)
                  }
                  if (rule04.fieldType === 'EXPR') {
                    const expression = jsonata(rule04.field)
                    // console.log('Expression' , rule04.field, rule04)
                    rule04.field = expression.evaluate(inputContext)
                    // console.log('rule04.field line no 233 ===>', rule04.field)
                    // console.log('rule03.field......rule03.field', JSON.stringify(inputContext))
                    // console.log("transitionId", rule01.transitionId)
                    // console.log('rule04 ===>', rule04)
                    // console.log('rule04.operator ===>', rule04.operator)
                    // console.log('rule04.field ===>', rule04.field)
                    // console.log('rule04.value ===>', rule04.value)
                    // console.log('rule04.value ===>', rule04.value)

                    if (rule04.field) {
                      if (String(rule04.field).toUpperCase() === 'HELP') {
                        await WorkflowTxn.destroy({
                          where: {
                            wfHdrId: inputContext.wfHdrId
                          }
                        })
                      }
                    }
                    if ((rule04.operator === '-' || rule04.operator === '=') && !decisionRules) {
                      if (typeof (rule04.field) === 'object') {
                        //   console.log('rule04.field[0]....', rule04.field[0])
                        if (rule04.field[0] === rule04.value[0] && (rule04.field[0] !== undefined || rule04.value[0] !== undefined)) {
                          transitionId = rule01.transitionId
                          decisionRules = true
                        }
                      } else {
                        if (String(rule04?.field) === String(rule04?.value) && (rule04.field !== undefined || rule04.value !== undefined ||
                          rule04.field !== null || rule04.value !== null)) {
                          transitionId = rule01.transitionId
                          //  console.log('else....', rule04.field, rule04.value, String(rule04.field) === String(rule04.value))
                          decisionRules = true
                        }
                      }
                    }
                    if (rule04.operator === '!=' && !decisionRules) {
                      if (rule04.field !== rule04.value && (rule04.field !== undefined || rule04.value !== undefined)) {
                        transitionId = rule01.transitionId
                        decisionRules = true
                      }
                    }
                    resultArray.push(decisionRules)
                  }
                }
                if (rule03.combinator === 'AND') {
                  for (const r of resultArray) {
                    if (!r) {
                      decision = false
                      break
                    } else {
                      decision = true
                    }
                  }
                } else {
                  for (const r of resultArray) {
                    if (r) {
                      decision = true
                      break
                    }
                  }
                }
                // console.log('resultArray', resultArray)
              } else {
                if (rule03.valueType === 'TEXT') {
                  rule03.value = rule03.value
                }
                if (rule03.fieldType === 'TEXT') {
                  rule03.field = rule03.field
                }

                if (rule03.valueType === 'EXPR') {
                  const expression = jsonata(rule03.value)
                  rule03.value = expression.evaluate(inputContext)
                }
                if (rule03.fieldType === 'EXPR') {
                  // console.log('rule03.field ===>', rule03.field)
                  // console.log('rule03.operator ===>', rule03.operator)
                  // console.log('rule03.typeof ===>', typeof (rule03.field))
                  // console.log('rule03.value ===>', rule03.value)
                  // console.log('rule03.field......rule03.field', JSON.stringify(inputContext))

                  const expression = jsonata(rule03.field)
                  rule03.field = expression.evaluate(inputContext)
                  //  console.log('rule03.field ===>', rule03.field)
                  if (rule03.field) {
                    if (rule03.field.toString().toUpperCase() === 'HELP') {
                      await WorkflowTxn.destroy({
                        where: {
                          wfHdrId: inputContext.wfHdrId
                        }
                      })
                    }
                  }
                }
                if ((rule03.operator === '-' || rule03.operator === '=') && !decision) {
                  if (typeof (rule03.field) === 'object') {
                    //   console.log('rule03.field[0]....', rule03.field[0])
                    if (rule03.field[0] === rule03.value[0] && (rule03.field[0] !== undefined || rule03.value[0] !== undefined)) {
                      transitionId = rule01.transitionId
                      decision = true
                      break
                    }
                  } else {
                    if (rule03.field === rule03.value && (rule03.field !== undefined || rule03.value !== undefined)) {
                      transitionId = rule01.transitionId
                      decision = true
                      break
                    }
                  }
                }
                if (rule03.operator === '!=' && !decision) {
                  if (rule03.field !== rule03.value && (rule03.field !== undefined || rule03.value !== undefined)) {
                    transitionId = rule01.transitionId
                    decision = true
                    break
                  }
                }
              }
              if (decision) {
                break
              }
            }
            if (decision) {
              break
            }
          }
          if (decision) {
            break
          }
        }
        if (decision) {
          // console.log('here......', transitionId)
          const transition = transitions.find(e => e.transitionId === transitionId)
          const nextActivityId = transition.to
          const txnData = {
            wfHdrId: inputContext.wfHdrId,
            activityId: currentActivity.activityId,
            // taskId: task.taskId,
            txnContext: inputContext,
            wfTxnStatus: 'DONE',
            createdBy: systemUserId,
            updatedBy: systemUserId
          }
          const wfTxn = await WorkflowTxn.create(txnData, { transaction: t }, { logging: true })
          if (wfTxn) {
            // updating the wfHdr table
            inputContext.wfHdrId = inputContext.wfHdrId
            const data = {
              nextActivityId,
              wfContext: inputContext
            }
            await WorkflowHdr.update(data, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
          }
          await t.commit()
          await continueWFExecution(wfJson, nextActivityId, inputContext)
        }
      } else {
        let noTaskFound = false
        for (const task of currentActivity.tasks) {
          // console.log('Processing task ' + task.taskName)

          let hasMoreTask = false
          if (currentActivity.tasks.length > 1) {
            hasMoreTask = true
          }

          // Finding any wait record in txn table and continueExecution
          const hasWaitRecord = await findUserWaitRecordById(currentActivityId, inputContext.wfHdrId)
          // console.log('hasWaitRecord.........', hasWaitRecord)
          if (hasWaitRecord) {
            logger.debug('B - Some task are in wait state or not yet done, So can`t prcess End step now')
            noTaskFound = false
            break
          } else {
            let payload = { skip: true }
            let hasTask = await WorkflowTxn.findOne({
              where: { wfHdrId: inputContext.wfHdrId, activityId: currentActivityId, taskId: task.taskId.toString() },
              order: [['createdAt', 'DESC']]
            })
            const hasTaskCopy = hasTask
            if (hasTask?.dataValues?.payload?.skip === false && hasTask?.dataValues.wfTxnStatus === 'DONE') {
              // console.log('---Here ---')
              hasTask = false
            } else if (hasTask?.dataValues?.payload?.skip === true && hasTask?.dataValues.wfTxnStatus === 'DONE') {
              // console.log('---Here 1 ---')
              hasTask = true
            }

            if (!hasTask && task.type === 'DB' && task.taskId > 1) {
              noTaskFound = true
              payload = { skip: false }
            }

            if (!hasTask) {
              const txnData = {
                wfHdrId: inputContext.wfHdrId,
                activityId: currentActivity.activityId,
                taskId: task.taskId,
                txnContext: inputContext,
                wfTxnStatus: 'DONE',
                payload: payload,
                createdBy: systemUserId,
                updatedBy: systemUserId
              }
              const wfTxn = await WorkflowTxn.create(txnData, { transaction: t }, { logging: true })
              // Storing Current activity under context
              // inputContext.context[activityPrefix] = activityPrefix

              // Finding taskContextPrefix and storing under current activity
              const taskActivityPrefix = task.taskContextPrefix

              // inputContext.context[activityPrefix] = {
              // [taskActivityPrefix]: taskActivityPrefix
              // }
              // console.log('task.type==>', task.type)
              if (task.type === 'DB') {
                await executeDatabaseTask(task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
              } else if (task.type === 'MANUAL') {
                await executeManualTask(task, inputContext, wfTxn, t, activityPrefix, taskActivityPrefix)
                noTaskFound = false
                break
              } else if (task.type === 'API') {
                await executeAPITask(task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
              } else {
                // To Execute other tasks
              }
            } else {
              const wfTxnData = {
                payload: { skip: false }
              }
              await WorkflowTxn.update(wfTxnData, { where: { wfTxnId: hasTaskCopy.dataValues.wfTxnId, wfHdrId: inputContext.wfHdrId, activityId: currentActivityId, taskId: task.taskId.toString() } })
              logger.debug('No tasks found')
              noTaskFound = true
            }
          }
        }
        if (noTaskFound) {
          // continueExecution for next activities and transitions
          const transition = transitions.find(e => e.from === currentActivityId)
          // console.log('wfJson........', wfJson)
          //  console.log('wfJson........', transition)
          //  console.log('inputContext........', inputContext)

          if (transition) {
            // console.log('transition -->', transition.to)
            const nextActivityId = transition.to
            // Here nextActivityId become current activityid
            await continueWFExecution(wfJson, nextActivityId, inputContext)
          } else {
            logger.debug('No transition found')
          }
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error while continue workflow execution step')
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const executeSendMessageTask = async (SendMessageTask, inputContext, t, activityPrefix, taskActivityPrefix) => {
  // console.log('im in send msg task', SendMessageTask)
  // await updateContext(SendMessageTask, inputContext, t, activityPrefix, taskActivityPrefix, false)
  return SendMessageTask
}

const executeCollectInputTask = async (collectInputTask, inputContext, t, activityPrefix, taskActivityPrefix, mobileNumber, msg, txnData, nextActivityId) => {
  // console.log('im in collect input');
  if (msg === '') {
    txnData.wfTxnStatus = 'DONE'
    const wfTxn = await WorkflowTxn.create(txnData, { transaction: t }, { logging: true })
    if (wfTxn) {
      // updating the wfHdr table
      inputContext.wfHdrId = wfTxn.wfHdrId
      const data = {
        nextActivityId,
        wfContext: inputContext
      }
      await WorkflowHdr.update(data, { where: { wfHdrId: wfTxn.wfHdrId }, transaction: t })
    }
    // await t.commit()
    return collectInputTask
  } else {
    // console.log('msg form user', msg)
    txnData.wfTxnStatus = 'DONE'
    const wfTxn = await WorkflowTxn.create(txnData, { transaction: t }, { logging: true })
    if (wfTxn) {
      // updating the wfHdr table
      inputContext.wfHdrId = wfTxn.wfHdrId
      const data = {
        nextActivityId,
        wfContext: inputContext
      }
      await WorkflowHdr.update(data, { where: { wfHdrId: wfTxn.wfHdrId }, transaction: t })
    }
    // await t.commit()
    return collectInputTask
    // if users are matching with our descisions then we can proceed
  }
}

const processEndStep = async (activityId, inputContext) => {
  const t = await sequelize.transaction()
  logger.debug('Processing End step')
  try {
    // console.log('activityId in end step', activityId)
    // console.log('inputContext.wfHdrId in end step', inputContext.wfHdrId)
    const hasRecord = await WorkflowTxn.findOne({
      where: {
        wfHdrId: inputContext.wfHdrId,
        activityId,
        wfTxnStatus: { [Op.ne]: 'DONE' }
      }
    })
    // console.log('hasrecord in end step', hasRecord)
    if (!hasRecord) {
      // Inserting data into WorkflowTxn table for end step
      const wfTxnData = {
        wfHdrId: inputContext.wfHdrId,
        activityId,
        taskId: null, // No task id for the start step
        wfTxnStatus: 'DONE',
        txnContext: inputContext,
        createdBy: systemUserId,
        updatedBy: systemUserId
      }
      const wfTxn = await WorkflowTxn.create(wfTxnData, { transaction: t })
      if (wfTxn) {
        // updating the wfHdr table  for end step
        const data = {
          nextActivityId: activityId,
          // wfContext: inputContext,
          wfStatus: 'DONE',
          updatedBy: systemUserId
        }
        await WorkflowHdr.update(data, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
      }
    } else {
      logger.debug('Some task are in wait state')
    }
    await t.commit()
    logger.debug('Successfully processed End step')
  } catch (error) {
    logger.error(error, 'Error while processing end step')
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const executeDatabaseTask = async (dbTasks, context, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Execute Database Task')
  if (dbTasks.queryType === 'SELECT') {
    await executeSelect(dbTasks, context, t, activityPrefix, taskActivityPrefix, hasMoreTask)
  } else if (dbTasks.queryType === 'INSERT') {
    await executeInsert(dbTasks, context, t, activityPrefix, taskActivityPrefix, hasMoreTask)
  } else if (dbTasks.queryType === 'UPDATE') {
    await executeUpdate(dbTasks, context, t, activityPrefix, taskActivityPrefix, hasMoreTask)
  } else {
    logger.debug('No Database Task found')
  }
  logger.debug('Successfully Executed DB Task')
}

const executeSelect = async (task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing Select')
  if (task.tables.length > 0 && task.columns.length > 0) {
    const { query, params, waitClause } = await formateSelectQuery(task, inputContext)
    logger.debug('Generated Select Query :', query)

    if (waitClause) {
      // console.log(waitClause)
    }
    // Fetching the results based generated query
    const response = await sequelize.query(query, {
      replacements: params,
      type: QueryTypes.SELECT,
      logging: true
    })
    logger.debug('Select query response :', response)
    if (response) {
      await updateContextDB(response, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask, task)
    }
  }
}

const executeInsert = async (task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing Insert')
  if (task.tables.length === 1 && task.columns.length > 0) {
    const query = await formateInsertQuery(task, inputContext)
    logger.debug('Generated Insert Query :', query)
    // Inserting data based generated query
    const response = await sequelize.query(query, { transaction: t }, {
      type: QueryTypes.INSERT
    })
    // console.log('insert query response....', response)
    if (response) {
      await updateContext(response, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
    }
  }
}

const executeUpdate = async (task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing Update')
  if (task.tables.length === 1 && task.columns.length === 1) {
    const { query, params } = await formateUpdateQuery(task, inputContext)
    logger.debug('Generated Update Query :', query)
    // Updating data based generated query
    const response = await sequelize.query(query, { transaction: t }, {
      replacements: params,
      type: QueryTypes.UPDATE
    })
    if (response) {
      await updateContext(response, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
    }
  }
}

const executeManualTask = async (manualTask, inputContext, wfTxn, t, activityPrefix, taskActivityPrefix) => {
  logger.debug('Execute Manual Task', manualTask.taskName)
  // Perform the assignment by setting curr_dept,curr_role and status as user_wait in workflow_txn
  let wfTxnData
  let hasMoreManualTask = false

  if (Array.isArray(manualTask.assignments) && manualTask.assignments.length > 0) {
    for (const assignment of manualTask.assignments) {
      // Evaluate condition
      let condition = false
      const noOfItems = manualTask.assignments.length
      if (noOfItems === 1) {
        condition = true
      } else if (noOfItems > 1) {
        const rules = assignment.rules[0].rules
        for (const r of rules) {
          if (r.fieldType === 'EXPR') {
            const expression = jsonata(r.field)
            const expValue = expression.evaluate(inputContext)
            if (expValue === r.value) {
              condition = true
              hasMoreManualTask = true
            }
          }
        }
      }

      if (condition) {
        if (assignment.assignmentType === 'BYHIERARCHY') {
          logger.debug('Assignment to Dept Roles Found')
          const obj = assignment.assignedToDeptRoles[0]
          wfTxnData = {
            currEntity: obj.unitId,
            currRole: obj.roleId,
            userStatus: obj.status[0],
            wfTxnStatus: 'USER_WAIT'
          }
        } else if (assignment.assignmentType === 'BYTASK') {
          const activityId = assignment.assignByTask.activityId
          const taskId = assignment.assignByTask.taskId.toString()
          const hasRecord = await WorkflowTxn.findOne({ where: { wfHdrId: inputContext.wfHdrId, activityId, taskId }, logging: true })
          if (hasRecord) {
            wfTxnData = {
              currEntity: hasRecord.currEntity,
              currRole: hasRecord.currRole,
              userStatus: hasRecord.userStatus,
              currUser: hasRecord.currUser,
              wfTxnStatus: 'USER_WAIT'
            }
          }
        }
        break
      }
    }
  }
  if (wfTxnData) {
    if (hasMoreManualTask) {
      inputContext.context[activityPrefix] = {
        ...inputContext.context[activityPrefix],
        [taskActivityPrefix]: taskActivityPrefix
      }
    } else {
      inputContext.context[activityPrefix] = activityPrefix
      inputContext = JSON.parse(JSON.stringify(inputContext))
      inputContext.context[activityPrefix] = {
        [taskActivityPrefix]: taskActivityPrefix
      }
    }

    inputContext.context[activityPrefix][taskActivityPrefix] = wfTxnData
    const data = {
      updatedBy: systemUserId,
      wfContext: inputContext
    }
    await WorkflowHdr.update(data, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })

    wfTxnData.txnContext = JSON.parse(JSON.stringify(inputContext))
    await WorkflowTxn.update(wfTxnData, { where: { wfTxnId: wfTxn.wfTxnId }, transaction: t })
  }
  await t.commit()
  logger.debug('Successfully Executed Manual Task')
}

const executeAPITask = async (APITask, context, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing API Task')
  if (APITask.api.method === 'POST') {
    await executePost(APITask, context, t, activityPrefix, taskActivityPrefix, hasMoreTask)
  } else if (APITask.api.method === 'PUT') {
    await executePut(APITask, context, t, activityPrefix, taskActivityPrefix, hasMoreTask)
  } else if (APITask.api.method === 'GET') {
    await executeGet(APITask, context, t, activityPrefix, taskActivityPrefix, hasMoreTask)
  } else if (APITask.api.method === 'DELETE') {
    await executeDelete(APITask, context, t, activityPrefix, taskActivityPrefix, hasMoreTask)
  } else {
    logger.debug('No API Task found')
  }
  logger.debug('Successfully Executed API Task')
}

const executePost = async (task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing POST')
  const properties = findUrlParamsAndBody(task, inputContext)
  // console.log('properties....', properties)
  const response = await Got.post({
    headers: { 'content-type': 'application/json' },
    url: properties.url,
    body: JSON.stringify(properties.reqBody),
    retry: 0
  }, {
    https: {
      rejectUnauthorized: false
    }
  })
  // console.log('response.body.....................XXXX', response.body)
  if (response.body) {
    // console.log('inputContext................................', inputContext)

    await updateContextWhatsApp(JSON.parse(response.body), inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)

    // await updateContext(JSON.parse(response.body), inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
    // const validate = ajv.compile(task.api.responseSchema)
    // const valid = validate(response)
    // if (!valid) {
    //   logger.debug('Response structure is not matched', validate.errors)
    // } else {
    //   return true
    // }
  }
}

const executePut = async (task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing PUT')
  const properties = findUrlParamsAndBody(task, inputContext)

  const response = await Got.put({
    headers: { 'content-type': 'application/json' },
    url: properties.url,
    body: JSON.stringify(properties.reqBody),
    retry: 0
  }, {
    https: {
      rejectUnauthorized: false
    }
  })
  if (response.body) {
    await updateContext(JSON.parse(response.body), inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)

    // const validate = ajv.compile(task.api.responseSchema)
    // const valid = validate(response)
    // if (!valid) {
    //   logger.debug('Response structure is not matched', validate.errors)
    // } else {
    //   return true
    // }
  }
}

const executeGet = async (task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing GET')
  const properties = findUrlParamsAndBody(task, inputContext)

  const response = await Got.get({
    headers: { 'content-type': 'application/json' },
    url: properties.url,
    retry: 1
  })
  if (response.body) {
    await updateContext(JSON.parse(response.body), inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
    // const validate = ajv.compile(task.api.responseSchema)
    // const valid = validate(response)
    // if (!valid) {
    //   logger.debug('Response structure is not matched', validate.errors)
    // } else {
    //   return true
    // }
  }
}

const executeDelete = async (task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  logger.debug('Executing DELETE')
  const properties = findUrlParamsAndBody(task, inputContext)
  const response = await Got.delete({
    headers: { 'content-type': 'application/json' },
    url: properties.url,
    retry: 0
  })
  if (response.body) {
    await updateContext(JSON.parse(response.body), inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
    // const validate = ajv.compile(task.api.responseSchema)
    // const valid = validate(response)
    // if (!valid) {
    //   logger.debug('Response structure is not matched', validate.errors)
    // } else {
    //   return true
    // }
  }
}

export const assignWFToEntity = async (entityId, entity, workflowId) => {
  console.log('here alocating',workflowId)
  const t = await sequelize.transaction()
  try {
    const workflow = await WorkflowNew.findOne({ where: { workflowId } })
    if (workflow) {
      const wfhdr = await WorkflowHdr.findOne({ where: { entity, entityId, wfDefnId: workflowId } })
      if (!wfhdr) {
        const data = {
          entity,
          entityId,
          wfDefnId: workflowId,
          wfContext: {},
          wfStatus: 'CREATED',
          createdBy: systemUserId,
          updatedBy: systemUserId
        }
        await WorkflowHdr.create(data, { transaction: t })
        await t.commit()
      }
    }
  } catch (error) {
    console.log(error)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

export const updateWFToEntity = async (entityId, entity, flowId, status, t) => {
  const wfhdr = await WorkflowHdr.findOne({ where: { wfHdrId: flowId } })
  if (wfhdr) {
    const wfEntityContext = wfhdr.wfContext.context
    const dataContext = {
      ...wfEntityContext,
      entity: entityId
    }
    // console.log('dataContext==', dataContext)
    const wfContext = {
      // ...wfhdr.wfContext,
      context: dataContext,
      entity: entityId,
      wfHdrId: flowId
    }
    // console.log('wfContext==', wfContext)

    const data = {
      entity,
      entityId: entityId,
      wfContext,
      wfStatus: status,
      createdBy: systemUserId,
      updatedBy: systemUserId
    }
    // console.log('Context update for workflow ', data)
    await WorkflowHdr.update(data, { where: { wfHdrId: flowId }, transaction: t })
  }
}

export const getWFState = async (entityId, entity) => {
  const response = {
    entities: []
  }
  logger.debug('Fetching workflow target Deparments and Roles ')
  const workflowHdr = await WorkflowHdr.findOne({ where: { entityId, entity } })
  // console.log(workflowHdr)
  if (workflowHdr) {
    // Fetching WorkflowTxn records to find the user wait record
    const workflowTxns = await WorkflowTxn.findAll({
      where: {
        wfHdrId: workflowHdr.wfHdrId,
        wfTxnStatus: 'USER_WAIT'
      },
      order: [['wfTxnId', 'DESC']]
    })
    // get Current Dept and created dept
    const interactionData = await Interaction.findOne({
      attributes: ['createdEntity', 'currEntity', 'currStatus'],
      where: {
        intxnId: entityId
      }
    })

    logger.debug('Finding target dept roles for')
    // console.log('workflowTxns', workflowTxns)
    if (workflowTxns.length > 0) {
      if (workflowTxns[0].wfTxnStatus === 'USER_WAIT') {
        // find the json from the workflow defination table for the given wfDefnId
        const workflowDfn = await WorkflowNew.findOne({ where: { workflowId: workflowHdr.wfDefnId } })
        if (workflowDfn && workflowDfn.wfDefinition && workflowDfn.wfDefinition.definitions && workflowDfn.wfDefinition.definitions.process) {
          const process = workflowDfn.wfDefinition.definitions.process
          // Finding the targetDeptRoles from the json object
          if (process) {
            const activities = process.activities
            if (activities) {
              const obj = activities.find(e => e.type === 'TASK' && e.activityId === workflowTxns[0].activityId)
              // console.log('Found Activity', obj)
              if (obj && obj.tasks) {
                const manualTask = obj.tasks.find(e => (e.type === 'MANUAL' && (e.taskId + '') === workflowTxns[0].taskId))
                // console.log('Found Task', manualTask)
                if (manualTask && manualTask.assignments) {
                  // let whereClause
                  // if (interactionData.currStatus === 'NEW' || interactionData.currStatus === 'ASSIGNED' || interactionData.currStatus === 'PEND-CLOSE') {
                  const whereClause = {
                    unitId: { [Op.in]: [interactionData.currEntity, interactionData.createdEntity, 'DPT0000642.OPU0000006.ORG0000001'] },
                    status: 'AC'
                  }
                  // }
                  // else {
                  //   whereClause = {
                  //     status: 'AC'
                  //   }
                  // }
                  const rolesOutput = await Role.findAll({
                    attributes: ['roleId', 'roleName', 'roleDesc'],
                    where: {
                      // isAdmin: 'false',
                      status: 'AC'
                    },
                    order: [
                      ['roleId', 'ASC']
                    ]
                  })
                  // console.log(rolesOutput)
                  const buOutput = await BusinessUnit.findAll({
                    attributes: ['unitId', 'unitName', 'unitDesc'],
                    where: {
                      // isAdmin: 'false',
                      // status: 'AC'
                      ...whereClause

                    },
                    order: [
                      ['unitId', 'ASC']
                    ]
                  })

                  const beOutput = await BusinessEntity.findAll({
                    attributes: ['code', 'description'],
                    where: {
                      status: 'AC',
                      codeType: 'INTERACTION_STATUS'
                    },
                    order: [
                      ['code', 'ASC']
                    ]
                  })

                  for (const asmt of manualTask.assignments) {
                    if (asmt.targetDeptRoles && asmt.targetDeptRoles.length > 0) {
                      for (const t of asmt.targetDeptRoles) {
                        const entry = {
                          roles: [],
                          entity: [],
                          status: []
                        }
                        // console.log(t)
                        if (t.roleId) {
                          for (const r of rolesOutput) {
                            if (t.roleId === r.roleId) {
                              entry.roles.push({
                                roleId: r.roleId,
                                roleName: r.roleName,
                                roleDesc: r.roleDesc
                              })
                              break
                            }
                          }
                        }
                        if (t.unitId) {
                          for (const u of buOutput) {
                            if (t.unitId === u.unitId) {
                              entry.entity.push({
                                unitId: u.unitId,
                                unitName: u.unitName,
                                unitDesc: u.unitDesc
                              })
                              break
                            }
                          }
                        }
                        if (t.status && t.status.length > 0) {
                          for (const s1 of t.status) {
                            for (const s2 of beOutput) {
                              if (s1 === s2.code) {
                                entry.status.push({
                                  code: s2.code,
                                  description: s2.description
                                })
                                break
                              }
                            }
                          }
                        }
                        // console.log('entry===========>', entry)
                        if (entry.status.length > 0 && entry.entity.length > 0 && entry.roles.length > 0) {
                          response.entities.push(entry)
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    response.flwId = workflowHdr?.wfHdrId
    response.flow = workflowHdr?.wfStatus
  }
  return response
}
export const getWFStateforStatus = async (entityId, entity) => {
  const response = {
    entities: []
  }
  logger.debug('Fetching workflow target Deparments and Roles ')
  const workflowHdr = await WorkflowHdr.findOne({ where: { entityId, entity, wfStatus: 'CREATED' } })
  if (workflowHdr) {
    const workflowTxns = await WorkflowTxn.findAll({
      where: {
        wfHdrId: workflowHdr.wfHdrId,
        wfTxnStatus: 'USER_WAIT'
      },
      order: [['wfTxnId', 'DESC']]
    })
    logger.debug('Finding target dept roles for', workflowTxns[0].activityId, workflowTxns[0].taskId, ' and in status ', workflowTxns[0].wfTxnStatus)
    if (workflowTxns.length > 0) {
      if (workflowTxns[0].wfTxnStatus === 'USER_WAIT') {
        // find the json from the workflow defination table for the given wfDefnId
        const workflowDfn = await WorkflowNew.findOne({ where: { workflowId: workflowHdr.wfDefnId } })
        if (workflowDfn && workflowDfn.wfDefinition && workflowDfn.wfDefinition.definitions && workflowDfn.wfDefinition.definitions.process) {
          const process = workflowDfn.wfDefinition.definitions.process
          // Finding the targetDeptRoles from the json object
          if (process) {
            const activities = process.activities
            if (activities) {
              const obj = activities.find(e => e.type === 'TASK' && e.activityId === workflowTxns[0].activityId)
              // console.log('Found Activity', obj)
              if (obj && obj.tasks) {
                const manualTask = obj.tasks.find(e => (e.type === 'MANUAL' && (e.taskId + '') === workflowTxns[0].taskId))
                // console.log('Found Task', manualTask)
                if (manualTask && manualTask.assignments) {
                  const rolesOutput = await Role.findAll({
                    attributes: ['roleId', 'roleName', 'roleDesc'],
                    where: {
                      // isAdmin: 'false',
                      status: 'AC'
                    },
                    order: [
                      ['roleId', 'ASC']
                    ]
                  })
                  // console.log(rolesOutput)
                  const buOutput = await BusinessUnit.findAll({
                    attributes: ['unitId', 'unitName', 'unitDesc'],
                    where: {
                      // isAdmin: 'false',
                      status: 'AC'
                    },
                    order: [
                      ['unitId', 'ASC']
                    ]
                  })

                  const beOutput = await BusinessEntity.findAll({
                    attributes: ['code', 'description'],
                    where: {
                      status: 'AC',
                      codeType: 'INTERACTION_STATUS'
                    },
                    order: [
                      ['code', 'ASC']
                    ]
                  })

                  for (const asmt of manualTask.assignments) {
                    if (asmt.targetDeptRoles && asmt.targetDeptRoles.length > 0) {
                      for (const t of asmt.targetDeptRoles) {
                        const entry = {
                          roles: [],
                          entity: [],
                          status: []
                        }
                        // console.log(t)
                        if (t.roleId) {
                          for (const r of rolesOutput) {
                            if (t.roleId === r.roleId) {
                              entry.roles.push({
                                roleId: r.roleId,
                                roleName: r.roleName,
                                roleDesc: r.roleDesc
                              })
                              break
                            }
                          }
                        }
                        if (t.unitId) {
                          for (const u of buOutput) {
                            if (t.unitId === u.unitId) {
                              entry.entity.push({
                                unitId: u.unitId,
                                unitName: u.unitName,
                                unitDesc: u.unitDesc
                              })
                              break
                            }
                          }
                        }
                        if (t.status && t.status.length > 0) {
                          for (const s1 of t.status) {
                            for (const s2 of beOutput) {
                              if (s1 === s2.code) {
                                entry.status.push({
                                  code: s2.code,
                                  description: s2.description
                                })
                                break
                              }
                            }
                          }
                        }
                        // console.log('entry===========>', entry)
                        response.entities.push(entry)
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      response.flwId = workflowHdr.wfHdrId
      response.flow = workflowHdr.wfStatus
    }
  }
  return response
}
export const updateWFState = async (entityId, entity, data, t) => {
  logger.debug('Updating workflow state')
  const workflowTxn = await findRecentUserWaitRecord(entityId, entity, data.flwId)
  if (!isEmpty(workflowTxn)) {
    let txnData
    if (data.status && !data.dept && !data.userId && !data.role) {
      txnData = {
        userStatus: data.status || null,
        updatedBy: systemUserId
      }
    } else {
      txnData = {
        currEntity: data.dept || null,
        currRole: data.role || null,
        currUser: data.userId || null,
        userStatus: data.status || null,
        fromEntity: workflowTxn.currEntity || null,
        fromRole: workflowTxn.currRole || null,
        fromUser: workflowTxn.currUser || null,
        fromUserStatus: workflowTxn.userStatus || null,
        updatedBy: systemUserId,
        wfTxnStatus: 'DONE',
        payload: { skip: true }
      }
    }
    await WorkflowTxn.update(txnData, { where: { wfTxnId: workflowTxn.wfTxnId }, transaction: t })
  }
  logger.debug('Successfully updated workflow state')
}

export const assignToSelf = async (data, t) => {
  logger.debug('Assigning to self')
  const workflowTxn = await findRecentUserWaitRecord(data.entityId, data.entity)
  if (!isEmpty(workflowTxn)) {
    const txnData = {
      currUser: data.userId,
      userStatus: data.status || 'ASSIGNED',
      updatedBy: systemUserId
    }
    await WorkflowTxn.update(txnData, { where: { wfTxnId: workflowTxn.wfTxnId }, transaction: t })
  }
  logger.debug('Successfully updated workflow state')
}

const findRecentUserWaitRecord = async (entityId, entity, wfHdrId) => {
  let wfTxn = {}
  let workflowHdr
  if (wfHdrId) {
    workflowHdr = await WorkflowHdr.findOne({ where: { wfHdrId } })
  } else {
    workflowHdr = await WorkflowHdr.findOne({ where: { entityId, entity } })
  }
  if (workflowHdr) {
    // Fetching WorkflowTxn records to find the user wait record
    const workflowTxns = await WorkflowTxn.findAll({
      where: { wfHdrId: workflowHdr.wfHdrId },
      order: [['wfTxnId', 'DESC']]
    })
    if (workflowTxns.length > 0) {
      if (workflowTxns[0].wfTxnStatus === 'USER_WAIT') {
        wfTxn = workflowTxns[0]
      }
    }
  }
  return wfTxn
}

const findUserWaitRecordById = async (activityId, wfHdrId) => {
  const hasWaitRecord = await WorkflowTxn.findOne({
    where: {
      wfHdrId,
      activityId,
      [Op.or]: [{ wfTxnStatus: 'USER_WAIT' }, { wfTxnStatus: 'SYS_WAIT' }]
    }
  })
  return hasWaitRecord
}

const findMapping = (schema, key, depth) => {
  let output = {}
  for (const p in schema.properties) {
    if (p === key) {
      output = {
        mapping: schema.properties[p].mapping,
        breakLoop: true
      }
      break
    } else {
      if (schema.properties[p].type === 'object') {
        output = findMapping(schema.properties[p], key, depth + 1)
        // console.log('output..........', output)
        if (output.breakLoop) {
          break
        }
      }
    }
  }
  if (depth === 0) {
    return output.mapping
  } else {
    return output
  }
}

const findRequestBodyObj = (requestSchema, context) => {
  const srcStack = []
  srcStack.push(requestSchema.properties)
  // console.log('srcStack.....01', srcStack)
  let response = {}
  while (srcStack.length) {
    for (const p in srcStack[0]) {
      if (srcStack[0][p].type === 'object') {
        srcStack.push(srcStack[0][p].properties)
        // console.log('srcStack.......02', srcStack)
      } else {
        const mapping = findMapping(requestSchema, p, 0)
        // console.log('mapping........', mapping)
        if (mapping) {
          // here start code by dipak to get value from context
          if (mapping.valueType === 'EXPR') {
            // console.log('mapping.value.....00', mapping.value)

            const expression = jsonata(mapping.value)
            mapping.value = expression.evaluate(context)

            // console.log('expression.....', expression.evaluate)
            // console.log('mapping.value.....', mapping.value);
            response = {
              ...response,
              [p]: mapping.value
            }
          } else {
            response = {
              ...response,
              [p]: mapping.value
            }
          }
          // here ended code by dipak to get value from context
        }
      }
    }
    srcStack.shift()
  }
  return response
}

const findUrlParamsAndBody = (task, context) => {
  const response = {}
  let params
  let url = task.api.protocol + '://' + task.api.endpoint + task.api.path
  // console.log('url....', url)
  // Finding query params
  if (task.api.queryParams && Array.isArray(task.api.queryParams) && !isEmpty(task.api.queryParams)) {
    for (const param of task.api.queryParams) {
      params = param.parameterName + '=' + param.value + '&'
    }
    params = params.substring(0, params.lastIndexOf('&'))
  }
  if (params) {
    url = url + '?' + params
  }
  response.url = url
  if (task.api.requestSchema) {
    // console.log('task.api.requestSchema....', task.api.requestSchema)
    // console.log('task.api.requestSchema....context', context)
    const reqBody = findRequestBodyObj(task.api.requestSchema, context)
    // console.log('reqBody.....here in task.api.requestSchema', reqBody)
    if (reqBody) {
      response.reqBody = reqBody
    }
  }
  // console.log('response..........', response)
  return response
}

const updateContext = async (data, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask, tables) => {
  if (hasMoreTask) {
    inputContext.context[activityPrefix] = {
      ...inputContext.context[activityPrefix],
      [taskActivityPrefix]: taskActivityPrefix
    }
  } else {
    inputContext.context[activityPrefix] = activityPrefix
    inputContext = JSON.parse(JSON.stringify(inputContext))
    inputContext.context[activityPrefix] = {
      [taskActivityPrefix]: taskActivityPrefix
    }
  }
  inputContext.context[activityPrefix][taskActivityPrefix] = data
  const wfData = {
    updatedBy: systemUserId,
    wfContext: inputContext
  }
  await WorkflowHdr.update(wfData, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
  await t.commit()
}

const updateContextDB = async (data, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask, task) => {
  // console.log('taskActivityPrefix..>>>>>>>>>>>', taskActivityPrefix)
  // console.log('activityPrefix..>>>>>>>>>>>', activityPrefix)
  // console.log('inputContext..>>>>>>>>>>>', inputContext)
  // console.log('hasMoreTask..>>>>>>>>>>>', hasMoreTask)
  // console.log('data..>>>>>>>>>>>', data);
  let table = ''
  if (task.tables.length === 1) {
    // console.log('task.tables[0]...', task.tables[0])
    table = task.tables[0]
  }
  // console.log('data table.......',table)
  if (hasMoreTask) {
    // const currentContext = inputContext.context[activityPrefix]
    // inputContext.context = {
    //   [activityPrefix]: {
    //     ...inputContext.context[activityPrefix]
    //   }
    // }
    inputContext.context = {
      entity: inputContext.context.entity,
      [activityPrefix]: {
        ...inputContext.context[activityPrefix],
        [taskActivityPrefix]: taskActivityPrefix
      }
    }
  } else {
    inputContext.context[activityPrefix] = activityPrefix
    inputContext = JSON.parse(JSON.stringify(inputContext))
    inputContext.context[activityPrefix] = {
      [taskActivityPrefix]: taskActivityPrefix
    }
  }
  // inputContext.context[activityPrefix][taskActivityPrefix] = data;
  inputContext.context[activityPrefix][taskActivityPrefix] = {
    [table]: data
  }
  // console.log('inputContext.........>>>>>>>>>>>>>>>>>>>>>>>>', inputContext)
  const wfData = {
    nextActivityId: activityPrefix,
    updatedBy: systemUserId,
    wfContext: inputContext
  }
  // console.log('wfData', wfData)
  // console.log('inputContext.wfHdrId==>', inputContext.wfHdrId)
  await WorkflowHdr.update(wfData, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
  await t.commit()
}

const updateContextWhatsApp = async (data, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask) => {
  if (hasMoreTask) {
    inputContext.context[activityPrefix] = {
      ...inputContext.context[activityPrefix],
      [taskActivityPrefix]: taskActivityPrefix
    }
  } else {
    inputContext.context[activityPrefix] = activityPrefix
    inputContext = JSON.parse(JSON.stringify(inputContext))
    inputContext.context[activityPrefix] = {
      [taskActivityPrefix]: taskActivityPrefix
    }
  }
  inputContext.context[activityPrefix][taskActivityPrefix] = {
    response: {
      value: data
    }
  }
  // inputContext.context[activityPrefix][taskActivityPrefix] = data
  const wfData = {
    updatedBy: systemUserId,
    wfContext: inputContext
  }
  await WorkflowHdr.update(wfData, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
  await t.commit()
}

// whats app apis

export const processWhatsAppStartStep = async (wfHdr, wfJson) => {
  logger.debug('Performing start step for new record')
  try {
    const process = wfJson.definitions.process
    if (process) {
      const activities = process.activities
      const transitions = process.transitions
      // Finding START activitie and  current Activiti Id from the activities array
      const startActivity = activities.find(e => e.type === 'START')
      if (startActivity) {
        const startActivityId = startActivity.activityId
        const startActivityPrefix = startActivity.activityContextPrefix
        // Finding transition and next activiti id based on start Activiti Id in the transitions array
        const transition = transitions.find(e => e.from === startActivityId)
        if (transition) {
          const nextActivityId = transition.to
          // console.log('nextActivityId in start process...', nextActivityId)
          let inputContext
          // Storing the activitie id's in context
          const context = {
            [startActivityPrefix]: startActivityPrefix
          }
          const hasStartRec = await WorkflowTxn.findOne({ where: { wfHdrId: wfHdr.wfHdrId, activityId: startActivityId, wfTxnStatus: { [Op.ne]: 'DONE' } } })
          if (!hasStartRec) {
            inputContext = {
              context
            }
            // Inserting data into WorkflowTxn table
            const wfTxnData = {
              wfHdrId: wfHdr.wfHdrId,
              activityId: startActivityId,
              taskId: null, // No task id for the start step
              wfTxnStatus: 'DONE',
              txnContext: inputContext,
              createdBy: systemUserId,
              updatedBy: systemUserId
            }
            const t = await sequelize.transaction()
            try {
              const wfTxn = await WorkflowTxn.create(wfTxnData, { transaction: t })
              if (wfTxn) {
                // updating the wfHdr table
                inputContext.wfHdrId = wfHdr.wfHdrId
                inputContext.context.entity = wfHdr.entityId
                inputContext.context.entityType = wfHdr.entityType
                const data = {
                  nextActivityId,
                  entity: wfHdr.entity,
                  wfContext: inputContext
                }
                await WorkflowHdr.update(data, { where: { wfHdrId: wfHdr.wfHdrId }, transaction: t })
              }
              await t.commit()
            } catch (error) {
              logger.error(error, 'Error while processing start step')
            } finally {
              if (t && !t.finished) {
                await t.rollback()
              }
            }
          }
          logger.debug('Successfully processed start step')
        } else {
          logger.debug('No transitions found for start activitie')
          return 'No transitions found for start activitie'
        }
      } else {
        logger.debug('No start activitie found')
        return 'No start activitie found'
      }
    } else {
      logger.debug('No process found in the wfDefinition ')
      return 'No process found in the wfDefinition'
    }
  } catch (error) {
    logger.error(error, 'Error while processing start step')
  }
}

export const continueChatWFExecution = async (wfJson, currentActivityId, inputContext, mobileNumber, msg) => {
  logger.debug('Continue chat workflow Execution')
  const t = await sequelize.transaction();
  try {
    const process = wfJson?.definitions?.process
    const activities = process?.activities
    const transitions = process?.transitions
    const transition = transitions.find(e => e.from === currentActivityId)
    const nextActivityId = transition?.to
    const currentActivity = activities.find(e => e.activityId === currentActivityId)
    const hasWaitRecord = await findUserWaitRecordById(currentActivityId, inputContext.wfHdrId)
    if (hasWaitRecord) {
      logger.debug('A - Some task are in wait state or not yet done, So can`t prcess End step now')
      return currentActivity.tasks[0].taskContextPrefix
    } else {
      // Finding tasks based on nextActivityId in the activities array
      const activityPrefix = currentActivity.activityContextPrefix
      if (currentActivity.type === 'END') {
        await WorkflowTxn.destroy({
          where: {
            wfHdrId: inputContext.wfHdrId
          },
          transaction: t
        })
        const data = {
          nextActivityId: '',
          wfContext: {},
          wfStatus: 'CREATED'
        }
        await WorkflowHdr.update(data, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
        await t.commit()
        await processEndStep(currentActivity.activityId, inputContext) // update the status as closed
        return 'WORKFLOWEND'
      } else if (currentActivity.type === 'DECISION') {
        let decision = false
        let transitionId
        for (const rule01 of currentActivity.condition) {
          if (rule01.ruleType == 'DEFAULT') {
            decision = true
            transitionId = rule01.transitionId
          }
          for (const rule02 of rule01.rules) {
            for (const rule03 of rule02.rules) {
              if (rule03.valueType == 'TEXT') {
                rule03.value = rule03.value
              }
              if (rule03.fieldType == 'TEXT') {
                rule03.field = rule03.field
              }

              if (rule03.valueType === 'EXPR') {
                const expression = jsonata(rule03.value)
                rule03.value = expression.evaluate(inputContext)
              }
              if (rule03.fieldType === 'EXPR') {
                const expression = jsonata(rule03.field)
                rule03.field = expression.evaluate(inputContext)
                if (rule03.field) {
                  if (rule03.field.toString().toUpperCase() === 'HELP') {
                    await WorkflowTxn.destroy({
                      where: {
                        wfHdrId: inputContext.wfHdrId
                      },
                      transaction: t
                    })
                  }
                }
              }
              if ((rule03.operator == '-' || rule03.operator == '=') && !decision) {
                if (typeof (rule03.field) === 'object') {
                  if (rule03.field == rule03.value && (rule03.field != undefined || rule03.value != undefined)) {
                    transitionId = rule01.transitionId
                    decision = true
                    break
                  }
                } else {
                  if (rule03.field == rule03.value && (rule03.field != undefined || rule03.value != undefined)) {
                    transitionId = rule01.transitionId
                    decision = true
                    break
                  }
                }
              }

              if (rule03.operator == '!=' && !decision) {
                if (rule03.field != rule03.value && (rule03.field != undefined || rule03.value != undefined)) {
                  transitionId = rule01.transitionId
                  decision = true
                  break
                }
              }
              if (rule03.operator == '>' && !decision) {
                if (rule03.field > rule03.value && (rule03.field != undefined || rule03.value != undefined)) {
                  transitionId = rule01.transitionId
                  decision = true
                  break
                }
              }
              if (decision) {
                break
              }
            }
            if (decision) {
              break
            }
          }
          if (decision) {
            break
          }
        }
        if (decision) {
          const transition = transitions.find(e => e.transitionId === transitionId)
          const nextActivityId = transition.to
          const txnData = {
            wfHdrId: inputContext.wfHdrId,
            activityId: currentActivity.activityId,
            txnContext: inputContext,
            wfTxnStatus: 'DONE',
            createdBy: systemUserId,
            updatedBy: systemUserId
          }
          const wfTxn = await WorkflowTxn.create(txnData, { transaction: t }, { logging: true })
          if (wfTxn) {
            // updating the wfHdr table
            inputContext.wfHdrId = inputContext.wfHdrId
            const data = {
              nextActivityId,
              wfContext: inputContext
            }
            await WorkflowHdr.update(data, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
          }
          await t.commit()
          return await continueChatWFExecution(wfJson, nextActivityId, inputContext, mobileNumber, msg)
        } else {
          await t.commit()
          return 'Please enter help to go main menu'
        }
      } else {
        let noTaskFound = false
        if (currentActivity?.tasks?.length > 0) {
          for (const task of currentActivity?.tasks) {
            // Finding any wait record in txn table and continueExecution
            const hasWaitRecord = await findUserWaitRecordById(currentActivityId, inputContext.wfHdrId)
            if (hasWaitRecord) {
              logger.debug('B - Some task are in wait state or not yet done, So can`t prcess End step now')
              return currentActivity.tasks[0].taskContextPrefix
            } else {
              const hasTask = await WorkflowTxn.findOne({
                where: { wfHdrId: inputContext.wfHdrId, activityId: currentActivityId, taskId: task.taskId.toString() }
              })
              if (!hasTask) {
                const txnData = {
                  wfHdrId: inputContext.wfHdrId,
                  activityId: currentActivity.activityId,
                  taskId: task.taskId,
                  txnContext: inputContext,
                  wfTxnStatus: 'DONE',
                  createdBy: systemUserId,
                  updatedBy: systemUserId
                }
                const wfTxn = await WorkflowTxn.create(txnData, { transaction: t }, { logging: true })
                // Finding taskContextPrefix and storing under current activity
                const taskActivityPrefix = task.taskContextPrefix
                if (task.type === 'SENDMESSAGE') {
                  const txnData = {
                    wfHdrId: inputContext.wfHdrId,
                    activityId: currentActivity.activityId,
                    taskId: task.taskId,
                    txnContext: inputContext,
                    wfTxnStatus: 'DONE',
                    createdBy: systemUserId,
                    updatedBy: systemUserId
                  }
                  const wfTxn = await WorkflowTxn.create(txnData, { transaction: t }, { logging: true })
                  if (wfTxn) {
                    // updating the wfHdr table
                    inputContext.wfHdrId = inputContext.wfHdrId
                    const data = {
                      nextActivityId,
                      wfContext: inputContext
                    }
                    await WorkflowHdr.update(data, { where: { wfHdrId: inputContext.wfHdrId }, transaction: t })
                  }
                  const executeSendMessageTaskResult = await executeSendMessageTask(task, inputContext, t, activityPrefix, taskActivityPrefix)
                  await WorkflowTxn.destroy({
                    where: {
                      wfHdrId: inputContext.wfHdrId
                    },
                    transaction: t
                  })
                  await t.commit()
                  return { executeSendMessageTaskResult, inputContext }
                } else if (task.type === 'COLLECTINPUT') {
                  const txnData = {
                    wfHdrId: inputContext.wfHdrId,
                    activityId: currentActivity.activityId,
                    taskId: task.taskId,
                    txnContext: inputContext,
                    wfTxnStatus: 'USER_WAIT',
                    createdBy: systemUserId,
                    updatedBy: systemUserId
                  }

                  const executeCollectInputTaskResult = await executeCollectInputTask(task, inputContext, t, activityPrefix, taskActivityPrefix, mobileNumber, msg, txnData, nextActivityId)
                  await WorkflowTxn.destroy({
                    where: {
                      wfHdrId: inputContext.wfHdrId
                    },
                    transaction: t
                  })
                  await t.commit()
                  return executeCollectInputTaskResult
                } else if (task.type === 'API') {
                  const txnData = {
                    wfHdrId: inputContext.wfHdrId,
                    activityId: currentActivity.activityId,
                    taskId: task.taskId,
                    txnContext: inputContext,
                    wfTxnStatus: 'SYS_WAIT',
                    createdBy: systemUserId,
                    updatedBy: systemUserId
                  }
                  return await executeAPITaskForWhatsApp(task, inputContext, t, activityPrefix, taskActivityPrefix, mobileNumber, msg, txnData, nextActivityId)
                } else if (task.type === 'DB') {
                  const hasMoreTask = false
                  await executeDatabaseTask(task, inputContext, t, activityPrefix, taskActivityPrefix, hasMoreTask)
                }
              } else {
                logger.debug('No tasks found')
                noTaskFound = true
              }
            }
          }
        }
        if (noTaskFound) {
          // continueExecution for next activities and transitions
          const transition = transitions.find(e => e.from === currentActivityId)
          if (transition) {
            const nextActivityId = transition.to
            // Here nextActivityId become current activityid
            return await continueChatWFExecution(wfJson, nextActivityId, inputContext, mobileNumber, msg)
          } else {
            logger.debug('No transition found')
          }
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error while continue workflow execution step')
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

export const executeAPITaskForWhatsApp = async (APITask, context, t, activityPrefix, taskActivityPrefix, mobileNumber, msg, txnData, nextActivityId) => {
  logger.debug('Executing API Task')
  if (APITask.api.method === 'POST') {
    await executePost(APITask, context, t, activityPrefix, taskActivityPrefix, nextActivityId, txnData)
  } else if (APITask.api.method === 'PUT') {
    await executePut(APITask, context, t, activityPrefix, taskActivityPrefix, nextActivityId, txnData)
  } else if (APITask.api.method === 'GET') {
    // console.log('GET API')
    return await executeGet(APITask, context, t, activityPrefix, taskActivityPrefix, nextActivityId, txnData)
  } else if (APITask.api.method === 'DELETE') {
    await executeDelete(APITask, context, t, activityPrefix, taskActivityPrefix, nextActivityId, txnData)
  } else {
    logger.debug('No API Task found')
  }
  logger.debug('Successfully Executed API Task')
}
