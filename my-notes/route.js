import { NotesService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const notesRouter = express.Router()

const notesService = new NotesService()

notesRouter
  .post('/', validateToken, validatePermission, notesService.createNotes.bind(notesService))
  .put('/:id', validateToken, validatePermission, notesService.updateNotes.bind(notesService))
  .get('/', validateToken, validatePermission, notesService.getNotesList.bind(notesService))
  .delete('/:id', validateToken, validatePermission, notesService.deleteNotes.bind(notesService))

module.exports = notesRouter
