import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Plan, PlanOffer, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'

const PLAN_TYPES = ['BASE', 'BALANCE', 'VAS']
const PROD_TYPES = ['Fixed', 'Prepaid', 'Postpaid']

export class PlanService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createPlan (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Plan')
      let plan = req.body
      const userId = req.userId
      if (!plan) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      plan = {
        ...plan,
        createdBy: userId,
        updatedBy: userId
      }
      const response = await Plan.create(plan, { transaction: t })
      await t.commit()
      logger.debug('Plan created successfully')
      return this.responseHelper.onSuccess(res, 'Plan created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Plan'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updatePlan (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating Plan')
      let plan = req.body
      const { id } = req.params
      const userId = req.userId
      if (!plan && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const planInfo = await Plan.findOne({
        where: {
          planId: id
        }
      })
      if (!planInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      plan = {
        ...plan,
        updatedBy: userId
      }
      await Plan.update(plan, {
        where: {
          planId: id
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Plan data updated successfully')
      return this.responseHelper.onSuccess(res, 'Plan updated successfully')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating Plan data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getPlan (req, res) {
    try {
      logger.debug('Getting Plan details by ID')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Plan.findOne({
        where: {
          planId: id
        }
      })
      logger.debug('Successfully fetch Plan data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Plan data')
      return this.responseHelper.onError(res, new Error('Error while fetching Plan data'))
    }
  }

  async getPlanList (req, res) {
    try {
      let planType = req.query.plantype

      if (planType && !PLAN_TYPES.includes(planType)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      } else {
        if (!planType) {
          planType = 'BASE'
        }
      }

      const prodType = req.query.prodtype

      if (prodType && !PROD_TYPES.includes(prodType)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      }

      const where = {}
      if (planType) {
        if (planType === 'BALANCE') {
          where.planType = ['TOPUP', 'BOOSTER']
        } else {
          where.planType = planType
        }
      }
      if (prodType) {
        where.prodType = prodType
      }
      where.status = 'AC'

      logger.debug('Getting Plan list')
      const response = await Plan.findAll({
        attributes: ['planId', 'prodType', 'planName', 'bandwidth', 'networkType', 'charge',
          'validity', 'planCategory', 'prodCatType', 'planType', 'planCategory'
        ],
        include: [
          {
            model: PlanOffer,
            as: 'planoffer',
            attributes: ['planOfferId', 'planId', 'quota', 'offerId', 'units', 'offerType']
          }
        ],
        where: where,
        order: [
          ['planId', 'ASC']
        ]
      })
      logger.debug('Successfully fetch Plan data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Plan data')
      return this.responseHelper.onError(res, new Error('Error while fetching Plan data'))
    }
  }
}
