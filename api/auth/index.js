const AuthController = require('@controller/admin/auth');
module.exports = function (router) {
    router.post('/login',[],AuthController.login);
    router.post('/ping',[],AuthController.ping);
    router.get('/verify_email',[],AuthController.verifyEmail);
    router.get('/forgot_password',[],AuthController.forgotPassword);
    router.post('/reset_password',[],AuthController.resetPassword);
    router.get('/getData',[],AuthController.getData);
}