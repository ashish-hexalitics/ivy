module.exports = (req, res, next) => {
  try {
    req.perPage = Number(req.query.limit) || 100;
    req.page = (Number(req.query.page) || 1) - 1;
    delete req.query.page;
    delete req.query.perPage;
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Error at pagination middleware' });
  }
};
