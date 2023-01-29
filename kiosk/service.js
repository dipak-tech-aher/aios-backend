import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Kiosk, sequelize, Interaction } from '../model'
import { defaultMessage } from '../utils/constant'
import { QueryTypes, Op } from 'sequelize'
import { camelCaseConversion } from '../utils/string'
import { isEmpty } from 'lodash'

export class KioskService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async findCutomer (req, res) {
    try {
      logger.debug('Validationg User')
      const searchParams = req.body
      if (!searchParams) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const query = `select c.first_name, c.last_name, c.customer_id, a.account_id, 
      c2.connection_id, c2.identification_no as access_number
      from customers c 
      join accounts a on c.customer_id = a.customer_id 
      join contacts c3 on c.contact_id = c3.contact_id 
      join connections c2 on a.account_id = c2.account_id 
      where c2.identification_no = coalesce($mobileNo, c2.identification_no) 
      and a.id_value = coalesce($iccid, a.id_value) 
      and a.id_value = coalesce($passport, a.id_value)`

      const cutomer = await sequelize.query(query, {
        bind: {
          mobileNo: (searchParams.mobileNo) ? Number(searchParams.mobileNo) : null,
          iccid: (searchParams.iccid) ? searchParams.iccid : null,
          passport: (searchParams.passport) ? searchParams.passport : null
        },
        type: QueryTypes.SELECT
      })
      if (!cutomer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const response = camelCaseConversion(cutomer)
      logger.debug('Successfully fetch kiosk data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch kiosk data', response)
    } catch (error) {
      logger.error(error, 'Error while fetching kiosk data')
      return this.responseHelper.onError(res, new Error('Error while fetching kiosk data'))
    }
  }

  async createKiosk (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new kiosk')
      let kiosk = req.body
      if (!kiosk) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      kiosk = {
        customerId: kiosk.customerId ? kiosk.customerId : null,
        accountId: kiosk.accountId ? kiosk.accountId : null,
        connectionId: kiosk.connectionId ? kiosk.connectionId : null,
        problemType: kiosk.problemType ? kiosk.problemType : null,
        product: kiosk.product ? kiosk.product : null,
        title: kiosk.title ? kiosk.title : null,
        firstName: kiosk.firstName,
        lastName: kiosk.lastName ? kiosk.lastName : null,
        contactNo: kiosk.contactNo ? kiosk.contactNo : null,
        usage: kiosk.usage ? kiosk.usage : null,
        speed: kiosk.speed ? kiosk.speed : null,
        payload: kiosk.payload ? kiosk.payload : null,
        status: 'AC',
        createdBy: kiosk.customerId ? kiosk.customerId : 181
      }
      const kioskData = await Kiosk.create(kiosk, { transaction: t })
      if (!kioskData) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      await t.commit()
      logger.debug('kiosk created successfully')
      return this.responseHelper.onSuccess(res, 'kiosk created successfully', kioskData)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while kiosk kiosk'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getKioskList (req, res) {
    try {
      logger.debug('Getting Kiosk list')
      const { limit = 10, page = 1, startDate, endDate } = req.query
      let where = {}
      if (startDate && endDate) {
        where = { createdAt: { [Op.between]: [startDate, endDate] } }
      }
      const response = await Kiosk.findAndCountAll({
        where,
        offset: ((page - 1) * limit),
        limit: limit
      })
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      logger.debug('Successfully fetch Kiosk list')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Kiosk list', response)
    } catch (error) {
      logger.error(error, 'Error while fetching Kiosk list')
      return this.responseHelper.onError(res, new Error('Error while fetching Kiosk list'))
    }
  }

  async getKioskById (req, res) {
    try {
      logger.debug('Getting Kiosk details by referenceNo')
      const { referenceNo } = req.params
      if (!referenceNo) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let response
      let kioskInfo = await sequelize.query(`select k.*, c.identification_no as access_number from kiosk k
                      left join connections c on k.connection_id = c.connection_id  where k.reference_no = $referenceNo`, {
        bind: {
          referenceNo
        },
        type: QueryTypes.SELECT
      })
      kioskInfo = camelCaseConversion(kioskInfo)
      if (isEmpty(kioskInfo)) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      if (kioskInfo[0].status === 'CLOSED') {
        const interaction = await Interaction.findOne({
          where: {
            kioskRefId: referenceNo
          }
        })
        response = {
          serviceRequestId: interaction.intxnId,
          status: 'CLOSED'
        }
        return this.responseHelper.onSuccess(res, 'The Kiosk reference id is closed and Linked service request id', response)
      } else {
        response = kioskInfo[0]
      }

      logger.debug('Successfully fetch Kiosk data')
      return this.responseHelper.onSuccess(res, 'Successfully fetch Kiosk data', response)
    } catch (error) {
      logger.error(error, 'Error while fetching Kiosk data')
      return this.responseHelper.onError(res, new Error('Error while fetching Kiosk data'))
    }
  }

  async assignToSelf (req, res) {
    const t = await sequelize.transaction()
    try {
      const { referenceNo } = req.params
      const { userId, roleId, department } = req
      if (!referenceNo) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const findKiosk = await Kiosk.findOne({ where: { referenceNo } })
      if (!findKiosk) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      const assignData = {
        assignedUser: userId,
        updatedBy: userId,
        assignedEntity: department,
        assignedRole: roleId
      }
      await Kiosk.update(assignData, { where: { referenceNo }, transaction: t })
      await t.commit()
      logger.debug('Successfully assigned to self')
      return this.responseHelper.onSuccess(res, 'Kiosk assigned to self')
    } catch (error) {
      logger.error(error, 'Error while assigning to self')
      return this.responseHelper.onError(res, new Error('Error while assigning to self'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async cancelKiosk (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Getting Kiosk details by referenceNo')
      const { referenceNo } = req.params
      if (!referenceNo) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Kiosk.update({ status: 'IN' }, {
        where: {
          referenceNo
        },
        transaction: t
      })
      if (!response) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      await t.commit()
      logger.debug('Successfully cancled Kiosk')
      return this.responseHelper.onSuccess(res, 'Successfully cancled Kiosk')
    } catch (error) {
      logger.error(error, 'Error while cancling Kiosk')
      return this.responseHelper.onError(res, new Error('Error while cancling Kiosk'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }
}
