import { InboundMessages, BusinessEntity, ProblemNotifyMap, sequelize } from '../model'
import { logger } from '../config/logger'
// import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } from 'config'
import jsonata from 'jsonata'
import { defaultMessage } from '../utils/constant'

const Got = require('got')


export async function createLiveChat(body, senderID, callAgainFlag) {
  let callAgain = false
  let response = 'Created'
  let whatsAppResp
  if (!callAgainFlag.callAgain) {
    const chatData = {
      smsMessageSid: body.conversationId,
      waId: body.senderID, // Customer Mobile Number
      smsStatus: 'received', // recevied for receiving from Livechat
      body: body.msg,
      messageFrom: senderID, // Customer Mobile Number,
      payload: body
    }
    response = await storeChat(chatData)
  }
  if (response === 'Created') {
    const data = {
      mobileNumber: body.senderID,
      msg: body.msg, // Msg from Livechat
      source: 'LIVE-CHAT'
    }
    const workflowResponse = await Got.post({
      headers: { 'content-type': 'application/json' },
      url: 'http://localhost:4000/api/web-live-chat', // chatByWorkflow is calling from here
      body: JSON.stringify(data),
      retry: 0
    }, {
      https: {
        rejectUnauthorized: false
      }
    })
    const wfResponse = JSON.parse(workflowResponse.body)
    // console.log('wfResponse...>>>>>', wfResponse)

    if (wfResponse?.message !== 'WORKFLOWEND' && wfResponse?.message === undefined) {
      // console.log('hereeeee............>>>>')
      callAgain = true
      return { callAgain: callAgain }
    }

    if (typeof (wfResponse.message) === 'object') {
      if (wfResponse?.message?.executeSendMessageTaskResult?.type === 'SENDMESSAGE' || wfResponse?.message?.type === 'API') {
        callAgain = true
      }

      if (wfResponse?.message?.executeSendMessageTaskResult?.taskContextPrefix !== undefined) {
        // console.log('here....')
        const separatedStr = wfResponse?.message?.executeSendMessageTaskResult?.taskContextPrefix.split('$.')
        if (separatedStr[1] !== undefined) {
          const expr = '$.' + separatedStr[1]
          const expression = jsonata(expr)
          const value = expression.evaluate(wfResponse?.message?.inputContext)
          const respOfWhatsapp  = separatedStr[0].replace("--@#@--", value);
          whatsAppResp = respOfWhatsapp
        } else if (wfResponse?.message?.executeSendMessageTaskResult?.taskContextPrefix === 'Notification here..') {
          // console.log('body.msg........cxxxxxxxxxxxxx.....xx..', JSON.parse(body?.msg));
          const data = JSON.parse(body?.msg);
          const problemCode = data?.problemCode;
          // console.log('problemCode...........xxxx.....', problemCode);

          const notification = await fetchNotification(problemCode);
          // console.log('notification......', notification)
          whatsAppResp = notification?.probNotification

        } else {
          // console.log('1111111111111111111...send msg......')
          whatsAppResp = wfResponse?.message?.executeSendMessageTaskResult?.taskContextPrefix
        }
      } else {
        whatsAppResp = wfResponse?.message?.taskContextPrefix
      }
    }
    if (wfResponse?.message !== 'WORKFLOWEND') {
      whatsAppResp = {
        senderID: senderID,
        message: whatsAppResp || wfResponse?.message,
        SmsStatus: 'sent'
      }
    }
  }
  return { callAgain: callAgain, livechat: whatsAppResp }
}

export const storeChat = async (body) => {
  const t = await sequelize.transaction()
  try {
    logger.info('Creating Live chat Data')
    const data = {
      smsMessageSid: body.smsMessageSid, // Random First time Number
      waId: body.waId, // Customer Mobile Number
      smsStatus: body.smsStatus, // recevied for receiving from Livechat
      body: body.payload.msg ? body.body : JSON.stringify(body.payload),
      messageFrom: body.messageFrom, // Customer Mobile Number
      createdAt: new Date(),
      status: 'in progress',
      flag: body.flag !== undefined ? body.flag : '',
      chatSource: 'LIVE-CHAT'
    }
    await InboundMessages.create(data, { transaction: t })
    await t.commit();
    logger.debug('Successfully created chat')
    return 'Created'
  } catch (error) {
    logger.error(error, defaultMessage.NOT_FOUND)
    return 'Error'
  }
  finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

export const fetchNotification = async (body) => {
  try {
    logger.info('Fetching notifications..')
    const hasRecord = await ProblemNotifyMap.findOne({
      attribute: ['probNotification'],
      where: {
        probCodeId: body
      },
      raw: true,
      logging: true,
    });
    logger.debug('Successfully Fetched notifications')
    return hasRecord;
  } catch (error) {
    logger.error(error, defaultMessage.NOT_FOUND)
    return 'Error'
  }
}

export const sendMessage = async (whatsAppResp, senderId) => {
  try {
    // await client.messages
    //   .create({
    //     body: whatsAppResp,
    //     from: 'whatsapp:+14155238886',
    //     to: senderId
    //   })
    //   .then(message => console.log(message.sid))
    //   .done()
    // return 'Sent'
  } catch (err) {
    console.log(err)
    return 'Not Sent'
  }
}
