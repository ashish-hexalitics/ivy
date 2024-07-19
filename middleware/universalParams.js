const universalParams = async (req, res, next) => {
  try {
    if (req.header('x-request-date')) {
      req.current_date = req.header('x-request-date')
    }
    if (req.header('x-request-timestamp')) {
      req.current_timestamp = req.header('x-request-timestamp')
    }
    if (req.header('x-request-timezone')) {
      req.current_timezone = req.header('x-request-timezone')
    }
    if (req.header('x-request-platform')) {
      req.current_platform = req.header('x-request-platform')
    }
    next()
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'An Error occured' })
  }
}
module.exports = universalParams
