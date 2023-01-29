import { UserService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'
import { validatePermission } from '../validation/permission-validator'

const userRouter = express.Router()
const userService = new UserService()

userRouter
  .post('/login', userService.login.bind(userService))
  .post('/', userService.createUser.bind(userService))
  .post('/register', userService.registerUser.bind(userService))
  .put('/approve', userService.approveNewUser.bind(userService))
  .post('/send-forgot-password-link', userService.forgotPassword.bind(userService))
  .post('/reset-password', userService.resetPassword.bind(userService))
  .get('/switch-user', validateToken, userService.getUserDepartmentAndRoles.bind(userService))
  .get('/token/:inviteToken', userService.getUserByToken.bind(userService))
  .put('/:id', validateToken, validatePermission, userService.updateUser.bind(userService))
  .get('/', validateToken, validatePermission, userService.getUserList.bind(userService))
  .get('/:id', validateToken, validatePermission, userService.getUser.bind(userService))
  .get('/get-user-by-mobile/:mobilenumber', userService.getUserByMobileNumber.bind(userService))
  .delete('/logout/:id', validateToken, userService.logout.bind(userService))
  .put('/session/:id', validateToken, userService.updateUserSession.bind(userService))
  .post('/send-otp', userService.sendOTP.bind(userService))
  .get('/verify-otp/:reference', userService.getOTP.bind(userService))
  .post('/search', validateToken, userService.getUserList.bind(userService))
  .post('/change-password', validateToken, validatePermission, userService.changePassword.bind(userService))

module.exports = userRouter
