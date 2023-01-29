import { smtp } from 'config'
import { logger } from '../config/logger'
const nodemailer = require('nodemailer')

export class EmailHelper {
  async sendMail (options) {
    try {
      logger.debug('Sending mail to user')
      const { to, message, subject } = options
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        auth: {
          user: smtp.userName,
          pass: smtp.password
        }
      })
      const response = await transporter.sendMail({
        from: smtp.fromEmailAddress,
        to,
        subject,
        html: message
      })
      logger.debug('Successfully send email')
      return response
    } catch (error) {
      logger.error('Error while sending email ', error)
    }
  }
}
