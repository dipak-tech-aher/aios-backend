import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { sequelize, Interaction, BusinessUnit, InteractionTxn, Role, User, BusinessEntity } from '../model'
import { QueryTypes, Op } from 'sequelize'
import { defaultMessage } from '../utils/constant'
import { camelCaseConversion } from '../utils/string'
import { transformInteractionTxn } from '../transforms/customer-servicce'
import { isEmpty } from 'lodash'
import { createUserNotification, createPopupNotification } from '../notification/notification-service'

export class InteractionService {
  constructor() {
    this.responseHelper = new ResponseHelper()
  }

  async searchInteraction(req, res) {
    try {
      logger.debug('Searching for Interactions')
      const searchParams = req.body

      const { limit = 10, page = 0 } = req.query
      const offSet = (page * limit)

      let query = `select i.intxn_id, i.wo_type, i.curr_entity, i.curr_user, i.curr_role, i.external_ref_no1,
                      be2.description as wo_type_description, i.connection_id as service_id,
                      i.identification_no  as access_nbr, p.prod_type,
                      i.customer_id, i.curr_status, 
                      i.created_at, (select concat(u.first_name ,' ',u.last_name) as created_by from users as u where user_id= i.created_by) as created_by, i.intxn_type, 
                      be.description as intxn_type_desc,
                      be1.description as priority_desc, 
                      be2.description as wo_type_desc,
                      be3.description as ticket_type_desc,
                      be4.description as curr_status_desc,
                      i.account_id, cnt.contact_no,
                      concat(cu.first_name ,' ',cu.last_name) as customer_name,
                      concat(acc.first_name ,' ',acc.last_name) as account_name,
                      COALESCE(NULLIF(i.external_ref_no1, null), NULLIF(i.external_ref_sys1, null)),
                      acc.account_no, cu.crm_customer_no as customer_nbr,concat(u.first_name ,' ',u.last_name) as assigned,
                      i.ref_intxn_id as ticket_id
                      from interaction as i 
                      left outer join customers cu on cu.customer_id =  i.customer_id
                      left outer join accounts acc on i.account_id = acc.account_id
                      left outer join contacts cnt on cu.contact_id = cnt.contact_id
                      left outer join connections conn on i.connection_id = conn.connection_id
                      left outer join plan p on CAST(conn.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id
                      left outer join business_entity be on i.intxn_type = be.code
                      left outer join business_entity be1 on i.priority_code = be1.code
                      left outer join business_entity be2 on i.wo_type = be2.code
                      left outer join business_entity be3 on i.intxn_cat_type = be3.code
                      left outer join business_entity be4 on i.curr_status = be4.code
                      left outer join users u on i.curr_user = u.user_id`

      let whereClause = ' where  '

      if (searchParams.interactionId && searchParams.interactionId !== '' && searchParams.interactionId !== undefined) {
        whereClause = whereClause + ' cast(i.intxn_id as varchar) like \'%' + searchParams.interactionId.toString() + '%\' and '
      }
      if (searchParams.customerId && searchParams.customerId !== '' && searchParams.customerId !== undefined) {
        whereClause = whereClause + ' cast(i.customer_id as varchar) like \'%' + searchParams.customerId.toString() + '%\' and '
      }
      if (searchParams.serviceNumber && searchParams.serviceNumber !== '' && searchParams.serviceNumber !== undefined) {
        whereClause = whereClause + ' cast(i.identification_no as varchar) like \'%' + searchParams.serviceNumber.toString() + '%\' and '
      }
      if (searchParams.accountNumber && searchParams.accountNumber !== '' && searchParams.accountNumber !== undefined) {
        whereClause = whereClause + ' cast(acc.account_no as varchar) like \'%' + searchParams.accountNumber.toString() + '%\' and '
      }
      if (searchParams.ticketId && searchParams.ticketId !== '' && searchParams.ticketId !== undefined) {
        whereClause = whereClause + ' cast(i.ref_intxn_id as varchar) like \'%' + searchParams.ticketId.toString() + '%\' and '
      }
      if (searchParams.userId && searchParams.userId !== '' && searchParams.userId !== undefined) {
        whereClause = whereClause + ' cast(i.curr_user as varchar) like \'%' + searchParams.userId.toString() + '%\' and '
      }
      if (searchParams.status && searchParams.status !== '' && searchParams.status !== undefined) {
        if (searchParams.status === 'ASSIGNED') {
          whereClause = whereClause + " i.curr_status NOT IN ('CLOSED', 'FAILED', 'NEW') and "
        } else {
          whereClause = whereClause + 'i.curr_status Ilike \'%' + searchParams.status + '%\' and '
        }
      }
      if (searchParams.customerName && searchParams.customerName !== '' && searchParams.customerName !== undefined) {
        whereClause = whereClause + '(cu.first_name Ilike \'%' + searchParams.customerName + '%\' or cu.last_name Ilike \'%' +
          searchParams.customerName + '%\' or concat(cu.first_name,\' \',cu.last_name) Ilike \'%' + searchParams.customerName + '%\') and '
      }
      if (searchParams.accountName && searchParams.accountName !== '' && searchParams.accountName !== undefined) {
        whereClause = whereClause + '( acc.first_name Ilike \'%' + searchParams.accountName + '%\' or acc.last_name Ilike \'%' +
          searchParams.accountName + '%\' or concat(acc.first_name,\' \',acc.last_name) Ilike \'%' + searchParams.accountName + '%\') and '
      }
      // DASHBOARD FILTER
      if (searchParams.startDate && searchParams.startDate !== '' && searchParams.startDate !== undefined) {
        whereClause = whereClause + 'i.created_at::DATE >=\'' + searchParams.startDate + '\' and '
      }
      if (searchParams.endDate && searchParams.endDate !== '' && searchParams.endDate !== undefined) {
        whereClause = whereClause + ' i.created_at::DATE <= \'' + searchParams.endDate + '\' and '
      }
      if (searchParams.roleId && searchParams.roleId !== '' && searchParams.roleId !== undefined) {
        whereClause = whereClause + ' i.curr_role = ' + searchParams.roleId + ' and '
      }
      if (searchParams.type && searchParams.type !== '' && searchParams.type !== undefined && searchParams.type !== 'ticket') {
        whereClause = whereClause + ' i.intxn_type Ilike \'%' + searchParams.type + '%\' and ' // For Service request
      }
      // if (searchParams.status && searchParams.status === 'ASSIGNED') {
      //   whereClause = whereClause + " i.curr_status NOT IN ('CLOSED', 'FAILED', 'NEW') and i.intxn_type = 'REQSR' and "
      // }
      if (searchParams.type && searchParams.type !== '' && searchParams.type !== undefined && searchParams.type === 'ticket') {
        whereClause = whereClause + " i.intxn_type != 'REQSR' and " // For complaint and inquiry
      }
      if (searchParams.selfDept === 'self') {
        whereClause = whereClause + ' i.curr_user = ' + req.userId + ' and ' +
          ' cast(i.curr_entity as varchar) like \'%' + req.departmentId.toString() + '%\' and '
      }
      if (searchParams.selfDept === 'dept') {
        whereClause = whereClause + ' cast(i.curr_entity as varchar) like \'%' + req.departmentId.toString() + '%\' and '
      }
      whereClause = whereClause.substring(0, whereClause.lastIndexOf('and'))

      if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
        const filters = searchInteractionWithFilters(searchParams.filters)
        if (filters !== '') {
          query = query + ' where ' + filters + ' order by i.created_at DESC'
        }
      } else {
        query = query + whereClause + ' order by i.created_at DESC'
      }
      let count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
        type: QueryTypes.SELECT
      })
      if (req.query.page && req.query.limit) {
        query = query + ' limit ' + limit + ' offset ' + offSet
      }
      let rows = await sequelize.query(query, {
        type: QueryTypes.SELECT
      })
      rows = camelCaseConversion(rows)

      if (count.length > 0) {
        count = count[0].count
      }
      const data = {
        rows,
        count
      }
      logger.debug('Successfully fetch customer data')
      return this.responseHelper.onSuccess(res, 'Intraction data fetch succesfully', data)
    } catch (error) {
      logger.error(error, 'Error while fetching Customer data')
      return this.responseHelper.onError(res, new Error('Error while fetching Customer data'))
    }
  }

  async countInteraction(req, res) {
    try {
      logger.debug('Counting Interatction starts')
      const searchParams = req.body
      const query = `select count(*) as count,
      i.intxn_type,
      be1.description as intxn_type_desc,
      i.curr_status,  
      be2.description as curr_status_desc from interaction i 
      inner join business_entity be1 on i.intxn_type = be1.code
      inner join business_entity be2 on i.curr_status = be2.code
      where i.intxn_type = coalesce($type, i.intxn_type) 
      and i.intxn_id = coalesce($interactionId, i.intxn_id)
      and i.curr_status = coalesce($status, i.curr_status) 
      and i.customer_id = coalesce($customerId, i.customer_id)          
      and coalesce(i.curr_user, -1) = coalesce($userId, coalesce(i.curr_user, -1))
      and coalesce(i.curr_role, -1) = coalesce($role, coalesce(i.curr_role, -1)) 
      and i.curr_entity = coalesce($dept, i.curr_entity)
      and (i.created_at:: DATE >= coalesce($startDate, i.created_at:: DATE) 
      and i.created_at:: DATE <= coalesce($endDate, i.created_at:: DATE))
      group by i.intxn_type, i.curr_status, be1.description, be2.description`
      let countInteraction = await sequelize.query(query, {
        bind: {
          interactionId: (searchParams.interactionId) ? searchParams.interactionId : null,
          customerId: (searchParams.customerId) ? searchParams.customerId : null,
          status: (searchParams.status) ? searchParams.status : null,
          type: (searchParams.type) ? searchParams.type : null,
          userId: (searchParams.selfDept && searchParams.selfDept === 'self') ? req.userId : null,
          startDate: (searchParams.startDate) ? searchParams.startDate : null,
          endDate: (searchParams.endDate) ? searchParams.endDate : null,
          dept: req.departmentId || null,
          role: req.roleId || null
        },
        type: QueryTypes.SELECT
      })
      countInteraction = camelCaseConversion(countInteraction)

      // Broadbrand graph count
      const graphBroadbrandQuery = `select date_trunc('month', i.created_at) as createdMonth, count(*) as broadBrand from interaction i 
      inner join connections c on i.connection_id = c.connection_id
      inner join plan p on cast(c.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id
      where p.prod_type in ('Fixed') 
      and coalesce(i.curr_user, -1) = coalesce($userId, coalesce(i.curr_user, -1))
      and i.curr_entity = coalesce($dept, i.curr_entity)
      and coalesce(i.curr_role, -1) = coalesce($role, coalesce(i.curr_role, -1))
      and (i.created_at::DATE >= coalesce($startDate, i.created_at::DATE) 
      and i.created_at::DATE <= coalesce($endDate, i.created_at::DATE))
      group by createdMonth`
      let graphBroadbrandData = await sequelize.query(graphBroadbrandQuery, {
        bind: {
          userId: (searchParams.selfDept && searchParams.selfDept === 'self') ? req.userId : null,
          startDate: (searchParams.startDate) ? searchParams.startDate : null,
          endDate: (searchParams.endDate) ? searchParams.endDate : null,
          dept: req.departmentId || null,
          role: req.roleId || null
        },
        type: QueryTypes.SELECT
      })
      graphBroadbrandData = camelCaseConversion(graphBroadbrandData)

      // Mobile graph count
      const graphMobileQuery = `select date_trunc('month', i.created_at) as mobileMonth, count(*) as mobile from interaction i 
      inner join connections c on i.connection_id = c.connection_id
      inner join plan p on cast(c.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id
      where p.prod_type in ('Prepaid', 'Postpaid') 
      and coalesce(i.curr_user, -1) = coalesce($userId, coalesce(i.curr_user, -1))
      and i.curr_entity = coalesce($dept, i.curr_entity)
      and coalesce(i.curr_role, -1) = coalesce($role, coalesce(i.curr_role, -1))
      and (i.created_at::DATE >= coalesce($startDate, i.created_at::DATE) 
      and i.created_at::DATE <= coalesce($endDate, i.created_at::DATE))
      group by mobileMonth`
      let graphMobileData = await sequelize.query(graphMobileQuery, {
        bind: {
          userId: (searchParams.selfDept && searchParams.selfDept === 'self') ? req.userId : null,
          startDate: (searchParams.startDate) ? searchParams.startDate : null,
          endDate: (searchParams.endDate) ? searchParams.endDate : null,
          dept: req.departmentId || null,
          role: req.roleId || null
        },
        type: QueryTypes.SELECT
      })
      graphMobileData = camelCaseConversion(graphMobileData)

      // Open by service count
      const openServiceTypeQuery = `select prod_type, count(*) as count from interaction i 
      inner join connections c on i.connection_id = c.connection_id
      inner join plan p on cast(c.mapping_payload->'plans'->0->'planId' as INT) = p.plan_id
      where i.curr_status NOT IN ('CLOSED', 'CANCELLED', 'UNFULFILLED') 
      and coalesce(i.curr_user, -1) = coalesce($userId, coalesce(i.curr_user, -1))
      and coalesce(i.curr_role, -1) = coalesce($role, coalesce(i.curr_role, -1))
      and i.curr_entity = coalesce($dept, i.curr_entity)
      and (i.created_at::DATE >= coalesce($startDate, i.created_at::DATE) 
      and i.created_at::DATE <= coalesce($endDate, i.created_at::DATE))
      group by p.prod_type`
      let openServiceTypeData = await sequelize.query(openServiceTypeQuery, {
        bind: {
          userId: (searchParams.selfDept && searchParams.selfDept === 'self') ? req.userId : null,
          startDate: (searchParams.startDate) ? searchParams.startDate : null,
          endDate: (searchParams.endDate) ? searchParams.endDate : null,
          dept: req.departmentId || null,
          role: req.roleId || null
        },
        type: QueryTypes.SELECT
      })
      openServiceTypeData = camelCaseConversion(openServiceTypeData)

      // By source count
      const bySourceQuery = `select count(*) as count,
      i.source_code ,
      be1.description as source_description from interaction i 
      inner join business_entity be1 on i.source_code = be1.code
      where coalesce(i.curr_user, -1) = coalesce($userId, coalesce(i.curr_user, -1))
      and coalesce(i.curr_role, -1) = coalesce($role, coalesce(i.curr_role, -1))  
      and i.curr_entity = coalesce($dept, i.curr_entity)   
      and (i.created_at::DATE >= coalesce($startDate, i.created_at::DATE) 
      and i.created_at::DATE <= coalesce($endDate, i.created_at::DATE))     
      group by i.source_code, be1.description`
      let bySourceData = await sequelize.query(bySourceQuery, {
        bind: {
          userId: (searchParams.selfDept && searchParams.selfDept === 'self') ? req.userId : null,
          startDate: (searchParams.startDate) ? searchParams.startDate : null,
          endDate: (searchParams.endDate) ? searchParams.endDate : null,
          dept: req.departmentId || null,
          role: req.roleId || null
        },
        type: QueryTypes.SELECT
      })
      bySourceData = camelCaseConversion(bySourceData)

      const response = {
        count: countInteraction,
        broadBandGraph: graphBroadbrandData,
        mobileGraph: graphMobileData,
        openByServiceType: openServiceTypeData,
        top5: bySourceData
      }
      logger.debug('Successfully get all counts of intreraction')
      return this.responseHelper.onSuccess(res, 'Intraction count fetched succesfully', response)
    } catch (error) {
      logger.error(error)
      return this.responseHelper.onError(res, new Error('Error while fetching Intraction count'))
    }
  }

  async getInteractionList(req, res) {
    try {
      logger.debug('Getting Interaction list')
      const { limit = 10, page = 0 } = req.query
      const response = await Interaction.findAll({
        offset: (page * limit),
        limit: limit
      })
      logger.debug('Successfully fetch lead list')
      return this.responseHelper.onSuccess(res, 'All Interaction List feched sucessfully', response)
    } catch (error) {
      logger.error(error, 'Error while fetching lead data')
      return this.responseHelper.onError(res, new Error('Error while fetching lead data'))
    }
  }

  async addFollowUp(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new follow up')
      const followUp = req.body
      const userId = req.userId
      if (!followUp && !req.body) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const intxnId = req.body.intxnId
      const intxnData = await Interaction.findOne({ where: { intxnId } })
      let response
      if (intxnData) {
        response = await addFollowUpData(followUp, userId, intxnId, t)
      }
      await t.commit()
      logger.debug('follow up created successfully')
      return this.responseHelper.onSuccess(res, 'follow up created successfully', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while creating follow up'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async assignToSelf(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Assiging  to self')
      const { id } = req.params
      const { userId, roleId, departmentId } = req
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      logger.debug('Finding interaction data')
      const interaction = await Interaction.findOne({
        where: {
          intxnId: id
        }
      })
      if (!interaction) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      if (interaction?.currStatus === "ASSIGNED" && interaction?.currUser) {
        logger.debug('Ticket is already assigned')
        return this.responseHelper.onError(res, new Error('Ticket is already assigned'))
      }

      logger.debug('Updating interaction data of', id)
      const assignData = {
        currUser: userId,
        currStatus: 'ASSIGNED',
        currRole: roleId
      }
      const updatedData = await Interaction.update(assignData, {
        where: {
          intxnId: id
        },
        transaction: t
      })
      if (updatedData) {
        logger.debug('Creating interaction history of id:-', id)
        const previousHistory = await InteractionTxn.findOne({
          where: { intxnId: id }
        })
        const addHistory = {
          intxnId: id,
          fromRole: interaction?.currRole ? Number(interaction.currRole) : roleId,
          toRole: roleId,
          fromEntity: previousHistory?.toEntity ? previousHistory?.toEntity : departmentId,
          toEntity: departmentId,
          toUser: userId,
          flwId: previousHistory?.flwId ? previousHistory.flwId : 'A',
          flwCreatedBy: userId,
          intxnStatus: interaction?.currStatus ? interaction.currStatus : null,
          flwAction: 'Assign to self',
          isFollowup: 'N'
        }
        logger.debug('History finding')
        await InteractionTxn.create(addHistory, { transaction: t })
      }
      await t.commit()
      logger.debug('Successfully assigned to self, id:-', id)
      return this.responseHelper.onSuccess(res, 'Ticket assigned to self')
    } catch (error) {
      logger.error(error, 'Error while assigning to self')
      return this.responseHelper.onError(res, new Error('Error while assigning to self'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  // async reAssign (req, res) {
  //   const t = await sequelize.transaction()
  //   try {
  //     logger.debug('Ticket is Reassign')
  //     const { id } = req.params
  //     const { userId, contactNo, roleId, departmentId } = req
  //     const reqData = req.body
  //     if (!id || !reqData || !reqData.userId) {
  //       return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
  //     }
  //     logger.debug('Finding interaction data')
  //     const interaction = await Interaction.findOne({
  //       where: {
  //         intxnId: id,
  //         currUser: userId,
  //         currRole: roleId,
  //         currEntity: departmentId
  //       }
  //     })
  //     if (!interaction) {
  //       logger.debug(defaultMessage.NOT_FOUND)
  //       return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
  //     }
  //     const user = await User.findOne({
  //       where: {
  //         userId: reqData.userId
  //       }
  //     })
  //     if (!user) {
  //       return this.responseHelper.notFound(res, new Error('Selected user not found'))
  //     }
  //     const assignData = {
  //       currUser: reqData.userId,
  //       currStatus: 'REASSIGNED'
  //     }
  //     const updatedData = await Interaction.update(assignData, {
  //       where: {
  //         intxnId: id
  //       },
  //       transaction: t
  //     })
  //     if (updatedData) {
  //       logger.debug('Creating interaction history of id ', id)
  //       const previousHistory = await InteractionTxn.findOne({
  //         where: { intxnId: id }
  //       })
  //       const addHistory = {
  //         intxnId: id,
  //         fromRole: interaction?.currRole ? Number(interaction.currRole) : roleId,
  //         toRole: roleId,
  //         fromEntity: previousHistory?.toEntity ? previousHistory?.toEntity : departmentId,
  //         toEntity: departmentId,
  //         flwId: previousHistory?.flwId ? previousHistory.flwId : 'A',
  //         flwCreatedBy: userId,
  //         intxnStatus: interaction?.currStatus ? interaction.currStatus : null,
  //         isFollowup: 'N',
  //         flwAction: 'Re-assign to user',
  //         toUser: reqData.userId
  //       }
  //       await InteractionTxn.create(addHistory, { transaction: t })
  //       if (interaction.currUser !== null && interaction.currStatus !== 'NEW' && interaction.currStatus !== 'CLOSED') {
  //         const source = interaction.intxnType === 'REQSR' ? 'Service Request' : interaction.intxnType === 'REQINQ' ? 'Inquiry' : 'Complaint'
  //         const data = {
  //           description: interaction.description,
  //           identificationNo: interaction.identificationNo,
  //           businessEntityCode: interaction.businessEntityCode,
  //           currStatus: interaction.currStatus
  //         }

  //         const toUserEmail = await User.findOne(
  //           {
  //             attributes: ['email'],
  //             where: {
  //               userId: assignData.currUser
  //             }
  //           }
  //         )

  //         const notificationSubject = 'reassigned to you'
  //         await createPopupNotification(id, roleId, departmentId, assignData.currUser, source, notificationSubject)
  //         await createUserNotification(id, toUserEmail.email, contactNo, roleId, departmentId, assignData.currUser, source, data, t, notificationSubject)
  //       }
  //     }
  //     await t.commit()
  //     logger.debug('Successfully Reassign')
  //     return this.responseHelper.onSuccess(res, 'Ticket Successfully reassigned')
  //   } catch (error) {
  //     logger.error(error, 'Error while reassigning')
  //     return this.responseHelper.onError(res, new Error('Error while reassigning'))
  //   } finally {
  //     if (t && !t.finished) {
  //       await t.rollback()
  //     }
  //   }
  // }

  async reAssign(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Ticket is Reassign')
      const { id } = req.params
      const { userId, contactNo, roleId, departmentId } = req
      const reqData = req.body

      if (!id || !reqData) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Finding interaction data')
      const interaction = await Interaction.findOne({
        where: {
          intxnId: Number(id),
          currUser: Number(userId),
          currRole: Number(roleId),
          currEntity: departmentId
        },
        logging: true
      })
      if (!interaction) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }

      if (reqData.userId) {
        const user = await User.findOne({
          where: {
            userId: Number(reqData.userId)
          }
        })
        if (!user) {
          return this.responseHelper.notFound(res, new Error('Selected user not found'))
        }
      }

      const assignData = {
        currUser: reqData.userId ? Number(reqData.userId) : null,
        currStatus: 'REASSIGNED',
        currEntity: reqData.entity
      }
      const updatedData = await Interaction.update(assignData, {
        where: {
          intxnId: Number(id)
        },
        transaction: t
      })
      if (updatedData) {
        logger.debug('Creating interaction history of id ', id)
        const previousHistory = await InteractionTxn.findOne({
          where: { intxnId: Number(id) }
        })
        const addHistory = {
          intxnId: Number(id),
          fromRole: interaction?.currRole ? Number(interaction.currRole) : Number(roleId),
          toRole: Number(roleId),
          fromEntity: previousHistory?.toEntity ? previousHistory?.toEntity : departmentId,
          toEntity: departmentId,
          flwId: previousHistory?.flwId ? previousHistory.flwId : 'A',
          flwCreatedBy: Number(userId),
          intxnStatus: interaction?.currStatus ? interaction.currStatus : null,
          isFollowup: 'N',
          flwAction: 'Re-assign to user',
          toUser: Number(reqData.userId)
        }

        await InteractionTxn.create(addHistory, { transaction: t })

        if (interaction.currUser !== null && interaction.currStatus !== 'NEW' && interaction.currStatus !== 'CLOSED') {
          const source = interaction.intxnType === 'REQSR' ? 'Service Request' : interaction.intxnType === 'REQINQ' ? 'Inquiry' : 'Complaint'
          const data = {
            description: interaction.description,
            identificationNo: interaction.identificationNo,
            businessEntityCode: interaction.businessEntityCode,
            currStatus: interaction.currStatus
          }

          const toUserEmail = await User.findOne(
            {
              attributes: ['email'],
              where: {
                userId: Number(assignData.currUser)
              }
            }
          )

          const notificationSubject = 'reassigned to you'
          await createPopupNotification(id, roleId, departmentId, assignData.currUser, source, notificationSubject)
          await createUserNotification(id, toUserEmail.email, contactNo, roleId, departmentId, assignData.currUser, source, data, t, notificationSubject)
        }
      }
      await t.commit()
      logger.debug('Successfully Reassign')
      return this.responseHelper.onSuccess(res, 'Ticket Successfully reassigned')
    } catch (error) {
      logger.error(error, 'Error while reassigning')
      return this.responseHelper.onError(res, new Error('Error while reassigning'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async ticketCancellation(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Ticket is cancelling')
      const { userId } = req
      const reqData = req.body

      if (!reqData.intxnId || !reqData) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Finding interaction data')
      const interaction = await Interaction.findOne({
        where: {
          intxnId: Number(reqData.intxnId),
        },
        logging: true
      })
      if (!interaction) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }

      const cancellationData = {
        cancelledBy: userId,
        currStatus: 'CANCELLED',
        cancelledReason: reqData.cancellationReason,
        cancelledAt: new Date(),
        // currUser: null
      }
      const updatedData = await Interaction.update(cancellationData, {
        where: {
          intxnId: Number(reqData.intxnId)
        },
        transaction: t
      })
      // if (updatedData) {
      //   logger.debug('Creating interaction history of id ', id)
      //   const previousHistory = await InteractionTxn.findOne({
      //     where: { intxnId: Number(id) }
      //   })
      //   const addHistory = {
      //     intxnId: Number(id),
      //     fromRole: interaction?.currRole ? Number(interaction.currRole) : Number(roleId),
      //     toRole: Number(roleId),
      //     fromEntity: previousHistory?.toEntity ? previousHistory?.toEntity : departmentId,
      //     toEntity: departmentId,
      //     flwId: previousHistory?.flwId ? previousHistory.flwId : 'A',
      //     flwCreatedBy: Number(userId),
      //     intxnStatus: interaction?.currStatus ? interaction.currStatus : null,
      //     isFollowup: 'N',
      //     flwAction: 'Re-assign to user',
      //     toUser: Number(reqData.userId)
      //   }

      //   await InteractionTxn.create(addHistory, { transaction: t })

      //   if (interaction.currUser !== null && interaction.currStatus !== 'NEW' && interaction.currStatus !== 'CLOSED') {
      //     const source = interaction.intxnType === 'REQSR' ? 'Service Request' : interaction.intxnType === 'REQINQ' ? 'Inquiry' : 'Complaint'
      //     const data = {
      //       description: interaction.description,
      //       identificationNo: interaction.identificationNo,
      //       businessEntityCode: interaction.businessEntityCode,
      //       currStatus: interaction.currStatus
      //     }

      //     const toUserEmail = await User.findOne(
      //       {
      //         attributes: ['email'],
      //         where: {
      //           userId: Number(assignData.currUser)
      //         }
      //       }
      //     )

      //     const notificationSubject = 'reassigned to you'
      //     await createPopupNotification(id, roleId, departmentId, assignData.currUser, source, notificationSubject)
      //     await createUserNotification(id, toUserEmail.email, contactNo, roleId, departmentId, assignData.currUser, source, data, t, notificationSubject)
      //   }
      // }
      await t.commit()
      logger.debug('Successfully Cancelled')
      return this.responseHelper.onSuccess(res, 'Ticket Successfully Cancelled', updatedData)
    } catch (error) {
      logger.error(error, 'Error while reassigning')
      return this.responseHelper.onError(res, new Error('Error while Cancelled'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getFollowUp(req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting followUp list')
      let response
      if (id) {
        const query = `select it.*, 
        bu.unit_desc as department_description, 
        r.role_desc as role_description, 
        concat(u.first_name, ' ', u.last_name) as flw_created_by, 
        be.description as source_description from interaction_txn it 
           left join business_entity be on it.sla_code = be.code
           left join business_units bu on it.to_entity = bu.unit_id 
           left join roles r on it.to_role = r.role_id 
           left join users u on it.flw_created_by = u.user_id 
           where it.intxn_id = coalesce ($id, it.intxn_id) and it.is_followup = 'Y'
           order by flw_created_at desc`

        response = await sequelize.query(query, {
          bind: {
            id
          },
          type: QueryTypes.SELECT
        })
      } else {
        response = await InteractionTxn.findAll()
      }
      response = camelCaseConversion(response)
      logger.debug('Successfully fetch followUp list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching followUp list')
      return this.responseHelper.onError(res, new Error('Error while fetching followUp list'))
    }
  }

  async getHistory(req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting follow up history')
      let response
      if (id) {
        response = await InteractionTxn.findAll({
          include: [
            {
              model: BusinessUnit,
              as: 'fromEntityName',
              attributes: ['unitId', 'unitName', 'unitDesc']
            },
            {
              model: BusinessUnit,
              as: 'toEntityName',
              attributes: ['unitId', 'unitName', 'unitDesc']
            },
            {
              model: Role,
              as: 'toRoleName',
              attributes: ['roleId', 'roleName', 'roleDesc']
            },
            {
              model: Role,
              as: 'fromRoleName',
              attributes: ['roleId', 'roleName', 'roleDesc']
            },
            {
              model: User,
              as: 'flwCreatedby',
              attributes: ['userId',
                [sequelize.fn('CONCAT', sequelize.col('first_name'), ' ', sequelize.col('last_name')), 'flwCreatedBy']]
            },
            {
              model: BusinessEntity,
              as: 'statusDescription',
              attributes: ['code', 'description']
            }
          ],
          where: {
            intxnId: id, isFollowup: 'N'
          },
          order: [
            ['flwCreatedAt', 'DESC']
          ]
        })
      } else {
        response = await InteractionTxn.findAll()
      }
      logger.debug('Successfully fetched follow up history')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching follow up history')
      return this.responseHelper.onError(res, new Error('Error while fetching follow up history'))
    }
  }

  async getTerminateData(req, res) {
    try {
      const reqBody = req.body
      logger.debug('Getting Interaction Data')
      const response = await Interaction.findAll({
        where: {
          customerId: reqBody.customerId,
          accountId: reqBody.accountId,
          identificationNo: reqBody.accessNbr,
          woType: {
            [Op.in]: ['TERMINATE', 'RELOCATE', 'TELEPORT']
          }
        },
        order: [
          ['intxnId', 'DESC']
        ]
      })
      logger.debug('Successfully fetch Interaction Data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Interaction Data')
      return this.responseHelper.onError(res, new Error('Error while fetching Interaction Data'))
    }
  }
}
const addFollowUpData = async (followUp, userId, intxnId, t) => {
  const previousHistory = await InteractionTxn.findOne({
    order: [['flwCreatedAt', 'DESC']],
    where: { intxnId }
  })
  const data = transformInteractionTxn(followUp)
  data.fromEntity = previousHistory.dataValues.fromEntity
  data.toEntity = previousHistory.dataValues.toEntity
  data.flwId = previousHistory.dataValues.flwId
  data.flwAction = previousHistory.dataValues.flwAction
  data.fromRole = previousHistory.dataValues.fromRole
  data.toRole = previousHistory.dataValues.toRole
  data.intxnStatus = previousHistory.dataValues.intxnStatus
  data.remarks = followUp.remarks
  data.isFollowup = 'Y'
  data.flwCreatedBy = userId
  const followUpData = await InteractionTxn.create(data, { transaction: t })
  return followUpData
}

export const getInquiryAndComplaint = async (id, intetactionType) => {
  const query = `select i.*, r.role_name as curr_role_name, 
  be.description as intxn_type_description,
  be1.description as about_description,
  be2.description as source_description,
  be3.description as priority_description, 
  be4.description as problem_cause,
  be5.description as chnl_description,
  be6.description as curr_status_description,
  be7.description as ticket_type,
  be8.description as cause_code_description,
  be9.description as category_description,
  be10.description as problem_code_description,
  be11.description as type_description,
  be12.description as location_description,
  be13.description as cancellation_description,
  bu.unit_desc as created_entity_desc,
  bu2.unit_desc as curr_entity_desc,
  r.role_desc as role_desc,
  concat(us.first_name ,' ',us.last_name) as user_name,
  (select concat(u.first_name ,' ',u.last_name) as created_by from users as u where user_id= i.created_by) as created_by,
  (select concat(u.first_name ,' ',u.last_name) as cancelled_by from users as u where user_id= i.cancelled_by) as cancelled_by
  from interaction as i
  left join users us on i.curr_user = us.user_id
  join roles r on CAST(i.curr_role AS INT) = r.role_id
  left join business_entity be on i.intxn_type = be.code
  left join business_entity be1 on i.comment_type = be1.code
  left join business_entity be2 on i.source_code = be2.code
  left join business_entity be3 on i.priority_code = be3.code
  left join business_entity be4 on i.comment_cause = be4.code
  left join business_entity be5 on i.chnl_code = be5.code
  left join business_entity be6 on i.curr_status = be6.code
  left join business_entity be7 on i.intxn_cat_type = be7.code
  left join business_entity be8 on i.cause_code = be8.code
  left join business_entity be9 on i.services = be9.code
  left join business_entity be10 on i.problem_code = be10.code
  left join business_entity be11 on i.business_entity_code = be11.code
  left join business_entity be12 on i.location = be12.code
  left join business_entity be13 on i.cancelled_reason = be13.code
  left join business_units bu on i.created_entity = bu.unit_id 
  left join business_units bu2 on i.curr_entity = bu2.unit_id 
  where i.intxn_id = $id  and i.intxn_type = $intetactionType`

  const response = await sequelize.query(query, {
    bind: {
      id: id,
      intetactionType
    },
    type: QueryTypes.SELECT
  })
  return response
}

const searchInteractionWithFilters = (filters) => {
  let query = ''
  for (const record of filters) {
    if (record.value) {
      if (record.id === 'interactionId') {
        if (record.filter === 'contains') {
          query = query + ' cast(i.intxn_id as varchar) like  \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(i.intxn_id as varchar) not like   \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'woType') {
        if (record.filter === 'contains') {
          query = query + ' be2.description Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' be2.description not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'interactionCatType') {
        if (record.filter === 'contains') {
          query = query + '   be.description Ilike \'%' + record.value + '%\''
        } else {
          query = query + '   be.description not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'serviceNumber') {
        if (record.filter === 'contains') {
          query = query + ' cast(conn.identification_no as varchar) like \'%' + record.value.toString() + '%\''
        } else {
          query = query + ' cast(conn.identification_no as varchar) not like \'%' + record.value.toString() + '%\''
        }
      } else if (record.id === 'serviceType') {
        if (record.filter === 'contains') {
          query = query + ' p.prod_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' p.prod_type not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'assigned') {
        if (record.filter === 'contains') {
          query = query + ' (u.first_name Ilike \'%' + record.value + '%\' or u.last_name Ilike \'%' + record.value + '%\' or concat(u.first_name,\' \',u.last_name) Ilike \'%' + record.value + '%\')'
        } else {
          query = query + ' (u.first_name not Ilike \'%' + record.value + '%\' or u.last_name not Ilike \'%' + record.value + '%\' or concat(u.first_name,\' \',u.last_name) not Ilike \'%' + record.value + '%\')'
        }
      } else if (record.id === 'status') {
        if (record.filter === 'contains') {
          query = query + ' be4.description Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' be4.description not Ilike\'%' + record.value + '%\''
        }
      }
      query = query + ' and '
    }
  }
  query = query.substring(0, query.lastIndexOf('and'))
  return query
}
