const asyncHandler = require('express-async-handler');
const User=require('@model/userSchema.js');
const cloudinary = require('cloudinary').v2;
const GlobalSettings=require('@model/globalSettingsSchema.js');
const fs = require('fs');
const aqp=require('api-query-params');
// const SmsService=require('@provider/SmsService/index.js');
const SmsService=require('@provider/SmsService');
const Report = require('@model/reportSchema.js');
const ReportResponse = require('@model/reportResponseSchema.js');
const Property = require('@model/propertySchema.js');
const Tenancy = require('@model/tenancySchema.js');
// const sms_service_provider=new SmsService();
const addAdminUser=asyncHandler(async (req,res) => {
    try{
        const {
            email,
            name,
            password,
        }=req.body;
        const admin=await User.create({
            email,
            name,
            password,
            type: 'admin'
        });
        res.status(201).json({
            success: true,
            message: 'Admin User Created'
        });
        await admin.sendEmailVerificationLink();
        admin.admin_id=admin._id;
        await admin.save();
    }
    catch(err){
        console.log(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
})
const imageUpload=asyncHandler(async (req,res) => {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
        const file = req.files.photo;
        let result = await cloudinary.uploader.upload(file.tempFilePath,{
            resource_type: 'auto',
            unique_filename: false,
            folder: 'report_documents',
            use_filename: true,
            public_id: file.name.split('.')[0]
        });
        result.secure_url=result.secure_url.replace('.heic','.jpg');
        result.url=result.url.replace('.heic','.jpg');
        res.status(200).json({
            success: true,
            data: result
        });
        fs.unlinkSync(file.tempFilePath);
    }
)
const documentUpload=asyncHandler(async (req,res) => {
    try{
        
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    const file = req.files.document;
    // console.log(file.name);
    let result;
    if(req.query.type=="report"){
        result = await cloudinary.uploader.upload(file.tempFilePath,{
            resource_type: 'auto',
            unique_filename: false,
            folder: 'report_documents',
            use_filename: true,
            public_id: file.name.split('.')[0]
        });
    }
    else{
    result = await cloudinary.uploader.upload(file.tempFilePath,{
        resource_type: 'auto'
    });}
    res.status(200).json({
        success: true,
        data: result
    });
    fs.unlinkSync(file.tempFilePath);
    }
    catch(error){
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}
)
const deleteAdminUser=asyncHandler(async (req,res) =>{
    try{
        const admin_id=req.params.id;
        await User.deleteMany({
            admin_id
        });
        res.status(200).json({
            success: true,
            message: 'Admin User Deleted'
        });
    }
    catch(error){
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
})

const createSettings=asyncHandler(async (req,res) => {
    try{
        const {
            entity_type,
            entity_value
        }= req.body;
        const global_settings=await GlobalSettings.findOne({
            entity_type
        });
        if(global_settings){
            return res.status(400).json({
                success: false,
                message: 'Settings Already Exists'
            });
        }
        const settings=await GlobalSettings.create({
            entity_type,
            entity_value
        });
        res.status(201).json({
            success: true,
            data: settings
        });
    }
    catch(error){
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
})

const updateSettings=asyncHandler(async (req,res) => {
    try{
        await GlobalSettings.findByIdAndUpdate(req.params.id,req.body,{
            new: true,
            runValidators: true
        });
        res.status(200).json({
            success: true,
            message: 'Settings Updated'
        });
    }
    catch(error){
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
})
const getSettings=asyncHandler(async (req,res) => {
    const custom_query=req.query;
    let {
        filter,
        skip,
        limit,
        sort,
        projection,
        populate
    }=aqp({
        skip: req.page*req.limit,
        ...custom_query
    })
    const settings=await GlobalSettings.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .select(projection)
        .populate(populate);
    res.status(200).json({
        success: true,
        data: settings
    });
})
const deleteSettings=asyncHandler(async (req,res) => {
    const settings=await GlobalSettings.findByIdAndDelete(req.params.id);
    if(!settings){
        return res.status(404).json({
            success: false,
            message: 'Settings Not Found'
        });
    }
    res.status(200).json({
        success: true,
        message: 'Settings Deleted'
    });
})
const sendSms=asyncHandler(async (req,res) => {
    const {
        message,
        phone_number
    }=req.body;
    await SmsService.send(phone_number,message);
    res.status(200).json({
        success: true,
        message: 'Sms Sent'
    });
})
const SettingsExcel = require('@model/settingsExcel.js');

const getItemDescription=asyncHandler(async(req,res)=>{
    const item=req.query.item;
    const item_name=`item_description_${item}`;
    let gb=await SettingsExcel.findOne({
        entity_type:item_name,
    })
    if(!gb){
        gb=await SettingsExcel.findOne({
            entity_type:'item_description_default'
        })
    }
    res.json({
        success:true,
        data:gb
    })
})
const axios = require('axios');
const { promisify } = require('util');
const xlsx = require('xlsx');
const unlinkAsync = promisify(fs.unlink);

const ingestSettings = asyncHandler(async (req, res) => {
    const fileUrl = req.body.fileUrl;

    if (!fileUrl) {
        return res.status(400).json({ success: false, message: 'File URL is missing' });
    }

    try {
        const response = await axios.get(fileUrl, { responseType: 'stream' });
        const tempFilePath = './temp.xlsx';
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const workbook = xlsx.readFile(tempFilePath);

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];

            const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

            let entity_value = {};

            let currentKey = null;
            let currentValues = [];

            // Process the data in the sheet
            for (const row of jsonData) {
                if (!row.length) {
                    // If currentKey is set, save the currentValues array to entity_value
                    if (currentKey) {
                        entity_value[currentKey] = currentValues;
                        currentValues = [];
                    }
                    currentKey = null;
                    continue;
                }
                // If currentKey is not set, set it to the first non-empty value in the row
                if (!currentKey) {
                    currentKey = row.find(value => value !== undefined && value !== '');
                } else {
                    // Add non-empty values to the currentValues array
                    const values = row.filter(value => value !== undefined && value !== '');
                    currentValues = currentValues.concat(values);
                }
            }

            // If currentKey is set, save the currentValues array to entity_value
            if (currentKey) {
                entity_value[currentKey] = currentValues;
            }

            // Create a new SettingsExcel document for each sheet
            const settingsExcel = new SettingsExcel({
                entity_type: `item_description_${sheetName}`,
                entity_value: entity_value
            });
            await settingsExcel.save();
        }
        await unlinkAsync(tempFilePath);

        return res.status(200).json({ success: true, message: 'Settings ingested successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Error processing the file' });
    }
});
const getReport=asyncHandler(async(req,res)=>{
    const report=await Report.findById(req.params.id);
    if(!report){
        return res.status(404).json({
            success:false,
            message:'Report Not Found'
        });
    }
    const report_response=await ReportResponse.find({
        report_id:report._id
    })
    const tenancy=await Tenancy.findOne({
        report_id:report._id
    });
    const property=await Property.findById(report.property_id);
    res.status(200).json({
        success:true,
        data:{report,report_response,tenancy,property}
    });
})

const getSignatureStatus = asyncHandler(async (req, res) => {
    const report_id = req.params.id;
    const tenant_id = req.params.tenant_id;
    // check metadata.id as tenant_id , report_id and entity_type as tenant_signature
    const report_response = await ReportResponse.findOne({
      report_id,
      entity_type: "tenant_signature",
    });
    if (report_response) {
      if (report_response.metadata.id == tenant_id) {
        res.status(200).json({
          status: "signed",
        });
      } else {
        res.status(200).json({
          status: "pending",
        });
      }
    } else {
      res.status(200).json({
        status: "pending",
      });
    }
  });
module.exports={
    addAdminUser,
    imageUpload,
    documentUpload,
    deleteAdminUser,
    createSettings,
    getSettings,
    deleteSettings,
    updateSettings,
    sendSms,
    getItemDescription,
    ingestSettings,
    getReport,
    getSignatureStatus
}
