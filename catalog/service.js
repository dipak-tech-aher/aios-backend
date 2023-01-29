import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Plan, PlanOffer, BusinessEntity, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
import { isEmpty } from 'lodash'
import { transformCatalog } from '../transforms/customer-servicce'
import { QueryTypes } from 'sequelize'
import { camelCaseConversion } from '../utils/string'

export class CatalogService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createCatalogBulk (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Catalog')
      const reqData = req.body
      const userId = req.userId
      if (isEmpty(reqData)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let planOffers = []
      const catalog = []
      reqData.map((e) => {
        const data = transformCatalog(e)
        data.createdBy = userId
        data.status = 'AC'
        catalog.push(data)
        planOffers.push(e.planOffer)
      })

      const response = await Plan.bulkCreate(catalog, { transaction: t })
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, 'Catalogue Creation Unsuccessfull')
      }
      const planOfferList = []
      planOffers.map((o) => {
        o.map((node) => {
          response.map((plan) => {
            if (plan.dataValues.refillProfileId === node.refillId) {
              node.planId = plan.dataValues.planId
              node.createdBy = userId
              planOfferList.push(node)
            }
          })
        })
      })
      planOffers = []
      let offerResponse
      if (planOfferList.length > 0) {
        offerResponse = await PlanOffer.bulkCreate(planOfferList, { transaction: t })
        if (!offerResponse) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, 'Offer Creation Unsuccesfull')
        }
      }
      await t.commit()
      logger.debug('Catalog bulk created successfully')
      return this.responseHelper.onSuccess(res, 'Catalog bulk created successfully', offerResponse)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating catalog bulk'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async createCatalog (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Catalog')
      const catalog = req.body
      const userId = req.userId
      if (!catalog) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const data = transformCatalog(catalog)
      data.createdBy = userId
      data.status = 'AC'
      data.charge = Number(data.charge)
      const response = await Plan.create(data, { transaction: t })
      if (response) {
        if (catalog.planOffer) {
          for (const plan of catalog.planOffer) {
            delete plan.planOfferId
            plan.planId = Number(response.dataValues.planId)
            plan.createdBy = Number(userId)
            await PlanOffer.create(plan, { transaction: t })
          }
        }
      }
      await t.commit()
      logger.debug('Catalog created successfully')
      return this.responseHelper.onSuccess(res, 'Catalog created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while Catalog Catalog'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateCatalog (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Update catalog data')
      const catalog = req.body
      const { id } = req.params
      const userId = req.userId
      if (!catalog && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const catalogInfo = await Plan.findOne({
        where: {
          planId: id
        }
      })
      if (!catalogInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      const data = transformCatalog(catalog)
      data.updatedBy = userId
      await Plan.update(data, {
        where: {
          planId: id
        },
        transaction: t
      })
      if (catalog.planOffer) {
        for (let i = 0; i < catalog.planOffer.length; i++) {
          if (!catalog.planOffer[i].planId) {
            const offer = catalog.planOffer[i]
            const newOffer = {
              offerId: offer.offerId,
              quota: offer.quota,
              units: offer.units,
              offerType: offer.offerType,
              planId: id,
              createdBy: userId
            }
            await PlanOffer.create(newOffer, { transaction: t })
          } else if (catalog.planOffer[i].planId) {
            const offer = catalog.planOffer[i]
            const oldOffer = {
              offerId: offer.offerId,
              quota: offer.quota,
              units: offer.units,
              offerType: offer.offerType,
              updatedBy: userId
            }
            await PlanOffer.update(oldOffer,
              {
                where: { planOfferId: catalog.planOffer[i].planOfferId },
                transaction: t
              })
          }
        }
      }
      if (catalog.deleteOffer && Array.isArray(catalog.deleteOffer)) {
        await PlanOffer.destroy({
          where: {
            planOfferId: catalog.deleteOffer
          },
          transaction: t
        })
      }
      await t.commit()
      logger.debug('Catalog data updated successfully')
      return this.responseHelper.onSuccess(res, 'Catalog updated successfully')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating Catalog'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getCatalog (req, res) {
    try {
      logger.debug('Getting catalog details by planId')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Plan.findOne({
        attributes: ['planId', 'refPlanCode', 'prodType', 'commPackName', 'planCategory', 'planType', 'ocsDesc', 'bandwidth', 'serviceCls', 'planName', 'networkType', 'charge', 'validity', 'refillProfileId', 'planType', 'status'],
        include: [
          {
            attributes: ['planId', 'quota', 'planOfferId', 'offerId', 'units', 'offerType'],
            include: [{
              model: BusinessEntity,
              as: 'offerTypeDesc',
              attributes: ['code', 'description']
            }],
            model: PlanOffer,
            as: 'planoffer'
          },
          {
            model: BusinessEntity,
            as: 'planTypeDesc',
            attributes: ['code', 'description']
          },
          {
            model: BusinessEntity,
            as: 'prodCatTypeDesc',
            attributes: ['code', 'description']
          },
          {
            model: BusinessEntity,
            as: 'prodTypeDesc',
            attributes: ['code', 'description']
          },
          {
            model: BusinessEntity,
            as: 'networkTypeDesc',
            attributes: ['code', 'description']
          }
        ],
        where: {
          planId: id
        }
      })
      if (isEmpty(response)) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Successfully fetch catalog data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch catalog data', response)
    } catch (error) {
      logger.error(error, 'Error while fetching catalog data')
      return this.responseHelper.onError(res, new Error('Error while fetching catalog data'))
    }
  }

  async getCatalogList (req, res) {
    try {
      logger.debug('Getting catalog list')
      const { limit = 10, page = 0 } = req.query
      const catalog = req.body
      let query = `SELECT pl.prod_type, pl.plan_name, pl.ref_plan_code, pl.network_type, pl.charge, pl.validity, 
                  pl.refill_profile_id, pl.ref_plan_code, pl.plan_type, pl.status, pf.plan_id, pf.quota, pf.plan_offer_id,
                  pf.offer_id, pf.units, pf.offer_type  FROM plan AS pl  LEFT OUTER JOIN plan_offer_mapping AS pf  
                  ON pl.plan_id = pf.plan_id`
      if (catalog.filters && Array.isArray(catalog.filters) && !isEmpty(catalog.filters)) {
        const filters = searchCataloWithFilters(catalog.filters)
        if (filters !== '') {
          query = query + ' where ' + filters
        }
      }
      let count = await sequelize.query('select COUNT(*) FROM (' + query + ') t', {
        type: QueryTypes.SELECT
      })
      if (req.query.page && req.query.limit) {
        query = query + ' limit ' + limit + ' offset ' + (page * limit)
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
      logger.debug('Successfully fetch catalog list')
      return this.responseHelper.onSuccess(res, 'Successfully fetch catalog list', response)
    } catch (error) {
      logger.error(error, 'Error while fetching catalog list')
      return this.responseHelper.onError(res, new Error('Error while fetching catalog list'))
    }
  }
}
const searchCataloWithFilters = (filters) => {
  let query = ''
  for (const record of filters) {
    if (record.value) {
      if (record.id === 'planId') {
        if (record.filter === 'contains') {
          query = query + 'pl.plan_id = ' + record.value
        } else {
          query = query + 'pl.plan_id != ' + record.value
        }
      } else if (record.id === 'refillProfileId') {
        if (record.filter === 'contains') {
          query = query + ' pl.refill_profile_id Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' pl.refill_profile_id not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'tariffCode') {
        if (record.filter === 'contains') {
          query = query + ' pl.prod_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' pl.prod_type not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'bundleName') {
        if (record.filter === 'contains') {
          query = query + ' pl.plan_name Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' pl.plan_name not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'bundleCategory') {
        if (record.filter === 'contains') {
          query = query + ' pl.plan_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' pl.plan_type not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'services') {
        if (record.filter === 'contains') {
          query = query + ' pl.prod_type Ilike \'%' + record.value + '%\''
        } else {
          query = query + ' pl.prod_type not Ilike \'%' + record.value + '%\''
        }
      } else if (record.id === 'denomination') {
        if (record.filter === 'contains') {
          query = query + ' pl.charge = ' + record.value
        } else {
          query = query + ' pl.charge =' + record.value
        }
      }
      query = query + ' and '
    }
  }
  query = query.substring(0, query.lastIndexOf('and'))
  return query
}
