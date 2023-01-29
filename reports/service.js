import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { sequelize, BusinessEntity } from '../model'
import { transformOpenClosedSLADeptInteractionSearchResponse } from '../transforms/customer-servicce'
import { QueryTypes } from 'sequelize'
import { isEmpty } from 'lodash'
import { camelCaseConversion } from '../utils/string'
import { defaultMessage } from '../utils/constant'

export class ReportService {
  constructor() {
    this.responseHelper = new ResponseHelper()
  }

  async getOpenOrClosedInteractions(req, res) {
    logger.debug('Fetching open/close interactions')
    try {
      const searchParams = req.body
      const { limit = 10, page = 0 } = req.query
      const offSet = page * limit

      let query = `select * from (
        with 
          crtbyroletxn as (
            select * from (
              select intxn_id, from_role as created_by_role, 
                     row_number() over (partition by intxn_id) as dup_id
                from interaction_txn
                 where flw_action = 'START') as dedupetxn
               where dup_id = 1
          ),
          pendclosetxn as (
            select * from (
              select intxn_id, intxn_status, flw_created_by as pending_close_by, flw_created_at as pending_close_date, 
                     row_number() over (partition by intxn_id) as dup_id
                from interaction_txn
                 where intxn_status = 'PEND-CLOSE' and flw_action!='Assign to self') as dedupetxn
               where dup_id = 1
          ),
          closedtxn as (
            select * from (
              select intxn_id, intxn_status, flw_created_by as closed_by, flw_created_at as closed_date, 
                     row_number() over (partition by intxn_id) as dup_id
                from interaction_txn
                 where intxn_status = 'CLOSED' and flw_action!='Assign to self') as dedupetxn
               where dup_id = 1
          ) 
        select intxn.intxn_id, intxn.created_at, 
               intxn.source_code, besc.description as source_code_desc, 
               intxn.chnl_code, bech.description as chnl_code_desc,
               ptxn.pending_close_date, intxn.cancelled_by,bcan.description as cancelled_reason,
               coalesce(cancelledBy.first_name, '', cancelledBy.first_name || ', ') || coalesce(cancelledBy.last_name, '') as cancelled_by_name,
               coalesce(pendingcloseuser.first_name, '', pendingcloseuser.first_name || ', ') || coalesce(pendingcloseuser.last_name, '') as pending_close_by_user_name,
               ctxn.closed_date, 
               coalesce(closedbyuser.first_name, '', closedbyuser.first_name || ', ') || coalesce(closedbyuser.last_name, '') as closed_by_user_name,
               cust.cust_type, bectype.description as cust_type_desc,
               coalesce(cust.first_name, '', cust.first_name || ', ') || coalesce(cust.last_name, '') as customer_name,
               cust.crm_customer_no,
               conn.identification_no, pln.prod_type,
               intxn.intxn_type, intxn.intxn_cat_type, tkttype.description as ticket_type_desc,
               intxn.comment_type, cmttype.description as comment_type_desc, 
               intxn.comment_cause, cmtcause.description as comment_cause_desc,
               coalesce(intxn.external_ref_no1, intxn.ref_intxn_id) ticket_id,
               intxn.description,
               intxn.priority_code, prty.description as priority_code_desc,
               intxn.created_by,        
               coalesce(crtbyusr.first_name, '', crtbyusr.first_name || ', ') || coalesce(crtbyusr.last_name, '') as created_by_user_name,
             intxn.curr_status, currsts.description as curr_status_desc,
             intxn.curr_role, currrole.role_desc as curr_role_name,
             intxn.curr_user,
               coalesce(curruser.first_name, '', curruser.first_name || ', ') || coalesce(curruser.last_name, '') as curr_user_name,
             case 
                 when intxn.survey_req = 'Y' then 'Yes'
                 when intxn.survey_req = 'N' or intxn.survey_req is null then 'No'
                end as survey_req,
             case 
                 when intxn.is_rebound = 'Y' then 'Yes'
                 when intxn.is_rebound = 'N' or intxn.is_rebound is null then 'No'
                end as is_rebound,   	   
                cntct.contact_no,
                cntct.email,
                intxn.wo_type, bewtype.description as wo_type_desc,
                crtdbyrole.role_desc as created_by_role,
                intxn.is_valid,
                intxn.problem_code
          from interaction intxn 
         inner join users crtbyusr on intxn.created_by = crtbyusr.user_id
         left outer join users cancelledBy on intxn.cancelled_by = cancelledBy.user_id
         left outer join business_entity bcan on intxn.cancelled_reason = bcan.code
         inner join business_entity currsts on intxn.curr_status = currsts.code
         inner join roles currrole on intxn.curr_role = currrole.role_id
         left outer join users curruser on intxn.curr_user = curruser.user_id
         left outer join crtbyroletxn on intxn.intxn_id = crtbyroletxn.intxn_id
         left outer join roles crtdbyrole on crtdbyrole.role_id = crtbyroletxn.created_by_role
         left outer join business_entity besc on intxn.source_code = besc.code
         left outer join business_entity bech on intxn.chnl_code = bech.code
         left outer join business_entity bewtype on intxn.wo_type = bewtype.code
         left outer join customers cust on intxn.customer_id = cust.customer_id 
         left outer join contacts cntct on cust.contact_id = cntct.contact_id 
         left outer join connections conn on intxn.connection_id = conn.connection_id
         left outer join plan pln on (conn.mapping_payload->'plans'->0->>'planId')::INTEGER = pln.plan_id
         left outer join business_entity bectype on cust.cust_type = bectype.code
         left outer join pendclosetxn ptxn on intxn.intxn_id = ptxn.intxn_id
         left outer join closedtxn ctxn on intxn.intxn_id = ctxn.intxn_id
         left outer join users pendingcloseuser on ptxn.pending_close_by = pendingcloseuser.user_id
         left outer join users closedbyuser on ctxn.closed_by = closedbyuser.user_id
         left outer join business_entity tkttype on intxn.intxn_cat_type = tkttype.code
         left outer join business_entity cmttype on intxn.comment_type = cmttype.code
         left outer join business_entity cmtcause on intxn.comment_cause = cmtcause.code
         left outer join business_entity prty on intxn.priority_code = prty.code) as ocintxn`

      let whereClause = ' where  '

      let paramIdx = 1
      const bindParams = {}

      if (searchParams.interactionId && searchParams.interactionId !== '' && searchParams.interactionId !== undefined) {
        whereClause = whereClause + ` ocintxn.intxn_id = $param${paramIdx}  and `
        bindParams[`param${paramIdx}`] = searchParams.interactionId
        paramIdx++
      }
      if (searchParams.interactionType && searchParams.interactionType !== '' && searchParams.interactionType !== undefined) {
        whereClause = whereClause + ` ocintxn.intxn_type = $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = searchParams.interactionType
        paramIdx++
      }
      if (searchParams.woType && searchParams.woType !== '' && searchParams.woType !== undefined) {
        whereClause = whereClause + ` ocintxn.wo_type = $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = searchParams.woType
        paramIdx++
      }
      if (searchParams.intxnStatus && searchParams.intxnStatus !== '' && searchParams.intxnStatus !== undefined) {
        whereClause = whereClause + ` ocintxn.curr_status = $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = searchParams.intxnStatus
        paramIdx++
      }
      if (searchParams.customerType && searchParams.customerType !== '' && searchParams.customerType !== undefined) {
        whereClause = whereClause + ` ocintxn.cust_type = $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = searchParams.customerType
        paramIdx++
      }
      if (searchParams.problemType && searchParams.problemType !== '' && searchParams.problemType !== undefined) {
        const beProblemType = await BusinessEntity.findOne({
          where: {
            codeType: 'PROBLEM_TYPE',
            code: searchParams.problemType
          }
        })

        const beCodes = await BusinessEntity.findAll({
          where: {
            codeType: ['PROBLEM_CAUSE', 'PROBLEM_CODE']
          }
        })

        const problemCauses = []
        for (const cd of beCodes) {
          if (cd.codeType === 'PROBLEM_CAUSE') {
            if (cd.mappingPayload && cd.mappingPayload.problemType && cd.mappingPayload.problemType.length > 0) {
              for (const pt of cd.mappingPayload.problemType) {
                if (pt === beProblemType.code) {
                  problemCauses.push(cd.code)
                }
              }
            }
          }
        }

        const problemCodes = []
        for (const cd of beCodes) {
          if (cd.codeType === 'PROBLEM_CODE') {
            if (cd.mappingPayload && cd.mappingPayload.problemCause && problemCauses.includes(cd.mappingPayload.problemCause)) {
              problemCodes.push(cd.code)
            }
          }
        }
        problemCodes.push(beProblemType.code)
        whereClause = whereClause + `ocintxn.problem_code IN ('${problemCodes.join("','")}') and `
      }
      if (searchParams.customerNo && searchParams.customerNo !== '' && searchParams.customerNo !== undefined) {
        whereClause = whereClause + ` ocintxn.crm_customer_no like $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${searchParams.customerNo}%`
        paramIdx++
      }
      if (searchParams.customerName && searchParams.customerName !== '' && searchParams.customerName !== undefined) {
        whereClause = whereClause + ` ocintxn.customer_name ilike $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${searchParams.customerName}%`
        paramIdx++
      }
      if (searchParams.serviceNo && searchParams.serviceNo !== '' && searchParams.serviceNo !== undefined) {
        whereClause = whereClause + ` ocintxn.identification_no like $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${searchParams.serviceNo}%`
        paramIdx++
      }
      if (searchParams.dateFrom && searchParams.dateFrom !== '' && searchParams.dateFrom !== undefined) {
        whereClause = whereClause + ` ocintxn.created_at::DATE >= $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = searchParams.dateFrom
        paramIdx++
      }
      if (searchParams.dateTo && searchParams.dateTo !== '' && searchParams.dateTo !== undefined) {
        whereClause = whereClause + ` ocintxn.created_at::DATE <= $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = searchParams.dateTo
        paramIdx++
      }

      whereClause = whereClause.substring(0, whereClause.lastIndexOf('and'))

      // if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
      //   const filters = searchInteractionWithFilters(searchParams.filters)
      //   if (filters !== '') {
      //     query = query + ' where ' + filters + ' order by ocintxn.created_at desc'
      //   }
      // } else {
      //   query = query + whereClause + ' order by ocintxn.created_at desc'
      // }

      query = query + whereClause + ' order by ocintxn.created_at desc'
      // console.log('OpenCloseQuery', query)

      let count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
        bind: bindParams,
        type: QueryTypes.SELECT
      })
      count = count[0].count
      if (req.query.page && req.query.limit) {
        query = query + ' limit ' + limit + ' offset ' + offSet
      }
      
