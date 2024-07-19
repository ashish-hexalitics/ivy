const mongoose = require('mongoose');

const settingsExcelBody = new mongoose.Schema({
    entity_type:{
        type: String,
        required: true,
        index: true,
    },
    entity_value:{
        type : Object,
        default:{},
        required: false,
    },
});
const settingsExcelSchema = mongoose.Schema(settingsExcelBody, {
    timestamps: true
})

settingsExcelSchema.pre('save', async function (next) {
    next()
})

settingsExcelSchema.post('save', async function () {
})

const SettingsExcel = mongoose.model('SettingsExcel', settingsExcelSchema)
module.exports = SettingsExcel