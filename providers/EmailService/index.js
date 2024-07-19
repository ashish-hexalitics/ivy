const nodemailer= require('nodemailer');
const asyncHandler=require('express-async-handler');
class EmailService {
    constructor(){
    }
    static async send(email,subject, message){
        console.log("email sending  done")
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.MAIL_SERVICE_EMAIL,
                    pass: process.env.MAIL_SERVICE_PASSWORD,
                },
            });
            const options = await transporter.sendMail({
                from: {
                    name: 'Ivy Inventory',
                    address: process.env.MAIL_SERVICE_EMAIL,
                },
                to: email,
                cc:['rav220@hotmail.com','navnit28anand@gmail.com','amanchauhan3004@gmail.com','rrajj7674@gmail.com'],
                subject: subject,
                html: message
            });
        } catch (err) {
            console.log(err);
        }

    }


}
module.exports=EmailService;