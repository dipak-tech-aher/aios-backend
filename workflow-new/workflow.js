import { logger } from '../config/logger'
import { Workflow, sequelize, InteractionTxn } from '../model'
import { QueryTypes } from 'sequelize'
import { ResponseHelper } from '../utils'
import { camelCaseConversion } from '../utils/string'

export const getWorkflowDefinition = async (code, interactionType) => {
  try {
    logger.debug('getWorkflowDefinition :- Finding work flow')

    const getWorkflow = await Workflow.findAll({
      where: {
        interactionType,
        status: 'AC'
      }
    })

    if (!getWorkflow) {
      logger.debug('getWorkflowDefinition :- No workflow found')
      return false
    }

    const workFlow = []
    getWorkflow.forEach(e => {
      e.wfDefinition.activities.forEach(f => {
        if (f.type === 'START') {
          f.filter.forEach(g => {
            g.value.forEach(h => {
              if (h === code) {
                workFlow.push(e)
              }
            })
          })
        }
      })
    })

    if (!workFlow || workFlow.length === 0) {
      return false
    } else {
      return {
        flwId: workFlow[0].workflowId
      }
    }
  } catch (error) {
    logger.error(error, 'Error occured while searching for matching workflow')
    return false
  }
}

export const setWorkflow = async (code, interactionType, intxnId) => {
  try {
    logger.debug('setWorkflow :- Finding work flow')

    const intxnHist = await InteractionTxn.findOne({
      where: {
        intxnId: intxnId,
        flwAction: 'START'
      }
    })

    const assignedWorkflow = await Workflow.findOne({
      where: {
        workflowId: intxnHist.flwId
      }
    })

    if (!assignedWorkflow) {
      logger.debug('setWorkflow :- No workflow found')
      return false
    }

    logger.debug('setWorkflow :- find work flow by problem code')

    const workFlow = []

    workFlow.push(assignedWorkflow)

    if (!workFlow) {
      return false
    }

    let activities // Activity objecct of work flow
    let transitions // Transaction object of work flow

    const currentTranscation = [] // Current Transcation

    logger.debug('setWorkflow :- Distincting ACTIVITY AND TRASACTION from workflow')

    workFlow.forEach(e => {
      activities = e.wfDefinition.activities
      transitions = e.wfDefinition.transitions
      activities.forEach(f => {
        if (f.type === 'START') {
          transitions.forEach(g => {
            if (g.name === f.transition) {
              currentTranscation.push(g)
            }
          })
        }
      })
    })

    logger.debug('setWorkflow :- Calling find flow function', currentTranscation)
    // console.log('contiuneFlow1')
    const responseData = await contiuneFlow(currentTranscation, activities, transitions, code, null, intxnId)

    // console.log('responseData2', responseData)
    let data
    if (responseData) {
      // if (responseData.flow === undefined || (responseData.flow && responseData.flow !== 'WAIT')) {
      if (!responseData.flow || responseData.flow !== 'WAIT') {
        const response = await findEntites(responseData.entity)
        data = {
          flow: 'CONTINUE',
          currTransaction: currentTranscation[0].transitionId,
          enities: response,
          flwId: workFlow[0].workflowId,
          transactionName: responseData.transactionName
        }
      } else {
        data = {
          flow: 'WAIT'
        }
      }
    } else {
      data = {}
    }

    logger.debug('setWorkflow :- Sucessfully set workflow')

    return data
  } catch (error) {
    logger.error(error, 'Error occured')
    return false
  }
}

