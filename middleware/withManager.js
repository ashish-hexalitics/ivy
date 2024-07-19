const User = require('@model/userSchema')
const jwt = require('jsonwebtoken')
const withManager = async (req, res, next) => {
    try {
        const bearerHeader = req.headers['authorization'];
        if (typeof bearerHeader !== 'undefined') {
            const bearer = bearerHeader.split(' ');
            const bearerToken = bearer[1];
            req.token = bearerToken;
            const user_id=await jwt.verify(req.token, process.env.JWT_SECRET).id;
            console.log(user_id,"admin_id")
            const user=await User.findOne({
                _id: user_id
            })
            if (!user || user.type=='customer' || user.type=='clerk' || user.is_email_verified==false) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
            }
            req.manager = user;
            delete req.manager.password;
            next();
        }
        else {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

    } catch (error) {
        console.log(error)
        res.status(401).json({
            message: "Unauthorized"
        });
    }


}
module.exports = withManager