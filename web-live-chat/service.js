import { logger } from '../config/logger'
import { ResponseHelper, SMSHelper } from '../utils'
import { QueryTypes, Op } from 'sequelize'
import { defaultMessage } from '../utils/constant'
import { WorkflowNew, WorkflowHdr, sequelize, InboundMessages, Customer, Contact, Chat, Interaction, Helpdesk, BusinessEntity, BusinessUnit, InteractionTxn, Kiosk, WorkflowMapping, Address, AddressLookup, WorkflowTxn, ChatResponse, Otp, BoosterPlans, Plan, User, BoosterPurchase } from '../model'
import { systemUserId, sms } from 'config'
import { createNotification, createUserNotification } from '../notification/notification-service'
import { processWhatsAppStartStep, continueChatWFExecution, assignWFToEntity } from '../jobs/workflow-engine'
import {
  transformInquiry, transformComplaint
} from '../transforms/customer-servicce'
import { findAndUpdateAttachment } from '../attachments/service'
import { createLiveChat } from '../utils/livechat-sender'
import { tibco } from 'config'
import {
  mobileAddBalanceServiceImagine
} from '../tibco/tibco-utils'
const got = require('got')

const { uuid } = require('uuidv4');

export class ChatService {
  constructor() {
    this.responseHelper = new ResponseHelper();
    this.smsHelper = new SMSHelper()
  }

