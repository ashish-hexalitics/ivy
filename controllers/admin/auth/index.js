const User = require("@model/userSchema.js");
const Customer = require("@model/customerSchema.js");
const asyncHandler = require("express-async-handler");
const aqp = require("api-query-params");
const EmailService = require("@provider/EmailService");
const login = asyncHandler(async (req, res) => {
  const { email, password, type } = req.body;
  const user = await User.findOne({ email });
  if (!user || user.is_email_verified === false) {
    return res.status(404).json({
      success: false,
      message: "User not found or email not verified",
    });
  }
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(404).json({
      success: false,
      message: "Incorrect Password",
    });
  }
  const access_token = await user.generateAuthToken();
  res.status(200).json({
    success: true,
    name: user.name,
    type: user.type,
    message: "Login Successful",
    data: {
      access_token,
    },
  });
});
const ping = asyncHandler(async (req, res) => {
  console.log(req.user, "inside ping");
  res.status(200).json({
    success: true,
    message: "Ping Successful",
  });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { id, token } = req.query;
  const user = await User.findOne({
    _id: id,
    email_verification_token: token,
  });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  user.is_email_verified = true;
  user.email_verification_token = undefined;
  await user.save();
  res.status(200).json({
    success: true,
    message: "Email Verified",
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.query;
  const user = await User.findOne({
    email,
  });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  await user.sendPasswordResetEmail();
  res.status(200).json({
    success: true,
    message: "Password reset link sent to your email",
  });
});
const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.query;
  const { password } = req.body;
  const user = await User.findOne({
    reset_password_token: token,
  });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  user.password = password;
  user.reset_password_token = undefined;
  await user.save();
  res.status(200).json({
    success: true,
    message: "Password reset successfully",
  });
});

const getData = asyncHandler(async (req, res) => {
  try {
    const user = await Customer.findOne({
      user_id: "644d415e74f180d9c16bf6f1",
    });
    // const user = {
    //   is_email_verified: true,
    //   _id: "644d415e74f180d9c16bf6f1",
    //   email: "info@studiorav.co.uk",
    //   name: "Studio Rav2",
    //   password: "Admin123",
    //   type: "admin",
    //   createdAt: "2023-04-29T16:10:06.874Z",
    //   updatedAt: "2024-07-30T10:13:05.785Z",
    //   __v: 0,
    //   admin_id: "644d415e74f180d9c16bf6f1",
    //   reset_password_token:
    //     "",
    // };
    res.status(200).json({ user });
  } catch (error) {
    res.status(200).json({
      success: true,
      message: "data fetched successfully",
    });
  }
});
module.exports = {
  login,
  ping,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getData,
};
