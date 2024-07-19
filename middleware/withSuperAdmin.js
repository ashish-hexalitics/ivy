module.exports = (req, res, next) => {
    try {
        const api_key = req.headers['x-api-key'];
        if(api_key!=process.env.SUPER_ADMIN_KEY){
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }
      next();
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'Error at super admin middleware' });
    }
  };
  