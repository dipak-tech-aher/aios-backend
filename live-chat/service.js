import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Chat, sequelize, Plan } from '../model'
import { defaultMessage } from '../utils/constant'
import { getCustomerDetails } from '../tibco/tibco-utils'
import { QueryTypes } from 'sequelize'
import { systemUserId, chatRoleId } from 'config'
import { camelCaseConversion } from '../utils/string'
import { isEmpty } from 'lodash'
import { format } from 'date-fns'

const NodeCache = require('node-cache')
const myCache = new NodeCache()

export class ChatService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createChat (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Creating new chat user')
      let chat = req.body.data
      /* if (!chat || !chat.customerName || !chat.contactNo || !chat.emailId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      } */
      chat = {
        ...chat,
        createdBy: systemUserId,
        updatedBy: systemUserId
      }
      const response = await Chat.create(chat, { transaction: t })
      await t.commit()
      logger.debug('New chat user created successfully')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating new chat user'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getNewChats (req, res) {
    try {
      logger.debug('Fetching new chats list')
      const { limit = 10, page = 0 } = req.query
      const response = await Chat.findAndCountAll({
        where: { status: 'NEW' },
        order: [['chatId', 'DESC']],
        offset: (page * limit),
        limit: limit
      })
      logger.debug('Successfully fetch new chats list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching new customer list')
      return this.responseHelper.onError(res, new Error('Error while fetching new customer list'))
    }
  }

  async getAssignedChats (req, res) {
    try {
      logger.debug('Fetching assigned chat list')
      const userId = req.userId
      const response = await Chat.findAll({
        where: {
          userId,
          status: 'ASSIGNED'
        }
      })
      logger.debug('Successfully fetch assigned chats list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching assigned chats')
      return this.responseHelper.onError(res, new Error('Error while fetching assigned chats'))
    }
  }

  async assignChat (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Assign chat to Agent')
      const { id } = req.params
      const userId = req.userId
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const chat = await Chat.findOne({ where: { chatId: id, status: 'NEW' } })
      if (!chat) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error('Chat not found with given chat id'))
      }
      const cutomerDetails = await getCustomerDetails(chat?.accessNo, chat.type, id)
      // console.log('cutomerDetails==>',cutomerDetails)
      if (!cutomerDetails) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error('Customer details not found in Tibco'))
      }
      let plan
      if (chat.customerInfo && chat.customerInfo.currentPlanCode) {
        plan = await Plan.findOne({
          attributes: ['planName'],
          where: {
            refPlanCode: chat.customerInfo.currentPlanCode
          }
        })
        if (!plan) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Plan not found'))
        }
      }
      const data = {
        chatId: id,
        status: 'ASSIGNED',
        userId,
        startAt: new Date(),
        // customerInfo: cutomerDetails
      }
      // data.customerInfo.planName = (plan && plan.planName !== null) ? plan.planName : ''

      await Chat.update(data, {
        where: {
          chatId: id,
          status: 'NEW'
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Successfully assign the chat to Agent')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS)
    } catch (error) {
      logger.error(error, 'Error when assign the chat to Agent ')
      return this.responseHelper.onError(res, new Error('Error when assign the chat to Agent'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async endChat (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Ending Chat')
      const reqData = req.body
      const userId = req.userId
      if (!reqData || !reqData.chatId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const chat = await Chat.findOne({ where: { chatId: reqData.chatId, userId } })
      if (!chat) {
        logger.debug('Chat not found with given chat id')
        return this.responseHelper.notFound(res, new Error('Chat not found with given chat id'))
      }
      const chatMessage = myCache.get(String(userId + ',' + chat.chatId))

      const data = {
        chatId: reqData.chatId,
        status: 'CLOSED',
        message: chatMessage,
        messageFrom: reqData.messageFrom,
        endAt: new Date()
      }
      await Chat.update(data, {
        where: {
          chatId: reqData.chatId
        },
        transaction: t
      })
      myCache.del(String(userId + ',' + chat.chatId))
      await t.commit()
      logger.debug('Chat ended successfully')
      return this.responseHelper.onSuccess(res, 'Chat ended successfully')
    } catch (error) {
      logger.error(error, 'Error while ending chat')
      return this.responseHelper.onError(res, new Error('Error while ending chat'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async searchChat (req, res) {
    try {
      logger.debug('Search chat list')
      const { limit = 10, page = 1 } = req.query
      const offSet = (page * limit)
      const userId = req.userId
      const { chatId, customerName, serviceNo, chatFromDate, chatToDate, status, selfDept, filters } = req.body
      let response
      let query = `SELECT ch.*,CONCAT(us.first_name ,' ',us.last_name) AS agent_name FROM chat ch 
                 LEFT JOIN users AS us ON us.user_id = ch.user_id `
      let whereClause = ' where  '

      if (selfDept && selfDept !== '' && selfDept !== undefined && selfDept === 'self') {
        whereClause = whereClause + `us.user_id =${userId}  and `
      }
      if (status && status !== '' && status !== undefined) {
        whereClause = whereClause + `ch.status ='${status.toUpperCase()}'  and `
      }
      if (chatId && chatId !== '' && chatId !== undefined) {
        whereClause = whereClause + `cast( chat_id as varchar) Ilike '%${chatId}%' and `
      }
      if (customerName && customerName !== '' && customerName !== undefined) {
        whereClause = whereClause + `customer_name Ilike '%${customerName}%' and `
      }
      if (serviceNo && serviceNo !== '' && serviceNo !== undefined) {
        whereClause = whereClause + `cast( service_no as varchar) Ilike '%${serviceNo}%' and `
      }
      if (chatFromDate && chatToDate && chatFromDate !== '' && chatToDate !== '' && chatFromDate !== undefined && chatToDate !== undefined) {
        whereClause = whereClause + `ch.created_at::DATE >= '${chatFromDate}' and ch.created_at:: DATE <= '${chatToDate}' and `
      }

      if (filters && Array.isArray(filters) && !isEmpty(filters)) {
        const filter = searchChatWithFilters(filters)
        if (filter !== '') {
          query = query + whereClause + filter + ' order by chat_id DESC'
        }
      } else {
        whereClause = whereClause.substring(0, whereClause.lastIndexOf('and'))
        query = query + whereClause + ' order by chat_id DESC'
      }
      const count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
        type: QueryTypes.SELECT
      })
      if (req.query.page && req.query.limit) {
        query = query + ' limit ' + limit + ' offset ' + offSet
      }
      let rows = await sequelize.query(query, {
        type: QueryTypes.SELECT
      })
      rows = camelCaseConversion(rows)

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

  async getChatCount (req, res) {
    logger.debug('Getting the current chat count')
    let query
    const { selfDept, chatFromDate, chatToDate } = req.body
    if (!chatFromDate && !chatToDate) {
      return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
    }
    const userId = req.userId
    if (selfDept === 'self') {
      query = `select status,user_id, COUNT (chat_id) as count from chat where created_at::DATE >='${chatFromDate}'and created_at::DATE <='${chatToDate}' GROUP by status,user_id having 1= 1 and user_id=${userId}`
    } else {
      query = `select status, COUNT (chat_id) as count from chat where created_at::DATE >='${chatFromDate}'and created_at::DATE <='${chatToDate}' GROUP by status`
    }
    try {
      let count = await sequelize.query(query, {
        type: QueryTypes.SELECT
      })
      count = camelCaseConversion(count)
      logger.debug('Successfully fetch Chat Count')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, count)
    } catch (error) {
      logger.error(error, 'Error while fetching Chat Count')
      return this.responseHelper.onError(res, new Error('Error while fetching Chat Count'))
    }
  }

  async saveChatMessages (req, res) {
    try {
      logger.debug('Saving chat messages in cache')
      const userId = req.userId
      const reqData = req.body
      if (!reqData || !reqData.message) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      // myCache.set(String(userId + ',' + reqData.email + reqData.chatId), reqData.message);
      console.log('reqData.message......',reqData.message)
      myCache.set(String(userId + ',' + reqData.chatId), reqData.message)
      logger.debug('Successfully saved chat message in cache')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS)
    } catch (error) {
      logger.error(error, 'Error while saving chat message')
      return this.responseHelper.onError(res, new Error('Error while saving chat message'))
    }
  }

  async getChatMessages (req, res) {
    try {
      logger.debug('Fetching chat messages in cache')
      const userId = req.userId
      const { email, id } = req.query
      // const response = myCache.get(String(userId + ',' + email + id))
      const response = myCache.get(String(userId + ',' + id))
      logger.debug('Successfully fetch chat message in cache')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching chat message')
      return this.responseHelper.onError(res, new Error('Error while fetching chat message'))
    }
  }

  async getNewChatCount (req, res) {
    logger.debug('Getting the new chat count')
    try {
      const response = await Chat.count({
        where: {
          status: 'NEW'
        }
      })
      logger.debug('Successfully fetch New Chat Count')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Chat Count')
      return this.responseHelper.onError(res, new Error('Error while fetching Chat Count'))
    }
  }

  async updateCustomerChatTime (req, res) {
    const t = await sequelize.transaction()
    logger.debug('Updating the chat')
    try {
      const socketId = req?.body?.data
      if (!socketId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Chat.findOne({
        where: {
          socketId: socketId
        }
      })
      if (!response) {
        return this.responseHelper.validationError(res, new Error('Chat Not Found'))
      }
      const chat = {
        customerCloseAt: new Date()
      }
      const chatResponse = await Chat.update(chat, {
        where: {
          socketId: socketId
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Successfully Updated the Chat')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, chatResponse)
    } catch (error) {
      logger.error(error, 'Error while updating chat')
      return this.responseHelper.onError(res, new Error('Error while updating chat'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getChatMonitorCounts (req, res) {
    logger.debug('Getting the chat monitor counts')
    try {
      const { date } = req.query
      const createdAt = format(new Date(), 'yyyy-MM-dd')
      console.log('createdAt......')
      const query = `SELECT COUNT(*) AS queue,
        (SELECT COUNT(*) AS currently_served FROM chat WHERE status ='ASSIGNED' AND created_at::date ='${createdAt}'),
        (SELECT COUNT(*) AS abandoned_chat FROM chat WHERE status ='ABANDONED' AND created_at::date ='${createdAt}'),
        (SELECT AVG(start_at - created_at) AS wait_average FROM chat WHERE status !='ABANDONED' AND created_at::date ='${createdAt}'),
        (SELECT MAX(start_at - created_at) AS wait_Longest FROM chat WHERE status !='ABANDONED' AND created_at::date ='${createdAt}'),
        (SELECT AVG(end_at - start_at) AS chat_duration_average FROM chat WHERE status!='ABANDONED' AND created_at::date ='${createdAt}'),
        (SELECT MAX(end_at - start_at) AS chat_duration_Longest FROM chat WHERE status!='ABANDONED' AND created_at::date ='${createdAt}'),
        (SELECT COUNT(distinct user_id) AS no_of_agents FROM chat WHERE status !='ABANDONED' AND created_at::date ='${createdAt}'),
        (SELECT COUNT(user_id) AS chat_per_agent_avg FROM chat WHERE status != 'ABANDONED' AND created_at::date ='${createdAt}'),
        (SELECT COUNT(user_id) AS logged_in_agents FROM user_session WHERE created_at::date = '${createdAt}' AND curr_role_id=${chatRoleId})
        FROM chat WHERE status ='NEW' AND created_at::date ='${createdAt}'`
       
      const counts = await sequelize.query(query, {
        type: QueryTypes.SELECT
      })
      const response = camelCaseConversion(counts)
      logger.debug('Successfully fetch Chat Monitor Count')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Chat Monitor Count')
      return this.responseHelper.onError(res, new Error('Error while fetching Chat Monitor Count'))
    }
  }

  async getChatPerAgent(req, res) {
    logger.debug('Getting the chat Per Agent')
    try{
      const { date } = req.query
      const createdAt = date === undefined ? format(new Date(), 'yyyy-MM-dd') : date
      const chatList= await sequelize.query(`SELECT (u.first_name||' '||u.last_name) as user_name ,COUNT(*) AS chat_count FROM chat c
          join users u on u.user_id=c.user_id
          WHERE c.status != 'ABANDONED' and c.user_id is not null AND c.created_at::date ='${createdAt}'
          group by (u.first_name||' '||u.last_name)`,
          {
            type: QueryTypes.SELECT
          })

        const response = camelCaseConversion(chatList)        
        logger.debug('Successfully fetch Chat Per Agent')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    }catch (error) {
      logger.error(error, 'Error while fetching Chat Per Agent')
      return this.responseHelper.onError(res, new Error('Error while fetching Chat Per Agent View'))
    }    
  }

  async getLoggedInAgent(req, res) {
    logger.debug('Getting the Loggedin Agent')
    try{
      const { date } = req.query
      const createdAt = date === undefined ? format(new Date(), 'yyyy-MM-dd') : date
      const chatList= await sequelize.query(`SELECT (u.first_name||' '||u.last_name) as user_name FROM user_session c
          join users u on u.user_id=c.user_id
          WHERE cast(c.created_at as date) ='${createdAt}' AND curr_role_id=${chatRoleId}`,
          {
            type: QueryTypes.SELECT
          })

        const response = camelCaseConversion(chatList)        
        logger.debug('Successfully fetch Loggedin Agent')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    }catch (error) {
      logger.error(error, 'Error while fetching Loggedin Agent')
      return this.responseHelper.onError(res, new Error('Error while fetching Loggedin Agent View'))
    }    
  }
}

const searchChatWithFilters = (filters) => {
  let query = ''
  for (const record of filters) {
    if (record.value) {
      if (record.id === 'contactNo') {
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
      } else if (record.id === 'email') {
        if (record.filter === 'contains') {
          query = query + ' ch.email_id Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' ch.email_id not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'agentName') {
        if (record.filter === 'contains') {
          query = query + ' (us.first_name Ilike \'%' + record.value + '%\' or us.last_name Ilike \'%' + record.value + '%\' or concat(us.first_name,\' \',us.last_name) Ilike \'%' + record.value + '%\')'
        } else {
          query = query + ' (us.first_name not Ilike \'%' + record.value + '%\' and us.last_name not Ilike \'%' + record.value + '%\' or concat(us.first_name,\' \',us.last_name) not Ilike \'%' + record.value + '%\')'
        }
      } else if (record.id === 'idValue') {
        if (record.filter === 'contains') {
          query = query + ' ch.id_value Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' ch.id_value not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'category') {
        if (record.filter === 'contains') {
          query = query + ' ch.category Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' ch.category not Ilike \'%' + record.value + '%\''
        }
      }
      query = query + ' and '
    }
  }
  query = query.substring(0, query.lastIndexOf('and'))
  return query
}
