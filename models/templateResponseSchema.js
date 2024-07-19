const mongoose = require("mongoose");

const templateResponseBody = new mongoose.Schema({
  template_id: {
    type: String,
    required: true,
    index: true,
  },
  display_name: {
    type: String,
    required: false,
    index: true,
  },
  entity_type: {
    type: String,
    required: true,
    index: true,
  },
  object_type: {
    type: String,
    required: false,
    index: true,
  },
  class_type: {
    type: String,
    required: false,
    index: true,
  },
  item_type: {
    type: String,
    required: false,
    index: true,
  },
  metadata: {
    type: Object,
    required: false,
    default: {},
  },
  answers: {
    type: Array,
    required: false,
    default: [],
  },
  images: {
    type: Array,
    required: false,
    default: [],
  },
  room_rank: {
    type: Number,
    required: false,
  },
  item_rank: {
    type: Number,
    required: false,
  },
});

const templateResponseSchema = mongoose.Schema(templateResponseBody, {
  timestamps: true,
});

templateResponseSchema.pre("save", async function (next) {
  next();
});

templateResponseSchema.post("save", async function () {});
const params = {};
// require("@model_method/userSchemaMethods/helper_methods")(propertySchema, params);
const TemplateResponse = mongoose.model(
  "TemplateResponse",
  templateResponseBody
);
module.exports = TemplateResponse;
