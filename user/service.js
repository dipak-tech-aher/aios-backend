import { logger } from '../config/logger'
import { get, isEmpty } from 'lodash'
import { ResponseHelper, CryptoHelper, EmailHelper, SMSHelper } from '../utils'
import { EmailTemplate, User, UserSession, Role, sequelize, BusinessUnit, Otp, BusinessEntity } from '../model'
import { defaultMessage } from '../utils/constant'
import { Op, QueryTypes } from 'sequelize'

import { aisoDomainURL, chatCount, chatRoleId, systemUserId, userLoginAttempts } from 'config'
const ST = require('stjs')
const generatePassword = require('generate-password')

export class UserService {
  constructor() {
    this.responseHelper = new ResponseHelper()
    this.cryptoHelper = new CryptoHelper()
    this.emailHelper = new EmailHelper()
    this.smsHelper = new SMSHelper()
  }

  async login(req, res) {
    const t = await sequelize.transaction()
    const { email, password } = req.body
    try {
      logger.debug('Authenticating user')
      let errorMesg
      if (!email) {
        errorMesg = 'Email/UserName is required'
      }
      if (!errorMesg && !password) {
        errorMesg = 'Password is required'
      }
      if (errorMesg) {
        return this.responseHelper.validationError(res, new Error(errorMesg))
      }
      let whereClauseQuery
      if (Number(email)) {
        whereClauseQuery = {
          [Op.or]: [
            { contactNo: email },
            { userId: email }
          ]
        }
      } else {
        whereClauseQuery = {
          [Op.or]: [
            { email },
            { loginid: email.toLowerCase() }
          ]
        }
      }
      const user = await User.findOne({
        where: whereClauseQuery
      })
      const locationDetails = await BusinessEntity.findOne({
        where: {
          code: user.location
        },
        raw: true,
        attributes: ['description']
      })
      if (!user) {
        logger.debug('User not found in DB')
        return this.responseHelper.notFound(res, new Error('Please enter valid Email Id/ User Id'))
      }
      if (user.status === 'IN') {
        return this.responseHelper.validationError(res, new Error('You account is In-active, please contact admin'))
      }
      if (user.expiryDate) {
        if (new Date(user.expiryDate) < new Date()) {
          return this.responseHelper.validationError(res, new Error('You account is Expired, please contact admin'))
        }
      }
      if (user.mappingPayload === null) {
        return this.responseHelper.validationError(res, new Error('No roles assigned, please contact admin'))
      } else if (user.status === 'TEMP') {
        if (password !== user.loginPassword) {
          await this.updateFailAttempts(user, t)
          return this.responseHelper.validationError(res, new Error('Incorrect password.Please check'))
        }
        const data = {
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          email: user.email,
          inviteToken: user.inviteToken
        }
        return this.responseHelper.onSuccess(res, 'Please reset your password', data)
      } else if (user.status === 'PENDING') {
        return this.responseHelper.validationError(res, new Error('You account is yet to activate by Admin, Thanks!'))
      }
      const validPassword = this.cryptoHelper.verifyHash(password, user.loginPassword)
      if (!validPassword) {
        await this.updateFailAttempts(user, t)
        return this.responseHelper.validationError(res, new Error('Incorrect password.Please check'))
      }
      let currRole; let currDept; let permissions
      let currRoleId; let currDeptId; let currRoleDesc; let currDeptDesc
      if (user.mappingPayload && user.mappingPayload.userDeptRoleMapping) {
        currRoleId = user.mappingPayload.userDeptRoleMapping[0].roleId[0]
        currDeptId = user.mappingPayload.userDeptRoleMapping[0].unitId
        const roleInfo = await Role.findOne({ where: { roleId: currRoleId } })
        if (roleInfo) {
          permissions = roleInfo.mappingPayload.permissions
          currRole = roleInfo.roleName
          currRoleDesc = roleInfo.roleDesc
        }
        const org = await BusinessUnit.findOne({ where: { unitId: currDeptId } })
        if (org) {
          currDept = org.unitName
          currDeptDesc = org.unitDesc
        }
      } else {
        t.rollback()
        logger.debug('User access missing ' + user.userId)
        return this.responseHelper.onError(res, new Error('User currently not mapped to any role.'))
      }
      const sessionData = {
        userId: user.userId,
        payload: user,
        createdBy: user.userId,
        updatedBy: user.userId,
        permissions,
        currRole,
        currRoleId,
        currDept,
        currDeptId
      }
      const session = await UserSession.create(sessionData, { transaction: t })
      const rawData = {
        userId: user.userId,
        sessionId: session.sessionId
      }
      const accessToken = this.cryptoHelper.createAccessToken(rawData)
      const response = {
        accessToken,
        user,
        currRole,
        currDept,
        currDeptId,
        currRoleId,
        currDeptDesc,
        currRoleDesc,
        permissions,
        chatCount,
        chatRoleId,
        locationDesc: locationDetails?.description || ''
      }
      if (user.loginAttempts > 0) {
        await this.resetFailAttempts(email, user.userId, t)
      }
      await t.commit()
      logger.debug('user authenticated successfully')
      return this.responseHelper.onSuccess(res, 'user authenticated successfully', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.NOT_AUTHORIZED)
        return this.responseHelper.notAuthorized(res, new Error('Incorrect username or password.Please check'))
      }
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateFailAttempts(user, t) {
    try {
      logger.debug('update login failed attempts')
      const data = {
        loginAttempts: user.loginAttempts === undefined ? 1 : user.loginAttempts + 1,
        updatedBy: user.userId
      }
      if (data.loginAttempts >= userLoginAttempts) {
        data.status = 'IN'
      }
      await User.update(data, { where: { email: user.email }, transaction: t })
      await t.commit()
    } catch (error) {
      logger.error('Error while updating login Failed Attempts')
      throw error
    }
  }

  async resetFailAttempts(email, userId, t) {
    try {
      logger.debug('Reset login failed attempts')
      const data = {
        loginAttempts: 0,
        updatedBy: userId
      }
      await User.update(data, { where: { email }, transaction: t })
    } catch (error) {
      logger.error('Error while reseting login Failed Attempts')
      throw error
    }
  }

  async logout(req, res) {
    const t = await sequelize.transaction()
    try {
      const { id } = req.params
      logger.debug('Logout user')
      await UserSession.destroy({ where: { userId: id }, transaction: t })
      await t.commit()
      logger.debug('user logout successfully')
      return this.responseHelper.onSuccess(res, 'user logout successfully')
    } catch (error) {
      logger.error(error, defaultMessage.NOT_FOUND)
      return this.responseHelper.notAuthorized(res, defaultMessage.NOT_FOUND)
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getUserByMobileNumber(req, res) {
    try {
      logger.info('Fetching user details by mobile number list')
      const { mobilenumber: mobileNumber } = req.params
      if (!mobileNumber) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let response = {}
      const user = await User.findOne({
        attributes: ['title', 'firstName', 'lastName', 'contactNo', 'icNumber', 'mappingPayload'],
        where: {
          contactNo: mobileNumber,
          waAccess: 'Y'
        }
      })
      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const roles = []
      if (user.mappingPayload && user.mappingPayload.userDeptRoleMapping) {
        for (const record of user.mappingPayload.userDeptRoleMapping) {
          const roleData = await Role.findAll({ where: { roleId: record.roleId } })
          const departments = await BusinessUnit.findOne({ where: { unitId: record.unitId } })
          for (const x of roleData) {
            const role = x.roleName
            const name = departments.unitName
            const unitType = departments.unitType
            roles.push({ name, role, unitType })
          }
        }
      }
      response = {
        userName: user.title + ' ' + user.firstName + ' ' + user.lastName,
        icNumber: (user.icNumber && user.icNumber !== null) ? user.icNumber : '',
        roles: { roles }
      }
      const data = await sequelize.query(`select c3.identification_no, email from users u2 
                    join connections c2 on c2.identification_no=cast(u2.contact_no as varchar)
                    join connections c3 on c3.account_id =c2.account_id 
                    where u2.contact_no =$phoneNo and c3.connection_type like 'CATBFL%'
                    and u2.wa_access ='Y' order by c3.identification_no LIMIT 1`, {
        bind: {
          phoneNo: mobileNumber
        },
        type: QueryTypes.SELECT
      })
      if (!isEmpty(data)) {
        response = {
          ...response,
          email: data[0].email,
          landline: data[0].identification_no
        }
      }
      logger.debug('Successfully fetch User details')
      return this.responseHelper.onSuccess(res, 'Successfully fetch user details', response)
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return this.responseHelper.notFound(res, defaultMessage.NOT_FOUND)
      } else {
        logger.error(error, defaultMessage.ERROR)
        return this.responseHelper.onError(res, new Error('Error while fething user details'))
      }
    }
  }

  async createUser(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Create new user')
      let user = req.body

      if (!user) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const userInfo = await User.findOne({ where: { email: user.email } })
      if (userInfo) {
        logger.debug(defaultMessage.CONFLICT)
        return this.responseHelper.conflict(res, new Error('Email already exist in the System'))
      }
      const inviteToken = this.cryptoHelper.createHmac(user)
      const password = generatePassword.generate({ length: 8, numbers: true })
      user = {
        ...user,
        loginPassword: password,
        status: 'TEMP',
        inviteToken,
        createdBy: systemUserId,
        updatedBy: systemUserId,
        country: 'CNTBN'
      }

      const response = await User.create(user, { transaction: t })
      if (response) {
        const template = await EmailTemplate.findOne({
          where: {
            templateName: 'User Registration',
            templateType: 'Email'
          }
        })
        if (!template) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Email template not found,Please create template'))
        }
        const data = {
          userId: response.userId,
          firstName: user.firstName,
          aisoDomainURL,
          email: user.email,
          loginPassword: password
        }
        const htmlContent = ST.select(data).transformWith(template.body).root()
        const inviteToken = await this.emailHelper.sendMail({
          to: [user.email],
          subject: template.subject,
          message: htmlContent
        })
        response.dataValues.inviteToken = inviteToken
      }

      await t.commit()
      logger.debug('Successfully creates new user')
      return this.responseHelper.onSuccess(res, 'Successfully created new user', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating user'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async registerUser(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Create new user')
      let user = req.body
      if (!user) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const userInfo = await User.findOne({ where: { email: user.email } })
      if (userInfo) {
        logger.debug(defaultMessage.CONFLICT)
        return this.responseHelper.conflict(res, new Error('Email already exist in the System'))
      }
      const inviteToken = this.cryptoHelper.createHmac(user)
      const password = generatePassword.generate({ length: 8, numbers: true })
      user = {
        ...user,
        title: '  ',
        userType: 'user',
        notificationType: 'SMS',
        loginPassword: password,
        status: 'PENDING',
        inviteToken,
        createdBy: systemUserId,
        updatedBy: systemUserId
      }
      await User.create(user, { transaction: t })
      await t.commit()
      logger.debug('Successfully creates new user')
      return this.responseHelper.onSuccess(res, 'Successfully created new user')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating user'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async approveNewUser(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Create new user')
      const user = req.body
      const userId = req.userId
      if (!user) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const userInfo = await User.findOne({ where: { userId: user.userId } })
      if (!userInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const data = {
        activationDate: user.activationDate === '' ? null : get(user, 'activationDate', null),
        expiryDate: user.expiryDate === '' ? null : get(user, 'expiryDate', null),
        adminRemark: user.adminRemark,
        updatedBy: userId,
        status: user.status === 'Active' || user.status === 'PENDING' ? 'TEMP' : 'IN',
        mappingPayload: user.mappingPayload === null ? null : user.mappingPayload
      }
      const response = await User.update(data, { where: { userId: user.userId }, transaction: t })
      if (response) {
        const template = await EmailTemplate.findOne({
          where: {
            templateName: 'User Registration',
            templateType: 'Email'
          }
        })
        if (!template) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Email template not found,Please create template'))
        }
        const data = {
          userId: user.userId,
          firstName: user.firstName,
          aisoDomainURL,
          email: user.email,
          loginPassword: userInfo.loginPassword
        }
        const htmlContent = ST.select(data).transformWith(template.body).root()
        await this.emailHelper.sendMail({
          to: [user.email],
          subject: template.subject,
          message: htmlContent
        })
      }
      await t.commit()
      logger.debug('Successfully approved new user')
      return this.responseHelper.onSuccess(res, 'Successfully approved new user', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while approving user'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateUser(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('updating user details')
      const user = req.body
      const { id } = req.params
      const userId = req.userId
      if (!id && !user) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      // if (isNaN(user.contactNo)) {
      //   return this.responseHelper.validationError(res, new Error('Entered contact No is not a number'))
      // }
      // user.contactNo = Number(user.contactNo)

      // Numbers in contact number field with min and max 7-digit value
      // if (user.contactNo.toString().length > 7) {
      //   return this.responseHelper.unprocessibleEntity(res, new Error('Please a enter valid contact number'))
      // }
      const userInfo = await User.findOne({ where: { userId: id } })
      if (!userInfo) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      user.updatedBy = userId
      user.loginPassword = userInfo.loginPassword
      user.email = userInfo.email
      user.profilePicture = user.image || null,
      user.gender = user.gender
      await User.update(user, { where: { userId: id }, transaction: t })
      await t.commit()
      logger.debug('Successfully updated user details')
      return this.responseHelper.onSuccess(res, 'Successfully updated user details')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating user details'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async changePassword(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Requesting for change of Password')
      const { oldPassword, password, confirmPassword } = req.body
      if (!oldPassword && !password && !confirmPassword) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      if (password !== confirmPassword) {
        return this.responseHelper.validationError(res, new Error('Password do not match'))
      }
      const userId = req.userId
      const user = await User.findOne({
        where: {
          userId
        }
      })
      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }



