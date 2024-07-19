const mongoose = require('mongoose');

const propertyBody = new mongoose.Schema({
    customer_user_id:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
    },
    ref_number: {
        type: String,
        required: false
    },
    address: {
        type: String,
        required: true
    },
    town: {
        type: String,
        required: true
    },
    postcode: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        required: true
    },
    furnishing: {
        type: Boolean,
        required: false
    },
    bedrooms: {
        type: Number,
        required: false
    },
    bathrooms: {
        type: Number,
        required: false
    },
    amenities: {
        type: Array,
        default: [],
        required: false
    },
    photos: {
        type: Array,
        default: [],
        required: false
    },
    notes:{
        type: Array,
        default: [],
        required: false
    },
    admin_id:{
        type: String,
        required:true,
        index: true,
    },
    tenancies_count:{
        type: Number,
        required: false,
        default: 0
    },
    reports_count:{
        type: Number,
        required: false,
        default: 0
    },
});
const propertySchema = mongoose.Schema(propertyBody, {
    timestamps: true
})


propertySchema.pre('save', async function (next) {
    next()
})

propertySchema.post('save', async function () {
})
const params={
}
require("@model_method/propertySchemaMethods/helper_methods")(propertySchema, params);
const Property = mongoose.model('Property', propertySchema)
module.exports = Property