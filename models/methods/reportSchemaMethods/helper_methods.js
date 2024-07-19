const Tenancy = require('@model/tenancySchema.js');
const Property = require('@model/propertySchema.js');
const ReportResponse = require('@model/reportResponseSchema.js');

module.exports = function (reportSchema, ex_params) {
    reportSchema.methods.deleteReport = async function () {
        
        await this.remove();
        const property=await Property.findById(this.property_id)
        if(property){
            property.reports_count=property.reports_count-1
            await property.save()
        }
        await Tenancy.deleteMany({report_id: this._id });
        await ReportResponse.deleteMany({report_id: this._id})
    }
    

}