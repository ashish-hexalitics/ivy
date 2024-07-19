const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const EmailService = require('@provider/EmailService')
const crypto = require("crypto");
const mongoose = require('mongoose');
module.exports = function (userSchema, ex_params) {
    userSchema.methods.generateRefreshToken = async function () {
        const refreshToken = jwt.sign({ _id: this._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_REFRESH_EXPIRE
        });
        return refreshToken;
    }
    userSchema.methods.getPropertyIdsOfCustomer = async function () {
        const Property = mongoose.model('Property');
        const properties = await Property.find({ customer_user_id: this._id }, { _id: 1 });
        const property_ids = properties.map(property => property._id);
        return property_ids;
    }
    userSchema.methods.getAssignedReportIds=async function(){
        const Report = mongoose.model('Report');
        const reports = await Report.find({ assigned_person_id: this._id }, { _id: 1 });
        const report_ids = reports.map(report => report._id);
        return report_ids;
    }
    userSchema.methods.generateAuthToken = async function () {
        return jwt.sign({id:this._id},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRE});
    }
    userSchema.methods.comparePassword=async function(enteredpassword){
        return await bcrypt.compare(enteredpassword,this.password);
    }
    userSchema.methods.generateEamilVerificationToken = async function () {
            const token = crypto.randomBytes(32).toString("hex");
            return token;
    }
    userSchema.methods.sendEmailVerificationLink = async function () {
        const token=await this.generateEamilVerificationToken();
        this.email_verification_token=token;
        await this.save();
        const url=`https://ivy.studiorav.co.uk/api/auth/verify_email?id=${this._id}&token=${token}`;
        const message=`<h1>Please verify your email</h1>
        <p>Click on the link below to verify your email</p>
        <a href=${url} clicktracking=off>${url}</a>
        `;
        try {
            await EmailService.send(this.email,'Email Verification',message);
        } catch (error) {
            console.log(error);
        }
    }

    userSchema.methods.generatePasswordResetToken = async function () {
            const token = crypto.randomBytes(32).toString("hex");
            return token;
    }

    userSchema.methods.sendPasswordResetEmail = async function () {
        const token=await this.generatePasswordResetToken();
        this.reset_password_token=token;
        await this.save();
        const url=`${process.env.FRONTEND_URL}/reset_password?token=${token}`;
        const message=`<h1>Reset your password</h1>
        <p>Click on the link below to reset your password</p>
        <a href=${url} clicktracking=off>${url}</a>
        `;
        try {
            await EmailService.send(this.email,'Password Reset',message);
        } catch (error) {
            console.log(error);
        }
    }

}