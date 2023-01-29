import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Attachment, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'
const { uuid } = require('uuidv4')

export class AttachmentService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createAttachment (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Creating attachemts')
      const attachemts = req.body
      const userId = req.userId
      if (!attachemts) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = []
      if (Array.isArray(attachemts)) {
        for (let attachemt of attachemts) {
          // create a uuid for temp entity id
          const entityId = uuid()
          attachemt = {
            ...attachemt,
            entityId,
            status: 'TEMP',
            createdBy: userId,
            updatedBy: userId
          }
          const data = await Attachment.create(attachemt, { transaction: t })
          if (data) {
            response.push(data)
          }
        }
      }
      await t.commit()
      logger.debug('Attachment created successfully')
      return this.responseHelper.onSuccess(res, 'Attachment created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating attachemt'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getAttachment (req, res) {
    try {
      logger.debug('Fetching attachemnt')
      const { id } = req.params
      const { 'entity-id': entityId, 'entity-type': entityType } = req.query
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const data = await Attachment.findOne({
        attributes: ['content', 'attachmentId', 'fileName'],
        where: {
          attachmentId: id,
          entityId,
          entityType
        }
      })
      if (!data) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Attachment fetched successfully')
      return this.responseHelper.onSuccess(res, 'Attachment fetched successfully', data)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error(defaultMessage.ERROR))
    }
  }

  async getAttachmentList (req, res) {
    try {
      logger.debug('Fetching attachemnt list')
      const { 'entity-id': entityId, 'entity-type': entityType } = req.query
      if (!entityId && !entityType) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const data = await Attachment.findAll({
        attributes: ['entityId', 'attachmentId', 'fileName'],
        where: {
          entityId,
          entityType
        }
      })
      if (!data) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      }
      logger.debug('Attachment list fetched successfully')
      return this.responseHelper.onSuccess(res, 'Attachment list fetched successfully', data)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error(defaultMessage.ERROR))
    }
  }

  async deleteAttachment (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Deleting attachemnt')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const resp = await Attachment.destroy({
        where: {
          attachmentId: id
        },
        transaction: t
      })
      if (resp === 0) {
        logger.debug('Attachment Not Found')
        return this.responseHelper.notFound(res, 'Attachment Not Found')
      }
      await t.commit()
      logger.debug('Attachment deleted successfully')
      return this.responseHelper.onSuccess(res, 'Attachment deleted successfully')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error(defaultMessage.ERROR))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }
}

export const findAndUpdateAttachment = async (entityId, newEntityId, entityType, t) => {
  logger.debug('Updating attachment status')
  const attachment = await Attachment.findOne({
    attributes: ['entityId', 'attachmentId'],
    where: {
      entityId,
      entityType,
      status: 'TEMP'
    }
  })
  if (attachment) {
    const data = {
      attachmentId: attachment.dataValues.attachmentId,
      status: 'FINAL',
      entityId: newEntityId
    }
    await Attachment.update(data, {
      where: {
        entityId,
        entityType
      },
      transaction: t
    })
    logger.debug('Successfully updated attachment status')
  }
}
