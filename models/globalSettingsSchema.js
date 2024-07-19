const mongoose = require('mongoose');

const globalSettingsBody = new mongoose.Schema({
    entity_type:{
        type: String,
        required: true,
        index: true,
    },
    entity_value:{
        type:Array,
        default:[],
        required: false,
    },
});
const globalSettingsSchema = mongoose.Schema(globalSettingsBody, {
    timestamps: true
})


globalSettingsSchema.pre('save', async function (next) {
    next()
})

globalSettingsSchema.post('save', async function () {
})
const params={
}
// require("@model_method/userSchemaMethods/helper_methods")(propertySchema, params);
const GlobalSettings = mongoose.model('GlobalSettings', globalSettingsSchema)
module.exports = GlobalSettings