import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Notes, sequelize } from '../model'
import { defaultMessage } from '../utils/constant'

export class NotesService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async createNotes (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Creating new Notes')
      let notes = req.body
      const userId = req.userId
      if (!notes) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      notes = {
        ...notes,
        createdBy: userId
      }
      const response = await Notes.create(notes, { transaction: t })
      await t.commit()
      logger.debug('Notes created successfully')
      return this.responseHelper.onSuccess(res, 'Notes created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Notes'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateNotes (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating Notes')
      const notes = req.body
      const userId = req.userId
      const { id } = req.params
      if (!notes && !id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const notesInfo = await Notes.findOne({
        where: {
          notesId: id,
          createdBy: userId
        }
      })
      if (!notesInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const response = await Notes.update(notes, {
        where: {
          notesId: id
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Notes data updated successfully')
      return this.responseHelper.onSuccess(res, 'Notes updated successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating Notes data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getNotesList (req, res) {
    try {
      logger.debug('Getting Notes list')
      const userId = req.userId
      const response = await Notes.findAll({
        where: {
          createdBy: userId
        },
        order: [
          ['notesId', 'ASC']
        ]
      })

      logger.debug('Successfully fetch Notes data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Notes data')
      return this.responseHelper.onError(res, new Error('Error while fetching Notes data'))
    }
  }

  async deleteNotes (req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Deleting Notes')
      const userId = req.userId
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const notesInfo = await Notes.findOne({
        where: {
          notesId: id,
          createdBy: userId
        }
      })
      if (!notesInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const response = await Notes.destroy({
        where: {
          notesId: id
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Notes data deleted successfully')
      return this.responseHelper.onSuccess(res, 'Notes deleted successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while deleting Notes data'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }
}