      let rows = await sequelize.query(query, { 
        bind: bindParams, 
        type: QueryTypes.SELECT 
      })
      rows = transformOpenClosedSLADeptInteractionSearchResponse(rows)

      const response = { rows, count }
      logger.debug('Successfully fetch ' + searchParams.reportType + ' detailed list')
      return this.responseHelper.onSuccess(res, 'Successfully fetch ' + searchParams.reportType + ' Interaction', response)
    } catch (error) {
      logger.error(error, 'Error while fetching open/close interactions')
      return this.responseHelper.onError(res, new Error('Error while fetching open/close interactions'))
    }
  }

  async getChatInteractions(req, res) {
    try {
      logger.debug('Fetching chat Interactions')
      const { limit = 10, page = 1 } = req.query
      const offSet = (page * limit)
      const {
        chatId, accessNumber, email, agent, contactNo, customerName, serviceType, chatFromDate,
        chatToDate, chatStatus, filters
      } = req.body
      let response
      let query = `select ch.chat_id,
                          ch.contact_no,
                          ch.email_id,
                          ch.customer_name,
                          case 
                            when ch.start_at <= ch.created_at then null
                            else round(extract(EPOCH from ch.start_at - ch.created_at)::int/60, 0)
                          end as response_min,
                          case 
                            when ch.start_at <= ch.created_at then null
                            else round(mod(extract(EPOCH from ch.start_at - ch.created_at)::numeric/60, 1) * 60, 0)
                          end as response_sec,
                          COALESCE(ch.start_at::timestamp AT TIME ZONE 'Asia/Brunei', ch.created_at::timestamp AT TIME ZONE 'Asia/Brunei') created_at,
                          COALESCE(ch.customer_close_at::timestamp AT TIME ZONE 'Asia/Brunei', ch.updated_at::timestamp AT TIME ZONE 'Asia/Brunei') end_at,
                          ch.status,
                          case ch.status 
                            when 'NEW' then 'New'
                            when 'ASSIGNED' then 'Assigned'
                            when 'CLOSED' then 'Closed'
                            when 'ABANDONED' then 'Abandoned'
                            else 'Unknown'
                          end as status_desc,
                          ch.message,
                          ch.type,
                          ch.access_no,
                          ch.category,
                          ch.id_value,
                          concat(us.first_name , ' ', us.last_name) as agent_name,
                          case 
                            when ch.start_at <= ch.created_at then null
                            else round(extract(EPOCH from ch.start_at - ch.created_at)::int/60, 0)
                          end as queue_wait_min,
                          case 
                            when ch.start_at <= ch.created_at then null
                            else round(mod(extract(EPOCH from ch.start_at - ch.created_at)::numeric/60, 1) * 60, 0)
                          end as queue_wait_sec,
                          case 
                            when coalesce(ch.end_at, ch.customer_close_at, ch.updated_at)  <= coalesce(ch.start_at, ch.created_at) then null
                            else round(extract(EPOCH from coalesce(ch.end_at, ch.customer_close_at, ch.updated_at) - coalesce(ch.start_at, ch.created_at))::int/60, 0)
                          end as chat_duration_min,
                          case 
                            when coalesce(ch.end_at, ch.customer_close_at, ch.updated_at)  <= coalesce(ch.start_at, ch.created_at) then null
                            else round(mod(extract(EPOCH from coalesce(ch.end_at, ch.customer_close_at, ch.updated_at) - coalesce(ch.start_at, ch.created_at))::numeric/60, 1) * 60, 0)
                          end as chat_duration_sec
                     FROM chat ch 
               left outer join users AS us ON us.user_id = ch.user_id`
      let whereClause = ' where '

      let paramIdx = 1
      const bindParams = {}

      if (chatStatus && chatStatus !== '' && chatStatus !== undefined) {
        whereClause = whereClause + ` ch.status = $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = chatStatus
        paramIdx++
      }
      if (chatId && chatId !== '' && chatId !== undefined) {
        whereClause = whereClause + ` ch.chat_id = $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = chatId
        paramIdx++
      }
      if (agent && agent !== '' && agent !== undefined) {
        whereClause = whereClause + ` concat(us.first_name , ' ', us.last_name)  Ilike $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${agent}%`
        paramIdx++
      }
      if (customerName && customerName !== '' && customerName !== undefined) {
        whereClause = whereClause + ` ch.customer_name  Ilike $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${customerName}%`
        paramIdx++
      }
      if (email && email !== '' && email !== undefined) {
        whereClause = whereClause + ` ch.email_id  Ilike $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${email}%`
        paramIdx++
      }
      if (serviceType && serviceType !== '' && serviceType !== undefined) {
        whereClause = whereClause + ` ch.type  ilike $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${serviceType}%`
        paramIdx++
      }
      if (accessNumber && accessNumber !== '' && accessNumber !== undefined) {
        whereClause = whereClause + ` ch.access_no  like $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${accessNumber}%`
        paramIdx++
      }
      if (contactNo && contactNo !== '' && contactNo !== undefined) {
        whereClause = whereClause + ` ch.contact_no::varchar  like $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = `%${contactNo}%`
        paramIdx++
      }

      if (chatFromDate && chatToDate && chatFromDate !== '' && chatToDate !== '' && chatFromDate !== undefined && chatToDate !== undefined) {
        whereClause = whereClause + ` ch.created_at::DATE >= $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = chatFromDate
        paramIdx++
        whereClause = whereClause + ` ch.created_at::DATE <= $param${paramIdx} and `
        bindParams[`param${paramIdx}`] = chatToDate
        paramIdx++
      }

      // if (filters && Array.isArray(filters) && !isEmpty(filters)) {
      //   const filter = searchChatWithFilters(filters)
      //   if (filter !== '') {
      //     query = query + whereClause + filter + ' order by chat_id DESC'
      //   }
      // } else {
      //   whereClause = whereClause.substring(0, whereClause.lastIndexOf('and'))
      //   query = query + whereClause + ' order by chat_id DESC'
      // }

      whereClause = whereClause.substring(0, whereClause.lastIndexOf('and'))
      query = query + whereClause + ' order by chat_id DESC'

      // console.log('query', query)
      const count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
        type: QueryTypes.SELECT,
        bind: bindParams
      })
      // console.log('1')
      if (req.query.page && req.query.limit) {
        query = query + ' limit ' + limit + ' offset ' + offSet
      }
      // console.log('2')
      let rows = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        bind: bindParams
      })
      // console.log('3')
      rows = camelCaseConversion(rows)
      // console.log('4')
      if (rows.length > 0 & count.length > 0) {
        response = {
          rows,
          count: count[0].count
        }
      }
      logger.debug('Successfully fetch chat list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Chat list')
      return this.responseHelper.onError(res, new Error('Error while fetching Chat list'))
    }
  }

  async dailyChatReportNewCustomers(req, res) {
    try {
      logger.debug('Fetching daily chat report new customers')
      const { limit = 10, page = 1 } = req.query
      const offSet = (page * limit)
      const { chatFromDate, chatToDate } = req.body
      let response
      const countQuery = `SELECT count(*) FROM customers c, contacts c2 WHERE c.contact_id = c2.contact_id AND c.status::text = 'TEMP'::text AND 
                          c.created_at::date >= '${chatFromDate}' and c.created_at::date <='${chatToDate}'`
      let count = await sequelize.query(countQuery, {
        type: QueryTypes.SELECT,
        bind: {
          chatFromDate,
          chatToDate
        }
      })
      if (count.length > 0) {
        count = count[0].count
      }
      let query = `SELECT c.first_name AS customer_name, c2.email AS customer_email_id, c2.contact_no AS customer_mobile_number,
                   c.id_value AS id_number, CASE WHEN c2.alt_contact_no1 = 0::numeric THEN NULL::numeric ELSE c2.alt_contact_no1
                   END AS access_number,c2.alt_email AS service_type, to_char(c.created_at, 'dd-mm-yyyy hh12:mi AM'::text) AS created_date
                   FROM customers c,contacts c2 WHERE c.contact_id = c2.contact_id AND c.status::text = 'TEMP'::text AND
                   c.created_at::date >= '${chatFromDate}' and c.created_at::date <='${chatToDate}' order by c.created_at::date DESC`
      if (req.query.page && req.query.limit) {
        query = query + ' limit ' + limit + ' offset ' + offSet
      }

      let rows = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        bind: {
          chatFromDate,
          chatToDate
        }
      })
      rows = camelCaseConversion(rows)
      if (rows.length > 0) {
        response = {
          rows,
          count
        }
      }
      logger.debug('Successfully Fetched Daily Chat Report For New Customers')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Daily Chat Report For New Customers')
      return this.responseHelper.onError(res, new Error('Error while fetching Daily Chat Report For New Customers'))
    }
  }

  async dailyChatReportBoosterPurchase(req, res) {
    try {
      logger.debug('Fetching daily chat report for booster purchase')
      const { limit = 10, page = 0 } = req.query
      const offSet = (page * limit)
      const { chatFromDate, chatToDate } = req.body
      let response
      const countQuery = `SELECT count(*) FROM booster_purchase  WHERE booster_purchase.purchase_date::date >= '${chatFromDate}' and booster_purchase.purchase_date::date <='${chatToDate}'`
      let count = await sequelize.query(countQuery, {
        type: QueryTypes.SELECT,
        bind: {
          chatFromDate,
          chatToDate
        }
      })
      if (count.length > 0) {
        count = count[0].count
      }
      let query = `SELECT bp.access_number AS access_number,
        bp.customer_name AS customer_name,
        bp.contact_no AS contact_no,
        bp.email_id AS email_id,
        bp.booster_name,
        to_char(bp.purchase_date, 'dd-mm-yyyy hh12:mi AM'::text) AS purchase_date,
        bp.status AS status
       FROM booster_purchase as bp
      WHERE bp.purchase_date::date >= '${chatFromDate}' and bp.purchase_date::date <='${chatToDate}' order by bp.purchase_date::date DESC`
      if (req.query.page && req.query.limit) {
        query = query + ' limit ' + limit + ' offset ' + offSet
      }

      let rows = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        bind: {
          chatFromDate,
          chatToDate
        }
      })
      rows = camelCaseConversion(rows)
      if (rows.length > 0) {
        response = {
          rows,
          count
        }
      }
      logger.debug('Successfully Fetched Daily Chat Report For Booster Purchase')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Daily Chat Report For Booster Purchase')
      return this.responseHelper.onError(res, new Error('Error while fetching Daily Chat Report For Booster Purchase'))
    }
  }

  async dailyChatReportCounts(req, res) {
    try {
      logger.debug('Fetching Daily Visited & Connected To Agent Chat Report Counts')
      const { chatFromDate, chatToDate } = req.body

      const visitCountQuery = `SELECT chat.created_date, count(chat.chat_id) AS "COUNT"  FROM chat  WHERE chat.created_date >= '${chatFromDate}' and chat.created_date<='${chatToDate}'
      GROUP BY chat.created_date`

      const connectedToAgentCountQuery = `SELECT DISTINCT workflow_hdr.created_date, count(workflow_hdr.wf_hdr_id) AS "COUNT"
        FROM workflow_hdr
        WHERE workflow_hdr.created_date >= '${chatFromDate}' and workflow_hdr.created_date <= '${chatToDate}' AND workflow_hdr.entity::text = 'LIVE-CHAT'::text AND workflow_hdr.next_activity_id::text = 'Activity_1bvmsbm'::text
        GROUP BY workflow_hdr.created_date`

      const connectedWithLiveAgentCount = await sequelize.query(connectedToAgentCountQuery, {
        type: QueryTypes.SELECT,
        bind: {
          chatFromDate,
          chatToDate
        }
      })

      const visitedCustomerCount = await sequelize.query(visitCountQuery, {
        type: QueryTypes.SELECT
      })
      const response = []

      if (connectedWithLiveAgentCount.length > 0 || visitedCustomerCount.length > 0) {
        let connectedCount = 0
        for (const i of connectedWithLiveAgentCount) {
          connectedCount = Number(connectedCount) + Number(i.COUNT)
        }
        let visitedCount = 0
        for (const j of visitedCustomerCount) {
          visitedCount = Number(visitedCount) + Number(j.COUNT)
        }
        response.push({
          connectedWithLiveAgentCount: connectedCount,// connectedWithLiveAgentCount[0].COUNT,
          visitedCustomerCount: visitedCount//visitedCustomerCount[0].COUNT
        })
      }
      const data = {
        rows: response.length > 0 ? response : [],
        count: response.length > 0 ? 1 : 0
      }
      logger.debug('Successfully Fetched Daily Visited & Connected To Agent Chat Report Counts')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, data)
    } catch (error) {
      logger.error(error, 'Error while fetching Daily Visited & Connected To Agent Chat Report Counts')
      return this.responseHelper.onError(res, new Error('Error while fetching Daily Visited & Connected To Agent Chat Report Counts'))
    }
  }
}

