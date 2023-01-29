import { CampaignService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const campaignRouter = express.Router()
const campaignService = new CampaignService()

campaignRouter
  .post('/', validateToken, validatePermission, campaignService.createCampaign.bind(campaignService))
  .post('/bulk', validateToken, validatePermission, campaignService.createCampaignBulk.bind(campaignService))
  .put('/:id', validateToken, validatePermission, campaignService.updateCampaign.bind(campaignService))
  .get('/:id', validateToken, validatePermission, campaignService.getCampaignById.bind(campaignService))
  .post('/list', validateToken, validatePermission, campaignService.getCampaignList.bind(campaignService))
  .get('/accessnumber/:id', validateToken, campaignService.getCampaignForCustomer360.bind(campaignService))
  .get('/access-nbr/:id', validateToken, campaignService.getCampaign.bind(campaignService))

module.exports = campaignRouter
