const mongoose = require('mongoose');

const tenancyBody = new mongoose.Schema({
    property_id:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
    },
    ref_number:{
        type: String,
        required: false
    },
    type:{
        type: String,
        required:false
    },
    tenants : [{
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
        },
        status:{
            type: String,
            required: true,
            default: 'pending'
        },
        signed_timestamp:{
            type: Number,
            required: false
        },
    }],
    admin_id:{
        type: String,
        index: true,
        required: true
    },
    report_id:{
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        required: true,
        ref: 'Report'
    },
    iv:{
        type: String,
        required: true,
    },
    start_date:{
        type:String,
        required: true
    }
});
const tenancySchema = mongoose.Schema(tenancyBody, {
    timestamps: true
})


tenancySchema.pre('save', async function (next) {
    next()
})

tenancySchema.post('save', async function () {
})
const params={
}
const Tenancy = mongoose.model('Tenancy', tenancySchema)
module.exports = Tenancy