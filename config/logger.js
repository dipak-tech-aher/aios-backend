import bunyan from 'bunyan'

const logger = bunyan.createLogger({ name: 'aios' })

if (process.env.NODE_ENV === 'production') {
  logger.addStream({
    level: 'debug',
    stream: process.stdout
  })
} else {
  logger.addStream({
    level: 'trace',
    stream: process.stdout
  })
}

export {
  logger
}