  async getAgentInfo(req, res) {
    try {
      logger.debug('Fetching Agent Info')
      const chatId = req?.body?.data;
      if (!chatId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage?.MANDATORY_FIELDS_MISSING))
      }
      const response = await Chat.findOne({
        include: [
          {
            model: User,
            attributes: ['firstName', 'lastName'],
            as: 'user'
          }],
        attributes: ["socketId"],
        where: { chatId: chatId }
      })
      logger.debug('Successfully fetch Agent Info')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Agent Info')
      return this.responseHelper.onError(res, new Error('Error while fetching Agent Info'))
    }
  }

  async getChatInfo(req, res) {
    try {
      logger.debug('Fetching Chat Info')
      const chatId = req?.body?.chatId;
      if (!chatId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Chat.findOne({
        where: { chatId: chatId }
      })
      logger.debug('Successfully fetch Chat Info')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Chat Info')
      return this.responseHelper.onError(res, new Error('Error while fetching Chat Info'))
    }
  }

  async addBalance(req, res) {
    const t = await sequelize.transaction()
    try {
      if (!req?.body?.payload || !req?.body?.accessNumber) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { refillId, offerId, price, productComercialName } = JSON.parse(req?.body?.payload);
      const boosterPurchasePayload = req?.body?.info;
      const { accessNumber } = JSON.parse(req?.body?.accessNumber);
      if (!boosterPurchasePayload || !refillId || !offerId || !price || !productComercialName || !accessNumber) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const unique_id = uuid();
      const boosterTopupType = 'Booster'
      const purpose = 'D'
      const balanceTxnCode = 'MA'
      const accessNumberNew = `673${accessNumber}`;
      const tibcoResponse = await mobileAddBalanceServiceImagine(
        boosterTopupType,
        unique_id,
        accessNumberNew,
        offerId,
        purpose,
        refillId,
        balanceTxnCode,
        price
      );
      const boosterPayload = {
        accessNumber: accessNumber,
        customerName: boosterPurchasePayload && boosterPurchasePayload.filter((ele) => ele?.name == 'CustomerName')[0].value?.stringValue || '',
        contactNo: accessNumber,
        emailId: boosterPurchasePayload && (boosterPurchasePayload.filter((ele) => ele?.name == 'PrimaryContactEmailAddress')[0].value?.stringValue).split(';')[0] || '',
        boosterName: productComercialName,
        purchaseDate: new Date(),
        status: 'Success',
        createdBy: 546,
        updatedBy: 546
      }
      if (tibcoResponse.status === 'failure') {
        boosterPayload.status = 'Failed';
      }
      await BoosterPurchase.create(boosterPayload, { transaction: t });
      await t.commit();
      res.json(tibcoResponse)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR);
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while verifying otp'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while verifying otp'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async sendOtp(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Into sending otp');
      if (!req?.body?.reference) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const type = 'mobile';
      const { accessNumber } = JSON.parse(req?.body?.reference);
      const reference = accessNumber;
      if (!reference) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
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
      const responseNEW = await Otp.create(newOTP, { transaction: t });
      if (responseNEW) {
        if (type === 'mobile') {
          const reference1 = `+673${reference}`
          const msg = `Please enter the One-Time Password (OTP) ${OTP} to proceed with your transaction via Chat2Us. Need any help? Simply Talk2Us at 111.`
          let response = await got.get({
            url: sms.URL + '?app=' + sms.app + '&u=' + sms.u + '&h=' + sms.h + '&op=' +
              sms.op + '&to=' + reference1 + '&msg=' + encodeURI(msg),
            retry: 0
          });
          if (!response?.body) {
            logger.debug(defaultMessage.NOT_FOUND);
            return res.json(
              {
                data: {
                  status: 'FAILED',
                  message: defaultMessage.NOT_FOUND
                }
              })
            // return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND));
          }
          response = JSON.parse(response.body);
        }
      }
      await t.commit();
      logger.debug('otp created successfully');
      return this.responseHelper.onSuccess(res, 'otp created successfully');
    } catch (error) {
      logger.error(error, defaultMessage.ERROR);
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while creating otp'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while creating otp'));
    } finally {
      if (t && !t.finished) {
        await t.rollback();
      }
    }
  }

  async validateOtp(req, res) {
    try {
      logger.debug('Into validating otp');
      if (!req?.body?.body || !req?.body?.otp) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { accessNumber } = JSON.parse(req?.body?.body);
      const { otp } = JSON.parse(req.body.otp);
      const reference = accessNumber
      if (!reference || !accessNumber || !otp) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Otp.findAll({
        where: { reference: reference, otp: otp, status: 'ACTIVE' },
        raw: true
      });
      let validationResppnse = ''
      if (response.length != 0) {
        logger.debug('otp verified successfully');
        validationResppnse = 'valid';
        await Otp.update({ status: 'INACTIVE' }, {
          where: { reference: reference }
        })
      } else {
        logger.debug('otp not verified');
        validationResppnse = 'inValid'
      }
      return this.responseHelper.onSuccess(res, validationResppnse)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while verifying otp'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while verifying otp'))
    }
  }

  async validateAccessNumber(req, res) {
    try {
      logger.debug('Getting realtime data');
      if (!req?.body?.accessNumber) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { identifier, accessNumber, senderID } = JSON.parse(req?.body?.accessNumber);
      const reqBody = {
        accessNumber: accessNumber,
        identifier: (identifier == 'Prepaid' || identifier == 'Postpaid') ? 'MOBILE' : 'FIXEDLINE',
        trackingId: senderID
      }
      if (!identifier || !accessNumber || !senderID || !reqBody) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await got.put({
        headers: { Authorization: 'Basic ' + Buffer.from('Aios' + ':' + '$Tibc0@Aios$').toString('base64') },
        // headers: { 'content-type': 'application/json', authorization: '' },
        url: tibco?.customerAPIEndPoint + tibco?.customerSummaryAPI,
        body: JSON.stringify(reqBody),
        retry: 0
      })
      logger.debug('Successfully fetched realtime data');
      if (!response || !response?.body) {
        logger.debug(defaultMessage.NOT_FOUND)
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.NOT_FOUND
            }
          })
        // return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      return res.json(JSON.parse(response.body))
    } catch (error) {
      logger.error(error, 'Error while fetching realtime data')
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while fetching realtime data'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while fetching realtime data'))
    }
  }

  async validateIcNumber(req, res) {
    try {
      const dbIcNumber = req?.body?.payload;
      if (!req?.body?.enteredIcNumber) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { icNumber } = JSON.parse(req?.body?.enteredIcNumber);
      if (!icNumber && !dbIcNumber) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let validationResponse = '';
      if ((dbIcNumber != '' && icNumber != '') && (dbIcNumber != null && icNumber != null) && (dbIcNumber && icNumber) && (dbIcNumber).trim() == icNumber.trim()) {
        validationResponse = 'valid'
      } else {
        validationResponse = 'Invalid'
      }
      return res.json(validationResponse)
    } catch (error) {
      logger.error(error, 'Error while validating ic number');
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while validating ic number'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while validating ic number'))
    }
  }

  async getCustomerSummary(req, res) {
    try {
      logger.debug('Getting realtime data')
      const { identifier, accessNumber, senderID } = req.body
      const reqBody = {
        accessNumber: accessNumber,
        identifier: (identifier == 'Prepaid' || identifier == 'Postpaid') ? 'MOBILE' : 'FIXEDLINE',
        trackingId: senderID
      }
      if (!identifier || !accessNumber || !senderID || !reqBody) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await got.put({
        headers: { Authorization: 'Basic ' + Buffer.from('Aios' + ':' + '$Tibc0@Aios$').toString('base64') },
        // headers: { 'content-type': 'application/json', authorization: '' },
        url: tibco.customerAPIEndPoint + tibco.customerSummaryAPI,
        body: JSON.stringify(reqBody),
        retry: 0
      })

      logger.debug('Successfully fetched realtime data')
      if (!response || !response?.body) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      res.json(JSON.parse(response.body))
    } catch (error) {
      logger.error(error, 'Error while fetching realtime data')
      return this.responseHelper.onError(res, new Error('Error while fetching realtime data'))
    }
  }

  async checkCustomerExistance(req, res) {
    try {
      logger.debug('Getting Whatsapp Customer details by mobile number')
      const { contactNo } = req?.body
      if (!contactNo) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const customer = await Customer.findOne({
        include: [
          {
            model: Contact,
            as: 'contact',
            where: { contactNo: contactNo }
          }
        ]
      })
      if (!customer) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.onSuccess(res, new Error('Customer not found'))
      } else {
        logger.debug('Successfully fetch customer data')
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customer)
      }
    } catch (error) {
      logger.error(error, 'Error while fetching Customer data')
      return this.responseHelper.onError(res, new Error('Error while fetching Customer data'))
    }
  }

  async inboundMsg(req, res) {
    try {
      logger.debug('Getting Inbound msges')
      const { waId } = req?.body
      if (!waId) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const inboundMsgData = await InboundMessages.findOne({
        attributes: ['body', 'profile_name'],
        where: { waId: waId, status: { [Op.ne]: 'CLOSED' }, smsStatus: 'received' },
        order: [
          ['inboundId', 'DESC']
        ]
      })

      if (!inboundMsgData) {
        logger.debug(defaultMessage.NOT_FOUND);
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.NOT_FOUND
            }
          })
        // return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      logger.debug('Successfully fetch inbound msg data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, inboundMsgData)
    } catch (error) {
      logger.error(error, 'Error while fetching inbound msg data')
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while fetching inbound msg data'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while fetching inbound msg data'))
    }
  }

  async checkWhatsAppCustomerExistance(req, res) {
    if (req?.body?.body != "hi") { // Website Chat
      const t = await sequelize.transaction();
      try {
        if (!req.body.body) {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
        const { userName, userEmail, senderID } = JSON.parse(req.body.body)
        if (!senderID) {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
        logger.debug('Checking customer is already exist or not')
        const customer = await Customer.findOne({
          include: [
            {
              model: Contact,
              as: 'contact',
              where: { contactNo: senderID }
            }
          ]
        })
        if (!customer) {
          logger.debug('customer not exist already')
          logger.debug('Createing customer')
          if (!senderID || !userEmail || !userName) {
            return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
          }
          const contactDet = {
            firstName: userName,
            contactType: 'CNTMOB',
            email: userEmail,
            contactNo: senderID,
            createdBy: 546,
            updatedBy: 546
          }
          const contact = await Contact.create(contactDet, { transaction: t })
          const customerDet = {
            firstName: userName,
            contactId: contact.contactId,
            custType: 'RESIDENTIAL',
            status: 'TEMP',
            createdBy: 546,
            updatedBy: 546
          }
          const customerResponse = await Customer.create(customerDet, { transaction: t })
          if (customerResponse.customerId) {
            const data = {
              crmCustomerNo: customerResponse.customerId
            }
            await Customer.update(data, { where: { customerId: customerResponse.customerId }, transaction: t })
          }
          await t.commit()
          logger.debug('Successfully created customer')
          return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customerResponse)
        }
        await t.commit()
        logger.debug('Successfully fetch customer data')
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customer)
      } catch (error) {
        logger.error(error, 'Error while fetching Customer data')
        return this.responseHelper.onError(res, new Error('Error while fetching Customer data'))
      } finally {
        if (t && !t.finished) { await t.rollback() }
      }
    } else {// Mobile chat
      // console.log('inside else to check customer existence')
      try {
        logger.debug('Getting Customer details by senderID')
        // console.log('req.bodyXXXXXXXXXX.....', req.body)
        const { contactNo } = req.body;
        if (!contactNo) {
          return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
        const customer = await Customer.findOne({
          include: [
            {
              model: Contact,
              as: 'contact',
              where: { contactNo: contactNo }
            }
          ]
        })
        if (!customer) {
          return this.responseHelper.onSuccess(res, new Error('Customer not found'))
        }
        logger.debug('Successfully fetch customer data')
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customer)
      } catch (error) {
        logger.error(error, 'Error while fetching Customer data')
        return this.responseHelper.onError(res, new Error('Error while fetching Customer data'))
      }
    }

  }

  async registration(req, res) {
    const t = await sequelize.transaction();
    try {
      if (!req?.body?.body) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { userName, userEmail, contactNo, passportID, serviceNumber, identifier } = JSON.parse(req.body.body)
      if (!contactNo) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Checking customer is already exist or not')
      const customer = await Customer.findOne({
        include: [
          {
            model: Contact,
            as: 'contact',
            where: { contactNo: Number(contactNo), altEmail: identifier }
          }
        ]
      })
      if (!customer) {
        logger.debug('customer not exist already')
        logger.debug('Createing customer')
        if (!userName || !userEmail || !contactNo || !passportID || !identifier) {
          logger.debug('validation error...');
          return res.json(
            {
              data: {
                status: 'FAILED',
                message: defaultMessage.MANDATORY_FIELDS_MISSING
              }
            })
          // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
        }
        logger.debug('validated')

        const contactDet = {
          firstName: userName,
          contactType: 'CNTMOB',
          email: userEmail,
          altEmail: identifier,
          contactNo: Number(contactNo),
          altContactNo1: Number(serviceNumber) || 0,
          createdBy: 546,
          updatedBy: 546
        }
        // console.log('contactDet...', contactDet)
        const contact = await Contact.create(contactDet, { transaction: t });
        // console.log('here.......')
        const customerDet = {
          firstName: userName,
          contactId: contact.contactId,
          idType: 'PASSPORT',
          idValue: passportID,
          custType: 'RESIDENTIAL',
          status: 'TEMP',
          createdBy: 546,
          updatedBy: 546
        }
        // console.log('customerDet....', customerDet)
        const customerResponse = await Customer.create(customerDet, { transaction: t });
        // console.log('customerResponse.customerId...xxx..', customerResponse?.dataValues?.customerId)
        // console.log('customerResponse.customerId.....', customerResponse.customerId);
        await t.commit()
        logger.debug('Successfully created customer')
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customerResponse)
      }
      await t.commit()
      logger.debug('Successfully fetch customer data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customer)
    } catch (error) {
      logger.error(error, 'Error while Registration of Customer data');
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while Registration of Customer data'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while Registration of Customer data'))
    } finally {
      if (t && !t.finished) { await t.rollback() }
    }
  }

  async customerLanguage(req, res) {
    try {
      logger.debug('Getting Customer Language details by senderID')
      const { customerId } = req?.body
      if (!customerId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      let customer = await Customer.findOne({
        attributes: ['chat_language'],
        where: { customerId: customerId },
        raw: true
      })

      if (!customer) {
        return this.responseHelper.onSuccess(res, new Error('Customer not found'))
      }

      if (customer?.chat_language === null) {
        customer.chat_language = 'null'
      }
      logger.debug('Successfully fetch customer Language', customer)
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customer)
    } catch (error) {
      logger.error(error, 'Error while fetching Customer data')
      return this.responseHelper.onError(res, new Error('Error while fetching Customer data'))
    }
  }

  async updateLanguage(req, res) {
    const t = await sequelize.transaction();
    try {
      logger.debug('Updating Customer Language details by senderID')
      const { customerId, chatLanguage } = req?.body
      if (!customerId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      let customer = await Customer.update({ chatLanguage: (chatLanguage == 1 || chatLanguage == 'ENGLISH') ? 'English' : 'Malay' }, { where: { customerId: customerId }, transaction: t })

      if (!customer) {
        return this.responseHelper.onSuccess(res, new Error('Customer not found'))
      }

      logger.debug('Successfully Updated customer Language')
      t.commit();
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, customer)
    } catch (error) {
      logger.error(error, 'Error while updating Customer Language')
      return this.responseHelper.onError(res, new Error('Error while updating Customer Language'))
    } finally {
      if (t && !t.finished) { await t.rollback() }
    }
  }

  async updateBotChatSocket(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.info('Updating socket')
      const { id } = req.params;
      const { userId, body } = req
      if (!id) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const findTicket = await Chat.findOne({
        where: { chatId: id }
      })
      if (!findTicket) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      // console.log('body.socketId.........', body.socketId)
      await Chat.update({ socketId: body.socketId, status: 'NEW', userId: userId, startAt: new Date() }, { where: { chatId: id }, transaction: t })
      await t.commit()
      logger.debug('Successfully assigned ticket to user')
      return this.responseHelper.onSuccess(res, 'Ticket Assigned Successfully')
    } catch (error) {
      logger.error(error, 'Error while assigning ticket to user')
      return this.responseHelper.onError(res, new Error('Error while assigning ticket to user'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async customerInteractions(req, res) {
    try {
      logger.debug('Getting Customer Interactions')
      const { customerId } = req?.body
      if (!customerId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const interactionData = await Interaction.findAll({
        attributes: ['intxnId', 'currStatus'],
        where: { customerId: customerId, currStatus: { [Op.ne]: 'CLOSED' } }
      })

      if (!interactionData) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      logger.debug('Successfully fetch interaction data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, interactionData)
    } catch (error) {
      logger.error(error, 'Error while fetching interaction data')
      return this.responseHelper.onError(res, new Error('Error while fetching interaction data'))
    }
  }

  async opendHelpdeskTickets(req, res) {
    try {
      logger.debug('Getting opendHelpdeskTickets')
      const { contactNo } = req.body
      if (!contactNo) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const helpdeskTicketsData = await Helpdesk.findAll({
        attributes: ['helpdeskId'],
        where: { status: 'NEW', contactNo }
      })
      // console.log('open helpdeskTicketsData', helpdeskTicketsData)
      if (!helpdeskTicketsData) {
        return this.responseHelper.onSuccess(res, 'Opened tickets not found')
      }
      logger.debug('Successfully fetch opendHelpdeskTickets data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, helpdeskTicketsData)
    } catch (error) {
      logger.error(error, 'Error while fetching opendHelpdeskTickets data')
      return this.responseHelper.onError(res, new Error('Error while fetching opendHelpdeskTickets data'))
    }
  }

  async closedHelpdeskTickets(req, res) {
    try {
      logger.debug('Getting closedHelpdeskTickets')
      const { contactNo } = req.body
      if (!contactNo) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const helpdeskTicketsData = await Helpdesk.findAll({
        attributes: ['helpdeskId'],
        where: { status: 'CLOSED', contactNo }
      })
      if (!helpdeskTicketsData) {
        return this.responseHelper.onSuccess(res, 'Closed tickets not found')
      }
      logger.debug('Successfully fetch closedHelpdeskTickets data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, helpdeskTicketsData)
    } catch (error) {
      logger.error(error, 'Error while fetching closedHelpdeskTickets data')
      return this.responseHelper.onError(res, new Error('Error while fetching closedHelpdeskTickets data'))
    }
  }

  async createHelpdeskTicket(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Createing ticket')
      const {
        waId,
        customerName,
        email,
        title,
        content
      } = req.body
      // console.log('req.body', req.body)
      if (!waId || !customerName || !email || !title || !content) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const helpdesk = {
        contactNo: waId,
        callerNo: waId,
        name: customerName,
        email: email,
        source: 'WHATSAPP',
        status: 'NEW',
        messageDateTime: new Date(),
        title: title === 1 ? 'LTD services' : title === 2 ? 'Electricity related' : title,
        createdBy: 0,
        updatedBy: 0
      }
      const heldeskResponse = await Helpdesk.create(helpdesk, { transaction: t })
      await t.commit();
      logger.debug('Successfully created helpdesk ticket')
      return this.responseHelper.onSuccess(res, 'Successfully created helpdesk ticket', heldeskResponse)
    } catch (error) {
      logger.error(error, 'Failed to create helpdesk ticket')
      return this.responseHelper.onError(res, new Error('Failed to create helpdesk ticket'))
    } finally {
      if (t && !t.finished) { await t.rollback() }
    }
  }

  async updateHelpdeskTicket(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating helpdesk ticket')
      const {
        helpdeskId,
        waId,
        customerName,
        email,
        content
      } = req.body
      if (!helpdeskId || !waId || !customerName || !email || !content) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const helpdeskData = await Helpdesk.findOne({ where: { helpdeskId } })
      if (!helpdeskData) {
        logger.debug(defaultMessage.NOT_FOUND)
        return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
      }
      const helpdeskPayload = {
        contactNo: waId,
        callerNo: waId,
        name: customerName,
        email: email,
        source: 'WHATSAPP',
        status: 'NEW',
        messageDateTime: new Date(),
        content: content === 1 ? 'Issue in the road' : content,
        createdBy: 0,
        updatedBy: 0
      }
      await Helpdesk.update(helpdeskPayload, { where: { helpdeskId }, transaction: t })
      await t.commit()
      logger.debug('Successfully updated helpdesk Ticket')
      return this.responseHelper.onSuccess(res, 'Successfully updated helpdesk Ticket')
    } catch (error) {
      logger.error(error, 'Failed to updated helpdesk Ticket')
      return this.responseHelper.onError(res, new Error('Failed to updated helpdesk Ticket'))
    } finally {
      if (t && !t.finished) { await t.rollback() }
    }
  }

  async createCustomer(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Createing customer')
      const {
        contactNo,
        customerName,
        chatLanguage
      } = req?.body
      if (!contactNo || !customerName || !chatLanguage) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      const contactDet = {
        firstName: customerName,
        contactType: 'CNTMOB',
        contactNo,
        createdBy: 546,
        updatedBy: 546
      }

      const contact = await Contact.create(contactDet, { transaction: t })

      const customerDet = {
        firstName: customerName,
        contactId: contact?.contactId,
        chatLanguage: chatLanguage == 1 ? 'English' : 'Malay',
        custType: 'RESIDENTIAL',
        status: "TEMP",
        createdBy: 546,
        updatedBy: 546
      }
      const customerResponse = await Customer.create(customerDet, { transaction: t })
      if (customerResponse.customerId) {
        const data = {
          crmCustomerNo: customerResponse?.customerId
        }
        await Customer.update(data, { where: { customerId: customerResponse?.customerId }, transaction: t })
      }
      await t.commit()
      logger.debug('Successfully created customer')
      return this.responseHelper.onSuccess(res, 'Successfully created customer', customerResponse)
    } catch (error) {
      logger.error(error, 'Failed to create customer')
      return this.responseHelper.onError(res, new Error('Failed to create customer'))
    } finally {
      if (t && !t.finished) { await t.rollback() }
    }
  }

  async updateCustomer(req, res) {
    const t = await sequelize.transaction()
    try {
      logger.debug('Updating customer')
      const {
        customerId,
        contactNo,
        email,
        idValue
      } = req?.body
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      if (email !== '') {
        const contactData = await Contact.findOne({ where: { contactNo } })
        if (!contactData) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
        }
        const contactPayload = {
          email,
          createdBy: 546,
          updatedBy: 546
        }
        await Contact.update(contactPayload, { where: { contactNo }, transaction: t })
      } else {
        const customerData = await Customer.findOne({ where: { customerId } })
        if (!customerData) {
          logger.debug(defaultMessage.NOT_FOUND)
          return this.responseHelper.notFound(res, new Error(defaultMessage.NOT_FOUND))
        }
        const customerPayload = {
          idValue,
          createdBy: 546,
          updatedBy: 546
        }
        await Customer.update(customerPayload, { where: { customerId }, transaction: t })
      }
      await t.commit()
      logger.debug('Successfully updated customer')
      return this.responseHelper.onSuccess(res, 'Successfully updated customer')
    } catch (error) {
      logger.error(error, 'Failed to updated customer')
      return this.responseHelper.onError(res, new Error('Failed to updated customer'))
    } finally {
      if (t && !t.finished) { await t.rollback() }
    }
  }

  async humanHandover(req, res) {
    const t = await sequelize.transaction()
    try {
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { customerName, contactNo, emailId } = req?.body
      const helpdeskBody = {

        source: 'WHATSAPP',

        status: 'NEW',

        name: customerName || '-',

        contactNo: contactNo,

        email: emailId || '-',

        createdBy: 546,

        updatedBy: 546

      }

      const helpdeskData = await Helpdesk.create(helpdeskBody, { transaction: t })

      if (!helpdeskData) {
        logger.info('Error while creating helpdesk record')
        await t.commit();
        return this.responseHelper.onError(res, 'Error while creating helpdesk record')
      }

      const chat = {

        contactNo: contactNo,

        status: 'NEW',

        helpdeskId: helpdeskData?.helpdeskId,

        createdBy: 546,

        updatedBy: 546

      }

      const response = await Chat.create(chat, { transaction: t })
      await t.commit()
      logger.debug('Successfully created human handover chat')
      return this.responseHelper.onSuccess(res, 'Successfully created human handover chat', response)
    } catch (error) {
      logger.error(error, 'Failed to create human handover chat')
      return this.responseHelper.onError(res, new Error('Failed to create human handover chat'))
    } finally {
      if (t && !t.finished) { await t.rollback() }
    }
  }

  //This function is for Livechat Webchat & Whatsapp
  async chatByWorkflow(req, res) {
    try {
      const { mobileNumber, msg, source } = req?.body
      if (!mobileNumber || mobileNumber === '' || mobileNumber == null) {
        return this.responseHelper.onSuccess(res, 'Mobile Number is required')
      }
      const response = await this.startWorkFlowChat(mobileNumber, msg, source)
      return this.responseHelper.onSuccess(res, response)
    } catch (error) {
      logger.error(error, 'Error while creating new chat user')
      return this.responseHelper.onError(res, new Error('Error while creating new chat user'))
    }
  }

  async startWorkFlowChat(mobileNumber, msg, source) {
    try {
      const workflowHrdx = await WorkflowHdr.findAll({ // checking whether workflow execution is done or not
        where: {
          [Op.and]: [{ entity: source }, { entityId: mobileNumber }, { wfStatus: 'DONE' }]
        }
      })
      if (Array.isArray(workflowHrdx) && workflowHrdx.length > 0) { // Reseting the workflow hdr table
        const t = await sequelize.transaction();
        try {
          for (const wfHdr of workflowHrdx) {
            const resp = await WorkflowHdr.update({ wfStatus: 'CREATED', nextActivityId: '', wfContext: {} }, { where: { entityId: mobileNumber, entity: source }, transaction: t })
          }
          await t.commit()
        } catch (err) {
          logger.error(err, 'Error while updating workflow hdr table')
        } finally {
          if (t && !t.finished) {
            await t.rollback()
          }
        }
      }
      const workflowCount = await WorkflowHdr.count({ // we are checking workflow already assigned or not
        where: {
          [Op.and]: [{ entityId: mobileNumber }, { entity: source }]
        }
      })
      if (workflowCount === 0) {
        if (source === 'Whatsapp') {
          await assignWFToEntity(mobileNumber, source, '103')
        } else if (source === 'LIVE-CHAT') {
          await assignWFToEntity(mobileNumber, source, '7')
        }
      }
      const workflowHrd = await WorkflowHdr.findAll({
        where: {
          [Op.and]: [{ entityId: mobileNumber }, { entity: source }],
          [Op.or]: [{ wfStatus: 'CREATED' }, { wfStatus: 'USER_WAIT' }, { wfStatus: 'SYS_WAIT' }]
        }
      })
      if (Array.isArray(workflowHrd) && workflowHrd.length > 0) {
        for (const wfHdr of workflowHrd) {
          // Finding the wfJSON for current wfHdr id
          const wfDfn = await WorkflowNew.findOne({ where: { workflowId: wfHdr.wfDefnId } })
          // Finding WFJSON have definitions and process or not
          if (wfDfn?.wfDefinition && wfDfn?.wfDefinition?.definitions && wfDfn?.wfDefinition?.definitions?.process) {
            // console.log('Checking start activity', wfHdr.wfStatus, wfHdr.nextActivityId)
            if (wfHdr.wfStatus === 'CREATED') {
              if (!wfHdr.nextActivityId) {
                // Performing start step for new record
                await processWhatsAppStartStep(wfHdr, wfDfn.wfDefinition, source)
                return await this.startWorkFlowChat(mobileNumber, msg, source)
              } else if (wfHdr.nextActivityId) {
                // If already wf started and continuing remaining tasks
                return await continueChatWFExecution(wfDfn.wfDefinition, wfHdr.nextActivityId, wfHdr.wfContext, mobileNumber, msg)
              }
            }
          } else {
            logger.debug('Workflow JSON not found in workflow definition table')
            return 'Please wait for allocation'
          }
        }
      } else {
        logger.debug('No records to execute the workflow hdr01')
        return 'Please wait for allocation'
      }
    } catch (err) {
      logger.debug(err, 'No records to execute the workflow hdr02')
    }
  }

  async createWhatsappInquiry(req, res) {
    const t = await sequelize.transaction();
    try {
      let inquiry = {
        type: '',
        deptId: '',
        serviceCode: '',
        problemCode: '',
        remark: ''
      }
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { waId, chatLanguage } = req.body

      logger.debug('Checking Departments counts in servicetype and OU');
      const lastInbound = await InboundMessages.findAll({
        where: {
          waId: waId,
        },
        raw: true,
        order: [['inbound_id', 'ASC']]
      });
      let seq = {
        category: 0,
        serviceType: 0,
        problemCode: 0,
        deptCode: 0,
        remark: 0,
        type: 0
      }
      const lastRecievedInbounds = lastInbound.filter((ele) => ele.smsStatus === 'received')
      const lastSentInbounds = lastInbound.filter((ele) => ele.smsStatus === 'sent')
      if (lastSentInbounds[2].body == 'Please select the Category' || lastSentInbounds[2].body == 'Sila pilih kategori') {
        seq.category = 2;
        seq.serviceType = 3;
        seq.problemCode = 4;
        seq.deptCode = 5;
        seq.remark = 8;
        seq.type = 6;
      } else if (lastSentInbounds[3].body == 'Please select the Category' || lastSentInbounds[3].body == 'Sila pilih kategori') {
        seq.category = 3;
        seq.serviceType = 4;
        seq.problemCode = 5;
        seq.deptCode = 6;
        seq.remark = 9;
        seq.type = 7;
      } else if (lastSentInbounds[4].body == 'Please select the Category' || lastSentInbounds[4].body == 'Sila pilih kategori') {
        seq.category = 4;
        seq.serviceType = 5;
        seq.problemCode = 6;
        seq.deptCode = 7;
        seq.remark = 10;
        seq.type = 8;
      }
      // console.log('seq...', seq)
      const problemCodes = await BusinessEntity.findAll({
        where: { codeType: 'PROBLEM_CODE' },
        raw: true
      })
      const buOutput = await BusinessUnit.findAll({
        attributes: ['unitId', 'unitName', 'unitDesc', 'langEng', 'langMalay'],
        where: {
          unitType: 'OU',
          status: 'AC'
        },
        raw: true,
        order: [
          ['unitId', 'ASC']
        ]
      });

      const serviceTypes = await BusinessEntity.findAll({
        where: { codeType: 'PROD_TYPE' },
        raw: true
      })

      const orgList = buOutput.filter((ele) => chatLanguage === 'English' ? ele.langEng != null : ele.langMalay != null);

      const orgUnits = orgList.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });

      const orgId = orgUnits.filter((ele) => ele.indexing == lastRecievedInbounds[seq.category].body);

      let serviceType = []
      for (let x of serviceTypes) {
        if (x?.mappingPayload?.ouDept && x?.mappingPayload?.ouDept?.length > 0) {
          x?.mappingPayload?.ouDept.filter((e) => {
            if (e.ouId === orgId[0].unitId) {
              serviceType.push(x)
            }
          })
        }
      }

      const sList = serviceType.filter((ele) => chatLanguage === 'English' ? ele.mappingPayload?.langEnglish != null : ele.mappingPayload?.langMalay != null);
      const sLists = sList.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });
      const sCode = sLists.filter((ele) => ele.indexing == lastRecievedInbounds[seq.serviceType].body);

      let problemCode = []
      for (let x of problemCodes) {
        if (x?.mappingPayload?.serviceType && x?.mappingPayload?.serviceType?.length > 0) {
          x?.mappingPayload?.serviceType.filter((e) => {
            if (e === sCode[0]?.code) {
              problemCode.push(x);
            }
          })
        }
      }
      // console.log('problemCode.....', problemCode)

      const problemCodeList = problemCode.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });

      // console.log('problemCodeList....', problemCodeList)
      const pCode = problemCodeList.filter((ele) => ele.indexing == lastRecievedInbounds[seq.problemCode].body);
      // console.log('pCode.....', pCode);

      const orgs = await BusinessUnit.findAll({
        where: {
          unitType: ['DEPT'],
          status: 'AC'
        },
        raw: true,
        order: [
          ['unitId', 'ASC']
        ]
      });
      const departments = orgs.filter(e => e.unitType === "DEPT")

      const departmentArray = serviceTypes.filter((ele) => ele.code === sCode[0]?.code)
      let x = []
      const depArr = departmentArray[0]?.mappingPayload?.ouDept.filter((ele) => ele.ouId === orgId[0].unitId)
      for (let d of depArr) {
        for (let dIds of d?.deptId) {
          const xx = departments.filter((ele) => ele.unitId === dIds)
          x.push(xx);
        }
      }

      let y = [];
      for (let i = 0; i < x.length; i++) {
        if (x[i].length != 0) {
          y.push(x[i][0])
        }
      }
      // console.log("deptss...yyy.", y.length);
      if (y.length === 1) {
        inquiry.deptId = y[0].unitId;
        inquiry.remark = lastRecievedInbounds[seq.remark].body;
        inquiry.type = lastRecievedInbounds[seq.type].body == 2 ? 'Complaint' : 'Inquiry';
      } else {
        seq.remark = seq.remark + 1;
        seq.type = seq.type + 1;
        // console.log('y.........', y)
        const deptCodeList = y.map((ele, index) => {
          return {
            ...ele,
            indexing: index + 1
          }
        });
        // console.log('deptCodeList....', deptCodeList)
        const deptCode = deptCodeList.filter((ele) => ele.indexing == lastRecievedInbounds[seq.deptCode].body);
        // console.log('deptCode......', deptCode)
        inquiry.deptId = deptCode[0].unitId;
        inquiry.remark = lastRecievedInbounds[seq.remark].body;
        inquiry.type = lastRecievedInbounds[seq.type].body == 2 ? 'Complaint' : 'Inquiry';
      }

      inquiry.serviceCode = sCode[0].code;
      inquiry.problemCode = pCode[0].code;

      logger.info('Creating new Inquiry');
      let roleId = 26;//CCT
      let userId = 3670;
      // const customerId = req.body.customerId;

      const contact = await Contact.findOne({
        raw: true,
        where: {
          contactNo: waId
        }
      })
      const customer = await Customer.findOne({
        raw: true,
        where: {
          contactId: Number(contact.contactId)
        }
      })
      const departmentId = inquiry.deptId
      inquiry.intxnType = inquiry?.type == 'Complaint' ? "REQCOMP" : "REQINQ"
      inquiry.ticketType = inquiry?.type == 'Complaint' ? "CATCOMP" : "CATINQ"
      inquiry.productOrServices = inquiry?.serviceCode
      inquiry.serviceType = inquiry?.serviceCode
      inquiry.chnlCode = 'Whatsapp'
      inquiry.priorityCode = "PR0003"//medium
      inquiry.currEntity = inquiry?.deptId;//from user selection
      inquiry.problemCode = inquiry?.problemCode;
      inquiry.customerId = customer.customerId;
      inquiry.custType = customer.custType;
      inquiry.addressId = customer.addressId
      inquiry.ticketDescription = inquiry?.remark
      if (!inquiry) {
        await t.commit();
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      // TRANSFROMING KEY VALUES AS PER DB MODEL
      const data = transformInquiry(inquiry)
      data.createdBy = userId
      data.currRole = roleId//CCT
      data.createdEntity = 'DPT0000642.OPU0000006.ORG0000001'//CCT dept id 'DPT0000642.OPU0000006.ORG0000001'--TD123
      data.currEntity = departmentId
      data.chnlCode = inquiry.chnlCode
      data.problemCode = inquiry.problemCode
      data.businessEntityCode = inquiry.serviceType
      // CREATING NEW INQUIRY RECORD
      // console.log('data.......', data)
      const inquiryData = await Interaction.create(data, { transaction: t })
      // CREATING HISTORY ON INQUIRY
      logger.debug('Creating History data')
      const interactionHistory = {
        fromRole: 24, //CITIZEN ROLE ID
        toRole: 26,//CCT=26, level2=3
        fromUser: userId,
        fromEntity: 'DPT0000642.OPU0000006.ORG0000001',//--'DPT0000642.OPU0000006.ORG0000001' need to discuss
        toEntity: departmentId,
        intxnId: inquiryData.intxnId,
        intxnStatus: 'NEW',
        flwCreatedBy: userId,
        isFollowup: 'N',
        updatedBy: userId,
        flwId: 'A', // flow.flwId,
        flwAction: 'START',
        remarks: inquiry?.ticketDescription,
        causeCode: inquiry?.problemCode
      }
      logger.debug('creating history')
      await InteractionTxn.create(interactionHistory, { transaction: t })

      let response
      if (inquiryData) {
        response = {
          interactionId: inquiryData?.intxnId,
          status: inquiryData?.currStatus,
          createdDate: inquiryData?.createdAt
        }

        // ADDING ATTACHMENT
        if (Array.isArray(req.body?.attachement)) {
          // console.log('Uploading Inquiry attachments.')
          for (const entityId of req.body?.attachement) {
            await findAndUpdateAttachment(entityId?.entityId, inquiryData?.intxnId, 'INQUIRY', t)
          }
        }

        if (data.kioskRefId !== null) {
          const kiosk = {
            status: 'CLOSED'
          }
          await Kiosk.update(kiosk, {
            where: {
              referenceNo: data.kioskRefId
            },
            transaction: t
          }
          )
        }
      }
      await t.commit()
      logger.debug('Inquiry created successfully')
      return this.responseHelper.onSuccess(res, 'Inquiry created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Inquiry'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async createWhatsappInquiryEx(req, res) {
    const t = await sequelize.transaction();
    try {
      let inquiry = {
        type: '',
        deptId: '',
        serviceCode: '',
        problemCode: '',
        remark: ''
      }

      const { waId, chatLanguage } = req.body

      logger.debug('Checking Departments counts in servicetype and OU');
      const lastInbound = await InboundMessages.findAll({
        where: {
          waId: waId,
        },
        raw: true,
        order: [['inbound_id', 'ASC']]
      });
      let seq = {
        category: 0,
        serviceType: 0,
        problemCode: 0,
        deptCode: 0,
        remark: 0,
        type: 0
      }
      const lastRecievedInbounds = lastInbound.filter((ele) => ele.smsStatus === 'received')
      const lastSentInbounds = lastInbound.filter((ele) => ele.smsStatus === 'sent')
      if (lastSentInbounds[2].body == 'Please select the Category') {
        seq.category = 2;
        seq.serviceType = 3;
        seq.problemCode = 4;
        seq.deptCode = 5;
        seq.remark = 8;
        seq.type = 6;
      } else if (lastSentInbounds[3].body == 'Please select the Category') {
        seq.category = 3;
        seq.serviceType = 4;
        seq.problemCode = 5;
        seq.deptCode = 6;
        seq.remark = 9;
        seq.type = 7;
      } else if (lastSentInbounds[4].body == 'Please select the Category') {
        seq.category = 4;
        seq.serviceType = 5;
        seq.problemCode = 6;
        seq.deptCode = 7;
        seq.remark = 10;
        seq.type = 8;
      }
      // console.log('seq...', seq)
      const codes = await BusinessEntity.findAll({
        where: { codeType: ['PROBLEM_CODE', 'PROD_TYPE'], status: 'AC' },
        raw: true
      });

      const orgs = await BusinessUnit.findAll({
        where: {
          unitType: ['OU', 'DEPT'],
          status: 'AC'
        },
        raw: true,
        order: [
          ['unitId', 'ASC']
        ]
      });

      const buOutput = orgs.filter(e => e.unitType === "OU")
      const departments = orgs.filter(e => e.unitType === "DEPT")
      const serviceTypes = codes.filter(e => e.codeType === "PROD_TYPE")
      const problemCodes = codes.filter(e => e.codeType === "PROBLEM_CODE")

      const orgList = buOutput.filter((ele) => chatLanguage === 'English' ? ele.langEng != null : ele.langMalay != null);

      const orgUnits = orgList.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });

      const orgId = orgUnits.filter((ele) => ele.indexing == lastRecievedInbounds[seq.category].body);
      let serviceType = []
      for (let x of serviceTypes) {
        if (x?.mappingPayload?.ouDept && x?.mappingPayload?.ouDept?.length > 0) {
          x?.mappingPayload?.ouDept.filter((e) => {
            if (e.ouId === orgId[0].unitId) {
              serviceType.push(x)
            }
          })
        }
      }

      const sList = serviceType.filter((ele) => chatLanguage === 'English' ? ele.mappingPayload?.langEnglish != null : ele.mappingPayload?.langMalay != null);

      const sLists = sList.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });
      const sCode = sLists.filter((ele) => ele.indexing == lastRecievedInbounds[seq.serviceType].body);
      // console.log('sCode....', sCode)
      const departmentArray = serviceTypes.filter((ele) => ele.code === sCode[0]?.code)
      let deptss = []
      const depArr = departmentArray[0]?.mappingPayload?.ouDept.filter((ele) => ele.ouId === orgId[0].unitId)
      for (let d of depArr) {
        for (let dIds of d?.deptId) {
          const xx = departments.filter((ele) => ele.unitId === dIds)
          deptss.push(xx)
        }
      }

      let problemCode = []
      for (let x of problemCodes) {
        if (x?.mappingPayload?.serviceType && x?.mappingPayload?.serviceType?.length > 0) {
          x?.mappingPayload?.serviceType.filter((e) => {
            if (e === sCode[0]?.code) {
              problemCode.push(x);
            }
          })
        }
      }

      const problemCodeList = problemCode.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });

      // console.log('problemCodeList....', problemCodeList)
      const pCode = problemCodeList.filter((ele) => ele.indexing == lastRecievedInbounds[seq.problemCode].body);
      // console.log('pCode.....', pCode);

      if (deptss.length === 1) {
        inquiry.deptId = deptss[0][0].unitId;
        inquiry.remark = lastRecievedInbounds[seq.remark].body;
        inquiry.type = lastRecievedInbounds[seq.type].body == 2 ? 'Complaint' : 'Inquiry';
      } else {
        seq.remark = seq.remark + 1;
        seq.type = seq.type + 1;
        const deptCodeList = deptss.map((ele, index) => {
          return {
            ...ele,
            indexing: index + 1
          }
        });
        // console.log('deptCodeList....', deptCodeList)
        const deptCode = deptCodeList.filter((ele) => ele.indexing == lastInbound[4].body);
        // console.log('deptCode......', deptCode)
        inquiry.deptId = deptCode[0][0].unitId;
        inquiry.remark = lastRecievedInbounds[seq.remark].body;
        inquiry.type = lastRecievedInbounds[seq.type].body == 2 ? 'Complaint' : 'Inquiry';
      }

      inquiry.serviceCode = sCode[0].code;
      inquiry.problemCode = pCode[0].code;

      logger.info('Creating new Inquiry');
      let roleId = 26;//CCT
      let userId = 3670;
      const customerId = req.body.customerId;

      const contact = await Contact.findOne({
        raw: true,
        where: {
          contactNo: waId
        }
      })
      const customer = await Customer.findOne({
        raw: true,
        where: {
          contactId: Number(contact.contactId)
        }
      })
      const departmentId = inquiry.deptId
      inquiry.intxnType = inquiry?.type == 'Complaint' ? "REQCOMP" : "REQINQ"
      inquiry.ticketType = inquiry?.type == 'Complaint' ? "CATCOMP" : "CATINQ"
      inquiry.productOrServices = inquiry?.serviceCode
      inquiry.serviceType = inquiry?.serviceCode
      inquiry.chnlCode = 'Whatsapp'
      inquiry.priorityCode = "PR0003"//medium
      inquiry.currEntity = inquiry?.deptId;//from user selection
      inquiry.problemCode = inquiry?.problemCode;
      inquiry.customerId = customer.customerId;
      inquiry.custType = customer.custType;
      inquiry.addressId = customer.addressId
      inquiry.ticketDescription = inquiry?.remark
      if (!inquiry) {
        await t.commit();
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      // TRANSFROMING KEY VALUES AS PER DB MODEL
      const data = transformInquiry(inquiry)
      data.createdBy = userId
      data.currRole = roleId//CCT
      data.createdEntity = 'DPT0000642.OPU0000006.ORG0000001'//CCT dept id 'DPT0000642.OPU0000006.ORG0000001'--TD123
      data.currEntity = departmentId
      data.chnlCode = inquiry.chnlCode
      data.problemCode = inquiry.problemCode
      data.businessEntityCode = inquiry.serviceType
      // CREATING NEW INQUIRY RECORD
      // console.log('data.......', data)
      const inquiryData = await Interaction.create(data, { transaction: t })
      // CREATING HISTORY ON INQUIRY
      logger.debug('Creating History data')
      const interactionHistory = {
        fromRole: 24, //CITIZEN ROLE ID
        toRole: 26,//CCT=26, level2=3
        fromUser: userId,
        fromEntity: 'DPT0000642.OPU0000006.ORG0000001',//--'DPT0000642.OPU0000006.ORG0000001' need to discuss
        toEntity: departmentId,
        intxnId: inquiryData.intxnId,
        intxnStatus: 'NEW',
        flwCreatedBy: userId,
        isFollowup: 'N',
        updatedBy: userId,
        flwId: 'A', // flow.flwId,
        flwAction: 'START',
        remarks: inquiry?.ticketDescription,
        causeCode: inquiry?.problemCode
      }
      logger.debug('creating history')
      await InteractionTxn.create(interactionHistory, { transaction: t })

      let response
      if (inquiryData) {
        response = {
          interactionId: inquiryData?.intxnId,
          status: inquiryData?.currStatus,
          createdDate: inquiryData?.createdAt
        }

        // ADDING ATTACHMENT
        if (Array.isArray(req.body?.attachement)) {
          // console.log('Uploading Inquiry attachments.')
          for (const entityId of req.body?.attachement) {
            await findAndUpdateAttachment(entityId?.entityId, inquiryData?.intxnId, 'INQUIRY', t)
          }
        }

        if (data.kioskRefId !== null) {
          const kiosk = {
            status: 'CLOSED'
          }
          await Kiosk.update(kiosk, {
            where: {
              referenceNo: data.kioskRefId
            },
            transaction: t
          }
          )
        }
      }
      await t.commit()
      logger.debug('Inquiry created successfully')
      return this.responseHelper.onSuccess(res, 'Inquiry created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Inquiry'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async createWhatsappComplaint(req, res) {
    const t = await sequelize.transaction();
    try {
      let payload = {
        type: '',
        deptId: '',
        serviceCode: '',
        problemCode: '',
        remark: ''
      }

      const { waId, chatLanguage } = req.body
      logger.debug('Checking Departments counts in servicetype and OU');

      const lastInbound = await InboundMessages.findAll({
        where: {
          waId: waId,
        },
        raw: true,
        order: [['inbound_id', 'ASC']]
      });
      let seq = {
        category: 0,
        serviceType: 0,
        problemCode: 0,
        deptCode: 0,
        remark: 0,
        type: 0
      }
      const lastRecievedInbounds = lastInbound.filter((ele) => ele.smsStatus === 'received')
      const lastSentInbounds = lastInbound.filter((ele) => ele.smsStatus === 'sent')
      if (lastSentInbounds[2].body == 'Please select the Category' || lastSentInbounds[2].body == 'Sila pilih kategori') {
        seq.category = 2;
        seq.serviceType = 3;
        seq.problemCode = 4;
        seq.deptCode = 5;
        seq.remark = 12;
        seq.type = 6;
      } else if (lastSentInbounds[3].body == 'Please select the Category' || lastSentInbounds[3].body == 'Sila pilih kategori') {
        seq.category = 3;
        seq.serviceType = 4;
        seq.problemCode = 5;
        seq.deptCode = 6;
        seq.remark = 13;
        seq.type = 7;
      } else if (lastSentInbounds[4].body == 'Please select the Category' || lastSentInbounds[4].body == 'Sila pilih kategori') {
        // console.log("03")
        seq.category = 4;
        seq.serviceType = 5;
        seq.problemCode = 6;
        seq.deptCode = 7;
        seq.remark = 14;
        seq.type = 8;
      }
      // console.log('seq...', seq)

      const problemCodes = await BusinessEntity.findAll({
        where: { codeType: 'PROBLEM_CODE' },
        raw: true
      })
      const buOutput = await BusinessUnit.findAll({
        attributes: ['unitId', 'unitName', 'unitDesc', 'langEng', 'langMalay'],
        where: {
          unitType: 'OU',
          status: 'AC'
        },
        raw: true,
        order: [
          ['unitId', 'ASC']
        ]
      });

      const serviceTypes = await BusinessEntity.findAll({
        where: { codeType: 'PROD_TYPE' },
        raw: true
      })

      const orgList = buOutput.filter((ele) => chatLanguage == 'English' ? ele.langEng != null : ele.langMalay != null);

      const orgUnits = orgList.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });

      const orgId = orgUnits.filter((ele) => ele.indexing == lastRecievedInbounds[seq.category].body);

      let serviceType = []
      for (let x of serviceTypes) {
        if (x?.mappingPayload?.ouDept && x?.mappingPayload?.ouDept?.length > 0) {
          x?.mappingPayload?.ouDept.filter((e) => {
            if (e.ouId === orgId[0].unitId) {
              serviceType.push(x)
            }
          })
        }
      }

      const sList = serviceType.filter((ele) => chatLanguage == 'English' ? ele.mappingPayload?.langEnglish != null : ele.mappingPayload?.langMalay != null);
      const sLists = sList.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });
      const sCode = sLists.filter((ele) => ele.indexing == lastRecievedInbounds[seq.serviceType].body);

      let problemCode = []
      for (let x of problemCodes) {
        if (x?.mappingPayload?.serviceType && x?.mappingPayload?.serviceType?.length > 0) {
          x?.mappingPayload?.serviceType.filter((e) => {
            if (e === sCode[0]?.code) {
              problemCode.push(x);
            }
          })
        }
      }
      // console.log('problemCode.....', problemCode)

      const problemCodeList = problemCode.map((ele, index) => {
        return {
          ...ele,
          indexing: index + 1
        }
      });

      // console.log('problemCodeList....', problemCodeList)
      const pCode = problemCodeList.filter((ele) => ele.indexing == lastRecievedInbounds[seq.problemCode].body);
      // console.log('pCode.....', pCode);

      const orgs = await BusinessUnit.findAll({
        where: {
          unitType: ['DEPT'],
          status: 'AC'
        },
        raw: true,
        order: [
          ['unitId', 'ASC']
        ]
      });
      const departments = orgs.filter(e => e.unitType === "DEPT")

      const departmentArray = serviceTypes.filter((ele) => ele.code === sCode[0]?.code)
      let x = []
      const depArr = departmentArray[0]?.mappingPayload?.ouDept.filter((ele) => ele.ouId === orgId[0].unitId)
      for (let d of depArr) {
        for (let dIds of d?.deptId) {
          const xx = departments.filter((ele) => ele.unitId === dIds)
          x.push(xx);
        }
      }

      let y = [];
      for (let i = 0; i < x.length; i++) {
        if (x[i].length != 0) {
          y.push(x[i][0])
        }
      }
      // console.log("deptss...yyy.", y.length);
      if (y.length === 1) {
        payload.deptId = y[0].unitId;
        payload.remark = lastRecievedInbounds[seq.remark].body;
        payload.type = lastRecievedInbounds[seq.type].body == 2 ? 'Complaint' : 'Inquiry';
      } else {
        seq.remark = seq.remark + 1
        seq.type = seq.type + 1
        const deptCodeList = y.map((ele, index) => {
          return {
            ...ele,
            indexing: index + 1
          }
        });
        // console.log('deptCodeList....', deptCodeList)
        const deptCode = deptCodeList.filter((ele) => ele.indexing == lastRecievedInbounds[seq.deptCode].body);
        // console.log('deptCode......', deptCode)
        payload.deptId = deptCode[0].unitId;
        payload.remark = lastRecievedInbounds[seq.remark].body;
        payload.type = lastRecievedInbounds[seq.type].body == 2 ? 'Complaint' : 'Inquiry';
      }

      payload.serviceCode = sCode[0].code;
      payload.problemCode = pCode[0].code;

      const addressPayloadData = await getAddressData(waId);

      logger.info('Creating new complaints')
      const contactNo = req.body.waId;
      const customerData = await Contact.findOne({
        attributes: ["contactId", "firstName", "email", "contactNo", "contactNoPfx"],
        include: [
          { model: Customer, attributes: ["custType", "customerId", "status"], as: 'customerDetails' }
        ],
        raw: true,
        where: {
          contactNo: Number(contactNo)
        }
      })
      payload.intxnType = payload?.type == 'Complaint' ? "REQCOMP" : "REQINQ"
      payload.ticketType = payload?.type == 'Complaint' ? "CATCOMP" : "CATINQ"
      payload.productOrServices = payload?.serviceCode
      payload.serviceType = payload?.serviceCode
      payload.chnlCode = 'Whatsapp'
      payload.priorityCode = "PR0003"//medium
      payload.roleId = 26;//CCT
      let userId = 3670;
      payload.remarks = payload?.remark;
      payload.currEntity = payload?.deptId;//whatever end user is selected
      payload.problemCode = payload?.problemCode;
      const departmentId = payload?.deptId;
      payload.customerId = customerData['customerDetails.customerId'];
      payload.custType = customerData['customerDetails.custType'];
      if (!payload) {
        await t.commit();
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      // FINDING WORKFLOW -- to be adjusted in BCAE
      logger.debug('Finiding work flow')
      const workflowMappings = await WorkflowMapping.findAll({
        where: {
          module: 'INTXN',
          status: 'AC'
        }
      })

      let flwId
      for (const w of workflowMappings) {
        const mapping = w.mapping
        // console.log('mappingid', w.mappingId, w.workflowId)
        // console.log('priority', mapping.priority, payload.priorityCode)
        // console.log('serviceType', mapping.serviceType, payload.serviceType)
        // console.log('customerType', mapping.customerType, payload.custType)
        // console.log('interactionType', mapping.interactionType, payload.intxnType)

        if (mapping.priority && mapping.priority === payload.priorityCode &&
          mapping.serviceType && mapping.serviceType === payload.serviceType &&
          mapping.customerType && mapping.customerType === payload.custType &&
          mapping.interactionType && mapping.interactionType === payload.intxnType) {
          flwId = w.workflowId
          break
        }
      }

      if (!flwId) {
        logger.debug('Unable to find workflow. Please check setup');
        await t.commit();
        return this.responseHelper.notFound(res, 'Unable to find workflow. Please check setup')
      }

      let woType
      payload.problemCause = ''
      const problemCausePaylod = await BusinessEntity.findOne({ where: { code: payload?.problemCause } })
      if (problemCausePaylod?.mappingPayload?.complaintType === 'FAULT') {
        woType = 'FAULT'
      } else {
        logger.debug('WORKORDER TYPE NOT FAULT')
        let query
        if (sequelize.options.dialect === 'mssql') {
          query = `select * from business_entity be where JSON_VALUE(mapping_payload, '$."ticketType"')='${payload.ticketType}'`
        } else {
          query = `select * from business_entity be where be.mapping_payload @> '{"ticketType": "${payload.ticketType}"}'`
        }
        const result =
          await sequelize.query(query,
            { type: QueryTypes.SELECT })
        woType = result[0]?.code || 'COMPLAINT'
      }
      // CREATING COMPLAINT
      logger.debug('Creating complaint')
      const addressData = {
        street: addressPayloadData.simpang,
        district: addressPayloadData.district,
        state: addressPayloadData.state,
        postCode: addressPayloadData.postCode,
        country: addressPayloadData.country
      }
      const address = await Address.create(addressData, { transaction: t })
      payload.addressId = address?.addressId
      delete payload.ouId
      delete payload.serviceCode
      delete payload.deptId
      delete payload.type
      delete payload.remark
      delete payload.customerId
      delete payload.custType
      let fromEntity = 'DPT0000642.OPU0000006.ORG0000001'//TD123 dept ID
      const complaintData = await createComplaint(payload, userId, payload.roleId, fromEntity, t, woType)
      logger.debug('Finding enitity')
      // CRAEATING INTERACTION HISTORY
      logger.debug('Creating Interaction history data')
      const interactionHistory = {
        fromRole: 24,
        toRole: 3,//level 2=3, cct=26
        fromUser: userId,
        fromEntity,
        toEntity: departmentId,//whatever they will select
        intxnId: complaintData.intxnId,
        remarks: payload.remark,
        intxnStatus: 'NEW',
        flwCreatedBy: userId,
        isFollowup: 'N',
        updatedBy: userId,
        flwId: flwId || 'A', // flow.flwId,
        flwAction: 'START',
        problemCode: payload.problemCode
      }
      // console.log('interactionHistory...........', interactionHistory)
      await InteractionTxn.create(interactionHistory, { transaction: t }, { logging: true })
      await assignWFToEntity(complaintData?.intxnId, 'Interaction', flwId, t)

      // CRETATING APPOINTMENT
      logger.debug('Creating appointment')
      if (payload?.appointment && payload?.appointment?.fromDate !== '') {
        await creatAappointment(payload?.appointment, userId, complaintData.intxnId, t)
      }

      if (req.body?.attachement && Array.isArray(req.body?.attachement)) {
        logger.debug('Uploading complaint attachments');
        for (const entityId of req.body?.attachement) {
          await findAndUpdateAttachment(entityId?.entityId, complaintData?.intxnId, 'COMPLAINT', t)
        }
      }

      logger.debug('Creating notifaction') // -- Dependet on customer module refer line no. 31
      if (complaintData.intxnType === 'REQCOMP' && complaintData.intxnCatType === 'CATCOMP') {
        if (customerData?.contactNo && customerData?.email) {
          const notificationType = 'Email'
          await createNotification(complaintData.intxnId, customerData['email'], customerData?.contactNo, notificationType, t)
        }
        if (customerData && customerData?.contactNo && customerData?.contactNo === 'CNTMOB') {
          const notificationType = 'SMS'
          const mobileNo = customerData?.contactNoPfx + customerData?.contactNo
          await createNotification(complaintData.intxnId, customerData?.email, mobileNo, notificationType, t)
        }
      }
      const source = payload.intxnType === 'Complaint' ? 'Complaint' : 'Service Request'
      const notificationSubject = 'assigned to your department '
      await createUserNotification(complaintData.intxnId, customerData?.email, customerData?.contactNo, payload.roleId, payload?.deptId, null, source, complaintData, t, notificationSubject)
      let response
      if (complaintData) {
        response = {
          interactionId: complaintData?.intxnId,
          status: complaintData?.currStatus,
          createdDate: complaintData?.createdAt
        }
      }
      await t.commit()
      logger.debug('Complaint created successfully')
      return this.responseHelper.onSuccess(res, 'Complaint created successfully', response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating Inquiry'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async deleteInbounds(req, res) {
    try {
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const { waId } = req?.body;
      const lastInbound = await InboundMessages.findAll({
        where: {
          waId: waId
        },
        raw: true,
        order: [['inbound_id', 'ASC']]
      });
      let popNumber = 0;
      let lastRecievedInbounds = lastInbound && lastInbound.filter((ele) => ele.smsStatus === 'received') || []
      const lastSentInbounds = lastInbound && lastInbound.filter((ele) => ele.smsStatus === 'sent') || []
      if (lastSentInbounds[2].body == 'Please select the Category' || lastSentInbounds[2].body == 'Sila pilih kategori') {
        // console.log("01")
        popNumber = 2;
      } else if (lastSentInbounds[3].body == 'Please select the Category' || lastSentInbounds[3].body == 'Sila pilih kategori') {
        // console.log("02")
        popNumber = 3;
      } else if (lastSentInbounds[4].body == 'Please select the Category' || lastSentInbounds[4].body == 'Sila pilih kategori') {
        // console.log("03")
        popNumber = 4;
      }
      lastRecievedInbounds.splice(0, popNumber);
      // console.log('lastRecievedInbounds', lastRecievedInbounds)
      const arr = lastRecievedInbounds.map((ele) => {
        return ele.inboundId
      });
      // console.log('arr...', arr)
      await InboundMessages.destroy({
        where: {
          inboundId: { [Op.in]: arr }
        }
      })
      return res.json("Inbounds deleted successfully.")

    } catch (error) {
      // console.log('error.......', error)
      return res.json(error)
    }
  }

  async createChat(req, res) {
    const t = await sequelize.transaction();
    try {
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      // console.log('req.body.WaId...', req.body)
      const chatExists = await Chat.findOne({ where: { contactNo: req.body.data.contactNo, status: ['NEW', 'ASSIGNED'] } });
      let response;
      if (chatExists) {
        response = 'Chat already exist'
      } else {
        const chat = {
          contactNo: 'Enquiry',
          chatLanguage: req.body.data.chatLanguage,
          botReq: req.body.data.contactNo,
          source: req.body.source,
          status: 'NEW',
          category: 'Enquiries',
          createdBy: systemUserId,
          updatedBy: systemUserId
        }
        response = await Chat.create(chat, { transaction: t });
        //await t.commit()
      }
      await t.commit()
      return res.json(response)
    } catch (error) {
      // console.log('error...', error)
      return res.json('Error while creating Chat');
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateChat(req, res) {
    const t = await sequelize.transaction();
    try {
      const waId = req?.body?.waId;
      if (!req.body.body || !waId) {
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
      }
      const body = JSON.parse(req.body.body)

      const chat = {
        contactNo: body.contactNo,
        emailId: body.userEmail,
        customerName: body.userName
      }
      const response = await Chat.update(chat, {
        where: {
          contactNo: waId
        },
        transaction: t
      })
      await t.commit()
      return res.json(response)
    } catch (error) {
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while updating Chat'
          }
        })
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async updateChatExistingCustomer(req, res) {
    const t = await sequelize.transaction();
    try {
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING);
        return res.json(
          {
            data: {
              status: 'FAILED',
              message: defaultMessage.MANDATORY_FIELDS_MISSING
            }
          })
        // return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const waId = req?.body?.waId
      const identifire = req?.body?.identifire;
      const info = req?.body?.info;
      const body = req?.body?.body
      const userName = body && body.filter((e) => e.name == "CustomerName")[0].value.stringValue
      const contactNo = body && body.filter((e) => e.name == "AccessNo")[0].value.stringValue
      const userEmail = body && body.filter((e) => e.name == "PrimaryContactEmailAddress")[0].value.stringValue;
      const chat = {
        contactNo: contactNo,
        emailId: userEmail,
        customerName: userName,
        identifier: identifire,
        customerInfo: info
      }
      const response = await Chat.update(chat, {
        where: {
          botReq: waId
        },
        transaction: t
      })
      await t.commit()
      return res.json(response)
    } catch (error) {
      return res.json('Error while updating Chat', error);
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async createMobileChat(req, res) {
    const t = await sequelize.transaction();
    try {
      logger.debug('Creating new chat user')
      let chat = req.body.data
      if (!chat || !chat.contactNo) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }

      const resp = await Contact.findOne({
        attributes: ["firstName", "lastName", "email"],
        where: { contactNo: chat.contactNo },
        raw: true
      })

      const helpdeskBody = {
        source: 'LIVE-CHAT',
        status: 'NEW',
        name: resp?.firstName,
        email: resp?.email,
        createdBy: systemUserId,
        updatedBy: systemUserId
      }

      const helpdeskData = await Helpdesk.create(helpdeskBody, { transaction: t });

      if (!helpdeskData) {
        logger.info('Error while creating helpdesk record');
        await t.commit();
        return this.responseHelper.onError(res, 'Error while creating helpdesk record')
      }

      chat = {
        customerName: resp.firstName,
        emailId: resp.email,
        contactNo: chat.contactNo,
        helpdeskId: helpdeskData?.helpdeskId,
        createdBy: systemUserId,
        updatedBy: systemUserId
      }

      const response = await Chat.create(chat, { transaction: t })
      await t.commit();
      logger.debug('New chat user created successfully')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while creating new chat user'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async chatCleanUp(req, res) {
    const t = await sequelize.transaction();
    try {
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      logger.debug('Cleaning the chat..')
      let entityId = req?.body?.contactNo;
      // console.log('entityId....', entityId)
      if (!entityId) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const workflowHdrData = await WorkflowHdr.findOne({
        attributes: ['wfHdrId'],
        where: {
          entityId
        },
        raw: true
      });
      // console.log('workflowHdrData.........', workflowHdrData)
      if (workflowHdrData) {
        // console.log('workflowHdrData?.wfHdrId.........', workflowHdrData?.wfHdrId)
        const res1 = await WorkflowHdr.destroy({
          where: {
            wfHdrId: workflowHdrData?.wfHdrId
          },
          transaction: t
        })
        // console.log('res1....', res1)
        if (res1 > 0) {
          const res3 = await InboundMessages.destroy({
            where: {
              waId: entityId
            },
            transaction: t
          })
          // console.log('res3/....', res3)
          if (res3 > 0) {
            const res2 = await WorkflowTxn.destroy({
              where: {
                wfHdrId: workflowHdrData?.wfHdrId
              },
              transaction: t
            })
            // console.log('res2...', res2)
          }
        }
        await t.commit();
        logger.debug('Chat Clean up done Successfully')
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS)
      } else {
        await t.commit()
        logger.debug('Nothing to clean')
        return this.responseHelper.onSuccess(res, "Nothing to clean")
      }
    } catch (error) {
      logger.error(error, defaultMessage.ERROR)
      return this.responseHelper.onError(res, new Error('Error while Cleaning the chat'))
    } finally {
      if (t && !t.finished) {
        await t.rollback()
      }
    }
  }

  async sendBotLivechatMessage(req, res) {
    logger.debug('Started Bot Live chat Message....')
    const t = await sequelize.transaction();
    try {
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const body = req?.body;
      // console.log('body....XX', body)
      const { intialSteps, customerCheck } = body.data
      let callAgainFlag = { callAgain: false }
      if (intialSteps) {
        const response = { livechat: { message: 'Thanks for reaching to our services', autoTrigger: true, conversationId: uuid() } }
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
      } else if (customerCheck) {
        const response = { livechat: { message: 'Please Provide the Mobile Number', autoTrigger: false } }
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
      } else {
        const { senderID, exitPreviousFlow } = body.data;
        // console.log('(senderID)...', senderID)
        const inbound = await InboundMessages.findOne({
          where: {
            messageFrom: senderID,
            status: 'in progress',
            chatSource: 'LIVE-CHAT'
          },
          // transaction: t,
          order: [['inbound_id', 'DESC']]
        })

        if (inbound != null) {
          const inboundId = inbound.inboundId
          await InboundMessages.update({ status: 'closed' }, {
            where: {
              inboundId,
              status: 'in progress',
              chatSource: 'LIVE-CHAT'
            },
            transaction: t
          })
        }
        callAgainFlag = await createLiveChat(body.data, senderID, callAgainFlag)
        while (callAgainFlag.callAgain && callAgainFlag?.livechat === undefined) {
          callAgainFlag = await createLiveChat(body.data, senderID, callAgainFlag)
        }
        await t.commit()
        return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, callAgainFlag)
      }

    } catch (err) {
      // console.log(err)
    } finally {
      if (t && !t.finished) {
        await t.rollback();
      }
    }
  }

  async getServiceTypes(req, res) {
    try {
      logger.debug('Fetching Service Types')
      const serviceTypeResponse = await BusinessEntity.findAll({
        where: { codeType: 'CHAT_MENU', status: 'AC' },
        order: [['createdAt', 'ASC']]
      })
      logger.debug('Successfully fetch Service Types')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, serviceTypeResponse)
    } catch (error) {
      logger.error(error, 'Error while fetching Service Types')
      return this.responseHelper.onError(res, new Error('Error while fetching Service Types'))
    }
  }

  async getTarrifName(req, res) {
    try {
      logger.debug('Fetching Tarrif Name');
      if (!req?.body) {
        logger.info(defaultMessage.MANDATORY_FIELDS_MISSING)
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const tarrifNameResponse = await Plan.findOne({
        attributes: ["planName"],
        where: { refPlanCode: req.body.tarrifCode }
      })
      logger.debug('Successfully fetch Tarrif Name')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, tarrifNameResponse)
    } catch (error) {
      logger.error(error, 'Error while fetching Tarrif Name')
      return this.responseHelper.onError(res, new Error('Error while fetching Tarrif Name'))
    }
  }

  async getEnquiries(req, res) {
    try {
      logger.debug('Fetching Enquiries')
      const enquiryResponse = await ChatResponse.findAll({
        where: { menuId: 'CM_ENQ', menuStatus: 'AC' },
        order: [['menu_seq_no', 'ASC']]
      })
      logger.debug('Successfully fetch enquirys')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, enquiryResponse)
    } catch (error) {
      logger.error(error, 'Error while fetching enquirys')
      return this.responseHelper.onError(res, new Error('Error while fetching enquirys'))
    }
  }

  async getBoosterPlans(req, res) {
    try {
      logger.debug('Fetching Booster Plans')
      const planBootserResponse = await BoosterPlans.findAll({
        where: { status: 'ACTIVE' },
        order: [['plan_id', 'ASC']]
      })
      logger.debug('Successfully fetch booster plans')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, planBootserResponse)
    } catch (error) {
      logger.error(error, 'Error while fetching booster plans')
      return this.responseHelper.onError(res, new Error('Error while fetching booster plans'))
    }
  }

  async getImagineGo(req, res) {
    try {
      logger.debug('Fetching Enquiries')
      const imagineGoResponse = await ChatResponse.findAll({
        where: { menuId: 'CM_IMAGINEGO', menuStatus: 'AC' },
        order: [['menu_seq_no', 'ASC']]
      })
      logger.debug('Successfully fetch enquirys')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, imagineGoResponse)
    } catch (error) {
      logger.error(error, 'Error while fetching enquirys')
      return this.responseHelper.onError(res, new Error('Error while fetching enquirys'))
    }
  }
}

