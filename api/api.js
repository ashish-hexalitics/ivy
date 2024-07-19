const express = require('express')

module.exports = function (apiParams) {
  const { api } = apiParams

  const AppendParams = async (req, res, next) => {
    try {
      req.modules = apiParams
      next()
    } catch (error) {
      console.log(error)
      res.status(500).json({
        message: 'An Error occured',
      })
    }
  }

  api.use(AppendParams)

  api.get('/', async (req, res) => {
    res.send('OK')
  })

  const admin_router = express.Router()
  api.use('/console', admin_router)
  require('./admin/admin_api')(admin_router)

  const account_router = express.Router();
  api.use('/account', account_router);
  require('./account/account.js')(account_router);

  const auth_router = express.Router();
  api.use('/auth', auth_router);
  require('./auth/index.js')(auth_router);
  
}