const searchInteractionWithFilters = (filters) => {
  let query = ''
  for (const record of filters) {
    if (record.value) {
      if (record.id === 'interactionId') {
        if (record.filter === 'contains') {
          query = query + ' cast(irView.intxn_id  as varchar) like  \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(irView.intxn_id  as varchar) not like   \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'interactionType') {
        if (record.filter === 'contains') {
          query = query + '   intxn_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + '   intxn_type not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'woType') {
        if (record.filter === 'contains') {
          query = query + ' wo_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' wo_type not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'status') {
        if (record.filter === 'contains') {
          query = query + ' ticket_status Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' ticket_status not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'serviceNumber') {
        if (record.filter === 'contains') {
          query = query + ' cast(irView.identification_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(irView.identification_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'billRefNumber') {
        if (record.filter === 'contains') {
          query = query + ' cast(irView.bill_ref_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(irView.bill_ref_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'customerName') {
        if (record.filter === 'contains') {
          query = query + ' irView.customer_name like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' irView.customer_name not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'serviceType') {
        if (record.filter === 'contains') {
          query = query + ' service_type like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' service_type not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'customerNo') {
        if (record.filter === 'contains') {
          query = query + ' cast(irView.customer_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(irView.customer_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'customerType') {
        if (record.filter === 'contains') {
          query = query + ' customer_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' customer_type not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'contactNo') {
        if (record.filter === 'contains') {
          query = query + ' cast( contact_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast( contact_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'contactEmail') {
        if (record.filter === 'contains') {
          query = query + ' email Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' email not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'commentType') {
        if (record.filter === 'contains') {
          query = query + ' comment_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' comment_type not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'currentRole') {
        if (record.filter === 'contains') {
          query = query + ' curr_role Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' curr_role not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'priority') {
        if (record.filter === 'contains') {
          query = query + ' priority  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' priority  not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'commentCause') {
        if (record.filter === 'contains') {
          query = query + ' comment_cause  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' comment_cause  not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'ticketId') {
        if (record.filter === 'contains') {
          query = query + ' ref_intxn_id  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' ref_intxn_id  not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'commentChannel') {
        if (record.filter === 'contains') {
          query = query + ' chnl_code  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' chnl_code  not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'commentSource') {
        if (record.filter === 'contains') {
          query = query + ' source_code  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' source_code  not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'currentUser') {
        if (record.filter === 'contains') {
          query = query + ' intxn_curr_user  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' intxn_curr_user  not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'createdBy') {
        if (record.filter === 'contains') {
          query = query + ' intxn_created_by  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' intxn_created_by  not Ilike\'%' + record.value + '%\''
        }
      } else if (record.id === 'surveySent') {
        if (record.filter === 'contains') {
          query = query + ' survey_req  Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' survey_req  not Ilike\'%' + record.value + '%\''
        }
      }

      query = query + ' and '
    }
  }
  query = query.substring(0, query.lastIndexOf('and'))
  return query
}

const searchChatWithFilters = (filters) => {
  let query = ''
  for (const record of filters) {
    if (record.value) {
      if (record.id === 'chatId') {
        if (record.filter === 'contains') {
          query = query + ' cast(chat_id as varchar) Ilike \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(chat_id as varchar) not Ilike \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'contactNo') {
        if (record.filter === 'contains') {
          query = query + ' cast(ch.contact_no as varchar) Ilike \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(ch.contact_no as varchar) not Ilike \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'status') {
        if (record.filter === 'contains') {
          query = query + ' ch.status Ilike \'%' + record.value.toUpperCase() + '%\''
        } else {
          query = query + ' ch.status not Ilike \'%' + record.value.toUpperCase() + '%\''
        }
      } else if (record.id === 'emailId') {
        if (record.filter === 'contains') {
          query = query + ' ch.email_id Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' ch.email_id not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'customerName') {
        if (record.filter === 'contains') {
          query = query + ' customer_name Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' customer_name not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'accessNo') {
        if (record.filter === 'contains') {
          query = query + ' cast(access_no as varchar) Ilike \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(access_no as varchar) not Ilike \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'agentName') {
        if (record.filter === 'contains') {
          query = query + ' (us.first_name Ilike \'%' + record.value + '%\' or us.last_name Ilike \'%' + record.value + '%\' or concat(us.first_name,\' \',us.last_name) Ilike \'%' + record.value + '%\')'
        } else {
          query = query + ' (us.first_name not Ilike \'%' + record.value + '%\' and us.last_name not Ilike \'%' + record.value + '%\' or concat(us.first_name,\' \',us.last_name) not Ilike \'%' + record.value + '%\')'
        }
      } else if (record.id === 'statusDesc') {
        if (record.filter === 'contains') {
          query = query + ' be.description Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' be.description not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'serviceTypeDesc') {
        if (record.filter === 'contains') {
          query = query + ' be1.description Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' be1.description not Ilike \'%' + record.value + '%\''
        }
      }
      query = query + ' and '
    }
  }
  query = query.substring(0, query.lastIndexOf('and'))
  return query
}
