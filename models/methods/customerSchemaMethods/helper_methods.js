const Tenancy = require('@model/tenancySchema.js');
const Property = require('@model/propertySchema.js');
const ReportResponse = require('@model/reportResponseSchema.js');
const User = require('@model/userSchema.js');

module.exports = function (customerSchema, ex_params) {
    customerSchema.methods.deleteCustomer = async function () {
        await this.remove();
        const user=await User.findOneAndDelete({email:this.email});
        const properties= await Property.find({customer_user_id:user._id})
        const requester =[];
        properties.forEach(property => {
            requester.push(property.deleteProperty());
        });
        await Promise.all(requester);
    }
    

}