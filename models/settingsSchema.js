const mongoose = require('mongoose');

const settingsBody = new mongoose.Schema({
    admin_id:{
        type: String,
        required: true,
        index: true,
    },
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
const settingsSchema = mongoose.Schema(settingsBody, {
    timestamps: true
})


settingsSchema.pre('save', async function (next) {
    next()
})

settingsSchema.post('save', async function () {
})
const params={
}
// require("@model_method/userSchemaMethods/helper_methods")(propertySchema, params);
const Settings = mongoose.model('Settings', settingsSchema)
module.exports = Settings