const mongoose = require("mongoose");

module.exports = function (propertySchema, ex_params) {
    propertySchema.methods.deleteProperty = async function () {
        await this.remove();
        const customer= await mongoose.model("Customer").findOne({user_id :this.customer_user_id})
        if(customer){
            customer.properties_count= customer.properties_count - 1
            await customer.save()
        }
        const reports= await mongoose.model("Report").find({property_id : this._id});
        const requester = []
        reports.forEach(report => {
            requester.push(report.deleteReport());
        });
        await Promise.all(requester);
    }
    

}