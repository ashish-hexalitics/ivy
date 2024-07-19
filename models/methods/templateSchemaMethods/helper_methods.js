const TemplateResponse = require("../../templateResponseSchema");

module.exports = function (templateSchema, ex_params) {
  templateSchema.methods.deleteReport = async function () {
    await this.remove();
    // const property = await Property.findById(this.property_id);
    // if (property) {
    //   property.reports_count = property.reports_count - 1;
    //   await property.save();
    // }
    await TemplateResponse.deleteMany({ template_id: this._id });
  };
};
