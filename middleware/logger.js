const logger = async (req, res, next) => {
  console.log(req.body);
  next();
};
module.exports = logger;