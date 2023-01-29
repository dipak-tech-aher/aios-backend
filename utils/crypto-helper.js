import crypto from 'crypto'
import { secret, iv, algorithm, hashAlgorithm, sessionTimeOut } from 'config'
import jwt from 'jsonwebtoken'

let instance
export class CryptoHelper {
  constructor () {
    if (!instance) {
      instance = this
    }
    return instance
  }

  encrypt (data) {
    const cipher = crypto.createCipheriv(algorithm, secret, iv)
    data = JSON.stringify(data)
    return cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
  }

  decrypt (data) {
    const decipher = crypto.createDecipheriv(algorithm, secret, iv)
    const decryptedData = decipher.update(data, 'hex', 'utf8') + decipher.final('utf8')
    return JSON.parse(decryptedData)
  }

  createHmac (data) {
    const hmac = crypto.createHmac(hashAlgorithm, secret)
    return hmac.update(JSON.stringify(data)).digest('hex')
  }

  createHash (data) {
    const hash = crypto.createHash(hashAlgorithm)
    hash.update(JSON.stringify(data))
    return hash.digest('hex')
  }

  createJWT (data) {
    return jwt.sign(data, secret)
  }

  verifyJWT (token) {
    return jwt.verify(token, secret)
  }

  random () {
    return crypto.randomBytes(256).toString('base64')
  }

  createAccessToken (data) {
    const keyPart2 = this.createHmac(data)
    const date = new Date()
    const fifteenMinutes = new Date(date.getTime() + sessionTimeOut) // 15mns validatity
    const accessTokenPayload = this.encrypt({
      id: data.userId,
      sid: data.sessionId,
      key: keyPart2,
      salt: this.random(),
      expiresIn: fifteenMinutes
    })
    return this.createJWT(accessTokenPayload)
  }

  // Create password hash using Password
  hashPassword (password) {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(password, salt, 2048, 32, hashAlgorithm).toString('hex')
    return [salt, hash].join('$')
  }

  // Checking the password hash
  verifyHash (password, original) {
    const originalHash = original.split('$')[1]
    const salt = original.split('$')[0]
    const hash = crypto.pbkdf2Sync(password, salt, 2048, 32, hashAlgorithm).toString('hex')
    if (hash === originalHash) { return true } else { return false }
  }
}
