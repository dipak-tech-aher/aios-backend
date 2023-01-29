import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Role, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'

export class RoleService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async getRole (req, res) {
    try {
      const { id } = req.params
      logger.debug('Getting Role details by Id: ', id)
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Role.findOne({
        where: {
          roleId: id
        }
      })
      logger.debug('Successfully fetch role data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching role data')
      return this.responseHelper.onError(res, new Error('Error while fetching role data'))
    }
  }

  async createRole (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Role')
      let role = req.body
      const userId = req.userId
      if (!role) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      role = {
        ...role,
        createdBy: userId,
        updatedBy: userId
      }
      const response = await Role.create(role, { transaction: t })
      await t.commit()
      logger.debug('Role created successfully')
      return this.responseHelper.onSuccess(res, 'Role created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Role'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateRole (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating Role')
      let role = req.body
      const { id } = req.params
      const userId = req.userId
      if (!role && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const roleInfo = await Role.findOne({
        where: {
          roleId: id
        }
      })
      if (!roleInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      role = {
        ...role,
        updatedBy: userId
      }
      const response = await Role.update(role, {
        where: {
          roleId: id
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Role data updated successfully')
      return this.responseHelper.onSuccess(res, 'Role updated successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating Role data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getRoleList (req, res) {
    try {
      logger.debug('Getting Role list')
      const response = await Role.findAll({
        attributes: ['roleId', 'roleName', 'roleDesc', 'isAdmin', 'status', 'mappingPayload'],
        order: [
          ['roleId', 'ASC']
        ]
      })
      logger.debug('Successfully fetch Role data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Role data')
      return this.responseHelper.onError(res, new Error('Error while fetching Role data'))
    }
  }
}
