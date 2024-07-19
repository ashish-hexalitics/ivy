const mongoose = require('mongoose');

const customerBody = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: false
    },
    town: {
        type: String,
        required: false
    },
    postcode: {
        type: String,
        required: false
    },
    email: {
        type: String,
        unique: true,
        required: true
    },
    contact_number: {
        type: String,
        required: false
    },
    company_no: {
        type: String,
        required: false
    },
    vet_no: {
        type: String,
        required: false
    },
    logo: {
        type: Array,
        default: [],
        required: false
    },
    contact_information: [{
        name: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        mobile:{
            type: String,
            required: false
        }
    }],
    notes: {
        type: Array,
        default: [],
        required: false
    },
    website_url: {
        type: String,
        required: false
    },
    admin_id:{
        type: String,
        required:true,
        index: true,
    },
    iv:{
        type: String,
        required: false
    },
    user_id:{
        type: String,
        required:false,
    },
    properties_count:{
        type: Number,
        required: false,
        default: 0
    },
    reports_count:{
        type: Number,
        required: false,
        default: 0
    }
});
const customerSchema = mongoose.Schema(customerBody, {
    timestamps: true
})


customerSchema.pre('save', async function (next) {
    next()
})

customerSchema.post('save', async function () {
})
const params={
}
require("@model_method/customerSchemaMethods/helper_methods")(customerSchema, params);
const Customer = mongoose.model('Customer', customerSchema)
module.exports = Customer