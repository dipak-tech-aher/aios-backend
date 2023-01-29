import { ConfigService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const configRouter = express.Router()
const configService = new ConfigService()

configRouter
  .post('/', configService.createConfig.bind(configService))
  .get('/', configService.getConfig.bind(configService))
  .get('/modules', validateToken, configService.getModuleScreens.bind(configService))

module.exports = configRouter