export const executeWorkFlow = async (req, res) => {
  const responseHelper = new ResponseHelper()
  try {
    const { id } = req.params

    if (!id) {
      return responseHelper.validationError(res, new Error('Invalid interaction ID'))
    }

    logger.debug('Finding workflow id and action from Interaction_txn')
    const bySourceQuery = `select it.flw_id , it.flw_action, i.intxn_type, i.problem_code, i.cause_code,
    it.intxn_status, it.flw_created_at from interaction_txn it 
    join interaction i on it.intxn_id = i.intxn_id 
    where i.intxn_id = $id and (it.flw_action NOT IN ('Assign to self', 'Manual', 'Re-assign to user'))
    order by it.flw_created_at desc 
    limit 1`
    let currWorkflow = await sequelize.query(bySourceQuery, {
      bind: {
        id
      },
      type: QueryTypes.SELECT
    })

    logger.debug('Getting workflow from workflow_defination by flow id')

    currWorkflow = currWorkflow.find(e => e)

    console.log('currWorkflow', currWorkflow)

    if (!currWorkflow) {
      return responseHelper.validationError(res, new Error('No resource found'))
    } else if (!Number(currWorkflow.flw_id)) {
      return responseHelper.validationError(res, new Error('Invalid flow id'))
    }

    if (currWorkflow.flw_action === 'START') {
      logger.debug('Intializing work flow')
      const interactionCode = currWorkflow.problem_code

      const startWorkflow = await setWorkflow(interactionCode, currWorkflow.intxn_type, id)
      console.log('startWorkflow', startWorkflow)
      if (!startWorkflow) {
        return responseHelper.validationError(res, new Error('No workflow found'))
      }
      logger.debug('setWorkflow :- Sucessfully found next flow')
      return responseHelper.onSuccess(res, 'Sucessfully found next flow', startWorkflow)
    } else {
      logger.debug('Executing work flow')
      const workFlow = await Workflow.findAll({ where: { workflowId: currWorkflow.flw_id } })
      if (!workFlow) {
        return responseHelper.validationError(res, new Error('No workflow found'))
      }

      logger.debug('Geeting Activites and Transaction')
      let activities
      let transitions
      workFlow.forEach(e => {
        activities = e.wfDefinition.activities
        transitions = e.wfDefinition.transitions
      })

      logger.debug('looking for current transaction')
      let flow = 'END'
      const previousTranscation = transitions.find(e => e.name === currWorkflow.flw_action)
      const currentTranscation = transitions.filter(e => e.from === previousTranscation.to)
      const currentActivity = activities.filter(e => e.name === currentTranscation[0].to)
      if (currentActivity[0].type === 'END') {
        return responseHelper.onSuccess(res, 'Workflow at end', { flow })
      } else {
        flow = 'CONTINUE'
      }
      logger.debug('Finding entites')
      // console.log('contiuneFlow2')
      const responseData = await contiuneFlow(currentTranscation, activities, transitions, null, currWorkflow.intxn_status, id)
      let data
      if (responseData) {
        const response = await findEntites(responseData.entity)
        data = {
          flow: 'CONTINUE',
          currTransaction: currentTranscation[0].transitionId,
          enities: response,
          flwId: workFlow[0].workflowId,
          transactionName: responseData.transactionName
        }
      } else {
        data = {}
      }
      logger.debug('setWorkflow :- Sucessfully found next flow', data)
      return responseHelper.onSuccess(res, 'Sucessfully found next flow', data)
    }
  } catch (error) {
    logger.error(error, 'Error while fetching workflow data')
    return responseHelper.onError(res, error)
  }
}

