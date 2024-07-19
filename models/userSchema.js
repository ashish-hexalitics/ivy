const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userBody = {
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  password: {
    type: String,
    required: true,
  },
  type: {
    enums: ["admin", "manager", "clerk", "customer"],
    type: String,
    required: true,
    index: true,
  },
  is_email_verified: {
    type: Boolean,
    default: false,
  },
  admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
    required: false,
  },
  email_verification_token: {
    type: String,
    required: false,
  },
  reset_password_token: {
    type: String,
    required: false,
  },
};

const userSchema = mongoose.Schema(userBody, {
  timestamps: true,
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  console.log("password is modified");
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.post("save", async function () {
  // console.log("checking role",this.type)
  // // console.log("checking role",this.role)
  // if(this.type=='admin'){
  //     this.admin_id=this._id;
  //     await this.save();
  // }
});
const params = {};
require("@model_method/userSchemaMethods/helper_methods")(userSchema, params);
const User = mongoose.model("Users", userSchema);
module.exports = User;