const createComplaint = async (complaint, userId, roleId, department, t, woType, planId, prodType) => {
  const data = transformComplaint(complaint)
  data.currRole = roleId
  data.createdBy = userId
  data.createdEntity = department
  data.currEntity = department
  data.currUser = (woType === 'FAULT') ? userId : null
  data.currStatus = (woType === 'FAULT') ? 'ASSIGNED' : 'NEW'
  data.woType = woType
  data.assignedDate = Date.now()
  data.businessEntityCode = prodType || 'Prepaid' // Hardcoded for Demo Purpose
  data.planId = planId || null
  data.chnlCode = "Whatsapp",
    data.problemCode = data.problemCode ? data.problemCode : data.problemType
  const complaintData = await Interaction.create(data, { transaction: t })

  if (data.kioskRefId !== null) {
    const kiosk = {
      status: 'CLOSED'
    }
    await Kiosk.update(kiosk, {
      where: {
        referenceNo: data.kioskRefId
      },
      transaction: t
    })
  }
  return complaintData
}

const getAddressData = async (waId) => {
  let payloadData = {
    district: '',
    simpang: '',
    state: '',
    postCode: '',
    country: 'Brunei Darussalam',
  }
  const response = await AddressLookup.findAll()
  let addressLookup = [];
  for (const row of response) {
    addressLookup.push({
      postCode: row.postCode,
      kampung: row.admUnit1,
      district: row.district
    })
  }
  const lastInbound = await InboundMessages.findAll({
    where: {
      waId,
      smsStatus: 'received',
    },
    raw: true,
    order: [['inbound_id', 'DESC']]//0=remarks,1=postcode,2=kampung,3=districts,4=simpang
  });
  let districts = []
  addressLookup.forEach((item) => {
    if (!districts.includes(item.district)) {
      districts.push(item.district);
    }
  });
  payloadData.simpang = lastInbound[4].body;
  payloadData.district = districts[lastInbound[3].body - 1]
  const kampungs = addressLookup.filter((ele) => ele.district == districts[lastInbound[3].body - 1])
  let kampungsData = []
  kampungs.forEach((item) => {
    if (!kampungsData.includes(item.kampung)) {
      kampungsData.push(item.kampung);
    }
  });
  payloadData.state = kampungsData[lastInbound[2].body - 1];
  const postCodes = addressLookup.filter((ele) => ele.kampung == kampungsData[lastInbound[2].body - 1])
  let unique = [];
  postCodes.forEach((item) => {
    if (!unique.includes(item.postCode)) {
      unique.push(item.postCode);
    }
  });
  payloadData.postCode = unique[lastInbound[1].body - 1];
  return payloadData;
}