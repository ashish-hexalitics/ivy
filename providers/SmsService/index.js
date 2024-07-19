class SmsService {
    constructor() {
       
    }
    static async send(phone, message) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        this.client = require('twilio')(accountSid, authToken);
        await this.client.messages.create({
            to: phone, 
            from: process.env.TWILIO_PHONE_NUMBER,
            body: message
          })
    }

}

module.exports = SmsService