const mongoose = require('mongoose');

const reportResponseBody = new mongoose.Schema({
    report_id:{
        type: String,
        required: true,
        index: true,
    },
    display_name:{
        type: String,
        required: false,
        index: true,
    },
    entity_type:{
        type: String,
        required: true,
        index: true,
    },
    object_type:{
        type: String,
        required: false,
        index: true,
    },
    class_type:{
        type: String,
        required: false,
        index: true,
    },
    item_type:{
        type: String,
        required: false,
        index: true,
    },
    metadata:{
        type: Object,
        required: false,
        default: {},
    },
    answers:{
        type: Array,
        required: false,
        default: [],
    },
    images:{
        type: Array,
        required: false,
        default: [],
    },
    room_rank:{
        type: Number,
        required: false,
    },
    item_rank:{
        type: Number,
        required: false,
    },
});
const reportResponseSchema = mongoose.Schema(reportResponseBody, {
    timestamps: true
})


reportResponseSchema.pre('save', async function (next) {
    next()
})

reportResponseSchema.post('save', async function () {
})
const params={
}
// require("@model_method/userSchemaMethods/helper_methods")(propertySchema, params);
const ReportResponse = mongoose.model('ReportResponse', reportResponseSchema)
module.exports = ReportResponse