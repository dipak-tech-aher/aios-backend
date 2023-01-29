import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { defaultMessage } from '../utils/constant'
import { Interaction, InteractionTxn, sequelize } from '../model'
import { QueryTypes } from 'sequelize'
import moment from 'moment'

export class DashboardService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async getInteractionCounts (req, res) {
    try {
      logger.debug('Getting Interaction counts for logged in user ')
      const userId = req.userId
      // counts yet to implement
      const response = await InteractionTxn.findAll({
        include: [{
          model: Interaction
        }],
        where: {
          toUser: userId
        }
      })
      logger.debug('Successfully fetch Interaction counts')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Interaction counts')
      return this.responseHelper.onError(res, new Error('Error while fetching Interaction counts'))
    }
  }

  async getInteractionToDo (req, res) {
    try {
      logger.debug('Getting Interaction todo list for logged in user ')
      const userId = req.userId
      const { limit = 10, page = 1 } = req.query
      const response = await Interaction.findAll({
        // attributes: ['intxnId', 'parentIntxn', 'subject', 'description', 'currStatus', 'currUser', 'planId',
        // 'intxnType', 'problemCode', 'slaCode', 'expctdDateCmpltn', 'identificationNo', 'assignedDate', 'businessEntityCode','priorityCode'],
        offset: ((page - 1) * limit),
        limit: limit,
        include: {
          // attributes: ['txnId', 'fromRole', 'fromUser', 'toRole', 'toUser', 'flwCreatedAt', 'expctdDateCmpltn'],
          model: InteractionTxn,
          where: {
            toUser: userId
          }
        }
      })
      logger.debug('Successfully fetch Interaction todo list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Interaction todo list')
      return this.responseHelper.onError(res, new Error('Error while fetching Interaction todo list'))
    }
  }

  async getSalesDashboardCounts (req, res) {
    logger.debug('Getting Sales Dashboard Count list')
    const {
      location, startDate = moment().startOf('month').format('YYYY-MM-DD'),
      endDate = moment().endOf('month').format('YYYY-MM-DD'), user, serviceType, orderType
    } = req.body
    let totalTargetCount = 0
    let prevTargetData = 0
    const sources = ['Fixed', 'Postpaid', 'Prepaid']
    const countSource = []
    const targetSource = []

    const targetQuery = `
    select * from sales_target tar
    where coalesce(tar.locations , null) = coalesce($location, coalesce(tar.locations , null))
    and coalesce(tar.service_type , null) = coalesce($serviceType, coalesce(tar.service_type , null))
    and coalesce(tar.target_month::DATE) between coalesce(to_date($dateFrom,'YYYY-MM'),tar.target_month::DATE) 
    AND coalesce(to_date($dateTo, 'YYYY-MM'), tar.target_month::DATE)
    `
    const targetBind = {
      location: location || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      dateFrom: startDate || null,
      dateTo: endDate || null
    }

    const query = `select a.account_no as "accountNumber",
    a.subscribers_name as "CustomerName", 
    a.stype as "stype" ,
    b."location" as "Location",
    be.description as "description", b.first_name as "userName",
    a.order_type as "orderType"
    from workorder_overall_new a
    join users b on a.clear_user=b.crm_user_id
    join business_entity be on be.code = b."location"
    where a.order_type is not null
    and  a.stype is not null
    and a.stype not in ('Postpaid/Prepaid')
    and b.user_type  in ('UT_INTERNAL')
    and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
    and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE)
    and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
    and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
    and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
      `
    const bind = {
      location: location || null,
      dateFrom: startDate || null,
      dateTo: endDate || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      user: user || null
    }
    try {
      const count = await sequelize.query(
        'select COUNT(*) , stype as serviceType FROM (' + query + ') t group by t.stype',
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      const rows = await sequelize.query(query,
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      for (const c of count) {
        countSource.push(c.servicetype)
      }
      for (const s of sources) {
        if (!countSource.includes(s)) {
          if (s === 'Fixed') {
            count.splice(0, 0, {
              count: '0',
              servicetype: s
            })
          } else if (s === 'Postpaid') {
            count.splice(0, 0, {
              count: '0',
              servicetype: s
            })
          } else if (s === 'Prepaid') {
            count.splice(0, 0, {
              count: '0',
              servicetype: s
            })
          }
        }
      }

      let totalSaleCount = await sequelize.query(
        'select COUNT(*) FROM (' + query + ') t',
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )
      let previoustotalSaleCount = await sequelize.query(
        'select COUNT(*) FROM (' + query + ') t',
        {
          bind: {
            location: location || null,
            dateFrom: moment().subtract(1, 'months').startOf('month').format('YYYY-MMM-DD') || null,
            dateTo: moment().subtract(1, 'months').endOf('month').format('YYYY-MMM-DD') || null,
            serviceType: serviceType || null,
            orderType: orderType || null,
            user: user || null
          },
          type: QueryTypes.SELECT
        }
      )

      totalSaleCount = totalSaleCount[0].count
      previoustotalSaleCount = previoustotalSaleCount[0].count

      const groupedTargetCount = await sequelize.query(
        'select SUM(target_count), service_type as serviceType FROM (' + targetQuery + ') t group by t.service_type',
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      for (const c of groupedTargetCount) {
        targetSource.push(c.servicetype)
      }

      for (const s of sources) {
        if (!targetSource.includes(s)) {
          if (s === 'Fixed') {
            groupedTargetCount.splice(0, 0, {
              sum: '0',
              servicetype: s
            })
          } else if (s === 'Postpaid') {
            groupedTargetCount.splice(0, 0, {
              sum: '0',
              servicetype: s
            })
          } else if (s === 'Prepaid') {
            groupedTargetCount.splice(0, 0, {
              sum: '0',
              servicetype: s
            })
          }
        }
      }

      const targetData = await sequelize.query(targetQuery, {
        bind: targetBind,
        type: QueryTypes.SELECT
      })

      const previousTargetData = await sequelize.query(targetQuery, {
        bind: {
          location: location || null,
          dateFrom: moment().subtract(1, 'months').startOf('month').format('YYYY-MM-DD') || null,
          dateTo: moment().subtract(1, 'months').endOf('month').format('YYYY-MM-DD') || null,
          serviceType: serviceType || null,
          orderType: orderType || null,
          user: user || null
        },
        type: QueryTypes.SELECT
      })
      for (const e of targetData) {
        totalTargetCount += Number(e.target_count)
      }
      for (const e of previousTargetData) {
        prevTargetData += Number(e.target_count)
      }

      const response = {
        salesCount: {
          totalSaleCount,
          previoustotalSaleCount,
          groupCount: count,
          rows
        },
        targetCount: {
          totalTargetCount,
          previousTargetData: prevTargetData,
          groupedTargetCount
        }
      }
      logger.debug('Successfully fetch  Sales Dashboard Count list')
      return this.responseHelper.onSuccess(
        res,
        'Successfully fetch Sales Dashboard Count list',
        response
      )
    } catch (error) {
      logger.error(error, 'Error while fetching Sales Dashboard Count list')
      return this.responseHelper.onError(res, new Error('Error while fetching Sales Dashboard list'))
    }
  }

  async getSalesDashboardGraphData (req, res) {
    logger.debug('Getting Sales Dashboard Graph Data')
    const { location, startDate, endDate, user, serviceType, orderType } = req.body

    const targetQuery = `
    select locations,service_type as serviceType,target_count as targetCount,status from sales_target tar
    where coalesce(tar.locations , null) = coalesce($location, coalesce(tar.locations , null))
    and coalesce(tar.service_type , null) = coalesce($serviceType, coalesce(tar.service_type , null))
    and coalesce(tar.target_month::DATE) between coalesce(to_date($dateFrom,'YYYY-MM'),tar.target_month::DATE) 
    AND coalesce(to_date($dateTo, 'YYYY-MM'), tar.target_month::DATE)
    `
    const targetBind = {
      location: location || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      dateFrom: startDate || null,
      dateTo: endDate || null
    }

    const query = `
    select b.location ,be.description,
    sum(case when a.stype  = 'Fixed' then 1 end) as FixedSales ,
    sum(case when a.stype  = 'Prepaid' then 1 end) as PrepaidSales ,
    sum(case when a.stype  = 'Postpaid' then 1 end) as PostpaidSales 
    from workorder_overall_new a
    join users b on a.clear_user=b.crm_user_id
    join business_entity be on be.code = b."location"
    where a.order_type is not null
    and  a.stype is not null
    and  a.stype not in ('Postpaid/Prepaid')
    and b.user_type  in ('UT_INTERNAL')
    and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
    and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE) 
    and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
    and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
    and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
    group by b."location" ,be.description
    `

    // const query = `select b."location" as location,
    // be.description as description ,
    // stype as serviceType,
    // coalesce(t.target_count,'0') as target  ,
    // count(*), coalesce(t.target_count,'0')::integer - count(*) as diff
    // from workorder_overall a
    // left join users b on a.clear_user=b.crm_user_id
    // join business_entity be on be.code = b."location"
    // join accounts a2 on a2.account_no = a.account_no::integer
    // join connections cs on cs.account_id::integer = a2.account_id ::integer
    // left join sales_target t on t.locations =be.description  and t.service_type =a.stype
    // where a.order_type is not null
    // and  a.stype is not null
    // and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
    // and coalesce(a.create_dt::DATE) between coalesce($dateFrom, a.create_dt::DATE) AND coalesce($dateTo, a.create_dt::DATE)
    // and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
    // and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
    // and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
    // group by b."location",stype,be.description,t.target_count
    // `

    const bind = {
      location: location || null,
      dateFrom: startDate || null,
      dateTo: endDate || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      user: user || null
    }
    try {
      const salesTarget = await sequelize.query(targetQuery, {
        bind: targetBind,
        type: QueryTypes.SELECT
      })

      const rows = await sequelize.query(query, {
        bind: bind,
        type: QueryTypes.SELECT
      })
      const response = {
        rows,
        salesTarget
      }

      logger.debug('Successfully fetch  Sales Dashboard Graph Data')
      return this.responseHelper.onSuccess(
        res,
        'Successfully fetch Sales Dashboard Graph Data',
        response
      )
    } catch (error) {
      logger.error(error, 'Error while fetching Sales Dashboard Graph Data')
      return this.responseHelper.onError(res, new Error('Error while fetching Sales Dashboard Graph Data'))
    }
  }

  async salesDashboardDailyCount (req, res) {
    logger.debug('Getting Sales Dashboard Daily Data')
    const {
      startDate = moment().startOf('month').format('YYYY-MMM-DD'),
      endDate = moment().endOf('month').format('YYYY-MMM-DD'), location, user, serviceType, orderType
    } = req.body
    const todayDate = moment().subtract(1, 'days').format('YYYY-MM-DD')

    const baseQuery = `
     select a.*,b.first_name,b."location",be.description
    from workorder_overall_new a
    join users b on a.clear_user=b.crm_user_id
    join business_entity be on be.code = b."location"
    where a.order_type is not null
    and  a.stype is not null
    and b.user_type  in ('UT_INTERNAL')
    and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
    and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE) 
    and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
    and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
    and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
   `

    const dateWiseDataQuery = `
  select count,to_char(date, 'DD-MON') as date ,serviceType,
  new_con,portin,bundle,
  upgrade  from (
   select COUNT(*) ,create_date::DATE as date, stype as serviceType ,
   sum(case when new_con = 'Yes' then 1 else 0 end) as new_con ,
   sum(case when portin = 'Yes' then 1 else 0 end) as portin ,
   sum(case when bundle = 'Yes' then 1 else 0 end) as bundle ,
   sum(case when upgrade = 'Yes' then 1 else 0 end) as upgrade FROM ( 
    select a.*,b.first_name,b."location",be.description
    from workorder_overall_new a
    join users b on a.clear_user=b.crm_user_id
    join business_entity be on be.code = b."location"
    where a.order_type is not null
    and  a.stype is not null
    and b.user_type  in ('UT_INTERNAL')
    and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
    and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
    and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
    and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
    and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE))
    t group by t.stype,create_date::DATE order by create_date::DATE ) t1
   `
    const dateWiseDataBind = {
      location: location || null,
      dateFrom: startDate || null,
      dateTo: endDate || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      user: user || null
    }

    const DailyDatabind = {
      location: location || null,
      dateFrom: todayDate || null,
      dateTo: todayDate || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      user: user || null
    }

    try {
      const row = await sequelize.query(dateWiseDataQuery,
        {
          bind: dateWiseDataBind,
          type: QueryTypes.SELECT
        }
      )

      const DailySalesData = await sequelize.query(
        'select COUNT(*) , stype as serviceType FROM (' + baseQuery + ') t group by t.stype',
        {
          bind: DailyDatabind,
          type: QueryTypes.SELECT
        })

      const response = {
        dateWiseData: row,
        DailySalesData
      }
      logger.debug('Successfully fetch  Sales Dashboard Daily Data')
      return this.responseHelper.onSuccess(
        res,
        'Successfully fetch Sales Dashboard Daily Data',
        response
      )
    } catch (error) {
      logger.error(error, 'Error while fetching Sales Dashboard Daily Data')
      return this.responseHelper.onError(res, new Error('Error while fetching Sales Dashboard Daily Data'))
    }
  }

  async getSalesDashboard (req, res) {
    logger.debug('Getting Sales Dashboard')
    const {
      startDate = moment().startOf('month').format('YYYY-MMM-DD'),
      endDate = moment().endOf('month').format('YYYY-MMM-DD'), location, user, serviceType, orderType
    } = req.body

    const userQuery = `
       select b.first_name as firstName,a.stype as serviceType, a.order_type  as orderType
      from workorder_overall_new a
      join users b on a.clear_user=b.crm_user_id
      join business_entity be on be.code = b."location"
      where a.order_type is not null
      and  a.stype is not null
      and b.user_type  in ('UT_INTERNAL')
      and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
      and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE) 
      and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
      and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
      and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
     `

    const topUserQuery = `
     select b.first_name as userName, sum(case when (stype='Fixed') then 1 else 0 end) as fixed, 
     sum(case when (stype='Postpaid') then 1 else 0 end) as Postpaid,
     sum(case when (stype='Prepaid') then 1 else 0 end) as Prepaid ,count(*)
     from workorder_overall_new a
     join users b on a.clear_user=b.crm_user_id
     join business_entity be on be.code = b."location"
     where a.order_type is not null
     and  a.stype is not null
     and b.user_type  in ('UT_INTERNAL')
     and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
     and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE)
     and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
     and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
     and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
     group by b.first_name order by count desc 
     limit 5
     `
    const topLocationQuery = `
     select be.description as branches,sum(case when (stype='Fixed') then 1 else 0 end) as fixed, 
     sum(case when (stype='Postpaid') then 1 else 0 end) as Postpaid,
     sum(case when (stype='Prepaid') then 1 else 0 end) as Prepaid , count(*)
     from workorder_overall_new a
     join users b on a.clear_user=b.crm_user_id
     join business_entity be on be.code = b."location"
     where a.order_type is not null
     and  a.stype is not null
     and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
     and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE)
     and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
     and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
     and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
     group by be.description order by count desc 
     limit 5
     `

    const bind = {
      location: location || null,
      dateFrom: startDate || null,
      dateTo: endDate || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      user: user || null
    }

    try {
      const user = await sequelize.query(userQuery,
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      const lastUpdatedDate = await sequelize.query(
        'select max(create_date::date) as UpdatedDate from workorder_overall_new t',
        {
          type: QueryTypes.SELECT
        })

      const topUser = await sequelize.query(topUserQuery,
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      const topLocation = await sequelize.query(topLocationQuery,
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      let userList = []
      let serviceTypeList = []
      let OrderTypeList = []
      for (const e of user) {
        userList.push({ firstname: e.firstname })
        serviceTypeList.push({ servicetype: e.servicetype })
        OrderTypeList.push({ ordertype: e.ordertype })
      }
      userList = [...new Map(userList.map(item => [item.firstname, item])).values()]
      serviceTypeList = [...new Map(serviceTypeList.map(item => [item.servicetype, item])).values()]
      OrderTypeList = [...new Map(OrderTypeList.map(item => [item.ordertype, item])).values()]

      const response = {
        lastUpdatedDate,
        user: userList,
        serviceType: serviceTypeList,
        orderType: OrderTypeList,
        topUser: topUser,
        topLocation: topLocation
      }

      logger.debug('Successfully fetch  Sales Dashboard')
      return this.responseHelper.onSuccess(
        res,
        'Successfully fetch Sales Dashboard',
        response
      )
    } catch (error) {
      logger.error(error, 'Error while fetching Sales Dashboard')
      return this.responseHelper.onError(res, new Error('Error while fetching Sales Dashboard'))
    }
  }

  async getSalesData (req, res) {
    logger.debug('Getting Sales Count list')

    const {
      location, startDate = moment().startOf('month').format('YYYY-MM-DD'),
      endDate = moment().endOf('month').format('YYYY-MM-DD'), user, serviceType, orderType
    } = req.body

    const query = `select a.account_no as "accountNumber",
    a.subscribers_name as "CustomerName",
    a.stype as "stype" ,
    b."location" as "Location",
    be.description as "description", b.first_name as "userName",
    a.order_type as "orderType"
    from workorder_overall_new a
    left join users b on a.clear_user=b.crm_user_id
    join business_entity be on be.code = b."location"
    where a.order_type is not null
    and  a.stype is not null
    and a.stype not in ('Postpaid/Prepaid')
    and b.user_type  in ('UT_INTERNAL')
    and coalesce(be.description, null) = coalesce($location, coalesce(be.description, null))
    and coalesce(a.create_date::DATE) between coalesce($dateFrom, a.create_date::DATE) AND coalesce($dateTo, a.create_date::DATE)
    and coalesce(a.stype, null) = coalesce($serviceType, coalesce(a.stype, null))
    and coalesce (a.order_type, null)= coalesce ($orderType, coalesce(a.order_type,null))
    and coalesce(b.first_name, null) = coalesce($user, coalesce(b.first_name, null))
      `
    const bind = {
      location: location || null,
      dateFrom: startDate || null,
      dateTo: endDate || null,
      serviceType: serviceType || null,
      orderType: orderType || null,
      user: user || null
    }

    try {
      const count = await sequelize.query(
        'select COUNT(*) FROM (' + query + ') t',
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      const rows = await sequelize.query(query,
        {
          bind: bind,
          type: QueryTypes.SELECT
        }
      )

      const response = {
        count: count[0].count,
        rows
      }

      logger.debug('Successfully fetch  Sales Count list')
      return this.responseHelper.onSuccess(
        res,
        'Successfully fetch Sales Dashboard Count list',
        response
      )
    } catch (error) {
      logger.error(error, 'Error while fetching Sales Count list')
      return this.responseHelper.onError(res, new Error('Error while fetching Sales list'))
    }
  }
}
