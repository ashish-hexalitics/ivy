const mongoose = require('mongoose');

const reportBody = new mongoose.Schema({
    property_id:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
    },
    ref_number:{
        type: String,
        required: true,
        unique: true
    },
    date:{
        type: Date,
        required: true
    },
    start_time:{
        type: String,
        required: true
    },
    end_time:{
        type: String,
        required: true
    },
    actual_start_time:{
        type: Date,
        required: false
    },
    actual_end_time:{
        type: Date,
        required: false
    },
    tenancy:{
        type: Boolean,
        required: true,
        default: false
    },
    report_type:{
        type: String,
        required: true
    },
    template_type:{
        type: String,
        required: false
    },
    // id of the one who is assigned to this report
    creator_type:{
        type: String,
        required: false
    },
    assigned_person_id:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
    },
    admin_id:{
        type: String,
        index: true,
        required: true
    },
    status:{
        type: String,
        default: 'pending',
    },
    linked_inventory_report:{
        type: String,
        required: false,
        default: null
    },
    notes:{
        type: [
            {
                text: {
                    type: String,
                    required: true
                },
                user_id:{
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Users',
                    required: true
                },
                date:{
                    type: Number,
                    required: true
                },
                name:{
                    type: String,
                    required: true
                }
            }
        ],
        required: false,
        default: []
    },
    skip_meter:{
        type: Boolean,
        required: false,
        default: false
    },
    skip_utilities :{
        type: Boolean,
        required: false,
        default: false
    },
    document_status:{
        type: String,
        required: false,
        default: 'pending'
    },
    documents:{
        type: [
            {
                url:{
                    type: String,
                    required: true
                },
                user_id:{
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Users',
                    required: true
                },
                name:{
                    type: String,
                    required: true
                },
                date:{
                    type: Number,
                    required: true
                }
            }
        ],
        required: false,
        default: [],
    }
});
const reportSchema = mongoose.Schema(reportBody, {
    timestamps: true
})


reportSchema.pre('save', async function (next) {
    next()
})

reportSchema.post('save', async function () {
})
const params={
}
require("@model_method/reportSchemaMethods/helper_methods")(reportSchema, params);
const Report = mongoose.model('Report', reportSchema)
module.exports = Report