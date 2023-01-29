import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { WhatsAppReport, WhatsAppReportDtl, BusinessEntity, Interaction, WhatsAppChatHistory, Contact, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
import { QueryTypes, Op } from 'sequelize'
import { camelCaseConversion } from '../utils/string'
import { isEmpty, map, set } from 'lodash'
import moment from 'moment'

export class WhatsAppService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async getWhatsAppCounts (req, res) {
    try {
      const searchParams = req.body
      if (!searchParams || !searchParams.startDate || !searchParams.endDate) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Getting whatsApp counts')
      const query1 = `SELECT service_type,count(*) FROM whatsapp_report_dtl WHERE 
                     (created_at:: DATE >= coalesce($startDate, created_at:: DATE)
                     AND created_at:: DATE <= coalesce($endDate, created_at:: DATE))
                     GROUP BY service_type`
      let countsByToday = await sequelize.query(query1, {
        bind: {
          startDate: (searchParams.startDate) ? searchParams.startDate : null,
          endDate: (searchParams.endDate) ? searchParams.endDate : null
        },
        type: QueryTypes.SELECT
        // logging: true
      })
      countsByToday = camelCaseConversion(countsByToday)
      const monthDates = getStartAndEndDates(searchParams.startDate)
      const query2 = `SELECT service_type,count(*) FROM whatsapp_report_dtl WHERE 
                     (created_at:: DATE >= coalesce($startDate, created_at:: DATE)
                     AND created_at:: DATE <= coalesce($endDate, created_at:: DATE))
                     GROUP BY service_type`
      let countsByMonth = await sequelize.query(query2, {
        bind: {
          startDate: (monthDates.startDate) ? monthDates.startDate : null,
          endDate: (monthDates.endDate) ? monthDates.endDate : null
        },
        type: QueryTypes.SELECT
        // logging: true
      })
      countsByMonth = camelCaseConversion(countsByMonth)

      const query3 = `SELECT i.business_entity_code AS service_type,count(*) FROM interaction_txn it 
                      INNER JOIN interaction AS i ON i.intxn_id =it.intxn_id WHERE it.cause_code ='WHATSAPP'
                      AND (flw_created_at:: DATE >= coalesce($startDate, created_at:: DATE)
                      AND flw_created_at:: DATE <= coalesce($endDate, created_at:: DATE))
                      GROUP BY i.business_entity_code`
      const monthDates1 = getStartAndEndDates(searchParams.startDate)
      let countsByFollowUp = await sequelize.query(query3, {
        bind: {
          startDate: (monthDates1.startDate) ? monthDates1.startDate : null,
          endDate: (monthDates1.endDate) ? monthDates1.endDate : null
        },
        type: QueryTypes.SELECT
      })
      countsByFollowUp = camelCaseConversion(countsByFollowUp)

      const query4 = `SELECT i.business_entity_code AS service_type,count(*) FROM interaction AS i WHERE subject='WHATSAPP' AND
                      (created_at:: DATE >= coalesce($startDate, created_at:: DATE)
                      AND created_at:: DATE <= coalesce($endDate, created_at:: DATE)) GROUP BY i.business_entity_code`
      const monthDates2 = getStartAndEndDates(searchParams.startDate)
      let countsByComplaint = await sequelize.query(query4, {
        bind: {
          startDate: (monthDates2.startDate) ? monthDates2.startDate : null,
          endDate: (monthDates2.endDate) ? monthDates2.endDate : null
        },
        type: QueryTypes.SELECT,
        logging: true
      })
      countsByComplaint = camelCaseConversion(countsByComplaint)
      const response = {
        countsByToday,
        countsByMonth,
        countsByFollowUp,
        countsByComplaint
      }
      logger.debug('Successfully fetch counts')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching counts')
      return this.responseHelper.onError(res, new Error('Error while fetching counts'))
    }
  }

  async getWhatsAppCountsDetails (req, res) {
    try {
      const searchParams = req.body
      if (!searchParams || !searchParams.startDate || !searchParams.endDate || !searchParams.flag) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Getting whatsApp counts details')
      if (searchParams.flagOne === 'Todays Visited Customers On Whatsapp') {
        const cond = searchParams.flag != 'All' ? `AND service_type = '${searchParams.flag}'` : ''
        const query = `SELECT created_at, access_number, service_type, contact_number,whatsapp_number  FROM whatsapp_report_dtl WHERE 
      (created_at:: DATE >= coalesce($startDate, created_at:: DATE)
      AND created_at:: DATE <= coalesce($endDate, created_at:: DATE) ${cond}) order by created_at desc`

        const response = await sequelize.query(query, {
          bind: {
            startDate: (searchParams.startDate) ? searchParams.startDate : null,
            endDate: (searchParams.endDate) ? searchParams.endDate : null
          },
          type: QueryTypes.SELECT
        });

        const inCond = [...new Set(map(response, 'access_number'))].map(function (a) { return "'" + a + "'"; }).join(",");
        console.log('inCond',inCond)
        if(inCond && inCond.length > 0) {
          const query0 = `select concat(a.first_name, ' ', a.last_name) as account_name, c2.email , concat(c3.first_name,' ',c3.last_name) as customer_name, a.account_no,  c3.crm_customer_no, c.identification_no  from connections c left join accounts a on c.account_id =a.account_id left join contacts c2 on c2.contact_id =a.contact_id left join customers c3 on c3.customer_id =a.customer_id where c.identification_no in (${inCond})`;
          let response1 = await sequelize.query(query0, {
            bind: {
              access_number: inCond
            },
            type: QueryTypes.SELECT,
            logging: true
          });
          response.map((x) => {
            const data = response1.find((y) => y.identification_no === x.access_number)
            if (data) {
              x.account_name = data.account_name
              x.email = data.email
              x.customer_name = data.customer_name
              x.account_no = data.account_no
              x.crm_customer_no = data.crm_customer_no
            } else {
              x.account_name = ''
              x.email = ''
              x.customer_name = ''
              x.account_no = ''
              x.crm_customer_no = ''
            }
  
            return x
          })
        }
        
        const response2 = {
          count: response.length,
          rows: response,
        }
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response2)
      } else if (searchParams.flagOne === 'Monthly Visited Customers On Whatsapp') {
        const monthDates = getStartAndEndDates(searchParams.startDate)

        const cond = searchParams.flag != 'All' ? `AND service_type = '${searchParams.flag}'` : ''

        const query = `SELECT created_at, access_number, service_type, contact_number,whatsapp_number  FROM whatsapp_report_dtl WHERE 
        (created_at:: DATE >= coalesce($startDate, created_at:: DATE)
        AND created_at:: DATE <= coalesce($endDate, created_at:: DATE) ${cond}) order by created_at desc`

        const response = await sequelize.query(query, {
          bind: {
            startDate: (monthDates.startDate) ? monthDates.startDate : null,
            endDate: (monthDates.endDate) ? monthDates.endDate : null
          },
          type: QueryTypes.SELECT
        });

        const inCond = [...new Set(map(response, 'access_number'))].map(function (a) { return "'" + a + "'"; }).join(",");
        if(inCond && inCond.length > 0) {
          const query0 = `select concat(a.first_name, ' ', a.last_name) as account_name, c2.email , concat(c3.first_name,' ',c3.last_name) as customer_name, a.account_no,  c3.crm_customer_no, c.identification_no  from connections c left join accounts a on c.account_id =a.account_id left join contacts c2 on c2.contact_id =a.contact_id left join customers c3 on c3.customer_id =a.customer_id where c.identification_no in (${inCond})`;
          let response1 = await sequelize.query(query0, {
            bind: {
              access_number: inCond
            },
            type: QueryTypes.SELECT,
            logging: true
          });
          response.map((x) => {
            const data = response1.find((y) => y.identification_no === x.access_number)
            if (data) {
              x.account_name = data.account_name
              x.email = data.email
              x.customer_name = data.customer_name
              x.account_no = data.account_no
              x.crm_customer_no = data.crm_customer_no
            } else {
              x.account_name = ''
              x.email = ''
              x.customer_name = ''
              x.account_no = ''
              x.crm_customer_no = ''
            }
  
            return x
          })
        }
        const response2 = {
          count: response.length,
          rows: response,
        }
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response2)
      } else if (searchParams.flagOne === 'Monthly Created Complaints On Whatsapp') {
        const cond = searchParams.flag != 'All' ? `AND i.business_entity_code = '${searchParams.flag}'` : ''

        const query4 = `select
        i.intxn_id,
        wrd.whatsapp_number,
        c.crm_customer_no,
        concat(c.first_name, ' ', c.last_name) as customer_name,
        a.account_no,
        concat(a.first_name, ' ', a.last_name) as account_name,
        wrd.access_number,
        wrd.service_type,wrd.contact_number, c2.email, i.curr_status, i.created_at as interaction_created_date, wrd.created_at as visted_date 
      from
        interaction i
      left join whatsapp_report_dtl wrd on
        i.intxn_id = wrd.intxn_id
      left join accounts a on
        a.account_id = i.account_id
      left join customers c on
        i.customer_id = c.customer_id
      left join contacts c2 on a.contact_id =c2.contact_id 
      where
        subject = 'WHATSAPP' AND (wrd.created_at:: DATE >= coalesce($startDate, wrd.created_at:: DATE)
        AND wrd.created_at:: DATE <= coalesce($endDate, wrd.created_at:: DATE) ${cond}) order by wrd.created_at desc`

        const monthDates2 = getStartAndEndDates(searchParams.startDate)

        const response = await sequelize.query(query4, {
          bind: {
            startDate: (monthDates2.startDate) ? monthDates2.startDate : null,
            endDate: (monthDates2.endDate) ? monthDates2.endDate : null
          },
          type: QueryTypes.SELECT,
          logging: true
        })

        const response2 = {
          count: response.length,
          rows: response
        }
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response2)
      } else if (searchParams.flagOne === 'Monthly Created FollowUps On Whatsapp') {
        const cond = searchParams.flag != 'All' ? `AND i.business_entity_code = '${searchParams.flag}'` : ''

        const query4 = `select
        i.intxn_id,
        wrd.whatsapp_number,
        c.crm_customer_no,
        concat(c.first_name, ' ', c.last_name) as customer_name,
        a.account_no,
        concat(a.first_name, ' ', a.last_name) as account_name,
        wrd.access_number,
        wrd.service_type,
        wrd.contact_number,
        c2.email,
        i.curr_status,
        i.created_at as interaction_created_date,
        wrd.created_at as visted_date,
        it.flw_created_at 
      from
        interaction_txn it
      inner join interaction as i on
        i.intxn_id = it.intxn_id
      inner join whatsapp_report_dtl wrd on
        i.identification_no = wrd.access_number
      inner join accounts a on
        a.account_id = i.account_id
      inner join customers c on
        i.customer_id = c.customer_id
      inner join contacts c2 on
        a.contact_id = c2.contact_id
      where
        it.cause_code = 'WHATSAPP' 
      
      AND (flw_created_at:: DATE >= coalesce($startDate, i.created_at:: DATE)
      AND flw_created_at:: DATE <= coalesce($endDate, i.created_at:: DATE)
      ${cond}) order by wrd.created_at desc`

        const monthDates1 = getStartAndEndDates(searchParams.startDate)
        let response = await sequelize.query(query4, {
          bind: {
            startDate: (monthDates1.startDate) ? monthDates1.startDate : null,
            endDate: (monthDates1.endDate) ? monthDates1.endDate : null
          },
          type: QueryTypes.SELECT
        })

        const response2 = {
          count: response.length,
          rows: response
        }
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response2)
      }
    } catch (error) {
      logger.error(error, 'Error while fetching counts')
      return this.responseHelper.onError(res, new Error('Error while fetching counts'))
    }
  }

  async getWhatsAppReports (req, res) {
    try {
      const searchParams = req.body
      logger.debug('Getting whatsApp reports')
      let { limit = 10, page = 0, excel = false } = req.query
      let offSet = (page * limit)
      if (excel) {
        offSet = undefined
        limit = undefined
      }
      if (!searchParams) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let whereClause = {}
      if (searchParams.sessionStartFrom || searchParams.sessionEndTo) {
        if (searchParams.sessionStartFrom !== '' && searchParams.sessionEndTo !== '') {
          whereClause = {
            [Op.and]: [
              [sequelize.where(sequelize.fn('date', sequelize.col('WhatsAppReportDtl.created_date')), '>=', searchParams.sessionStartFrom)],
              [sequelize.where(sequelize.fn('date', sequelize.col('WhatsAppReportDtl.end_date')), '<=', searchParams.sessionEndTo)]
            ]
          }
        } else if (searchParams.sessionStartFrom !== '') {
          whereClause = {
            [Op.and]: [sequelize.where(sequelize.fn('date', sequelize.col('WhatsAppReportDtl.created_date')), '>=', searchParams.sessionStartFrom)]
          }
        } else if (searchParams.sessionEndTo !== '') {
          whereClause = {
            [Op.and]: [sequelize.where(sequelize.fn('date', sequelize.col('WhatsAppReportDtl.end_date')), '<=', searchParams.sessionEndTo)]
          }
        }
      }
      if (searchParams.interactionStatus && searchParams.interactionStatus !== '' && searchParams.interactionStatus !== undefined) {
        whereClause.interactionStatus = {
          [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('interactionDetails.curr_status'), 'varchar'), {
            [Op.like]: `%${searchParams.interactionStatus.toString()}%`
          })]
        }
      }
      if (searchParams.whatsappNumber && searchParams.whatsappNumber !== '' && searchParams.whatsappNumber !== undefined) {
        whereClause.whatsappNumber = {
          [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.whatsapp_number'), 'varchar'), {
            [Op.like]: `%${searchParams.whatsappNumber.toString()}%`
          })]
        }
      }
      if (searchParams.interactionId && searchParams.interactionId !== '' && searchParams.interactionId !== undefined) {
        whereClause.interactionId = {
          [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.intxn_id'), 'varchar'), {
            [Op.like]: `%${searchParams.interactionId.toString()}%`
          })]
        }
      }
      if (searchParams.contactNumber && searchParams.contactNumber !== '' && searchParams.contactNumber !== undefined) {
        whereClause.contactNumber = {
          [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.contact_number'), 'varchar'), {
            [Op.like]: `%${searchParams.contactNumber.toString()}%`
          })]
        }
      }
      if (searchParams.accessNumber && searchParams.accessNumber !== '' && searchParams.accessNumber !== undefined) {
        whereClause.accessNumber = {
          [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.access_number'), 'varchar'), {
            [Op.like]: `%${searchParams.accessNumber.toString()}%`
          })]
        }
      }
      if (searchParams.serviceType && searchParams.serviceType !== '' && searchParams.serviceType !== undefined) {
        whereClause.serviceType = {
          [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.service_type'), 'varchar'), {
            [Op.like]: `%${searchParams.serviceType.toString()}%`
          })]
        }
      }
      if (searchParams.customerName && searchParams.customerName !== '' && searchParams.customerName !== undefined) {
        const contactInfo = await Contact.findAll({
          where: {
            [Op.and]: sequelize.where(sequelize.fn('concat', sequelize.fn('UPPER', sequelize.col('Contact.first_name')), ' ',
              sequelize.fn('UPPER', sequelize.col('Contact.last_name'))), {
              [Op.like]: `%${searchParams.customerName.toUpperCase()}%`
            })
          },
          distinct: true,
          attributes: ['contactNo'],
          raw: true
        })
        const contactNos = [...new Set(map(contactInfo, 'contactNo'))]
        whereClause.contactNumber = {
          [Op.in]: contactNos
        }
      }
      if (searchParams.emailId && searchParams.emailId !== '' && searchParams.emailId !== undefined) {
        const contactInfo = await Contact.findAll({
          where: {
            [Op.and]: sequelize.where(sequelize.fn('concat', sequelize.fn('UPPER', sequelize.col('Contact.email'))), {
              [Op.like]: `%${searchParams.emailId.toUpperCase()}%`
            })
          },
          distinct: true,
          attributes: ['contactNo'],
          raw: true
        })
        const contactNos = [...new Set(map(contactInfo, 'contactNo'))]
        whereClause.contactNumber = {
          [Op.in]: contactNos
        }
      }

      if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
        for (const record of searchParams.filters) {
          if (record.value) {
            if (record.id === 'WhatsAppId') {
              whereClause.whatsappNumber = {
                [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.whatsapp_number'), 'varchar'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'contactNumber') {
              whereClause.contactNumber = {
                [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.contact_number'), 'varchar'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'accessNumber') {
              whereClause.accessNumber = {
                [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.access_number'), 'varchar'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'ineractionId') {
              whereClause.intxnId = {
                [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('WhatsAppReportDtl.intxn_id'), 'varchar'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'serviceType') {
              whereClause.serviceType = {
                [Op.and]: [sequelize.where(sequelize.fn('UPPER', sequelize.col('WhatsAppReportDtl.service_type')), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value.toUpperCase()}%`
                })]
              }
            } else if (record.id === 'interactionStatus') {
              whereClause.currStatus = {
                [Op.and]: [sequelize.where(sequelize.fn('UPPER', sequelize.col('interactionDetails.curr_status')), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value.toUpperCase()}%`
                })]
              }
            } else if (record.id === 'customerName') {
              const contactInfo = await Contact.findAll({
                where: {
                  [Op.and]: sequelize.where(sequelize.fn('concat', sequelize.fn('UPPER', sequelize.col('Contact.first_name')), ' ',
                    sequelize.fn('UPPER', sequelize.col('Contact.last_name'))), {
                    [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value.toUpperCase()}%`
                  })
                },
                distinct: true,
                attributes: ['contactNo'],
                raw: true
              })
              const contactNos = [...new Set(map(contactInfo, 'contactNo'))]
              whereClause.contactNumber = {
                [Op.in]: contactNos
              }
            } else if (record.id === 'emailId') {
              const contactInfo = await Contact.findAll({
                where: {
                  [Op.and]: sequelize.where(sequelize.fn('concat', sequelize.fn('UPPER', sequelize.col('Contact.email'))), {
                    [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value.toUpperCase()}%`
                  })
                },
                distinct: true,
                attributes: ['contactNo'],
                raw: true
              })
              const contactNos = [...new Set(map(contactInfo, 'contactNo'))]
              whereClause.contactNumber = {
                [Op.in]: contactNos
              }
            }
          }
        }
      }
      const response = await WhatsAppReportDtl.findAndCountAll({
        include: [
          { model: WhatsAppReport, as: 'whatsAppReport' },
          {
            model: Interaction,
            as: 'interactionDetails',
            attributes: ['intxnId', 'currStatus'],
            include: [
              { model: BusinessEntity, as: 'currStatusDesc', attributes: ['description'] }
            ]
          },
          { model: BusinessEntity, as: 'statusDesc', attributes: ['description'] }
          // { model: Contact, as: 'contactDetails', attributes: ['firstName', 'email'] }
        ],
        where: whereClause,
        order: [['createdAt', 'DESC']],
        offset: offSet,
        limit: excel === false ? Number(limit) : limit
      })

      if (response.count > 0) {
        const contactNos = [...new Set(map(response.rows, 'contactNumber'))]
        const contactInfo = await Contact.findAll({
          where: {
            contactNo: contactNos
          },
          distinct: true,
          attributes: ['contactId', 'contactNo', 'firstName', 'email'],
          raw: true
        })
        response.rows.map((x) => {
          for (const contact of contactInfo) {
            if (Number(contact.contactNo) === Number(x.dataValues.contactNumber)) {
              x.dataValues.customerName = contact.firstName
              x.dataValues.email = contact.email
            }
          }
          return x
        })
      }
      if (isEmpty(response)) {
        const data = {
          count: 0,
          rows: []
        }
        return this.responseHelper.onSuccess(res, 'No Records Found', data)
      }
      logger.debug('Successfully fetch whatsApp reports')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching whatsApp reports')
      return this.responseHelper.onError(res, new Error('Error while fetching whatsApp reports'))
    }
  }

  async getWhatsAppHistory (req, res) {
    try {
      const searchParams = req.body
      logger.debug('Getting whatsApp reports')
      if (!searchParams || !searchParams.reportId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await WhatsAppChatHistory.findAll({
        where: { reportId: searchParams.reportId },
        order: [['id', 'ASC']]
      })
      logger.debug('Successfully fetch whatsApp reports')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching whatsApp reports')
      return this.responseHelper.onError(res, new Error('Error while fetching whatsApp reports'))
    }
  }

  async getWhatsAppGraphDataByDay (req, res) {
    try {
      const searchParams = req.body
      if (!searchParams || !searchParams.startDate || !searchParams.endDate) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Getting whatsApp graph data by Day wise')
      const query = `select sum(Counts) as Count,to_char(created_at, 'DD-MON') as date ,service_type  from (
                    select COUNT(*)  as Counts,created_at::DATE as created_at, service_type  
                    from whatsapp_report_dtl where coalesce(created_at::DATE) between coalesce($startDate, created_at::DATE) 
                    AND coalesce($endDate, created_at::DATE) group by created_at,service_type)t 
                    group by t.created_at,t.service_type order by created_at::DATE`

      const monthDates = getStartAndEndDates(searchParams.startDate)
      let response = await sequelize.query(query, {
        bind: {
          startDate: (monthDates.startDate) ? monthDates.startDate : null,
          endDate: (monthDates.endDate) ? monthDates.endDate : null
        },
        type: QueryTypes.SELECT
      })
      response = camelCaseConversion(response)
      logger.debug('Successfully fetch whatsApp graph data by day wise')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching whatsApp graph data by day wise')
      return this.responseHelper.onError(res, new Error('Error while fetching whatsApp graph data by day wise'))
    }
  }

  async getWhatsAppGraphDataByTime (req, res) {
    try {
      const searchParams = req.body
      if (!searchParams || !searchParams.startDate) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Getting whatsApp graph data by Time wise')
      // const query = `select sum(Counts) as Count,created_at as created_at,service_type
      //                from  ( select COUNT(*)  as Counts,to_char(date_trunc('hour', created_at::time),'HH24') as created_at, service_type
      //                from whatsapp_report_dtl where coalesce(created_at::DATE) =$startDate
      //                 group by created_at,service_type) t group by t.created_at,t.service_type
      //                 order by t.created_at`

      const query = `SELECT COUNT(*) AS Counts, created_at AS start_date, service_type  
                     FROM whatsapp_report_dtl WHERE coalesce(created_at::DATE) =$startDate
                     GROUP BY created_at,service_type ORDER BY created_at`
      const response = await sequelize.query(query, {
        bind: {
          startDate: (searchParams.startDate) ? searchParams.startDate : null
        },
        type: QueryTypes.SELECT
        // //logging: true
      })
      const graphData = []
      for (const record of response) {
        const time = moment(record.start_date).format('HH')
        console.log('mome', moment(record.start_date).format('DD-MM-YYYY hh:mm:ss'))
        console.log('mome1', moment(record.start_date).format('DD-MM-YYYY HH:mm:ss'))
        const obj = {
          createdDate: record.start_date,
          createdAt: time,
          serviceType: record.service_type,
          counts: record.counts
        }
        graphData.push(obj)
      }
      logger.debug('Successfully fetch whatsApp graph data by Time wise')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, graphData)
    } catch (error) {
      logger.error(error, 'Error while fetching whatsApp graph data by Time wise')
      return this.responseHelper.onError(res, new Error('Error while fetching whatsApp graph data by Time wise'))
    }
  }

  async getWhatsAppGraphComplaintData (req, res) {
    try {
      const searchParams = req.body
      if (!searchParams || !searchParams.startDate || !searchParams.endDate) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Getting whatsApp graph Complaint data by Time wise')
      const query = `select sum(Counts) as Count,to_char(created_at, 'DD-MON') as date ,service_type  from (
                    select COUNT(*)  as Counts,created_at::DATE as created_at, business_entity_code as service_type  
                    from interaction where subject='WHATSAPP' and coalesce(created_at::DATE) between coalesce($startDate, created_at::DATE) 
                    AND coalesce($endDate, created_at::DATE) group by created_at,service_type)t 
                    group by t.created_at,t.service_type order by created_at::DATE`

      const monthDates = getStartAndEndDates(searchParams.startDate)
      console.log('monthDates', monthDates)
      let response = await sequelize.query(query, {
        bind: {
          startDate: (monthDates.startDate) ? monthDates.startDate : null,
          endDate: (monthDates.endDate) ? monthDates.endDate : null
        },
        type: QueryTypes.SELECT
      })

      response = camelCaseConversion(response)
      logger.debug('Successfully fetch whatsApp graph Complaint data by Time wise')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching whatsApp graph Complaint data by Time wise')
      return this.responseHelper.onError(res, new Error('Error while fetching whatsApp graph Complaint data by Time wise'))
    }
  }

  async getWhatsAppGraphFollowUpData (req, res) {
    try {
      const searchParams = req.body
      if (!searchParams || !searchParams.startDate || !searchParams.endDate) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Getting whatsApp graph Complaint data by Time wise')
      const query = `select sum(Counts) as Count,to_char(flw_created_at, 'DD-MON') as date ,service_type  from (
                    select COUNT(*)  as Counts,flw_created_at::DATE as flw_created_at, i.business_entity_code as service_type  
                    from interaction_txn it
                    INNER JOIN interaction AS i ON i.intxn_id =it.intxn_id 
                    where it.cause_code='WHATSAPP' and coalesce(flw_created_at::DATE) between coalesce($startDate, flw_created_at::DATE) 
                    AND coalesce($endDate, flw_created_at::DATE) group by flw_created_at,service_type)t 
                    group by t.flw_created_at,t.service_type order by flw_created_at::DATE
                    `
      const monthDates = getStartAndEndDates(searchParams.startDate)
      let response = await sequelize.query(query, {
        bind: {
          startDate: (monthDates.startDate) ? monthDates.startDate : null,
          endDate: (monthDates.endDate) ? monthDates.endDate : null
        },
        type: QueryTypes.SELECT
      })
      response = camelCaseConversion(response)
      logger.debug('Successfully fetch whatsApp graph Complaint data by Time wise')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching whatsApp graph Complaint data by Time wise')
      return this.responseHelper.onError(res, new Error('Error while fetching whatsApp graph Complaint data by Time wise'))
    }
  }
}

const getStartAndEndDates = (input) => {
  const date = input.split('-')
  const month = date[1]
  const year = date[0]
  let startDate = ''
  let endDate = ''
  if (month === '1' || month === '3' || month === '5' || month === '7' || month === '8' || month === '10' || month === '12') {
    startDate = `${year}-${month}-01`
    endDate = `${year}-${month}-31`
  } else if (month === '2') {
    startDate = `${year}-${month}-01`
    endDate = `${year}-${month}-28`
  } else if (month === '4' || month === '6' || month === '9' | month === '11') {
    startDate = `${year}-${month}-01`
    endDate = `${year}-${month}-31`
  }
  const response = {
    startDate,
    endDate
  }
  return response
}
