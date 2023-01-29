import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Campaign, Connection, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
import { isEmpty } from 'lodash'
import { QueryTypes } from 'sequelize'
import { camelCaseConversion } from '../utils/string'
import moment from 'moment'
export class CampaignService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createCampaign (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Campaign')
      let campaign = req.body
      const userId = req.userId
      const validateServiceNo = await Connection.findOne({
        where: {
          identificationNo: campaign.serviceNo
        }
      })
      if (!validateServiceNo) {
        return this.responseHelper.notFound(res, new Error('Access Number not found'))
      }

      const sql = "select c.identification_no, i.wo_type  from connections c join interaction i on i.identification_no = c.identification_no where i.wo_type = 'TERMINATE' and c.identification_no like " + '\'' + campaign.serviceNo + '\''

      const result = await sequelize.query(sql, { type: QueryTypes.SELECT })

      if (result.length > 0) {
        return this.responseHelper.notFound(res, new Error('Access Number not valid'))
      }
      const campaignInfo = await Campaign.findAll({
        where: {
          campName: campaign.campName,
          campDescription: campaign.campDescription,
          serviceNo: campaign.serviceNo
        }
      })
      if (campaignInfo) {
        let found = false
        for (const campaignValue in campaignInfo) {
          if (moment(moment(campaign.validFrom).format('DD MMM YYYY')).isSameOrAfter(moment(campaignInfo[campaignValue].dataValues.validFrom).format('DD MMM YYYY')) &&
            moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrBefore(moment(campaignInfo[campaignValue].dataValues.validTo).format('DD MMM YYYY'))
          ) {
            found = true
            break
          } else if (moment(moment(campaign.validFrom).format('DD MMM YYYY')).isSameOrBefore(moment(campaignInfo[campaignValue].dataValues.validTo).format('DD MMM YYYY')) &&
          moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrAfter(moment(campaignInfo[campaignValue].dataValues.validFrom).format('DD MMM YYYY'))
          ) {
            found = true
            break
          } else if (moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrAfter(moment(campaignInfo[campaignValue].dataValues.validFrom).format('DD MMM YYYY')) &&
            moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrBefore(moment(campaignInfo[campaignValue].dataValues.validTo).format('DD MMM YYYY'))
          ) {
            found = true
            break
          }
        }
        if (found === true) {
          return this.responseHelper.conflict(res, new Error('Record already exists'))
        }
      }

      campaign = {
        ...campaign,
        createdBy: userId,
        updatedBy: userId
      }
      const response = await Campaign.create(campaign, { transaction: t })
      await t.commit()
      logger.debug('Campaign created successfully')
      return this.responseHelper.onSuccess(res, 'Campaign created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Campaign'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async createCampaignBulk (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating bulk Campaigns')
      const campaign = req.body
      const userId = req.userId
      if (isEmpty(campaign)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      campaign.map((e) => {
        e.createdBy = userId
        e.updatedBy = userId
      })
      const response = await Campaign.bulkCreate(campaign, { transaction: t })
      await t.commit()
      logger.debug('Bulk Campaigns created successfully')
      return this.responseHelper.onSuccess(res, 'Bulk Campaigns created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating campaign, Please Enter Correct Data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateCampaign (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Update campaign data')
      let campaign = req.body
      const { id } = req.params
      const userId = req.userId
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const validateServiceNo = await Connection.findOne({
        where: {
          identificationNo: campaign.serviceNo
        }
      })
      if (!validateServiceNo) {
        return this.responseHelper.notFound(res, new Error('Access Number not found'))
      }

      const sql = "select c.identification_no, i.wo_type  from connections c join interaction i on i.identification_no = c.identification_no where i.wo_type = 'TERMINATE' and c.identification_no like " + '\'' + campaign.serviceNo + '\''

      const result = await sequelize.query(sql, { type: QueryTypes.SELECT })

      if (result.length > 0) {
        return this.responseHelper.notFound(res, new Error('Access Number not valid'))
      }
      const campaignInfo = await Campaign.findAll({
        where: {
          campName: campaign.campName,
          campDescription: campaign.campDescription,
          serviceNo: campaign.serviceNo
        }
      })
      if (campaignInfo) {
        let found = false
        for (const campaignValue in campaignInfo) {
          if (campaignInfo.length === 1) {
            found = false
            break
          }
          if (moment(moment(campaign.validFrom).format('DD MMM YYYY')).isSameOrAfter(moment(campaignInfo[campaignValue].dataValues.validFrom).format('DD MMM YYYY')) &&
            moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrBefore(moment(campaignInfo[campaignValue].dataValues.validTo).format('DD MMM YYYY'))
          ) {
            found = true
            break
          } else if (moment(moment(campaign.validFrom).format('DD MMM YYYY')).isSameOrBefore(moment(campaignInfo[campaignValue].dataValues.validTo).format('DD MMM YYYY')) &&
          moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrAfter(moment(campaignInfo[campaignValue].dataValues.validFrom).format('DD MMM YYYY'))
          ) {
            found = true
            break
          } else if (moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrAfter(moment(campaignInfo[campaignValue].dataValues.validFrom).format('DD MMM YYYY')) &&
              moment(moment(campaign.validTo).format('DD MMM YYYY')).isSameOrBefore(moment(campaignInfo[campaignValue].dataValues.validTo).format('DD MMM YYYY'))
          ) {
            found = true
            break
          }
        }
        if (found === true) {
          return this.responseHelper.conflict(res, new Error('Record already exists'))
        }
      }

      const existingCampaignInfo = await Campaign.findOne({
        where: {
          campId: id
        }
      })
      if (!existingCampaignInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      campaign = {
        ...campaign,
        updatedBy: userId
      }
      await Campaign.update(campaign, {
        where: {
          campId: id
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Campaign data updated successfully')
      return this.responseHelper.onSuccess(res, 'Campaign updated successfully')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating Campaign'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getCampaignList (req, res) {
    try {
      logger.debug('Getting campaign list')
      const { limit = 10, page = 0 } = req.query
      const { allNames } = req.query
      if (allNames) {
        const reponseAllNames = await Campaign.findAll({ attributes: ['campName', 'campDescription', 'serviceNo', 'validFrom', 'validTo'] })
        logger.debug('Successfully fetch campaign ')
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, reponseAllNames)
      }
      const campaign = req.body
      let query = `select c.*, concat(u.first_name ,' ',u.last_name) from campaign as c 
                   left join users u on c.created_by = u.user_id`
      if (campaign.filters && Array.isArray(campaign.filters) && !isEmpty(campaign.filters)) {
        const filters = searchCampaignWithFilters(campaign.filters)
        if (filters !== '') {
          query = query + ' where ' + filters
        }
      }
      let count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
        type: QueryTypes.SELECT
      })
      if (req.query.page && req.query.limit) {
        query = query + ' order by c.created_at DESC ' + ' limit ' + limit + ' offset ' + (page * limit)
      }
      let rows = await sequelize.query(query, {
        type: QueryTypes.SELECT
      })
      rows = camelCaseConversion(rows)

      if (count.length > 0) {
        count = count[0].count
      }
      const response = {
        rows,
        count
      }
      logger.debug('Successfully fetch campaign list')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching campaign list')
      return this.responseHelper.onError(res, new Error('Error while fetching campaign list'))
    }
  }

  async getCampaignById (req, res) {
    try {
      logger.debug('Getting Campaign details by id')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Campaign.findOne({
        attributes: ['campId', 'campName', 'campDescription', 'validFrom', 'validTo', 'serviceNo', 'campValidity', 'createdAt'],
        where: {
          campId: id
        }
      })
      if (isEmpty(response)) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Successfully fetch Campaign data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Campaign data', response)
    } catch (error) {
      logger.error(error, 'Error while fetching Campaign data')
      return this.responseHelper.onError(res, new Error('Error while fetching Campaign data'))
    }
  }

  async getCampaign (req, res) {
    try {
      logger.debug('Getting Campaign details by Service No')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Campaign.findAll({
        attributes: ['campId', 'campName', 'campDescription', 'validFrom', 'validTo', ['service_no', 'accessNumber']],
        where: {
          serviceNo: id
        }
      })
      if (isEmpty(response)) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Successfully fetch Campaign data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Campaign data', response)
    } catch (error) {
      logger.error(error, 'Error while fetching Campaign data')
      return this.responseHelper.onError(res, new Error('Error while fetching Campaign data'))
    }
  }

  async getCampaignForCustomer360 (req, res) {
    try {
      const query = `select * from campaign c 
   left join connections c2 on trim(c.service_no)=trim(c2.identification_no)
   where c2.connection_id =$searchInput and c.valid_to::date >= current_date`

      const response = await sequelize.query(query, {
        bind: {
          searchInput: req.params.id
        },
        type: QueryTypes.SELECT
      })

      return this.responseHelper.onSuccess(res, 'Success', response)
    } catch (error) {
      logger.error(error, 'Error while fetching Campaign data')
      return this.responseHelper.onError(res, error)
    }
  }
}

const searchCampaignWithFilters = (filters) => {
  let query = ''
  for (const record of filters) {
    if (record.value) {
      if (record.id === 'campaignName') {
        if (record.filter === 'contains') {
          query = query + ' camp_name Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' camp_name not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'campaignDescription' && record.value) {
        if (record.filter === 'contains') {
          query = query + ' camp_description Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' camp_description not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'accessNumber') {
        if (record.filter === 'contains') {
          query = query + ' service_no Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' service_no not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'validFrom') {
        if (record.filter === 'contains') {
          query = query + ' valid_from = \'' + record.value + '\''
        } else {
          query = query + ' valid_from != \'' + record.value + '\''
        }
      } else if (record.id === 'validTo') {
        if (record.filter === 'contains') {
          query = query + ' valid_to = \'' + record.value + '\''
        } else {
          query = query + ' valid_to != \'' + record.value + '\''
        }
      }
      query = query + 'and '
    }
  }
  query = query.substring(0, query.lastIndexOf('and'))
  return query
}
