import { ChatService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const chatRouter = express.Router()
const chatService = new ChatService()

chatRouter
  .post('/', chatService.createChat.bind(chatService))
  .post('/message', validateToken, chatService.saveChatMessages.bind(chatService))
  .get('/', validateToken, chatService.getNewChats.bind(chatService))
  .get('/monitor', validateToken, chatService.getChatMonitorCounts.bind(chatService))
  .get('/message', validateToken, chatService.getChatMessages.bind(chatService))
  .get('/assigned', validateToken, chatService.getAssignedChats.bind(chatService))
  .get('/count/new', validateToken, chatService.getNewChatCount.bind(chatService))
  .put('/', chatService.updateCustomerChatTime.bind(chatService))
  .put('/assign/:id', validateToken, chatService.assignChat.bind(chatService))
  .put('/end', validateToken, chatService.endChat.bind(chatService))
  .post('/count', validateToken, chatService.getChatCount.bind(chatService))
  .post('/search', validateToken, chatService.searchChat.bind(chatService))
  .get('/chat-per-agent', validateToken, chatService.getChatPerAgent.bind(chatService))
  .get('/loggedin-agent', validateToken, chatService.getLoggedInAgent.bind(chatService))

module.exports = chatRouter
