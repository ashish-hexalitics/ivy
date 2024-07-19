const mongoose = require("mongoose");

const templateBody = new mongoose.Schema({
  date_created: {
    type: Date,
    required: false,
  },
  template_type: {
    type: String,
    required: true,
  },
  template_name: {
    type: String,
    required: true,
  },
  no_of_rooms: {
    type: Number,
    required: true,
  },
  // id of the one who is assigned to this report
  added_by: {
    type: Object,
    ref: "Users",
  },
  skip_meter: {
    type: Boolean,
    required: false,
    default: false,
  },
  skip_utilities: {
    type: Boolean,
    required: false,
    default: false,
  },
});

const templateSchema = mongoose.Schema(templateBody, {
  timestamps: true,
});

templateSchema.pre("save", async function (next) {
  next();
});

templateSchema.post("save", async function () {});
const params = {};
require("@model_method/templateSchemaMethods/helper_methods")(
  templateSchema,
  params
);
const Template = mongoose.model("Template", templateSchema);
module.exports = Template;
