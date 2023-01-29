import 'babel-polyfill'

import express from 'express'
import bodyParser from 'body-parser'
import config from 'config'
import { logger } from './config/logger'

import { task, retries, dropThoughtIntegration, SMSEmail, processChat } from './jobs/aios-cron'

const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('./swagger.json')

// const https = require('https')
const cors = require('cors')
const app = express()
const port = config.aios.port
const SocketIdArr = []

app.use(cors())
app.use(bodyParser.json({ limit: '20mb' }))
app.use(bodyParser.urlencoded({ extended: true }))

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
const routes = require('./route')
app.use('/api', routes)

const server = require('http').createServer(app)

server.listen(port, (err) => {
  if (err) {
    logger.error('Error occured while starting server: ', err)
    return
  }
  if (process.env.NODE_ENV === 'production' || (process.env.NODE_ENV === 'uat')) {
    task.start()
    retries.start()
  }
  logger.debug('Server started in port no: ', port)
})

const io = require('socket.io')(server, {
  cors: {
    origin: ['*', 'http://localhost:3001', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['my-custom-header'],
    credentials: true
  }
})

app.post('/jobs/:state', (req, res) => {
  const { state } = req.params
  if (state === 'start') {
    task.start()
    retries.start()
    SMSEmail.start()
    processChat.start()
  } else {
    task.stop()
    retries.stop()
    SMSEmail.stop()
    processChat.stop()
  }
  res.json({ status: 'ok' })
})

app.post('/dt-job/:state', (req, res) => {
  const { state } = req.params
  if (state === 'start') {
    dropThoughtIntegration.start()
  } else {
    dropThoughtIntegration.stop()
  }
  res.json({ status: 'ok' })
})

io.on('connection', (socket) => {
  // socket object may be used to send specific messages to the new connected client
  socket.on('channel-join', (email) => {
    return email
  });

  socket.on('messageByBot', (msg) => {
    io.emit(msg.split('^^')[1] + '-CLIENT-2', msg.split('^^')[0])
    return msg
  })

  // Message from client-1
  socket.on(socket.id, (message) => {
    // Receive the msg from client-1 and send into client-2
    io.emit(socket.id + '-CLIENT-2', message)
    if (!SocketIdArr.includes(socket.id)) {
      SocketIdArr.push(socket.id)
    }
    return message
  })

  // Message from client-2
  socket.on('CLIENT-2', (message) => {
    // Receive the msg from client-2 and send into client-1
    const arr = message.split('^^')
    io.emit(arr[1], arr[0])
    if (!SocketIdArr.includes(socket.id)) {
      SocketIdArr.push(socket.id)
    }
    return message
  })

  socket.on('disconnection', () => {
    logger.debug('disconnect the socket...');
    socket.disconnect()
  })
})