// FIND FLOW AND CONTINUE TRANSACTION
async function contiuneFlow (currentTranscation, activities, transitions, code, currStatus, intxnId) {
  let responseData

  logger.debug('contiuneFlow :- Finding current activivty')
  // console.log('contiuneFlow - A')
  let currentActivity
  for (const i of activities) {
    if (i.name === currentTranscation[0].to) {
      currentActivity = i
      break
    }
  }
  console.log('currentActivity', currentActivity)

  logger.debug('contiuneFlow :- Finding flow')
  if (currentActivity.type === 'DECISION') {
    // console.log('contiuneFlow - B')
    const condition = currentActivity.condition
    for (const c of condition) {
      let breakCondnLoop = false

      if (c.attribute !== 'status') {
        const sql = 'SELECT ' + c.attribute + ' as code' +
          ' FROM ' + c.table +
          ' WHERE intxn_id = $intxnId'

        const SqlBindParams = {
          intxnId: intxnId
        }

        const sqlResp = await sequelize.query(sql, {
          bind: SqlBindParams,
          type: QueryTypes.SELECT
          // logging: console.log

        })
        if (!sqlResp) {
          return false
        }
        const intxnCode = sqlResp[0].code
        const value = c.value
        for (const v of value) {
          if (v === intxnCode) {
            logger.debug('Match found')
            currentTranscation = transitions.filter(e => e.name === c.transition)
            responseData = await contiuneFlow(currentTranscation, activities, transitions, code, null, intxnId)
            breakCondnLoop = true
            logger.debug('Checking with ' + c.attribute)
            break
          }
        }
      } else if (c.attribute === 'status') {
        if (c.value === currStatus) {
          currentTranscation = transitions.filter(e => e.name === c.transition)
          // console.log('contiuneFlow4')
          responseData = await contiuneFlow(currentTranscation, activities, transitions, null, currStatus, intxnId)
          breakCondnLoop = true
          logger.debug('Checking with status', responseData)
        }
      }
      if (breakCondnLoop) {
        console.log('Breaking condition loop')
        break
      }
    }
    // console.log('return responsedata', responseData)
    return responseData
  } else if (currentActivity.type === 'ASSIGN') {
    responseData = {
      entity: currentActivity.entity,
      // status: currentActivity.status,
      transactionName: currentTranscation[0].name
    }
    return responseData
  } else if (currentActivity.type === 'WAIT') {
    // console.log('contiuneFlow - D')

    const whenCondition = currentActivity.whenCondition[0]

    // console.log('whenCondition', whenCondition)

    const whenConditionSQL = 'SELECT ' + whenCondition.attribute +
      ' FROM ' + whenCondition.table +
      ' WHERE intxn_id = $intxnId'

    const whenConditionBindParams = {
      intxnId: intxnId
    }

    let whenConditionParamIdx = 1
    let whenConditionWhereClause = ' AND 1 = 1'
    if (whenCondition.where) {
      for (const w of whenCondition.where) {
        whenConditionWhereClause += ' AND ' + w.attribute + ' ' + w.operator + ' ' + '$p' + whenConditionParamIdx
        whenConditionBindParams['p' + whenConditionParamIdx] = w.value
        whenConditionParamIdx++
      }
    }

    // console.log('whenSqlText', whenConditionSQL + whenConditionWhereClause)
    // console.log('bindParams', whenConditionBindParams)

    const whenResp = await sequelize.query(whenConditionSQL + whenConditionWhereClause, {
      bind: whenConditionBindParams
    })

    // console.log('whenResp', whenResp)
    // console.log('whenRespVal', whenResp[0][0].wo_type)

    if (whenResp[0][0].wo_type === 'FAULT') {
      const untilCondition = currentActivity.untilCondition[0]

      const untilConditionSQL = 'SELECT ' + untilCondition.attribute +
        ' FROM ' + untilCondition.table +
        ' WHERE intxn_id = $intxnId'

      const untilConditionBindParams = {
        intxnId: intxnId
      }

      let untilConditionParamIdx = 1
      let untilConditionWhere = ' AND 1 = 1'
      for (const w of untilCondition.where) {
        untilConditionWhere += ' AND ' + w.attribute + ' ' + w.operator + ' ' + '$p' + untilConditionParamIdx
        untilConditionBindParams['p' + untilConditionParamIdx] = w.value
        untilConditionParamIdx++
      }

      // console.log('sqlText', untilConditionSQL + untilConditionWhere)
      // console.log('bindParams', untilConditionBindParams)

      const untilResp = await sequelize.query(untilConditionSQL + untilConditionWhere, {
        bind: untilConditionBindParams
      })

      // console.log('untilRespJSON', JSON.stringify(untilResp, null, 2))
      // console.log('untilRespCount',  untilResp[1].rowCount)
      // console.log('untilRespStatus', untilResp[0][0].status)
      // console.log('contiuneFlow - D1')

      if (untilResp && untilResp[1] && untilResp[1].rowCount !== 0 && ['CLOSED', 'RESOLVED'].includes(untilResp[0][0].status)) {
        // console.log('contiuneFlow - D2')
        currentTranscation = transitions.filter(e => e.name === currentActivity.transition)
        // console.log('currentTranscation', currentTranscation)
        // console.log('contiuneFlow5')
        responseData = await contiuneFlow(currentTranscation, activities, transitions, code, currStatus, intxnId)
        // console.log('responseData1', responseData)
      } else {
        responseData = {
          flow: 'WAIT'
        }
      }
      return responseData
    } else {
      // console.log('contiuneFlow - D3')
      currentTranscation = transitions.filter(e => e.name === currentActivity.transition)
      // console.log('currentTranscation', currentTranscation)
      // console.log('contiuneFlow5')
      responseData = await contiuneFlow(currentTranscation, activities, transitions, code, currStatus, intxnId)
      // console.log('responseData3', responseData)
      return responseData
    }
  } else {
    // ('contiuneFlow - F')
    logger.debug('Invalid flow')
    return false
  }
}

// FIND ENTITIES
async function findEntites (data) {
  if (!data) {
    return 'No data found'
  }
  const response = []
  for (const d of data) {
    const unit = {
      roles: camelCaseConversion(await sequelize.query('select r.role_id, r.role_desc from roles r where r.role_id in (' + d.roleId.join(',') + ')', { type: QueryTypes.SELECT })),
      entity: camelCaseConversion(await sequelize.query(`select u.unit_id, u.unit_name, u.unit_desc from business_units u where u.unit_id = '${d.entityId}'`, { type: QueryTypes.SELECT })),
      status: camelCaseConversion(await sequelize.query("select s.code, s.description from business_entity s where s.code in ('" + d.status.join("','") + "')", { type: QueryTypes.SELECT }))
    }
    response.push(unit)
  }
  return response
}
