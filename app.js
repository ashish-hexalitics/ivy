require('dotenv').config()
require('module-alias/register')
require('./config/database')
const express = require('express')
const bodyParser = require('body-parser')
const compression = require('compression')

const cors = require('cors')

const app = express()
const http = require('http')
const useragent = require('express-useragent')

const morgan = require('morgan')
const fileUpload = require("express-fileupload");
app.use(fileUpload({
  useTempFiles: true,
  preserveExtension: true,
}))

app.use(bodyParser.urlencoded({
  extended: true
}));
app.set('trust proxy', true)

app.use(compression())

app.use(
  cors({
    origin: '*',
    optionsSuccessStatus: 200,
  })
)

app.use(useragent.express())

app.get('/Ping', async (req, res) => {
  res.status(200).send('ok')
})

app.use(
  morgan('dev', {
    skip(req, res) {
      if (res) {
      }
      if (req.originalUrl.indexOf('path') >= 0) {
        return true
      }
      return false
    },
  })
)

app.use(express.static('public'))


app.get('/', async (req, res) => {
  res.redirect('/console')
})

const server = http.createServer(app)

const router = express.Router()

router.use(
  express.urlencoded({
    limit: '100mb',
    extended: true,
  })
)
router.use(
  express.json({
    limit: '100mb',
    extended: false,
  })
)

const api = express.Router()

api.use(
  express.urlencoded({
    limit: '100mb',
    extended: true,
  })
)
api.use(
  express.json({
    limit: '100mb',
    extended: true,
  })
)

const logger = require('./middleware/logger')
const universalParams = require('./middleware/universalParams')

api.use(logger)
api.use(universalParams)
app.use('/api', api)

const apiParams = {
  api,
}
require('./api/api')(apiParams)

app.use('/', router)
require('./initializers/repeatables');
router.all('/*', (req, res) => {
  res.status(404).send('Not Found')
})
console.log('process.env.GENERIC_TENANCY_TYPE', process.env.GENERIC_TENANCY_TYPE)
const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})