      const validPassword = this.cryptoHelper.verifyHash(oldPassword, user.loginPassword)
      if (!validPassword) {
        return this.responseHelper.validationError(res, new Error('Old password does not match'))
      }
      const hashPassword = this.cryptoHelper.hashPassword(password)
      const data = {
        userId: user.userId,
        updatedBy: userId,
        loginPassword: hashPassword
      }
      await User.update(data, {
        where: {
          userId
        },
        transaction: t
      })
      await t.commit()
      logger.debug('Change Password Request was successful')
      return this.responseHelper.onSuccess(res, 'Change Password Request was successful')
    } catch (error) {
      logger.error(error, 'Error while changing password')
      return this.responseHelper.onError(res, new Error('Error while changing password'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getUser(req, res) {
    try {
      logger.debug('Fetching user details by id')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const user = await User.findOne({
        attributes: ['mappingPayload', 'userId', 'contactNo', 'email', 'userType', 'photo', 'title', 'firstName', 'lastName',
          'gender', 'dob', 'officeNo', 'extn', 'notificationType', 'biAccess', 'waAccess', 'status', 'location', 'country',
          'icNumber', 'profilePicture', 'adminRemark', 'activationDate', 'expiryDate'],
        include: [
          { model: BusinessEntity, as: 'locationDet', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'userTypeDet', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'countryDet', attributes: ['code', 'description'] }
        ],
        where: { userId: id }
      })
      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      logger.debug('Successfully fetched user details')
      return this.responseHelper.onSuccess(res, 'Successfully fetched user details', user)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while fetching user details'))
    }
  }

  async getUserList(req, res) {
    try {
      logger.debug('Fetching user list')
      const searchParams = req.body
      if (!searchParams) {
        return this.responseHelper.validationError(
          res,
          new Error(defaultMessage.MANDATORY_FIELDS_MISSING)
        )
      }
      let { limit = 10, page = 0, source, excel = false } = req.query
      let offSet = (page * limit)
      if (excel) {
        offSet = undefined
        limit = undefined
      }
      const whereClause = {}
      if (source === 'NEW') {
        whereClause.status = 'PENDING'
      }
      if (searchParams.filters && Array.isArray(searchParams.filters) && !isEmpty(searchParams.filters)) {
        for (const record of searchParams.filters) {
          if (record.value) {
            if (record.id === 'userId') {
              whereClause.userId = {
                [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('User.user_id'), 'varchar'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value.toString()}%`
                })]
              }
            } else if (record.id === 'firstName') {
              whereClause.firstName = {
                [Op.and]: [sequelize.where(sequelize.col('User.first_name'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'lastName') {
              whereClause.lastName = {
                [Op.and]: [sequelize.where(sequelize.col('User.last_name'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'email') {
              whereClause.email = {
                [Op.and]: [sequelize.where(sequelize.col('User.email'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value}%`
                })]
              }
            } else if (record.id === 'contactNo') {
              whereClause.contactNo = {
                [Op.and]: [sequelize.where(sequelize.cast(sequelize.col('User.contact_no'), 'varchar'), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value.toString()}%`
                })]
              }
            } else if (record.id === 'userType') {
              whereClause.userType = {
                [Op.and]: [sequelize.where(sequelize.fn('UPPER', sequelize.col('User.user_type')), {
                  [record.filter === 'contains' ? Op.like : Op.notLike]: `%${record.value.toUpperCase()}%`
                })]
              }
            }
          }
        }
      }
      const user = await User.findAndCountAll({
        attributes: ['mappingPayload', 'userId', 'contactNo', 'email', 'userType', 'photo', 'title', 'firstName', 'lastName',
          'gender', 'dob', 'officeNo', 'extn', 'notificationType', 'biAccess', 'waAccess', 'status', 'location', 'country',
          'icNumber', 'profilePicture', 'adminRemark', 'activationDate', 'expiryDate'],
        include: [
          { model: BusinessEntity, as: 'locationDet', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'userTypeDet', attributes: ['code', 'description'] },
          { model: BusinessEntity, as: 'countryDet', attributes: ['code', 'description'] }
        ],
        where: whereClause,
        order: [
          ['firstName', 'ASC']
        ],
        offset: offSet,
        limit: excel === false ? Number(limit) : limit
      })
      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      logger.debug('Successfully fetched user list')
      return this.responseHelper.onSuccess(res, 'Successfully fetched user list', user)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while fetching user list'))
    }
  }

  async forgotPassword(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Requesting for change of Password')
      const { email } = req.body

      if (!email) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let whereClauseQuery
      if (Number(email)) {
        whereClauseQuery = {
          [Op.or]: [
            { contactNo: email },
            { userId: email }
          ]
        }
      } else {
        whereClauseQuery = {
          [Op.or]: [
            { email },
            { loginid: email.toLowerCase() }
          ]
        }
      }
      const user = await User.findOne({ where: whereClauseQuery })

      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const hashPassword = generatePassword.generate({ length: 8, numbers: true })
      // const oneTimePassword = this.cryptoHelper.hashPassword(hashPassword)
      const forgotPasswordToken = this.cryptoHelper.createHmac(user)
      const data = {
        userId: user.userId,
        inviteToken: forgotPasswordToken,
        updatedBy: user.userId,
        loginPassword: hashPassword,
        status: 'TEMP'
      }

      const response = await User.update(data, { where: whereClauseQuery, transaction: t })
      if (response) {
        const template = await EmailTemplate.findOne({
          where: { templateName: 'Forgot Password', templateType: 'Email' }
        })
        if (!template) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Email template not found,Please create template'))
        }
        const data = {
          firstName: user.firstName,
          aisoDomainURL,
          email: user.email,
          hashPassword: hashPassword,
          forgotPasswordToken
        }
        const htmlContent = ST.select(data).transformWith(template.body).root()
        await this.emailHelper.sendMail({
          to: [user.email],
          subject: template.subject,
          message: htmlContent
        })
      }
      await t.commit()
      logger.debug('Check your email for a link to reset your password. If it doesn’t appear within a few minutes, check your spam folder.')
      return this.responseHelper.onSuccess(res, 'Check your email for a link to reset your password. If it doesn’t appear within a few minutes, check your spam folder.')
    } catch (error) {
      logger.error(error, 'Error while changing password')
      return this.responseHelper.onError(res, new Error('Error while changing password'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async resetPassword(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Into setting the reset password change')
      const { email, oldPassword, password, confirmPassword, forceChangePwd } = req.body
      if (!password || !confirmPassword || !oldPassword || !email) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      if (password !== confirmPassword) {
        return this.responseHelper.validationError(res, new Error('Password do not match'))
      }
      if (oldPassword === confirmPassword) {
        return this.responseHelper.validationError(res, new Error('New password can not be same as old password'))
      }
      const user = await User.findOne({ where: { email } })
      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      if (user && user.loginPassword === null) {
        return this.responseHelper.validationError(res, new Error('Your change password has been expired'))
      }
      let validPassword
      if (forceChangePwd) {
        validPassword = oldPassword === user.loginPassword
      } else {
        validPassword = this.cryptoHelper.verifyHash(oldPassword, user.loginPassword)
      }
      if (!validPassword) {
        await this.updateFailAttempts(user, t)
        return this.responseHelper.validationError(res, new Error('One Time Password Does not Match'))
      }
      // To generate hash new password
      const hashPassword = this.cryptoHelper.hashPassword(password)
      const data = {
        updatedBy: user.userId,
        loginPassword: hashPassword,
        inviteToken: null,
        status: 'ACTIVE'
      }
      await User.update(data, { where: { email }, transaction: t })
      await t.commit()
      logger.debug('successfully set the reset password change')
      return this.responseHelper.onSuccess(res, 'successfully set the reset password change')
    } catch (error) {
      logger.error(error, 'Error while setting password')
      this.responseHelper.onError(res, new Error('Error while setting password'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateUserSession(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating the user session details')
      const reqbody = req.body
      const userId = req.userId
      const id = req.params
      if (userId !== id && !reqbody) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const role = await Role.findOne({
        where: {
          roleId: reqbody.currRoleId
        }
      })
      if (!role) {
        logger.debug('Role not found in DB')
        return this.responseHelper.notFound(res, 'Role not found')
      }
      let response = {}
      if (role.mappingPayload && role.mappingPayload.permissions && role.mappingPayload.permissions.length > 0) {
        const permissions = role.mappingPayload.permissions
        const data = {
          ...reqbody,
          updatedBy: userId,
          permissions
        }
        response = await UserSession.update(data, { where: { userId }, transaction: t })
        response = {
          ...response,
          permissions
        }
      }
      await t.commit()
      logger.debug('User Session data updated successfully')
      return this.responseHelper.onSuccess(res, 'User Session data updated successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while updating user session details'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getUserByToken(req, res) {
    try {
      const { inviteToken } = req.params
      logger.debug('Get user by token')
      const user = await User.findOne({
        where: {
          inviteToken
        }
      })
      if (!user) {
        return this.responseHelper.validationError(res, new Error('INVALID_TOKEN'))
      }
      const response = {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        gender: user.gender,
        inviteToken: user.inviteToken
      }
      logger.debug('Successfully fetched user detail by invite token')
      this.responseHelper.onSuccess(res, 'Successfully fetched token details', response)
    } catch (error) {
      logger.error('Error while fetching user by invite token ', error)
      this.responseHelper.onError(res, new Error('Error while fetching user by invite token '))
    }
  }

  async getUserDepartmentAndRoles(req, res) {
    try {
      logger.debug('Getting user departments and roles list  by user id')
      const userId = req.userId
      const user = await User.findOne({
        attributes: ['userId', 'mappingPayload'],
        where: { userId }
      })
      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const response = []
      if (user.mappingPayload && Array.isArray(user.mappingPayload.userDeptRoleMapping)) {
        for (const role of user.mappingPayload.userDeptRoleMapping) {
          const roles = await Role.findAll({
            attributes: ['roleId', 'roleName', 'roleDesc'],
            where: {
              roleId: role.roleId
            }
          })
          const department = await BusinessUnit.findOne({
            attributes: ['unitId', 'unitName', 'unitDesc', 'unitType'],
            where: {
              unitId: role.unitId
            }
          })
          if (department) {
            const unitId = department.unitId
            const unitName = department.unitName
            const unitType = department.unitType
            const unitDesc = department.unitDesc
            response.push({ unitId, unitName, unitType, unitDesc, roles })
          }
        }
      }
      logger.debug('Successfully fetched user departments and roles list')
      return this.responseHelper.onSuccess(res, 'Successfully fetched user departments and roles list', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while fetching user departments and roles list  by user id'))
    }
  }

  async sendOTP(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Into sending otp')

      const { type, source } = req.query
      const { reference, firstName } = req.body
      if (!reference || !type || !firstName) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      if (type === 'mobile' && source === 'REGISTER') {
        const isExist = await User.findOne({
          where: { contactNo: reference }
        })
        if (isExist) {
          logger.debug(defaultMessage.CONFLICT)
          return this.responseHelper.conflict(res, new Error('Mobile number already exist in the System'))
        }
      } else if (type === 'email' && source === 'REGISTER') {
        const isExist = await User.findOne({
          where: { email: reference }
        })
        if (isExist) {
          logger.debug(defaultMessage.CONFLICT)
          return this.responseHelper.conflict(res, new Error('Email already exist in the System'))
        }
      }
      const response = await Otp.findAll({
        where: { reference: reference }
      })
      if (response) {
        await Otp.update({ status: 'INACTIVE' }, {
          where: { reference: reference }
        })
      }
      const OTP = Math.floor(100000 + Math.random() * 900000)
      const newOTP = {
        otp: OTP,
        reference: reference,
        status: 'ACTIVE'
      }
      const responseNEW = await Otp.create(newOTP, { transaction: t })
      if (responseNEW) {
        const template = await EmailTemplate.findOne({
          where: {
            templateName: type === 'email' ? 'Email OTP' : 'SMS To User',
            templateType: type === 'email' ? 'Email' : 'SMS'
          }
        })
        if (!template) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error('Email template not found,Please create template'))
        }
        const data = { firstName, reference, OTP, aisoDomainURL }
        const htmlContent = ST.select(data).transformWith(template.body).root()
        if (type === 'email') {
          await this.emailHelper.sendMail({
            to: reference,
            subject: template.subject.replace('{{OTP}}', OTP),
            message: htmlContent
          })
        } else if (type === 'mobile') {
          await this.smsHelper.sendSMS({
            to: reference,
            subject: template.subject.replace('{{OTP}}', OTP),
            message: htmlContent
          })
        }
      }
      await t.commit()
      logger.debug('otp created successfully')
      return this.responseHelper.onSuccess(res, 'otp created successfully')
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating otp'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async getOTP(req, res) {
    try {
      logger.debug('Into sending otp')

      const { reference } = req.params

      if (!reference) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Otp.findOne({
        where: {
          reference: reference,
          status: 'ACTIVE'
        }
      })
      logger.debug('Successfully fetch otp data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching otp data')
      return this.responseHelper.onError(res, new Error('Error while fetching otp data'))
    }
  }
}
