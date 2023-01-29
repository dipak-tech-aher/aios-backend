import { sms } from 'config'
import { logger } from '../config/logger'
import got from 'got'

export class SMSHelper {
  async sendSMS (options) {
    try {
      logger.debug('Sending sms to user')
      const { to, message } = options
      let response = await got.get({
        url: sms.URL + '?app=' + sms.app + '&u=' + sms.u + '&h=' + sms.h + '&op=' +
          sms.op + '&to=' + to + '&msg=' + encodeURI(message),
        retry: 0
      })
      response = JSON.parse(response.body)
      logger.debug('Successfully send sms')
      return response
    } catch (error) {
      logger.error('Error while sending sms ', error)
    }
  }
}
