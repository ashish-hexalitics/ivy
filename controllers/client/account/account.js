const Customer = require("@model/customerSchema.js");
const Property = require("@model/propertySchema.js");
const User = require("@model/userSchema.js");
const jwt = require("jsonwebtoken");
const Settings = require("@model/settingsSchema.js");
const GlobalSettings = require("@model/globalSettingsSchema.js");
const asyncHandler = require("express-async-handler");
const aqp = require("api-query-params");
const Tenancy = require("@model/tenancySchema.js");
const Report = require("@model/reportSchema.js");
const Template = require("@model/templateSchema.js");
const ReportResponse = require("@model/reportResponseSchema.js");
const TemplateResponse = require("@model/templateResponseSchema.js");
const EmailService = require("@provider/EmailService");
// const cloudinary = require('cloudinary').v2;
const CloudinaryProvider = require("@provider/cloudinary");
const cloudinary_provider = new CloudinaryProvider();
const { Readable } = require("stream");
const { encrypt } = require("@helpers/encrypt");
const { decrypt } = require("@helpers/decrypt");
const { cleanString } = require("@helpers/string");
const { PDFDocument, rgb } = require("pdf-lib");
const puppeteer = require("puppeteer");
const fs = require("fs");
var crypto = require("crypto");
const moment = require("moment");
const e = require("express");
const { compresssReport } = require("@helpers/child_threads_helper.js");
const { clearObject } = require("../../../helpers/utils");

const deleteProperty = asyncHandler(async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }
    await property.deleteProperty();
    res.status(200).json({
      success: true,
      message: "Property Deleted",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const updateProperty = asyncHandler(async (req, res) => {
  if (req.body.notes) {
    for (let i = 0; i < req.body.notes.length; i++) {
      req.body.notes[i].user_id = req.clerk._id;
      req.body.notes[i].timestamp = new Date();
    }
  }
  try {
    await Property.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({
      success: true,
      message: "Property Updated",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const getProperties = asyncHandler(async (req, res) => {
  const custom_query = req.query;
  custom_query["admin_id"] = req.user.admin_id;
  req.user.type == "customer"
    ? (custom_query["customer_user_id"] = req.user._id)
    : console.log("not customer");
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const properties = await Property.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    //populate customer name
    .populate({
      path: "customer_user_id",
      select: "name",
    });
  res.status(200).json({
    success: true,
    data: properties,
  });
});

const getCustomers = asyncHandler(async (req, res) => {
  const custom_query = req.query;
  custom_query["admin_id"] = req.user.admin_id;
  req.user.type == "customer"
    ? (custom_query["email"] = req.user.email)
    : console.log("not customer");
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const customers = await Customer.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .populate(populate);
  for (let i = 0; i < customers.length; i++) {
    for (let j = 0; j < customers[i].contact_information.length; j++) {
      customers[i].contact_information[j].name = await decrypt(
        customers[i].contact_information[j].name,
        customers[i].iv
      );
      customers[i].contact_information[j].email = await decrypt(
        customers[i].contact_information[j].email,
        customers[i].iv
      );
    }
  }
  res.status(200).json({
    success: true,
    data: customers,
  });
});

const createCustomer = asyncHandler(async (req, res) => {
  let {
    name,
    address,
    town,
    postcode,
    email,
    contact_number,
    company_no,
    vet_no,
    logo,
    password,
    contact_information,
    notes,
    website_url,
  } = req.body;

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "A user with this email already exists",
    });
  }

  // console.log(req.user)
  //for every object inside array notes create new field with user id and timestamp
  let iv = crypto.randomBytes(16);
  if (contact_information) {
    for (let i = 0; i < contact_information.length; i++) {
      contact_information[i].name = await encrypt(
        contact_information[i].name,
        iv
      );
      contact_information[i].email = await encrypt(
        contact_information[i].email,
        iv
      );
    }
  }
  iv = Buffer.from(iv, "binary").toString("base64");
  if (notes) {
    for (let i = 0; i < notes.length; i++) {
      notes[i].user_id = req.clerk._id;
      notes[i].timestamp = new Date();
    }
  }
  let customer, user;
  try {
    [customer, user] = await Promise.all([
      Customer.create({
        name,
        address,
        town,
        postcode,
        email,
        contact_number,
        company_no,
        vet_no,
        logo,
        admin_id: req.clerk.admin_id,
        contact_information,
        notes,
        iv,
        website_url,
      }),
      User.create({
        email,
        password,
        name,
        type: "customer",
        admin_id: req.clerk.admin_id,
      }),
    ]);
    customer.user_id = user._id;
    await customer.save();
    console.log("Customer :", customer);
    res.status(201).json({
      success: true,
      message: "Customer created successfully",
    });
    await user.sendEmailVerificationLink();
  } catch (error) {
    console.log("customer not found");
    try {
      await User.findOneAndDelete({
        email,
      });
    } catch (err) {
      console.log("user not found");
    }
    try {
      console.log("user not found");
      await Customer.findOneAndDelete({
        email,
      });
    } catch (err) {
      console.log("customer not found");
    }
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      // Duplicate key error, email already exists
      res.status(400).json({
        success: false,
        message: "This customer already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const createProperty = asyncHandler(async (req, res) => {
  try {
    const {
      customer_user_id,
      ref_number,
      address,
      town,
      postcode,
      type,
      furnishing,
      bedrooms,
      bathrooms,
      tags,
      amenities,
      photos,
      notes,
    } = req.body;
    console.log("notes", notes);
    if (notes) {
      for (let i = 0; i < notes.length; i++) {
        notes[i].user_id = req.clerk._id;
        notes[i].timestamp = new Date();
      }
    }
    const customer = await User.findById(customer_user_id);
    if (
      !customer ||
      customer.type !== "customer" ||
      String(customer.admin_id) !== String(req.clerk.admin_id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or invalid",
      });
    }
    await Property.create({
      customer_user_id,
      ref_number,
      address,
      town,
      postcode,
      type,
      furnishing,
      bedrooms,
      bathrooms,
      tags,
      amenities,
      photos,
      notes,
      admin_id: req.clerk.admin_id,
    });
    const actual_customer = await Customer.findOne({
      user_id: customer_user_id,
    });
    actual_customer.properties_count = actual_customer.properties_count + 1;
    await actual_customer.save();
    res.status(201).json({
      success: true,
      message: "Property created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customerUser = await User.findOne({ email: req.body.email });
  console.log(customerUser);
  delete req.body._id;
  delete req.body.email;
  delete req.body.properties_count;
  delete req.body.user_id;
  delete req.body.admin_id;
  delete req.body.email;
  if (req.body.notes) {
    for (let i = 0; i < req.body.notes.length; i++) {
      if (!req.body.notes[i].user_id) {
        req.body.notes[i].user_id = req.clerk._id;
        req.body.notes[i].timestamp = new Date();
      }
    }
  }
  const iv = crypto.randomBytes(16);
  if (req.body.contact_information) {
    for (let i = 0; i < req.body.contact_information.length; i++) {
      req.body.contact_information[i].name = await encrypt(
        req.body.contact_information[i].name,
        iv
      );
      req.body.contact_information[i].email = await encrypt(
        req.body.contact_information[i].email,
        iv
      );
    }
  }
  req.body.iv = Buffer.from(iv, "binary").toString("base64");
  try {
    await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    customerUser.name = req.body.name;
    await customerUser.save();
    res.status(200).json({
      success: true,
      message: "Customer Updated",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }
  await customer.deleteCustomer();
  res.status(200).json({
    success: true,
    message: "Customer Deleted",
  });
});

const createManager = asyncHandler(async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const user = await User.create({
      email,
      password,
      name,
      type: "manager",
      admin_id: req.admin.admin_id,
    });
    res.status(201).json({
      success: true,
      message: "Manager created successfully",
    });
    await user.sendEmailVerificationLink();
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const createClerk = asyncHandler(async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const user = await User.create({
      email,
      password,
      name,
      type: "clerk",
      admin_id: req.manager.admin_id,
    });
    res.status(201).json({
      success: true,
      message: "Clerk created successfully",
    });
    await user.sendEmailVerificationLink();
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const deleteClerk = asyncHandler(async (req, res) => {
  const clerk = await User.findByIdAndDelete(req.params.id);
  if (!clerk) {
    return res.status(404).json({
      success: false,
      message: "Clerk not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "clerk Deleted",
  });
});

const deleteManager = asyncHandler(async (req, res) => {
  const manager = await User.findByIdAndDelete(req.params.id);
  if (!manager) {
    return res.status(404).json({
      success: false,
      message: "Manager not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "Manager Deleted",
  });
});

const createSettings = asyncHandler(async (req, res) => {
  try {
    const { entity_type, entity_value } = req.body;
    const settings = await Settings.findOne({
      admin_id: req.admin.admin_id,
      entity_type,
    });
    if (settings) {
      return res.status(400).json({
        success: false,
        message: "Settings already exists",
      });
    }
    await Settings.create({
      entity_type,
      entity_value,
      admin_id: req.admin.admin_id,
    });
    res.status(201).json({
      success: true,
      message: "Settings created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const updateSettings = asyncHandler(async (req, res) => {
  try {
    await Settings.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({
      success: true,
      message: "Settings Updated",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const getSettings = asyncHandler(async (req, res) => {
  const custom_query = req.query;
  custom_query["admin_id"] = req.admin.admin_id;
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const settings = await Settings.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .populate(populate);
  res.status(200).json({
    success: true,
    data: settings,
  });
});

const deleteSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.findByIdAndDelete(req.params.id);
  if (!settings) {
    return res.status(404).json({
      success: false,
      message: "Settings not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "Settings Deleted",
  });
});

const createTenancy = asyncHandler(async (req, res) => {
  try {
    const { property_id, ref_number, type, tenants, report_id, start_date } =
      req.body;
    //create 16 length random string
    // const iv= '1234567890123456';
    const property = await Property.findById(property_id);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }
    const iv = crypto.randomBytes(16);
    for (let i = 0; i < tenants.length; i++) {
      // encrypt name and email
      tenants[i].name = await encrypt(tenants[i].name, iv);
      tenants[i].email = await encrypt(tenants[i].email, iv);
      tenants[i].mobile = await encrypt(tenants[i].mobile, iv);
    }
    console.log("encrypted", tenants);
    const base64data = Buffer.from(iv, "binary").toString("base64");
    property.tenancies_count = property.tenancies_count + 1;
    await property.save();
    await Tenancy.create({
      property_id,
      ref_number,
      type,
      tenants,
      report_id,
      iv: base64data,
      admin_id: req.clerk.admin_id,
      start_date,
    });
    res.status(201).json({
      success: true,
      message: "Tenancy created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const getTenancies = asyncHandler(async (req, res) => {
  let custom_query = req.query;
  custom_query["admin_id"] = req.user.admin_id;
  if (req.user.type == "clerk") {
    const reports = await req.user.getAssignedReportIds();
    custom_query["report_id"] = reports;
  }
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const tenancies = await Tenancy.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .populate({
      path: "property_id report_id",
      select: "address town postcode report_type ref_number status", // Include status field
      populate: {
        // Assuming report_status is a field in the report document
        path: "report_status",
        select: "status", // Adjust this according to the structure of your report_status document
      },
    });
  for (let i = 0; i < tenancies.length; i++) {
    const iv = tenancies[i].iv;
    for (let j = 0; j < tenancies[i].tenants.length; j++) {
      tenancies[i].tenants[j].name = await decrypt(
        tenancies[i].tenants[j].name,
        iv
      );
      tenancies[i].tenants[j].email = await decrypt(
        tenancies[i].tenants[j].email,
        iv
      );
      tenancies[i].tenants[j].mobile = await decrypt(
        tenancies[i].tenants[j].mobile,
        iv
      );
    }
  }
  // console.log("decrypted",tenancies);
  res.status(200).json({
    success: true,
    data: tenancies,
  });
});

const updateTenancy = asyncHandler(async (req, res) => {
  delete req.body.admin_id;
  delete req.body.property_id;
  delete req.body._id;
  const iv = crypto.randomBytes(16);
  if (req.body.tenants) {
    for (let i = 0; i < req.body.tenants.length; i++) {
      req.body.tenants[i].name = await encrypt(req.body.tenants[i].name, iv);
      req.body.tenants[i].email = await encrypt(req.body.tenants[i].email, iv);
      req.body.tenants[i].mobile = await encrypt(
        req.body.tenants[i].mobile,
        iv
      );
    }
  }
  req.body.iv = Buffer.from(iv, "binary").toString("base64");

  // encrypt name and email
  try {
    await Tenancy.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    // if the body contains empty tenants array then change report status to completed
    const { tenants } = req.body;
    if (tenants && tenants.length == 0) {
      const tenancy = await Tenancy.findById(req.params.id);
      const report = await Report.findById(tenancy.report_id);
      report.status = "completed";
      await report.save();
    }
    res.status(200).json({
      success: true,
      message: "Tenancy Updated",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const deleteTenancy = asyncHandler(async (req, res) => {
  const tenancy = await Tenancy.findByIdAndDelete(req.params.id);
  if (!tenancy) {
    return res.status(404).json({
      success: false,
      message: "Tenancy not found",
    });
  }
  const property = await Property.findById(tenancy.property_id);
  property.tenancies_count = property.tenancies_count - 1;
  res.status(200).json({
    success: true,
    message: "Tenancy Deleted",
  });
});

const createReport = asyncHandler(async (req, res) => {
  try {
    let {
      property_id,
      ref_number,
      date,
      start_time,
      end_time,
      tenancy,
      report_type,
      template_type,
      assigned_person_id,
      notes,
      documents,
      linked_inventory_report,
    } = req.body;
    const property = await Property.findById(property_id);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }
    date = moment(date, "DD-MM-YYYY").toDate();
    const new_report = await Report.create({
      property_id,
      ref_number,
      date,
      start_time,
      end_time,
      tenancy,
      report_type,
      template_type,
      admin_id: req.clerk.admin_id,
      creator_type: req.clerk.type,
      assigned_person_id,
      notes,
      documents,
      linked_inventory_report,
    });
    property.reports_count = property.reports_count + 1;
    await property.save();
    const customer = await Customer.findOne({
      user_id: property.customer_user_id,
    });
    customer.reports_count = customer.reports_count + 1;
    await customer.save();
    let requ = [];

    if (report_type == "Checkout Report" && linked_inventory_report != null) {
      const linked_response = await ReportResponse.find({
        report_id: linked_inventory_report,
      }).exec();
      for (let i = 0; i < linked_response.length; i++) {
        if (
          linked_response[i].entity_type != "signature" &&
          linked_response[i].entity_type != "check_in_overview"
        ) {
          linked_response[i].report_id = new_report._id;
          const new_resp = new ReportResponse();
          new_resp.report_id = linked_response[i].report_id;
          new_resp.entity_type = linked_response[i].entity_type;
          new_resp.object_type = linked_response[i].object_type;
          new_resp.class_type = linked_response[i].class_type;
          new_resp.item_type = linked_response[i].item_type;
          new_resp.metadata = linked_response[i].metadata;
          new_resp.display_name = linked_response[i].display_name;
          new_resp.item_rank = linked_response[i].item_rank;
          new_resp.room_rank = linked_response[i].room_rank;
          let new_obj = {};
          if (linked_response[i].entity_type == "rooms_and_areas") {
            let metadata = { ...linked_response[i].metadata };
            if (linked_response[i].item_type == "general_overview") {
              metadata.status = "pending";
            }
            metadata.old_description = linked_response[i].metadata?.description;
            metadata.old_condition = linked_response[i].metadata?.condition;
            metadata.old_body = linked_response[i].metadata?.body;
            metadata.old_cleanliness = linked_response[i].metadata?.cleanliness;
            metadata.description = [];
            metadata.condition = "";
            metadata.body = "";
            metadata.cleanliness = "";
            new_resp.metadata = metadata;
            new_obj = {
              ...new_resp,
              metadata,
            };
          } else {
            new_obj = new_resp;
          }
          requ.push(new_resp.save());
        }
      }
      const inventory_report = await Report.findById(linked_inventory_report);
      const inventory_report_tenants = await Tenancy.findOne({
        report_id: linked_inventory_report,
      });
      if(inventory_report_tenants)
      {
      const inventory_tenants = inventory_report_tenants.tenants;
      for (let i = 0; i < inventory_tenants.length; i++) {
        inventory_tenants[i].status = "pending";
      }
      property.tenancies_count = property.tenancies_count + 1;
      await property.save();
      let start_date = new Date();
      start_date = start_date.toISOString();
      await Tenancy.create({
        property_id,
        ref_number,
        tenants: inventory_tenants,
        report_id: new_report._id,
        iv: inventory_report_tenants.iv,
        admin_id: inventory_report.admin_id,
        start_date,
      });
    }
      await Promise.all(requ);
    }

    if (template_type !== "None") {
      const template = await Template.findOne({
        template_name: template_type,
      });
      const template_response = await TemplateResponse.find({
        template_id: template?._id,
      }).exec();

      const reqs = [];

      for (let i = 0; i < template_response.length; i++) {
        let new_resp = {
          ...template_response[i].toObject(),
        };
        delete new_resp.template_id;
        delete new_resp._id;
        const res = new ReportResponse(new_resp);
        res.report_id = new_report._id;
        if (res.entity_type === "h_s_compliance") {
          res.metadata.images = [];
        } else res.metadata.photos = [];
        reqs.push(res.save());
      }

      await Promise.all(reqs);
    }

    res.status(201).json({
      success: true,
      message: "Report created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const createTemplate = asyncHandler(async (req, res) => {
  try {
    let { template_type, template_name } = req.body;
    // const property = await Property.findById(property_id);
    // if (!property) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Property not found",
    //   });
    // }
    const date_created = moment(new Date(Date.now()), "DD-MM-YYYY").toDate();
    const new_template = await Template.create({
      date_created,
      template_type,
      template_name,
      added_by: {
        name: req?.user?.name,
        email: req?.user?.email,
        type: req?.user?.type,
        _id: req?.user?._id,
      },
      no_of_rooms: 0,
    });
    // property.reports_count = property.reports_count + 1;
    // await property.save();
    // const customer = await Customer.findOne({
    //   user_id: property.customer_user_id,
    // });
    // customer.reports_count = customer.reports_count + 1;
    // await customer.save();
    // let requ = [];
    // if (report_type == "Checkout Report" && linked_inventory_report != null) {
    //   const linked_response = await ReportResponse.find({
    //     report_id: linked_inventory_report,
    //   }).exec();
    //   for (let i = 0; i < linked_response.length; i++) {
    //     if (
    //       linked_response[i].entity_type != "signature" &&
    //       linked_response[i].entity_type != "check_in_overview"
    //     ) {
    //       linked_response[i].report_id = new_report._id;
    //       const new_resp = new ReportResponse();
    //       new_resp.report_id = linked_response[i].report_id;
    //       new_resp.entity_type = linked_response[i].entity_type;
    //       new_resp.object_type = linked_response[i].object_type;
    //       new_resp.class_type = linked_response[i].class_type;
    //       new_resp.item_type = linked_response[i].item_type;
    //       new_resp.metadata = linked_response[i].metadata;
    //       new_resp.display_name = linked_response[i].display_name;
    //       new_resp.item_rank = linked_response[i].item_rank;
    //       new_resp.room_rank = linked_response[i].room_rank;
    //       let new_obj = {};
    //       if (linked_response[i].entity_type == "rooms_and_areas") {
    //         let metadata = { ...linked_response[i].metadata };
    //         if (linked_response[i].item_type == "general_overview") {
    //           metadata.status = "pending";
    //         }
    //         metadata.old_description = linked_response[i].metadata?.description;
    //         metadata.old_condition = linked_response[i].metadata?.condition;
    //         metadata.old_body = linked_response[i].metadata?.body;
    //         metadata.old_cleanliness = linked_response[i].metadata?.cleanliness;
    //         metadata.description = [];
    //         metadata.condition = "";
    //         metadata.body = "";
    //         metadata.cleanliness = "";
    //         new_resp.metadata = metadata;
    //         new_obj = {
    //           ...new_resp,
    //           metadata,
    //         };
    //       } else {
    //         new_obj = new_resp;
    //       }
    //       requ.push(new_resp.save());
    //     }
    //   }
    //   const inventory_report = await Report.findById(linked_inventory_report);
    //   const inventory_report_tenants = await Tenancy.findOne({
    //     report_id: linked_inventory_report,
    //   });
    //   const inventory_tenants = inventory_report_tenants.tenants;
    //   for (let i = 0; i < inventory_tenants.length; i++) {
    //     inventory_tenants[i].status = "pending";
    //   }
    //   property.tenancies_count = property.tenancies_count + 1;
    //   await property.save();
    //   let start_date = new Date();
    //   start_date = start_date.toISOString();
    //   await Tenancy.create({
    //     property_id,
    //     ref_number,
    //     tenants: inventory_tenants,
    //     report_id: new_report._id,
    //     iv: inventory_report_tenants.iv,
    //     admin_id: inventory_report.admin_id,
    //     start_date,
    //   });
    //   await Promise.all(requ);
    // }
    res.status(201).json({
      success: true,
      message: "Template created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const wipeOutResponses = async (reportId) => {
  await Tenancy.updateMany(
    { report_id: reportId },
    { $set: { "tenants.$[].status": "pending" } }
  );
  // await ReportResponse.deleteMany({ report_id: reportId });
};
const updateReport = asyncHandler(async (req, res) => {
  try {
    delete req.body.admin_id;
    delete req.body.assigned_person_id;
    delete req.body.property_id;
    delete req.body._id;
    // If report status is redraft, change all tenants status to pending
    if (req.body.status === "redraft") {
      await wipeOutResponses(req.params.id);
    }
    // Only change report status to approved if all tenants have signed
    if (req.body.status === "approved") {
      const tenancy = await Tenancy.findOne({ report_id: req.params.id });
      const tenants = tenancy.tenants;
      const allTenantsSigned = tenants.every(
        (tenant) => tenant.status === "signed"
      );
      if (!allTenantsSigned) {
        return res.status(400).json({
          success: false,
          message: "All tenants must sign the report before it can be approved",
        });
      }
    }
    const report = await Report.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({
      success: true,
      message: "Report Updated",
      report: report,
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const updateTemplate = asyncHandler(async (req, res) => {
  try {
    delete req.body.added_by;
    delete req.body.date_created;
    delete req.body._id;

    const template = await Template.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Template Updated",
      template: template,
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const getReports = asyncHandler(async (req, res) => {
  let custom_query = req.query;
  custom_query["admin_id"] = req.user.admin_id;
  console.log(req.user.admin_id,"aya")

  if (req.user.type == "customer") {
    const properties = await req.user.getPropertyIdsOfCustomer();
    custom_query["property_id"] = properties;
  } else if (req.user.type == "clerk") {
    custom_query["assigned_person_id"] = req.user._id;
  }
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  let [reports, tenancies] = await Promise.all([
    Report.find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .select(projection)
      .populate({
        path: "property_id assigned_person_id",
        select: "address town photos name postcode",
        populate: {
          path: "customer_user_id",
          select: "name contact_information",
        },
      })
      .lean(),
    Tenancy.find({}).lean(),
  ]);
  const tenancy_map = {};
  for (let i = 0; i < tenancies.length; i++) {
    tenancy_map[tenancies[i].report_id] = tenancies[i].tenants.length;
  }
  for (let i = 0; i < reports.length; i++) {
    reports[i].tenancy_count = tenancy_map[reports[i]._id]
      ? tenancy_map[reports[i]._id]
      : 0;
  }
  res.status(200).json({
    success: true,
    data: reports,
  });
});

const getTemplates = asyncHandler(async (req, res) => {
  let custom_query = req.query;
  // custom_query["admin_id"] = req.user.admin_id;
  // if (req.user.type == "customer") {
  //   const properties = await req.user.getPropertyIdsOfCustomer();
  //   custom_query["property_id"] = properties;
  // } else if (req.user.type == "clerk") {
  //   custom_query["assigned_person_id"] = req.user._id;
  // }
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const templates = await Template.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .lean();
  // const tenancy_map = {};
  // for (let i = 0; i < tenancies.length; i++) {
  //   tenancy_map[tenancies[i].report_id] = tenancies[i].tenants.length;
  // }
  // for (let i = 0; i < reports.length; i++) {
  //   reports[i].tenancy_count = tenancy_map[reports[i]._id]
  //     ? tenancy_map[reports[i]._id]
  //     : 0;
  // }
  res.status(200).json({
    success: true,
    data: templates,
  });
});

const deleteReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: "Report not found",
    });
  }
  await report.deleteReport();
  res.status(200).json({
    success: true,
    message: "Report Deleted",
  });
});

const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findById(req.params.id);
  if (!template) {
    return res.status(404).json({
      success: false,
      message: "Template not found",
    });
  }
  await template.deleteReport();
  res.status(200).json({
    success: true,
    message: "Template Deleted",
  });
});

const duplicateRoom = asyncHandler(async (req, res) => {
  const display_name = req.body.display_name;
  const report_id = req.params.id;
  const prev_items = await ReportResponse.find({
    report_id,
    entity_type: "rooms_and_areas",
    display_name,
  });
  // filter prev iten with item_type general_overview
  let prev_items_filtered = prev_items.filter(
    (item) => item.item_type == "general_overview"
  );
  object_type = prev_items_filtered[0]?.object_type;
  console.log("object_type", object_type);
  // console.log("prev_items",prev_items);
  const count =
    (await ReportResponse.countDocuments({
      report_id,
      entity_type: "rooms_and_areas",
      object_type,
      item_type: "general_overview",
      // display_name
    })) + 1;
  const room_rank =
    (await ReportResponse.countDocuments({
      report_id,
      entity_type: "rooms_and_areas",
      item_type: "general_overview",
    })) + 1;
  const new_display_name = `${object_type} ${count}`;
  console.log("new_display_name", new_display_name, "count", count);
  let requ = [];
  for (let i = 0; i < prev_items.length; i++) {
    const new_resp = new ReportResponse();
    new_resp.report_id = report_id;
    new_resp.entity_type = prev_items[i].entity_type;
    new_resp.object_type = prev_items[i].object_type;
    new_resp.class_type = prev_items[i].class_type;
    new_resp.item_type = prev_items[i].item_type;
    new_resp.item_rank = prev_items[i].item_rank;
    const metadata = {
      ...prev_items[i].metadata,
      photos: [],
      photos_360: [],
      status: "pending",
    };
    new_resp.metadata = metadata;
    new_resp.display_name = new_display_name;
    if (new_resp.item_type == "general_overview") {
      new_resp.room_rank = room_rank;
    }
    requ.push(new_resp.save());
  }
  await Promise.all(requ);
  res.json({
    success: true,
    msg: "Room duplicated",
  });
});

const duplicateTemplateRoom = asyncHandler(async (req, res) => {
  const display_name = req.body.display_name;
  const template_id = req.params.id;
  const prev_items = await TemplateResponse.find({
    template_id,
    entity_type: "rooms_and_areas",
    display_name,
  });
  // filter prev iten with item_type general_overview
  let prev_items_filtered = prev_items.filter(
    (item) => item.item_type == "general_overview"
  );
  object_type = prev_items_filtered[0]?.object_type;
  console.log("object_type", object_type);
  // console.log("prev_items",prev_items);
  const count =
    (await TemplateResponse.countDocuments({
      template_id,
      entity_type: "rooms_and_areas",
      object_type,
      item_type: "general_overview",
      // display_name
    })) + 1;
  const room_rank =
    (await TemplateResponse.countDocuments({
      template_id,
      entity_type: "rooms_and_areas",
      item_type: "general_overview",
    })) + 1;
  const new_display_name = `${object_type} ${count}`;
  console.log("new_display_name", new_display_name, "count", count);
  let requ = [];
  for (let i = 0; i < prev_items.length; i++) {
    const new_resp = new TemplateResponse();
    new_resp.template_id = template_id;
    new_resp.entity_type = prev_items[i].entity_type;
    new_resp.object_type = prev_items[i].object_type;
    new_resp.class_type = prev_items[i].class_type;
    new_resp.item_type = prev_items[i].item_type;
    new_resp.item_rank = prev_items[i].item_rank;
    const metadata = {
      ...prev_items[i].metadata,
      status: "pending",
    };
    new_resp.metadata = metadata;
    new_resp.display_name = new_display_name;
    if (new_resp.item_type == "general_overview") {
      new_resp.room_rank = room_rank;
    }
    requ.push(new_resp.save());
  }
  await Promise.all(requ);
  res.json({
    success: true,
    msg: "Room duplicated",
  });
});

const cloneReport = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const report_id = id;

    // Find the report to clone
    const reportToClone = await Report.findById(report_id).exec();
    if (!reportToClone) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // generate a random number
    const random_number = Math.floor(Math.random() * 1000000);

    // Clone the report
    const clonedReport = new Report({
      ...reportToClone.toObject(),
      ref_number: `${random_number}_${reportToClone.ref_number}_copy`,
      _id: undefined,
    });
    await clonedReport.save();

    // Define entity types and their conditions
    const entityTypes = {
      rooms_and_areas: req.body.rooms_and_areas,
      rooms_and_areas_images: req.body.rooms_and_areas_images,
      check_in_overview: req.body.check_in_overview,
      check_in_overview_images: req.body.check_in_overview_images,
      inspection_overview: req.body.inspection_overview,
      inspection_overview_images: req.body.inspection_overview_images,
      check_out_overview: req.body.check_out_overview,
      check_out_overview_images: req.body.check_out_overview_images,
      h_s_compliance: req.body.h_s_compliance,
      h_s_compliance_images: req.body.h_s_compliance_images,
      utilities: req.body.utilities,
      utilities_images: req.body.utilities_images,
      meters: req.body.meters,
      meters_images: req.body.meters_images,
    };

    // Find and update associated report responses
    const reportResponsesToUpdate = await ReportResponse.find({
      report_id,
    }).exec();
    for (const response of reportResponsesToUpdate) {
      const entityType = entityTypes[response.entity_type];
      const entityTypeImages = entityTypes[`${response.entity_type}_images`];

      const clonedResponse = new ReportResponse({
        report_id: clonedReport._id,
        entity_type: response.entity_type,
        item_type: response.item_type,
        class_type: response.class_type,
        display_name: response.display_name,
        item_rank: response.item_rank,
        room_rank: response.room_rank,
        metadata: {},
      });

      if (entityTypeImages) {
        clonedResponse.images = response.images;
      }

      if (
        response.entity_type === "rooms_and_areas" ||
        response.entity_type === "utilities" ||
        response.entity_type === "meters"
      ) {
        clonedResponse.metadata = entityType
          ? response?.metadata
          : clearObject(response?.metadata);
        clonedResponse.metadata.photos = entityTypeImages
          ? response?.metadata?.photos
          : [];
      } else if (
        response.entity_type === "inspection_overview" ||
        response.entity_type === "check_out_overview" ||
        response.entity_type === "check_in_overview"
      ) {
        clonedResponse.images = entityTypeImages ? response?.images : [];
        clonedResponse.metadata.comment = "";
        clonedResponse.metadata.property_info = "";
        clonedResponse.metadata.response = [];
        if (entityType) {
          clonedResponse.metadata.comment = response?.metadata?.comment;
          clonedResponse.metadata.property_info =
            response?.metadata?.property_info;
          clonedResponse.metadata.response = response?.metadata?.response;
        }
      } else if (response.entity_type === "h_s_compliance") {
        clonedResponse.images = [];
        clonedResponse.metadata.comment = "";
        clonedResponse.metadata.response = [];
        if (entityType) {
          clonedResponse.metadata.comment = response?.metadata?.comment;
          clonedResponse.metadata.response = response?.metadata?.response;
        }
        clonedResponse.metadata.images = entityTypeImages
          ? response?.metadata?.images
          : [];
      }
      (entityType || entityTypeImages) && (await clonedResponse.save());
    }

    return res.status(200).json({
      success: true,
      message: "Report cloned successfully",
      cloned_report_id: clonedReport._id,
      cloned_report_ref_number: `${random_number}_${reportToClone.ref_number}_copy`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

const updateReportRoomsOrder = asyncHandler(async (req, res) => {
  const display_names = req.body.display_names;
  const report_id = req.params.id;
  let custom_query = {};
  custom_query["report_id"] = report_id;
  custom_query["entity_type"] = "rooms_and_areas";
  custom_query["class_type"] = "general_overview";
  custom_query["display_name"] = display_names;
  console.log(custom_query);
  let { filter, skip, limit, sort, projection, populate } = aqp({
    ...custom_query,
  });
  let report_response = await ReportResponse.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .populate(populate);
  const rank_map = {};
  for (let i = 0; i < display_names.length; i++) {
    rank_map[display_names[i]] = i + 1;
  }
  let requ = [];
  for (let i = 0; i < report_response.length; i++) {
    report_response[i].room_rank = rank_map[report_response[i].display_name];
    requ.push(report_response[i].save());
  }
  await Promise.all(requ);
  res.json({
    success: true,
    data: report_response,
  });
});

const updateTemplateRoomsOrder = asyncHandler(async (req, res) => {
  const display_names = req.body.display_names;
  const template_id = req.params.id;
  let custom_query = {};
  custom_query["template_id"] = template_id;
  custom_query["entity_type"] = "rooms_and_areas";
  custom_query["class_type"] = "general_overview";
  custom_query["display_name"] = display_names;
  console.log(custom_query);
  let { filter, skip, limit, sort, projection, populate } = aqp({
    ...custom_query,
  });
  let template_response = await TemplateResponse.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .populate(populate);
  const rank_map = {};
  for (let i = 0; i < display_names.length; i++) {
    rank_map[display_names[i]] = i + 1;
  }
  let requ = [];
  for (let i = 0; i < template_response.length; i++) {
    template_response[i].room_rank =
      rank_map[template_response[i].display_name];
    requ.push(template_response[i].save());
  }
  await Promise.all(requ);
  res.json({
    success: true,
    data: template_response,
  });
});

const updateReportItemsOrder = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  const item_ids = req.body.item_ids;
  console.log(item_ids, "item_ids");
  let report_response = await ReportResponse.find({
    _id: {
      $in: item_ids,
    },
  });
  console.log(report_response, "report_response");
  let requ = [];
  for (let i = 0; i < report_response.length; i++) {
    report_response[i].item_rank =
      item_ids.indexOf(String(report_response[i]._id)) + 1;
    requ.push(report_response[i].save());
  }
  await Promise.all(requ);
  res.json({
    success: true,
    data: report_response,
  });
});

const updateTemplateItemsOrder = asyncHandler(async (req, res) => {
  const template_id = req.params.id;
  const item_ids = req.body.item_ids;
  console.log(item_ids, "item_ids");
  let template_response = await TemplateResponse.find({
    _id: {
      $in: item_ids,
    },
  });
  console.log(template_response, "template_response");
  let requ = [];
  for (let i = 0; i < template_response.length; i++) {
    template_response[i].item_rank =
      item_ids.indexOf(String(template_response[i]._id)) + 1;
    requ.push(template_response[i].save());
  }
  await Promise.all(requ);
  res.json({
    success: true,
    data: template_response,
  });
});

const renameReportRoom = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  const display_name = req.body.display_name;
  const new_display_name = req.body.new_display_name;
  const rooms = await ReportResponse.countDocuments({
    report_id,
    entity_type: "rooms_and_areas",
    display_name: new_display_name,
  });
  if (rooms > 0) {
    return res.status(400).json({
      success: false,
      message: "Room name already exists",
    });
  }
  const rooms_response = await ReportResponse.find({
    report_id,
    entity_type: "rooms_and_areas",
    display_name,
  });
  console.log("display_name", display_name);
  let requ = [];
  for (let i = 0; i < rooms_response.length; i++) {
    if (rooms_response[i].display_name == display_name) {
      rooms_response[i].display_name = new_display_name;
      requ.push(rooms_response[i].save());
    }
  }
  await Promise.all(requ);
  res.json({
    success: true,
    msg: "Room name updated",
  });
});

const renameTemplateRoom = asyncHandler(async (req, res) => {
  const template_id = req.params.id;
  const display_name = req.body.display_name;
  const new_display_name = req.body.new_display_name;
  const rooms = await TemplateResponse.countDocuments({
    template_id,
    entity_type: "rooms_and_areas",
    display_name: new_display_name,
  });
  if (rooms > 0) {
    return res.status(400).json({
      success: false,
      message: "Room name already exists",
    });
  }
  const rooms_response = await TemplateResponse.find({
    template_id,
    entity_type: "rooms_and_areas",
    display_name,
  });
  console.log("display_name", display_name);
  let requ = [];
  for (let i = 0; i < rooms_response.length; i++) {
    if (rooms_response[i].display_name == display_name) {
      rooms_response[i].display_name = new_display_name;
      requ.push(rooms_response[i].save());
    }
  }
  await Promise.all(requ);
  res.json({
    success: true,
    msg: "Room name updated",
  });
});

const deleteReportRoom = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  const display_name = req.body.display_name;
  const display_names = req.body.display_names;
  try {
    if (
      typeof display_name !== "undefined" &&
      display_name !== null &&
      display_name !== ""
    ) {
      const roomsToDelete = await ReportResponse.find({
        report_id,
        entity_type: "rooms_and_areas",
        display_name,
      });
      let deletionPromises = [];
      for (const room of roomsToDelete) {
        if (room.display_name === display_name) {
          deletionPromises.push(room.remove());
        }
      }

      await Promise.all(deletionPromises);

      return res.json({
        success: true,
        msg: "Room deleted",
      });
    } else if (Array.isArray(display_names) && display_names.length > 0) {
      for (const name of display_names) {
        const roomsToDelete = await ReportResponse.find({
          report_id,
          entity_type: "rooms_and_areas",
          display_name: name,
        });

        let deletionPromises = [];
        for (const room of roomsToDelete) {
          if (room.display_name === name) {
            deletionPromises.push(room.remove());
          }
        }

        await Promise.all(deletionPromises);
      }

      return res.json({
        success: true,
        msg: "Rooms deleted",
      });
    } else {
      return res.status(400).json({
        success: false,
        msg: "Invalid request. Either display_name or display_names must be provided.",
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      msg: "Error deleting rooms",
    });
  }
});

const deleteTemplateRoom = asyncHandler(async (req, res) => {
  const template_id = req.params.id;
  const display_name = req.body.display_name;
  const display_names = req.body.display_names;
  try {
    if (
      typeof display_name !== "undefined" &&
      display_name !== null &&
      display_name !== ""
    ) {
      const roomsToDelete = await TemplateResponse.find({
        template_id,
        entity_type: "rooms_and_areas",
        display_name,
      });
      let deletionPromises = [];
      for (const room of roomsToDelete) {
        if (room.display_name === display_name) {
          deletionPromises.push(room.remove());
        }
      }

      await Promise.all(deletionPromises);

      return res.json({
        success: true,
        msg: "Room deleted",
      });
    } else if (Array.isArray(display_names) && display_names.length > 0) {
      for (const name of display_names) {
        const roomsToDelete = await TemplateResponse.find({
          template_id,
          entity_type: "rooms_and_areas",
          display_name: name,
        });

        let deletionPromises = [];
        for (const room of roomsToDelete) {
          if (room.display_name === name) {
            deletionPromises.push(room.remove());
          }
        }

        await Promise.all(deletionPromises);
      }

      return res.json({
        success: true,
        msg: "Rooms deleted",
      });
    } else {
      return res.status(400).json({
        success: false,
        msg: "Invalid request. Either display_name or display_names must be provided.",
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      msg: "Error deleting rooms",
    });
  }
});

const createReportResponse = asyncHandler(async (req, res) => {
  try {
    let {
      report_id,
      entity_type,
      object_type,
      class_type,
      item_type,
      metadata,
      display_name,
    } = req.body;
    let room_rank = null;
    if (class_type == "general_overview") {
      item_type = "general_overview";
    }
    if (entity_type == "tenant_signature") {
      const tenant_id = metadata.id;
      const tenant = await Tenancy.findOne({
        report_id,
      });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: "Tenant not found",
        });
      }
      // const tenant_iv=tenant.iv;
      // iterate over tenants and find the one with matching email
      for (let i = 0; i < tenant.tenants.length; i++) {
        if (tenant.tenants[i]._id == tenant_id) {
          // tenant.tenants[i].signature=metadata.signature;
          tenant.tenants[i].status = "signed";
          tenant.tenants[i].signed_timestamp = Date.now();
          break;
        }
      }
      // mark tenants as modified
      tenant.markModified("tenants");
      // find the report and update status to signed
      const report = await Report.findById(report_id);
      if (!report) {
        return res.status(404).json({
          success: false,
          message: "Report not found",
        });
      }
      report.status = "signed";
      await report.save();
      await tenant.save();
      console.log("tenant savec", tenant);
    }
    let [room_count, room_number, item_count] = await Promise.all([
      ReportResponse.countDocuments({
        report_id,
        entity_type,
        object_type,
        class_type: "general_overview",
      }),
      ReportResponse.countDocuments({
        report_id,
        entity_type,
        class_type: "general_overview",
      }),
      ReportResponse.countDocuments({
        report_id,
        entity_type: "rooms_and_areas",
      }),
    ]);
    if (entity_type == "meters" || entity_type == "utilities") {
      display_name = `${item_type}`;
      const count = await ReportResponse.countDocuments({
        report_id,
        entity_type,
        item_type,
      });
      if (count > 0) display_name = `${item_type} ${count + 1}`;
    } else if (
      entity_type == "rooms_and_areas" &&
      class_type == "general_overview"
    ) {
      display_name = object_type;

      room_rank = room_number + 1;
      if (room_count > 0) display_name = `${object_type} ${room_count + 1}`;
    }
    const new_item_count = item_count - room_number;
    // if(metadata?.body) metadata.body=metadata?.body?.replace('/',' ')
    await ReportResponse.create({
      report_id,
      entity_type,
      object_type,
      class_type,
      item_type,
      metadata,
      display_name,
      room_rank,
      item_rank: new_item_count + 1,
    });
    res.status(201).json({
      success: true,
      message: "Report Response created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const createTemplateResponse = asyncHandler(async (req, res) => {
  try {
    let {
      template_id,
      entity_type,
      object_type,
      class_type,
      item_type,
      metadata,
      display_name,
    } = req.body;
    let room_rank = null;
    let [room_count, room_number, item_count] = await Promise.all([
      TemplateResponse.countDocuments({
        template_id,
        entity_type,
        object_type,
        class_type: "general_overview",
      }),
      TemplateResponse.countDocuments({
        template_id,
        entity_type,
        class_type: "general_overview",
      }),
      TemplateResponse.countDocuments({
        template_id,
        entity_type: "rooms_and_areas",
      }),
    ]);
    if (entity_type == "meters" || entity_type == "utilities") {
      display_name = `${item_type}`;
      const count = await TemplateResponse.countDocuments({
        template_id,
        entity_type,
        item_type,
      });
      if (count > 0) display_name = `${item_type} ${count + 1}`;
    } else if (
      entity_type == "rooms_and_areas" &&
      class_type == "general_overview"
    ) {
      display_name = object_type;

      room_rank = room_number + 1;
      if (room_count > 0) display_name = `${object_type} ${room_count + 1}`;
    }
    const new_item_count = item_count - room_number;
    // if(metadata?.body) metadata.body=metadata?.body?.replace('/',' ')
    await TemplateResponse.create({
      template_id,
      entity_type,
      object_type,
      class_type,
      item_type,
      metadata,
      display_name,
      room_rank,
      item_rank: new_item_count + 1,
    });
    res.status(201).json({
      success: true,
      message: "Template Response created successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const updateReportResponse = asyncHandler(async (req, res) => {
  try {
    // if(req.body.metadata?.body) metadata.body=req.body.metadata?.body?.replace('/',' ')
    if (req.body.class_type == "general_overview") {
      req.body.item_type = "general_overview";
    }
    await ReportResponse.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({
      success: true,
      message: "Report Response Updated",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const updateTemplateResponse = asyncHandler(async (req, res) => {
  try {
    // if(req.body.metadata?.body) metadata.body=req.body.metadata?.body?.replace('/',' ')
    await TemplateResponse.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({
      success: true,
      message: "Template Response Updated",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const getReportResponses = asyncHandler(async (req, res) => {
  const custom_query = req.query;
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const reportResponses = await ReportResponse.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .populate(populate);
  res.status(200).json({
    success: true,
    data: reportResponses,
  });
});

const getTemplateResponses = asyncHandler(async (req, res) => {
  const custom_query = req.query;
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const templateResponses = await TemplateResponse.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(projection)
    .populate(populate);
  res.status(200).json({
    success: true,
    data: templateResponses,
  });
});

const deleteReportResponse = asyncHandler(async (req, res) => {
  const reportResponse = await ReportResponse.findByIdAndDelete(req.params.id);
  if (!reportResponse) {
    return res.status(404).json({
      success: false,
      message: "Report Response not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "Report Response Deleted",
  });
});

const deleteTemplateResponse = asyncHandler(async (req, res) => {
  const templateResponse = await TemplateResponse.findByIdAndDelete(
    req.params.id
  );
  if (!templateResponse) {
    return res.status(404).json({
      success: false,
      message: "Template Response not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "Template Response Deleted",
  });
});

const startReportInspection = asyncHandler(async (req, res) => {
  try {
    await Report.findByIdAndUpdate(
      req.params.id,
      {
        actual_start_time: Date.now(),
        status: "draft",
      },
      {
        new: true,
        runValidators: true,
      }
    );
    res.status(200).json({
      success: true,
      message: "Report Inspection Started",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const getDashboardStats = asyncHandler(async (req, res) => {
  const admin_id = req.user.admin_id;
  const [property, customer, report, tenancies] = await Promise.all([
    Property.countDocuments({ admin_id }),
    Customer.countDocuments({ admin_id }),
    Report.countDocuments({ admin_id }),
    Tenancy.countDocuments({ admin_id }),
  ]);
  res.status(200).json({
    success: true,
    data: {
      property,
      customer,
      report,
      tenancies,
    },
  });
});

const getUsers = asyncHandler(async (req, res) => {
  const admin_id = req.user.admin_id;
  const custom_query = req.query;
  custom_query["admin_id"] = admin_id;
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  const users = await User.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select("-password")
    .populate(populate);
  res.status(200).json({
    success: true,
    data: users,
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    await user.remove();
    res.status(200).json({
      success: true,
      message: "User Deleted",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const updateUser = asyncHandler(async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    if (req.body.type === "customer") {
      const customer = await Customer.findOne({ email: req.body.email });
      customer.name = req.body.name;
      await customer.save();
    }
    const payload = req.body;
    Object.keys(payload).forEach((key) => {
      if (payload[key]) {
        user[key] = payload[key];
      }
    });
    await user.save();
    res.status(200).json({
      success: true,
      message: "User Updated",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const addReportNote = asyncHandler(async (req, res) => {
  const { note } = req.body;
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }
    if (report.notes.length == 0) {
      report.notes.push({
        text: note,
        user_id: req.clerk._id,
        name: req.clerk.name,
        date: Date.now(),
      });
    } else {
      report.notes[report.notes.length - 1].text = note;
      report.notes[report.notes.length - 1].user_id = req.clerk._id;
      report.notes[report.notes.length - 1].name = req.clerk.name;
      report.notes[report.notes.length - 1].date = Date.now();
    }
    await report.save();
    res.status(200).json({
      success: true,
      message: "Report note added",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const addDocument = asyncHandler(async (req, res) => {
  const { url } = req.body;
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }
    report.documents.push({
      url,
      user_id: req.clerk._id,
      name: req.clerk.name,
      date: Date.now(),
    });
    report.document_status = "completed";
    await report.save();
    res.status(200).json({
      success: true,
      message: "Report document added",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const deleteDocument = asyncHandler(async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }
    // report.documents.pull(req.params.document_id);
    const { document_id } = req.params;
    const index = report.documents.findIndex(
      (document) => document._id == document_id
    );
    if (index == -1) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }
    report.documents.splice(index, 1);
    await report.save();
    res.status(200).json({
      success: true,
      message: "Report document deleted",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const addSignature = asyncHandler(async (req, res) => {
  let { url, name, date } = req.body;
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }
    report.signature.url = url;
    report.signature.name = name;
    date = moment(date, "DD-MM-YYYY").toDate();
    report.signature.date = date;
    await report.save();
    res.status(200).json({
      success: true,
      message: "Report signature added",
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
});

const getReportResponseStatus = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  let meters = "pending";
  let utilities = "pending";
  let h_s_compliance = "pending";
  let inspection_comments = "pending";
  let signature = "pending";
  let rooms_and_areas = "pending";
  let documents = "pending";
  let check_in_overview = "pending";
  const [report, report_responses] = await Promise.all([
    Report.findById(report_id),
    ReportResponse.find({ report_id }),
  ]);
  documents = report.document_status;
  if (documents == "pending" && report.documents.length > 0) {
    documents = "completed";
  }
  // added skip_meter and skip_utilities in report model to bypass the meter and utilities section
  report.skip_meter ? (meters = "completed") : (meters = "pending");
  report.skip_utilities ? (utilities = "completed") : (utilities = "pending");
  let key = "check_in_overview";
  if (report.report_type == "Inspection Report") {
    key = "inspection_overview";
  } else if (report.report_type == "Checkout Report") {
    key = "check_out_overview";
  }

  report_responses?.forEach((report_response) => {
    if (report_response.entity_type == "meters") {
      meters = "completed";
    } else if (report_response.entity_type == "utilities") {
      utilities = "completed";
    } else if (report_response.entity_type == "h_s_compliance") {
      h_s_compliance = "completed";
    } else if (report_response.entity_type == "inspection_comments") {
      inspection_comments = "completed";
    } else if (report_response.entity_type == "signature") {
      signature = "completed";
    } else if (report_response.entity_type == "rooms_and_areas") {
      rooms_and_areas = "completed";
    } else if (report_response.entity_type == key) {
      check_in_overview = "completed";
    }
  });
  res.json({
    success: true,
    status: {
      meters,
      utilities,
      h_s_compliance,
      inspection_comments,
      signature,
      rooms_and_areas,
      documents,
      check_in_overview,
    },
  });
});

const createUser = asyncHandler(async (req, res) => {
  try {
    const { email, password, name, type } = req.body;
    const user = await User.create({
      email,
      password,
      name,
      type,
      admin_id: req.user.admin_id,
    });
    res.status(201).json({
      success: true,
      message: "User created successfully",
    });
    await user.sendEmailVerificationLink();
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const downloadReport = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  const [report, report_responses] = await Promise.all([
    Report.findById(report_id)
      .populate({
        path: "assigned_person_id",
        select: "name",
      })
      .select(
        "_id property_id date report_type documents assigned_person_id ref_number"
      ),
    ReportResponse.find({ report_id }).sort("display_name item_type"),
  ]);
  const property = await Property.findById(report.property_id);
  const admin_id = property.admin_id;
  const [declaration, disclaimer, company_logo, tenancy, customer] =
    await Promise.all([
      Settings.findOne({ admin_id, entity_type: "declaration" }),
      Settings.findOne({ admin_id, entity_type: "disclaimer" }),
      Settings.findOne({ admin_id, entity_type: "company_logo" }),
      Tenancy.findOne({ report_id }).select("tenants iv type start_date"),
      Customer.findOne({ user_id: property.customer_user_id }).select(
        "name logo"
      ),
    ]);
  const report_type = report.report_type;
  const gallery_url = `${process.env.FRONTEND_URL}/reports/gallery/${report_id}`;
  let htmlFiles = [
    "1-home.html",
    "2-contents.html",
    "3-definitions.html",
    "4-schedule.html",
    "5-overview.html",
    "6-maintenance.html",
    "7-meters.html",
    "8-compliance.html",
    "9-utilities.html",
    "10-rooms.html",
    "11-declaration.html",
    "12-disclaimer.html",
    "13-documents.html",
  ];
  if (report_type == "Inspection Report") {
    //remove only 7-meters.html and 9-utilities.html
    htmlFiles.splice(6, 1);
    htmlFiles.splice(7, 1);
    htmlFiles.splice(htmlFiles.length - 1, 1);
  }
  //   if(report_type=="Checkout Report"){
  //     htmlFiles.splice(htmlFiles.length-1,1);
  //   }
  let tenants_name = [];
  tenancy?.tenants?.forEach((tenant) => {
    tenants_name.push(decrypt(tenant.name, tenancy.iv));
  });
  const tenants = tenants_name.join(" , ");
  let html_template_list = [];
  // let css_url="https://res.cloudinary.com/dcugtdlab/raw/upload/v1701016150/test/index_gnde2w_s3cp3h.css"
  // mark the time here
  const start_time = Date.now();
  for (let i = 0; i < htmlFiles.length; i++) {
    const file = htmlFiles[i];
    if (file == "1-home.html") {
      // convert 2023-11-27T05:12:44.271Z to 27-11-2023 using moment
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      hydrate_template = hydrate_template.replace(
        /REPORT_DATE/g,
        moment(report.date).format("DD-MM-YYYY")
      );
      hydrate_template = hydrate_template
        .replace("PROPERTY_TYPE", property.type)
        .replace("TENANCY_TYPE", tenancy?.type)
        .replace("TENANTS", tenants)
        .replace("REPORT_TYPE", report.report_type)
        .replace(
          "${IVY_LOGO}",
          company_logo?.entity_value?.length > 0
            ? company_logo?.entity_value[0]
            : "https://res.cloudinary.com/dcugtdlab/image/upload/v1694537890/samples/cloudinary-icon.png"
        )
        .replace("CUSTOMER_NAME", customer.name)
        .replace(
          "${COMPANY_LOGO}",
          customer?.logo?.length > 0
            ? customer?.logo[0]
            : "https://res.cloudinary.com/dcugtdlab/image/upload/v1694537890/samples/cloudinary-icon.png"
        )
        .replace("PROPERTY_ADDRESS", property.address)
        .replace("${GALLERY_URL}", gallery_url)
        .replace("${GALLERY_URL_1}", gallery_url)
        .replace("REPORT_TYPE", report.report_type)
        .replace("REF_NUM", report?.ref_number)
        .replace("POSTCODE", property?.postcode)
        .replace(
          "TENANT_START_DATE",
          moment(tenancy?.start_date).format("DD-MM-YYYY")
        )
        .replace("${PROPERTY_IMAGE}", property?.photos[0]);
      // .replace('${CSS_URL}',css_url)
      html_template_list.push(hydrate_template);
      console.log("1-home.html", Date.now() - start_time);
      // await page.setContent(hydrate_template);
    }  else if (file == "2-contents.html") {
      let rooms_and_areas = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.item_type == "general_overview"
      );
      // sort by room_rank
      rooms_and_areas.sort((a, b) => a.room_rank - b.room_rank);
      let template_rooms_and_areas = "";
      let index = 0;
      console.log(rooms_and_areas, "rooms_and_areas");
      // const copyRoom = rooms_and_areas
      // rooms_and_areas.push({display_name:"Homepage"})
      // rooms_and_areas.unsift("Table of Contents")
      // rooms_and_areas.unsift("Definition")
      // rooms_and_areas.unsift("Schedule of Condition")
      rooms_and_areas?.forEach((room) => {
        index++;
        let list_template = `<li>
                <a href="#">
                  <span class="title"> INDEX . ROOM_NAME <span class="leaders" aria-hidden="true"></span></span>
                  <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
                </a>
              </li>`;

        list_template = list_template
          .replace(
            "ROOM_NAME",
            room?.display_name?.charAt(0).toUpperCase() +
              room?.display_name?.slice(1)
          )
          .replace("INDEX", index);
        template_rooms_and_areas += list_template;
      });
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      let overview_type = "Check In Overview";
      if (report_type == "Inspection Report") {
        overview_type = "Inspection Overview";
      } else if (report_type == "Checkout Report") {
        overview_type = "Check Out Overview";
      }
      let h_s_compliance = report_responses.filter(
        (report_response) => report_response.entity_type == "check_in_overview"
      );
      if (report.report_type == "Inspection Report") {
        h_s_compliance = report_responses.filter(
          (report_response) =>
            report_response.entity_type == "inspection_overview"
        );
      }
      if (report.report_type == "Checkout Report") {
        h_s_compliance = report_responses.filter(
          (report_response) =>
            report_response.entity_type == "check_out_overview"
        );
      }
      let temp = "";
      if (h_s_compliance.length > 0) {
        temp += `<li>
              <a href="#">
                <span class="title">${overview_type}<span class="leaders" aria-hidden="true"></span></span>
                <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
              </a>
            </li>`;
      }
      const maintenance = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.metadata?.maintenance == true
      );
      if (maintenance.length > 0) {
        temp += `<li>
            <a href="#">
              <span class="title">Maintenance Overview<span class="leaders" aria-hidden="true"></span></span>
              <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
            </a>
          </li>`;
      }
      if (report_type != "Inspection Report") {
        const meters = report_responses.filter(
          (report_response) => report_response.entity_type == "meters"
        );
        if (meters.length > 0)
          temp += `<li>
            <a href="#">
              <span class="title">Meters<span class="leaders" aria-hidden="true"></span></span>
              <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
            </a>
          </li>`;
      }
      const compliance = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.metadata?.fire_alarm_compliance == true
      );
      if (compliance.length > 0) {
        temp += `<li>
          <a href="#">
            <span class="title">H&S Compliance<span class="leaders" aria-hidden="true"></span></span>
            <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
          </a>
        </li>`;
      }
      if (report_type != "Inspection Report") {
        const utilities = report_responses.filter(
          (report_response) => report_response.entity_type == "utilities"
        );
        if (utilities.length > 0)
          temp += `<li>
            <a href="#">
              <span class="title">Utilities<span class="leaders" aria-hidden="true"></span></span>
              <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
            </a>
          </li>`;
      }
      hydrate_template = hydrate_template
        .replace("ROOMS_AND_AREAS", template_rooms_and_areas)
        .replace("DYNAMIC_CONTENT", temp);
      if (report?.documents?.length > 0) {
        hydrate_template = hydrate_template.replace(
          "DOCUMENTS",
          `<a href="#">
            <span class="title">Documents<span class="leaders" aria-hidden="true"></span></span>
            <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
          </a>`
        );
      } else {
        hydrate_template = hydrate_template.replace("DOCUMENTS", "");
      }
      html_template_list.push(hydrate_template);
      console.log("2-contents.html", Date.now() - start_time);
    } else if (file == "3-definitions.html") {
      let template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      html_template_list.push(template);
    } else if (file == "4-schedule.html") {
      let rooms_and_areas = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.item_type == "general_overview"
      );
      // sort by room_rank
      rooms_and_areas.sort((a, b) => a.room_rank - b.room_rank);
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      let rooms_and_areas_template = "";
      rooms_and_areas?.forEach((room) => {
        let room_template = `<tr>
                <td> ROOM_NAME <br/>`;
        if (room.metadata?.photos?.length > 0) {
          room_template += `<a href=${gallery_url} target="_blank" >(${room.metadata?.photos?.length} photo`;
          if (room.metadata?.photos?.length > 1) room_template += `s`;
          room_template += `)</a>`;
        }
        // else{
        //     room_template+=`&nbsp;`
        // }
        room_template += `</td><td> DESCRIPTION </td></tr>`;

        room_template = room_template.replace(
          "ROOM_NAME",
          cleanString(room?.display_name)
        );
        room_template = room_template.replace(
          "DESCRIPTION",
          room.metadata?.description.length > 0
            ? room.metadata?.description.join(". ") +" "+ room.metadata?.body
            : room.metadata?.body
        );
        rooms_and_areas_template += room_template;
      });
      hydrate_template = hydrate_template.replace(
        "ROOMS_AND_AREAS_DESCRIPTIONS",
        rooms_and_areas_template
      );
      html_template_list?.push(hydrate_template);
      console.log("4-schedule.html", Date.now() - start_time);
    } else if (file == "5-overview.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      let h_s_compliance = report_responses?.filter(
        (report_response) => report_response.entity_type == "check_in_overview"
      );
      if (report.report_type == "Inspection Report") {
        h_s_compliance = report_responses?.filter(
          (report_response) =>
            report_response.entity_type == "inspection_overview"
        );
      }
      if (report.report_type == "Checkout Report") {
        h_s_compliance = report_responses?.filter(
          (report_response) =>
            report_response.entity_type == "check_out_overview"
        );
      }
      h_s_compliance = h_s_compliance[0];
      let question_response = "";
      h_s_compliance?.metadata?.response?.forEach((h_s) => {
        const response = h_s.answer;
        const question = h_s.question?.split("_")[0];
        const is_yellow_in_green = h_s?.if_yes_in_green;
        let style_class = "response-yes";
        if (response == "No") {
          style_class = "response-no";
        } else if (response == "N/A") {
          style_class = "response-na";
        }
        if (is_yellow_in_green == false) {
          if (style_class == "response-yes") {
            style_class = "response-no";
          } else if (style_class == "response-no") {
            style_class = "response-yes";
          }
        }
        const question_template = `<tr>
                <td> QUESTION </td>
                <td class="${style_class}"> RESPONSE </td>
            </tr>`;
        question_response += question_template
          .replace("QUESTION", question)
          .replace("RESPONSE", response);
      });
      let dynamic_title = "Check In Overview";
      if (report.report_type == "Inspection Report") {
        dynamic_title = "Inspection Overview";
      }
      if (report.report_type == "Checkout Report") {
        dynamic_title = "Check Out Overview";
      }
      let compliance_photos = "";
      h_s_compliance?.metadata?.images?.forEach((link) => {
        let photo_ref = `<a href=${gallery_url} target="_blank" >
          <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain;">
          </figure></a>`;
        compliance_photos += photo_ref;
      });
      hydrate_template = hydrate_template
        .replace("QUESTION_RESPONSES", question_response)
        .replace("COMPLIANCE_PHOTOS", compliance_photos)
        .replace("COMMENTS", h_s_compliance?.metadata?.comment)
        .replace(
          "PROPERTY_INFORMATION",
          h_s_compliance?.metadata?.property_info
        )
        .replace("DYNAMIC_TITLE", dynamic_title);
      if (h_s_compliance?.metadata?.response?.length > 0)
        html_template_list.push(hydrate_template);
      console.log("5-overview.html", Date.now() - start_time);
    } else if (file == "6-maintenance.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      const maintenance = report_responses.filter(
        (report_response) => report_response.entity_type == "rooms_and_areas"
      );
      let maintenance_template = "";
      let maintenance_grouped_by_name = {};
      maintenance?.forEach((maintenance) => {
        if (maintenance_grouped_by_name[maintenance.display_name]) {
          maintenance_grouped_by_name[maintenance.display_name].push(
            maintenance
          );
        } else {
          maintenance_grouped_by_name[maintenance.display_name] = [maintenance];
        }
      });
      let rooms_array_1 = maintenance.filter(
        (room) => room.class_type == "general_overview"
      );
      rooms_array_1.sort((a, b) => Number(a.room_rank) - Number(b.room_rank));
      // keep only display_name from rooms_array_1
      let rooms_array = rooms_array_1.map((room) => room.display_name);
      let flag = false;

      for (let key of rooms_array) {
        let maintenance_group = maintenance_grouped_by_name[key];
        let table_row_maintaince = "";
        let total_cost = 0;
        let index = 0;
        maintenance_group?.forEach((maintenance) => {
          if (maintenance?.metadata?.maintenance == true) {
            index++;
            let maintenance_template = `<tr>
                    <td> ITEM_NAME </td>
                    <td> COMMENTS </td>
                    <td> LIABILITY </td>
                </tr>`;
            let maintenance_tag = "";
            maintenance?.metadata?.maintenance_issue?.forEach((issue) => {
              maintenance_tag += `${issue}, `;
            });
            maintenance_tag = maintenance_tag.slice(0, -2);
            let maintenance_item =
              maintenance?.item_type?.charAt(0).toUpperCase() +
              maintenance?.item_type?.slice(1);
            maintenance_item = maintenance_item.replace(/_/g, " ");
            maintenance_template = maintenance_template
              .replace("ITEM_NAME", maintenance_item)
              .replace("LIABILITY", maintenance.metadata?.liability[0])
              .replace("COMMENTS", maintenance_tag);
            total_cost += Number(maintenance.metadata?.remedial_cost);
            table_row_maintaince += maintenance_template;
          }
        });
        if (index == 0) continue;
        else flag = true;
        let maintenance_template_group = `<table>  <tr>
                <th> ${key.charAt(0).toUpperCase() + key.slice(1)}` 
                 if(total_cost > 0) maintenance_template_group+=`- £${total_cost.toFixed(2)}` 
        maintenance_template_group+=`</th>
                <th>Defects</th>
                <th>Liability</th>
            </tr> ${table_row_maintaince} </table>`;
        maintenance_template += maintenance_template_group;
      }

      hydrate_template = hydrate_template.replace(
        "MAINTENANCE_DESCRIPTIONS",
        maintenance_template
      );
      if (flag == true) html_template_list.push(hydrate_template);
      console.log("6-maintenance.html", Date.now() - start_time);
    } else if (file == "7-meters.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      // let hydrate_template=template;
      const meters = report_responses.filter(
        (report_response) => report_response.entity_type == "meters"
      );
      let meters_str = "";
      let meters_comment_str = "";
      let meter_photos = "";
      meters?.forEach((meter) => {
        let meter_template = `<tr>
                <td> METER <br/>`;
        if (meter.metadata?.photos?.length > 0) {
          meter_template += `<a href=${gallery_url} target = "_blank" > (${meter.metadata?.photos?.length} photo`;
          if (meter.metadata?.photos?.length > 1) meter_template += `s`;
          meter_template += `)</a>`;
        }
        // else{
        //     meter_template+=`&nbsp;`
        // }
        meter_template += `</td><td> LOCATION </td>
                <td> SERIAL </td>
                <td> IN_READING 
                     DATE 
                </td>
                <td> OUT_READING 
                    CHECK_DATE 
                    </td>
            </tr>`;
            let meter_in= meter.metadata?.meter_reading_in;
            if(meter_in) meter_in = meter_in + " <br>";
            let meter_out= meter.metadata?.meter_reading_out;
            if(meter_out) meter_out = meter_out + " <br>";
        meter_template = meter_template
          .replace("METER", cleanString(meter.item_type))
          .replace("LOCATION", meter.metadata?.location)
          .replace("SERIAL", meter.metadata?.serial_no)
          .replace("IN_READING", meter_in)
          .replace("OUT_READING", meter_out)
          .replace(
            "DATE",
            meter.metadata?.check_in_date
              ? "(" +
                  moment(meter.metadata?.check_in_date, "YYYY-MM-DD").format(
                    "DD-MM-YYYY"
                  ) +
                  ")"
              : "N/A"
          )
          .replace(
            "CHECK_DATE",
            meter.metadata?.check_out_date
              ? "(" +
                  moment(meter.metadata?.check_out_date, "YYYY-MM-DD").format(
                    "DD-MM-YYYY"
                  ) +
                  ")"
              : "N/A"
          );
        meters_str += meter_template;
        if (meter.metadata?.notes && meter.metadata?.notes != "")
          meters_comment_str +=
            "<p>" + meter.item_type + " - " + meter.metadata?.notes + "</p>";
        meter.metadata?.photos?.forEach((link) => {
          link = link.replace("upload/", "upload/c_thumb,w_200,g_face/");
          let photo_ref = `<a href=${gallery_url} target="_blank" >
            <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain;">
            </figure></a>`;
          meter_photos += photo_ref;
        });
      });
      if (meter_photos!="")
      {
        hydrate_template+=`<div class="container page-width">
        <h3>Photos</h3>
        <div class="section">
            <div class="list-of-images">
                METER_PHOTOS
            </div>
        </div>
    </div>`
      }
      hydrate_template = hydrate_template
        .replace("COMMENTS", meters_comment_str)
        .replace("METER_DESCRIPTIONS", meters_str)
        .replace("METER_PHOTOS", meter_photos);
      // .replace('${CSS_URL}',css_url)
      console.log("7-meters.html", Date.now() - start_time);
      if (meters.length > 0) html_template_list.push(hydrate_template);
    } else if (file == "8-compliance.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      // let hydrate_template=template
      const compliance = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.metadata?.fire_alarm_compliance == true
      );
      let complaince_str = `<div class="container page-width" ><h1>Alarm Summary </h1>
            <table>
                <tr>
                    <th style="width:15%;">Room</th>
                    <th style="width:20%;">Item</th>
                    <th style="width:unset;">Description</th>
                    <th style="width:15%;">Date Tested</th>
                    <th style="width:15%;">Expiry Date</th>
                </tr>`;
      compliance?.forEach((compliance) => {
        let compliance_template = `<tr>
                <td> ROOM_NAME </td>
                <td> ITEM_NAME <br/>`;
        if (compliance.metadata?.photos?.length > 0) {
          compliance_template += `<a href=${gallery_url} target = "_blank"> (${compliance.metadata?.photos?.length}  photo`;
          if (compliance.metadata?.photos?.length > 1)
            compliance_template += `s`;
          compliance_template += `)</a>`;
        }
        // else{
        //     compliance_template+=`&nbsp;`
        // }
        compliance_template += `</td>
                <td> BODY </td>
                <td> TESTED_DATE </td>
                <td> EXPIRY_DATE </td>
            </tr>`;
        let room_name_str =
          compliance?.display_name?.charAt(0).toUpperCase() +
          compliance?.display_name?.slice(1);
        room_name_str = room_name_str.replace(/_/g, " ");
        let item_type_str =
          compliance?.item_type?.charAt(0).toUpperCase() +
          compliance?.item_type?.slice(1);
        item_type_str = item_type_str.replace(/_/g, " ");
        compliance_template = compliance_template
          .replace("ITEM_NAME", item_type_str)
          .replace("ROOM_NAME", room_name_str)
          .replace(
            "BODY",
            compliance.metadata?.description.length > 0
              ? compliance.metadata?.description.join(". ") + " " + compliance.metadata?.body
              : " " + compliance.metadata?.body
          )
          .replace(
            "TESTED_DATE",
            compliance.metadata?.date_tested
              ? moment(compliance.metadata?.date_tested, "YYYY-MM-DD").format(
                  "DD-MM-YYYY"
                )
              : "N/A"
          )
          .replace(
            "EXPIRY_DATE",
            compliance.metadata?.expiry_date
              ? moment(compliance.metadata?.expiry_date, "YYYY-MM-DD").format(
                  "DD-MM-YYYY"
                )
              : "N/A"
          );
        complaince_str += compliance_template;
      });
      let h_s_compliance = report_responses.filter(
        (report_response) => report_response.entity_type == "h_s_compliance"
      );
      h_s_compliance = h_s_compliance[0];
      let question_response = "";
      let compliance_photos = "";
      h_s_compliance?.metadata?.images?.forEach((link) => {
        let photo_ref = `<a href=${gallery_url} target="_blank" >
          <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain;">
          </figure></a>`;
        compliance_photos += photo_ref;
      });
      h_s_compliance?.metadata?.response?.forEach((h_s) => {
        const response = h_s.answer;
        const question = h_s.question?.split("_")[0];
        let style_class = "response-yes";
        if (response == "No") {
          style_class = "response-no";
        } else if (response == "N/A") {
          style_class = "response-na";
        }
        const question_template = `<tr>
                <td> QUESTION </td>
                <td class="${style_class}"> RESPONSE </td>
            </tr>`;
        question_response += question_template
          .replace("QUESTION", question)
          .replace("RESPONSE", response);
      });
      complaince_str += `</table></div>`;
      if (compliance_photos != "") {
        hydrate_template = hydrate_template.replace("PHOTOS",`<div class="container page-width">
        <h3>Photos</h3>
        <div class="section">
            <div class="list-of-images">
                COMPLIANCE_PHOTOS
            </div>
        </div>`)
      }
      else{
        hydrate_template = hydrate_template.replace("PHOTOS","")
      }
      hydrate_template = hydrate_template
        .replace("QUESTION_RESPONSES", question_response)
        .replace("COMMENTS", h_s_compliance?.metadata?.comment)
        .replace("COMPLIANCE_PHOTOS", compliance_photos);
      if (compliance.length > 0)
        hydrate_template = hydrate_template.replace(
          "COMPLIANCE_DESCRIPTIONS",
          complaince_str
        );
      else
        hydrate_template = hydrate_template.replace(
          "COMPLIANCE_DESCRIPTIONS",
          ""
        );
      // .replace('${CSS_URL}',css_url)
      if (compliance.length > 0) html_template_list.push(hydrate_template);
      console.log("8-compliance.html", Date.now() - start_time);
      // await page.setContent(hydrate_template);
    } else if (file == "9-utilities.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      const utilities = report_responses.filter(
        (report_response) => report_response.entity_type == "utilities"
      );
      let utilities_str = "";
      let utility_photos = "";
      let utility_comment_str = "";
      utilities?.forEach((utility) => {
        let utility_template = `<tr>
                <td> UTILITY_NAME <br/>`;
        if (utility.metadata?.photos?.length > 0) {
          utility_template += `<a href=${gallery_url} target = "_blank" > (NUM photo`;
          if (utility.metadata?.photos?.length > 1) utility_template += `s`;
          utility_template += `)</a>`;
        }
        // else{
        //     utility_template+=`&nbsp;`
        // }
        utility_template += `</td>  <td> LOCATION </td> </tr>`;
        utility_template = utility_template
          .replace("NUM", utility.metadata?.photos?.length)
          .replace("UTILITY_NAME", cleanString(utility.item_type))
          .replace("LOCATION", utility.metadata?.location);
        utilities_str += utility_template;
        utility.metadata?.photos?.forEach((link) => {
          link = link.replace("upload/", "upload/c_thumb,w_200,g_face/");
          let photo_ref = `<a href=${gallery_url} target="_blank" >
            <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain;">
            </figure></a>`;
          utility_photos += photo_ref;
        });
        if (utility.metadata?.notes && utility.metadata?.notes != "")
          utility_comment_str +=
            "<p>" +
            cleanString(utility.item_type) +
            " - " +
            utility.metadata?.notes +
            "</p>";
      });
      if(utility_photos!=""){
        hydrate_template+=`<div class="container page-width">
        <h3>Photos</h3>
        <div class="section">
            <div class="list-of-images">
                UTILITY_PHOTOS
            </div>
        </div>
    </div>`
      }
      hydrate_template = hydrate_template
        .replace("PROPERTY_ADDRESS", property.address)
        .replace("UTILITY_DESCRIPTIONS", utilities_str)
        .replace("COMMENTS", utility_comment_str)
        .replace("UTILITY_PHOTOS", utility_photos);
      if (utilities.length > 0) html_template_list.push(hydrate_template);
      console.log("9-utilities.html", Date.now() - start_time);
    } else if (file == "10-rooms.html") {
      let rooms_and_areas = report_responses.filter(
        (report_response) => report_response.entity_type == "rooms_and_areas"
      );
      rooms_and_areas.sort((a, b) => a.room_rank - b.room_rank);
      let rooms_and_areas_grouped_by_name = {};
      let photo_sec_num = report.report_type === "Inspection Report" ? 3 : 5;

      for (let room of rooms_and_areas) {
        if (rooms_and_areas_grouped_by_name[room.display_name]) {
          rooms_and_areas_grouped_by_name[room.display_name].push(room);
        } else {
          rooms_and_areas_grouped_by_name[room.display_name] = [room];
        }
      }
      Object.keys(rooms_and_areas_grouped_by_name)?.forEach((key) => {
        rooms_and_areas_grouped_by_name[key].sort(
          (a, b) => Number(a.item_rank) - Number(b.item_rank)
        );
      });
      let rooms_array_1 = rooms_and_areas.filter(
        (room) => room.class_type == "general_overview"
      );
      rooms_array_1.sort((a, b) => Number(a.room_rank) - Number(b.room_rank));
      // keep only display_name from rooms_array_1
      let rooms_array = rooms_array_1.map((room) => room.display_name);
      
      let index = 0;
      let rt = 0;
      let ct = 0;
      for (let key of rooms_array) {
        index++;

        let photos_360 = "";
        let single_photos = "";
        let rooms_and_areas_group = rooms_and_areas_grouped_by_name[key];
        let pic_index = 0;
        let pic_360_index = 0;
        let decor_count = 0;
        let fixtures_count = 0;
        let furnishings_count = 0;
        let decor = "";
        let fixtures = "";
        let furnishings = "";
        for (let inx = 0; inx < rooms_and_areas_group.length; inx++) {
          let room = rooms_and_areas_group[inx];
          if (room.metadata?.photos_360?.length > 0) {
            room.metadata?.photos_360?.forEach((link) => {
              link = link.replace("upload/", "upload/c_thumb,w_200,g_face/");
              pic_index++;
              pic_360_index++;
              let img_template = `<a href="${gallery_url}" target="_blank">
                            <div style="page-break-inside: avoid;">
                            <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain; page-break-inside: avoid;">
                            <figcaption>${index}.${photo_sec_num}.${pic_index} - ${cleanString(
                room?.item_type
              )}  </figcaption>
                            </figure></div></a>`;
              ct++;
              // if(ct%12==0){
              //     img_template+=`<div style="page-break-after: always;"></div>`
              // }
              photos_360 += img_template;
            });
          }
          if (room.metadata?.photos?.length > 0) {
            room.metadata?.photos?.forEach((link) => {
              link = link.replace("upload/", "upload/c_thumb,w_200,g_face/");
              pic_index++;
              let img_template = `<a href="${gallery_url}" target="_blank" >
                            <div style="page-break-inside: avoid;">
                            <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain; ">
                            <figcaption>${index}.${photo_sec_num}.${pic_index} - ${cleanString(
                room?.item_type
              )}  </figcaption>
                            </figure></div></a>`;
              rt++;
              // if(rt%12==0){
              //     img_template+=`<div style="page-break-after: always;"></div>`
              // }
              single_photos += img_template;
            });
          }
         if (room.metadata?.feedbackImg) {
            pic_index++;
            let img = room.metadata.feedbackImg;
            let img_template = `<a href=${gallery_url} target="_blank" >
                                <figure style="background: #f0f0f0 url(${img}) no-repeat center center; background-size: contain;">
                                <figcaption>${index}.5.${pic_index} - ${cleanString(room?.item_type)} - Feedback</figcaption>
                                </figure></a>`;
            single_photos += img_template;
          }
            if (report.report_type == "Inventory Report" && tenancy.type == "HMO") {
            if (room.metadata.hmo_feedback) {
              for (let feedback of room.metadata.hmo_feedback) {
                if (feedback.tenant_id === req.query.tenant_id) {
                  if (feedback.feedbackImg) {
                    pic_index++;
                    let img = feedback.feedbackImg;
                    let img_template = `<a href=${gallery_url} target="_blank" >
                                      <figure style="background: #f0f0f0 url(${img}) no-repeat center center; background-size: contain;">
                                      <figcaption>${index}.5.${pic_index} - ${cleanString(room?.item_type)} - Feedback</figcaption>
                                      </figure></a>`;
                    single_photos += img_template;
                  }
                }
              }
            }
          }
          if (report.report_type == "Checkout Report" &&  room.linked_inventory_report!=null) {
            let temp = room.metadata?.old_description;
            room.metadata.old_description = room.metadata?.description;
            room.metadata.description = temp;
            temp = room.metadata?.old_body;
            room.metadata.old_body = room.metadata?.body;
            room.metadata.body = temp;
            temp = room.metadata?.old_condition;
            room.metadata.old_condition = room.metadata?.condition;
            room.metadata.condition = temp;
            temp = room.metadata?.old_cleanliness;
            room.metadata.old_cleanliness = room.metadata?.cleanliness;
            room.metadata.cleanliness = temp;
          }
          if (room.class_type == "decor") {
            // make room.item_type first letter capital
            // room.item_type=
            decor_count++;
            let condition = room.metadata?.condition;
            let cleanliness = room.metadata?.cleanliness;
            let old_condition = room.metadata?.old_condition;
            let old_cleanliness = room.metadata?.old_cleanliness;
            condition = condition.toLowerCase();
            cleanliness = cleanliness.toLowerCase();
            old_condition = old_condition?.toLowerCase();
            old_cleanliness = old_cleanliness?.toLowerCase();
            let decor_template = `<tr style="page-break-inside: avoid;"> <td rowspan="2"><b>${index}.2.${decor_count} ${cleanString(
              room?.item_type
            )} </b><br/>`;
            if (room?.metadata?.photos?.length > 0) {
              decor_template += `<a href=${gallery_url}>(${room?.metadata?.photos?.length} photo`;
              if (room?.metadata?.photos?.length > 1) decor_template += `s`;
              decor_template += `)</a>`;
            }
            let tenant_feedback = room.metadata?.feedback;
            let inspector_feedback = room.metadata?.inspector_feedback;
            if (req.query.original && req.query.original == "true") {
              (inspector_feedback = ""), (tenant_feedback = "");
            }
            if (room.metadata?.hmo_feedback?.length > 0) {
              // filter by metadata.tenant_id and get the feedback
              let tenant_id = req.query.tenant_id || req.query.id;
              let tenant_feedback_obj = room.metadata?.hmo_feedback.filter(
                (feedback) => feedback.tenant_id == tenant_id
              );
              if (tenant_feedback_obj.length > 0) {
                tenant_feedback = tenant_feedback_obj[0].feedback;
              }
              if (room.metadata?.hmo_inspector_feedback?.length > 0) {
                let inspector_feedback_obj =
                  room.metadata?.hmo_inspector_feedback.filter(
                    (feedback) => feedback.tenant_id == tenant_id
                  );
                if (inspector_feedback_obj.length > 0) {
                  inspector_feedback = inspector_feedback_obj[0].feedback;
                }
              }
            }
            if (req.query.type == "tenant") {
              tenant_feedback = "";
              inspector_feedback = "";
            }
            decor_template += `</td>
                        <td rowspan="2"> ${
                          room.metadata?.description.length > 0
                            ? room.metadata?.description.join(". ") +
                              " " +
                              room.metadata?.body
                            : room.metadata?.body
                        }  
                        ${
                          tenant_feedback
                            ? '<span style="color:red;"> Tenant Comments - ' +
                              tenant_feedback +
                              "</span>"
                            : ""
                        }
                        ${
                          inspector_feedback
                            ? '<span style="color:blue;"> Inspector Comments - ' +
                              inspector_feedback +
                              "</span>"
                            : ""
                        } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${condition} pad4r">${
              room?.metadata?.condition
            }</td>`;
            // if(report.report_type=="Checkout Report"){
            //     decor_template+=`<td rowspan="2" style="width:25%;">${room.metadata?.check_out_comments}</td>`
            // }
            // decor_template+=`</tr><tr>
            // <td class="pad4"><strong>Cleanliness</strong></td>
            // <td class="${cleanliness} pad4">${room?.metadata?.cleanliness}</td></tr>`
            if (report.report_type == "Checkout Report") {
              decor_template += `<td rowspan="2"> ${
                room.metadata?.old_description.length > 0
                  ? room.metadata?.old_description.join(". ") +
                    " " +
                    room.metadata?.old_body
                  : room.metadata?.old_body
              } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${old_condition} pad4r">${
                room?.metadata?.old_condition
              }</td>`;
            }
            decor_template += `</tr><tr><td class="pad4"><strong>Cleanliness</strong></td>
                        <td class="${cleanliness} pad4r">${room?.metadata?.cleanliness}</td>`;
            if (report.report_type == "Checkout Report") {
              decor_template += `<td class="pad4"><strong>Cleanliness</strong></td>
                            <td class="${old_cleanliness} pad4r">${room?.metadata?.old_cleanliness}</td>`;
            }
            decor_template += `</tr>`;
            let maintenance_tag = "";
            room?.metadata?.maintenance_issue?.forEach((issue) => {
              maintenance_tag += `<span class="mr10">${issue} </span>`;
            });
            let liability = room?.metadata?.liability[0];
            if (liability != "Fair wear & tear") {
              liability += " liability";
            }
            if (room?.metadata?.maintenance == true) {
              decor_template += `<tr class="maintenance-issue">
                        <td style="width: unset"><span> ${room?.metadata?.liability[0]} liability</span></td>`;
              if (report.report_type == "Checkout Report")
                decor_template += `<td style="width: unset" colspan="7"> ${maintenance_tag} </td>`;
              else
                decor_template += `<td style="width: unset" colspan="3"> ${maintenance_tag} </td>`;
              decor_template += `</tr>`;
            }
            decor += decor_template;
          } else if (room.class_type == "fixtures") {
            fixtures_count++;
            let condition = room.metadata?.condition;
            let cleanliness = room.metadata?.cleanliness;
            let old_condition = room.metadata?.old_condition;
            let old_cleanliness = room.metadata?.old_cleanliness;
            condition = condition.toLowerCase();
            cleanliness = cleanliness.toLowerCase();
            old_condition = old_condition?.toLowerCase();
            old_cleanliness = old_cleanliness?.toLowerCase();
            let fixtures_template = `<tr style="page-break-inside: avoid;"> <td rowspan="2"><b>${index}.3.${fixtures_count} ${cleanString(
              room?.item_type
            )}  </b><br/>`;
            if (room?.metadata?.photos?.length > 0) {
              fixtures_template += `<a href="#">(${room?.metadata?.photos?.length} photo`;
              if (room?.metadata?.photos?.length > 1) fixtures_template += `s`;
              fixtures_template += `)</a>`;
            }
            let tenant_feedback = room.metadata?.feedback;
            let inspector_feedback = room.metadata?.inspector_feedback;
            if (req.query.original && req.query.original == "true") {
              (inspector_feedback = ""), (tenant_feedback = "");
            }
            if (room.metadata?.hmo_feedback?.length > 0) {
              // filter by metadata.tenant_id and get the feedback
              let tenant_id = req.query.tenant_id || req.query.id;
              let tenant_feedback_obj = room.metadata?.hmo_feedback.filter(
                (feedback) => feedback.tenant_id == tenant_id
              );
              if (tenant_feedback_obj.length > 0) {
                tenant_feedback = tenant_feedback_obj[0].feedback;
              }
              if (room.metadata?.hmo_inspector_feedback?.length > 0) {
                let inspector_feedback_obj =
                  room.metadata?.hmo_inspector_feedback.filter(
                    (feedback) => feedback.tenant_id == tenant_id
                  );
                if (inspector_feedback_obj.length > 0) {
                  inspector_feedback = inspector_feedback_obj[0].feedback;
                }
              }
            }
            if (req.query.type == "tenant") {
              tenant_feedback = "";
              inspector_feedback = "";
            }
            fixtures_template += `</td>
                        <td rowspan="2"> ${
                          room.metadata?.description.length > 0
                            ? room.metadata?.description.join(". ") +
                              " " +
                              room.metadata?.body
                            : room.metadata?.body
                        } 
                        ${
                          tenant_feedback
                            ? '<span style="color:red;"> Tenant Comments - ' +
                              tenant_feedback +
                              "</span>"
                            : ""
                        }
                        ${
                          inspector_feedback
                            ? '<span style="color:blue;"> Inspector Comments - ' +
                              inspector_feedback +
                              "</span>"
                            : ""
                        } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${condition} pad4r">${
              room?.metadata?.condition
            }</td>`;
            // if(report.report_type=="Checkout Report"){
            //     fixtures_template+=`<td rowspan="2" style="width:25%;">${room.metadata?.check_out_comments}</td>`
            // }
            // fixtures_template+=`</tr><tr>
            // <td class="pad4"><strong>Cleanliness</strong></td>
            // <td class="${cleanliness} pad4">${room?.metadata?.cleanliness}</td>
            // </tr>`
            if (report.report_type == "Checkout Report") {
              fixtures_template += `<td rowspan="2"> ${
                room.metadata?.old_description.length > 0
                  ? room.metadata?.old_description.join(". ") +
                    " " +
                    room.metadata?.old_body
                  : room.metadata?.old_body
              } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${old_condition} pad4r">${
                room?.metadata?.old_condition
              }</td>`;
            }
            fixtures_template += `</tr><tr><td class="pad4"><strong>Cleanliness</strong></td>
                        <td class="${cleanliness} pad4r">${room?.metadata?.cleanliness}</td>`;
            if (report.report_type == "Checkout Report") {
              fixtures_template += `<td class="pad4"><strong>Cleanliness</strong></td>
                            <td class="${old_cleanliness} pad4r">${room?.metadata?.old_cleanliness}</td>`;
            }
            fixtures_template += `</tr>`;
            let maintenance_tag = "";
            room?.metadata?.maintenance_issue?.forEach((issue) => {
              maintenance_tag += `<span class="mr10">${issue} </span>`;
            });
            if (room?.metadata?.maintenance == true) {
              let liability = room?.metadata?.liability[0];
              if (liability != "Fair wear & tear") {
                liability += " liability";
              }
              fixtures_template += `<tr class="maintenance-issue">
                        <td style="width: unset"><span> ${room?.metadata?.liability[0]} liability</span></td>`;
              if (report.report_type == "Checkout Report")
                fixtures_template += `<td style="width: unset" colspan="7"> ${maintenance_tag} </td>`;
              else
                fixtures_template += `<td style="width: unset" colspan="3"> ${maintenance_tag} </td>`;
              fixtures_template += `</tr>`;
            }
            fixtures += fixtures_template;
          } else if (room.class_type == "furnishings & effects") {
            // Check if any relevant metadata fields are present or if arrays have items
            if (
              room.metadata &&
              (room.metadata.condition ||
                room.metadata.cleanliness ||
                room.metadata.old_condition ||
                room.metadata.old_cleanliness ||
                (room.metadata.photos && room.metadata.photos.length > 0) ||
                (room.metadata.description &&
                  room.metadata.description.length > 0) ||
                (room.metadata.body && room.metadata.body.length > 0))
            ) {
              furnishings_count++;
              let condition = room.metadata?.condition;
              let cleanliness = room.metadata?.cleanliness;
              let old_condition = room.metadata?.old_condition;
              let old_cleanliness = room.metadata?.old_cleanliness;
              condition = condition.toLowerCase();
              cleanliness = cleanliness.toLowerCase();
              old_condition = old_condition?.toLowerCase();
              old_cleanliness = old_cleanliness?.toLowerCase();
              let furnishings_template = `<tr style="page-break-inside: avoid;"> <td rowspan="2"><b>${index}.4.${furnishings_count} ${cleanString(
                room?.item_type
              )}  </b><br/>`;
              if (room?.metadata?.photos?.length > 0) {
                furnishings_template += `<a href=${gallery_url}>(${room?.metadata?.photos?.length} photo`;
                if (room?.metadata?.photos?.length > 1)
                  furnishings_template += `s`;
                furnishings_template += `)</a>`;
              }
              let tenant_feedback = room.metadata?.feedback;
              let inspector_feedback = room.metadata?.inspector_feedback;
              if (req.query.original && req.query.original == "true") {
                (inspector_feedback = ""), (tenant_feedback = "");
              }
              if (room.metadata?.hmo_feedback?.length > 0) {
                // filter by metadata.tenant_id and get the feedback
                let tenant_id = req.query.tenant_id || req.query.id;
                let tenant_feedback_obj = room.metadata?.hmo_feedback.filter(
                  (feedback) => feedback.tenant_id == tenant_id
                );
                if (tenant_feedback_obj.length > 0) {
                  tenant_feedback = tenant_feedback_obj[0].feedback;
                }
                if (room.metadata?.hmo_inspector_feedback?.length > 0) {
                  let inspector_feedback_obj =
                    room.metadata?.hmo_inspector_feedback.filter(
                      (feedback) => feedback.tenant_id == tenant_id
                    );
                  if (inspector_feedback_obj.length > 0) {
                    inspector_feedback = inspector_feedback_obj[0].feedback;
                  }
                }
              }
              if (req.query.type == "tenant") {
                tenant_feedback = "";
                inspector_feedback = "";
              }
              furnishings_template += `</td>
                            <td rowspan="2"> ${
                              room.metadata?.description.length > 0
                                ? room.metadata?.description.join(". ") +
                                  " " +
                                  room.metadata?.body
                                : room.metadata?.body
                            }  
                            ${
                              tenant_feedback
                                ? '<span style="color:red;"> Tenant Comments - ' +
                                  tenant_feedback +
                                  "</span>"
                                : ""
                            }
                            ${
                              inspector_feedback
                                ? '<span style="color:blue;"> Inspector Comments - ' +
                                  inspector_feedback +
                                  "</span>"
                                : ""
                            } </td>
                            <td class="pad4"><strong>Condition</strong></td>
                            <td class="${condition} pad4r">${
                room?.metadata?.condition
              }</td>`;
              // if(report.report_type=="Checkout Report"){
              //     furnishings_template+=`<td rowspan="2" style="width:25%;">${room.metadata?.check_out_comments}</td>`
              // }
              // furnishings_template+=`</tr><tr>
              // <td class="pad4"><strong>Cleanliness</strong></td>
              // <td class="${cleanliness} pad4">${room?.metadata?.cleanliness}</td>
              // </tr>`
              if (report.report_type == "Checkout Report") {
                furnishings_template += `<td rowspan="2"> ${
                  room.metadata?.old_description.length > 0
                    ? room.metadata?.old_description.join(". ") +
                      " " +
                      room.metadata?.old_body
                    : room.metadata?.old_body
                } </td>
                            <td class="pad4"><strong>Condition</strong></td>
                            <td class="${old_condition} pad4r">${
                  room?.metadata?.old_condition
                }</td>`;
              }
              furnishings_template += `</tr><tr><td class="pad4"><strong>Cleanliness</strong></td>
                            <td class="${cleanliness} pad4r">${room?.metadata?.cleanliness}</td>`;
              if (report.report_type == "Checkout Report") {
                furnishings_template += `<td class="pad4"><strong>Cleanliness</strong></td>
                                <td class="${old_cleanliness} pad4r">${room?.metadata?.old_cleanliness}</td>`;
              }
              furnishings_template += `</tr>`;
              let maintenance_tag = "";
              room?.metadata?.maintenance_issue?.forEach((issue) => {
                maintenance_tag += `<span class="mr10">${issue} </span>`;
              });
              if (room?.metadata?.maintenance == true) {
                let liability = room?.metadata?.liability[0];
                if (liability != "Fair wear & tear") {
                  liability += " liability";
                }
                furnishings_template += `<tr class="maintenance-issue">
                                <td style="width: unset"><span> ${room?.metadata?.liability[0]} liability</span></td>`;
                if (report.report_type == "Checkout Report")
                  furnishings_template += `<td style="width: unset" colspan="7"> ${maintenance_tag} </td>`;
                else
                  furnishings_template += `<td style="width: unset" colspan="3"> ${maintenance_tag} </td>`;
                furnishings_template += `</tr>`;
              }
              furnishings += furnishings_template;
            }
          }
        }
        const general_overview = rooms_and_areas_group.filter(
          (room) => room.item_type == "general_overview"
        );

        let temp = `<div class="container roompage page-width">
                <h1>${index}. ${
          key.charAt(0).toUpperCase() + key.slice(1)
        } </h1>
                <h3>${index}.1 Overview</h3>
                <table class="">
                    <tr>
                        <td class="overview overview-${index}"  rowspan="2" >${index}.1.1 Overview <br/></td>`;

        // Checking if general_overview[0] exists and has metadata
        if (general_overview[0]?.metadata) {
          const { photos, photos_360, description, body } =
            general_overview[0].metadata;

          // Checking if photos or photos_360 exists and has a length greater than 0
          const totalPhotos = (photos?.length ?? 0) + (photos_360?.length ?? 0);

          if (totalPhotos > 0) {
            temp += `<a href="${gallery_url}" target="_blank"> (${totalPhotos} photo${
              totalPhotos > 1 ? "s" : ""
            })</a>`;
          }

          // Constructing the content based on description and body
          const content =
            (description?.length > 0 ? description.join(". ")+" " : "") +
            (body ?? "");

          temp += `</td>
                        <td style="width: unset !important;">${content}</td>`;
        } else {
          // If general_overview[0] or its metadata is undefined, handle it accordingly
          temp += `<td style="width: unset !important;"></td>`;
        }

        temp += `</tr>
                    </table>
                </div>`;
        if (report_type != "Inspection Report") {
          if (decor_count > 0) {
            temp += `<div class="container roompage page-width `;
            if (report.report_type == "Checkout Report") temp += ` checkout`;
            temp += `" style="page-break-inside: auto; page-break-before: auto;">
                <h3>${index}.2 Decor</h3>
                <table>
                    ${decor}
                </table>
            </div>`;
          }
          if (fixtures_count > 0) {
            temp += `<div class="container roompage page-width `;
            if (report.report_type == "Checkout Report") temp += ` checkout`;
            temp += `" style="page-break-inside: auto; page-break-before: always;">
                <h3>${index}.3 Fixtures</h3>
                <table>
                    ${fixtures}
                </table>
            </div>`;
          }
          if (furnishings_count > 0) {
            temp += `<div class="container roompage page-width `;
            if (report.report_type == "Checkout Report") temp += ` checkout`;
            temp += `" style="page-break-inside: auto; page-break-before: always;">
                <h3>${index}.4 Furnishings</h3>
                <table>
                    ${furnishings}
                </table>
            </div>`;
          }
        } else if (decor_count > 0) {
          temp += `<div class="container roompage page-width" style="page-break-inside: auto; page-break-before: auto;">
                <h3>${index}.2 Defects </h3>
                <table>
                    ${decor}
                    ${fixtures}
                    ${furnishings}
                </table>
            </div>`;
        }
        if (pic_360_index + pic_index > 0) {
          temp += `<div class="page" style="page-break-before: always">
            <div class="container page-width">
                <h3>${index}.${photo_sec_num} Photos</h3>`;
          if (pic_360_index > 0) {
            temp += `<strong style="margin-bottom: 10px;"></strong>
                <div class="list-of-images larger">
                    ${photos_360}
                </div>`;
          }

          temp += `<strong></strong>
                <div class="list-of-images">
                    ${single_photos}
                </div>
            </div>
            </div>`;
        }
        if (report.report_type == "Checkout Report")
          temp = `<div class="checkout"> ${temp} </div>`;
        let hydrate_template = fs
          .readFileSync(`${__dirname}/template/${file}`)
          .toString()
          // let hydrate_template=template
          .replace("ROOMS_AND_AREAS_DESCRIPTIONS", temp);
        // .replace('${CSS_URL}',css_url)
        html_template_list.push(hydrate_template);
        // html_rooms.push(hydrate_template);
        console.log("10-rooms.html", Date.now() - start_time);
      }
    } else if (file == "11-declaration.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      // split declaration by \n and then make each line a <p> tag
      const decl = declaration.entity_value[0];

      let declaration_arr = decl.split("\n");

      let declaration_str = "";
      declaration_arr.forEach((line) => {
        declaration_str += `<p>${line}</p>`;
      });
      hydrate_template = hydrate_template
        .replace("DECLARATION", declaration_str)
        .replace("ASSIGNED_PERSON_NAME", report.assigned_person_id.name)
        .replace("REPORT_DATE", moment(report.date).format("DD-MM-YYYY"));
      let template_string = `<td>Tenant INDEX  Name: NAME </br>
            Date of Signature: DATE_SIGNATURE <br/>
            <b>Signature</b> <img src=" SIGN_URL " class="ivy-logo"/> <p style="color:red;"> FEEDBACK </p></td>`;
      let index = 0;
      let second_table_repl = "";
      let first_table_repl = "";
      let signature_url = "";
      report_responses?.forEach((room) => {
        if (room.entity_type == "signature") {
          signature_url = room.metadata?.signature;
        }
      });
      const tenant_signature = report_responses.filter(
        (report_response) => report_response.entity_type == "tenant_signature"
      );
      let tenant_signature_map = {};
      tenant_signature.forEach((tenant) => {
        tenant_signature_map[tenant.metadata?.id] = tenant.metadata?.url;
      });
      let tenant_feedback = report_responses.filter(
        (report_response) => report_response.entity_type == "tenant_feedback"
      );
      let tenant_feedback_map = {};
      tenant_feedback.forEach((tenant) => {
        tenant_feedback_map[tenant.item_type] = tenant.metadata?.feedback;
      });
      console.log("tenant_feedback_map", tenant_feedback_map);
      tenancy?.tenants?.forEach((tenant) => {
        index++;
        if (
          (req.query.tenant_id || req.query.id) &&
          (req.query.tenant_id || req.query.id) != tenant._id
        ) {
          index--;
          return;
        }
        let final_feedback = tenant_feedback_map[tenant?._id] || "";
        if (req.query.original && req.query.original == "true")
          final_feedback = "";
        let tenant_template = template_string.replace("INDEX", index);
        tenant_template = tenant_template.replace(
          "NAME",
          decrypt(tenant?.name, tenancy?.iv)
        );
        tenant_template = tenant_template.replace("FEEDBACK", final_feedback);
        const default_url =
          "https://res.cloudinary.com/dcugtdlab/image/upload/v1696067271/test/Screenshot_2023-09-30_at_3.16.56_PM_gq25nd.png";
        let sign_url = tenant_signature_map[tenant?._id] || default_url;
        tenant_template = tenant_template.replace("SIGN_URL", sign_url);
        if (tenant?.signed_timestamp)
          tenant_template = tenant_template.replace(
            "DATE_SIGNATURE",
            moment(tenant?.signed_timestamp).format("DD-MM-YYYY")
          );
        else tenant_template = tenant_template.replace("DATE_SIGNATURE", "");
        if (index % 2 == 1) {
          second_table_repl += tenant_template;
        } else {
          first_table_repl += tenant_template;
        }
      });
      let inspector_feedback = report_responses.filter(
        (report_response) => report_response.entity_type == "inspector_feedback"
      );
      let inspector_feedback_final =
        inspector_feedback[0]?.metadata?.feedback || "";
      if (req.query.original && req.query.original == "true") {
        (inspector_feedback = ""),
          (tenant_feedback = ""),
          (inspector_feedback_final = "");
      }
      hydrate_template = hydrate_template
        .replace("FIRST_TENANT_TABLE", first_table_repl)
        .replace("SECOND_TENANT_TABLE", second_table_repl)
        .replace("${SIGNATURE_URL}", signature_url)
        .replace("INSPECTOR_FEEDBACK", inspector_feedback_final);
      // .replace('${CSS_URL}',css_url)
      html_template_list.push(hydrate_template);
      console.log("11-declaration.html", Date.now() - start_time);
      // await page.setContent(hydrate_template);
    } else if (file == "12-disclaimer.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      const entity = disclaimer.entity_value[0];
      // split by \n and then make each line a <p> tag
      let entity_arr = entity.split("\n");
      let entity_str = "";
      entity_arr.forEach((line) => {
        entity_str += `<p>${line}</p>`;
      });
      hydrate_template = hydrate_template.replace("DISCLAIMER", entity_str);
      html_template_list.push(hydrate_template);
      console.log("12-disclaimer.html", Date.now() - start_time);
    } else if (file == "13-documents.html") {
      let hydrate_template = fs
        .readFileSync(`${__dirname}/template/${file}`)
        .toString();
      // hydrate_template=template
      let repl = "";
      let tenant_repl = "";
      for (let i = 0; i < report?.documents?.length; i++) {
        const temp = `<tr>
                <td><a href=" ${report?.documents[i].url} ">Document ${
          i + 1
        } </a></td>
            </tr>`;
        repl += temp;
      }
      let index = 0;
      const tenant_signature = report_responses.filter(
        (report_response) => report_response.entity_type == "tenant_signature"
      );
      let tenant_signature_map = {};
      tenant_signature?.forEach((tenant) => {
        tenant_signature_map[tenant.metadata?.id] = tenant.metadata?.url;
      });
      console.log(tenant_signature_map, "tenant_signature_map");
      const template_string = `<td>Tenant INDEX name: NAME <br/>
            Email: TENANT_EMAIL <br/>
            REPORT_DATE <br/>
            <b>Signature</b>
            <img src=" SIGN_URL " class="ivy-logo"/>
            </td>`;
      const default_url =
        "https://res.cloudinary.com/dcugtdlab/image/upload/v1696067271/test/Screenshot_2023-09-30_at_3.16.56_PM_gq25nd.png";
      tenancy?.tenants?.forEach((tenant) => {
        index++;
        if ((req.query.tenant_id || req.query.id) != tenant._id) {
          index--;
          return;
        }
        console.log(
          "sign_url",
          tenant_signature_map[tenant?._id] || default_url
        );
        let tenant_template = template_string
          .replace("INDEX", index)
          .replace("NAME", decrypt(tenant?.name, tenancy?.iv))
          .replace("TENANT_EMAIL", decrypt(tenant?.email, tenancy?.iv))
          .replace("REPORT_DATE", moment(report.date).format("DD-MM-YYYY"))
          .replace(
            "SIGN_URL",
            tenant_signature_map[tenant?._id] || default_url
          );
        tenant_repl += tenant_template;
      });
      console.log("tenant_repl", tenant_repl);
      hydrate_template = hydrate_template
        .replace("DOCUMENTS_TABLE_ROWS", repl)
        .replace("TENANT_TABLE_ROWS", tenant_repl);
      if (report?.documents?.length > 0)
        html_template_list.push(hydrate_template);
      console.log("13-documents.html", Date.now() - start_time);
    }
  }
  const payload = {
    html_template_list,
    report_type,
    property: {
      address: property.address,
      postcode:property?.postcode
    }
  };
  const response = await compresssReport(payload);
  console.log("Compressed PDF :", response);
  res.json({
    success: true,
    url: response.outputUrl,
  });
});

const getReportPreview = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  const [report, report_responses] = await Promise.all([
    Report.findById(report_id)
      .populate({
        path: "assigned_person_id",
        select: "name",
      })
      .select(
        "_id property_id date report_type documents assigned_person_id ref_number"
      ),
    ReportResponse.find({ report_id }).sort("display_name item_type"),
  ]);
  const property = await Property.findById(report.property_id);
  const admin_id = property.admin_id;
  const [declaration, disclaimer, company_logo, tenancy, customer] =
    await Promise.all([
      Settings.findOne({ admin_id, entity_type: "declaration" }),
      Settings.findOne({ admin_id, entity_type: "disclaimer" }),
      Settings.findOne({ admin_id, entity_type: "company_logo" }),
      Tenancy.findOne({ report_id }).select("tenants iv type start_date"),
      Customer.findOne({ user_id: property.customer_user_id }).select(
        "name logo"
      ),
    ]);
  const report_type = report.report_type;
  const gallery_url = `${process.env.FRONTEND_URL}/reports/gallery/${report_id}`;
  let htmlFiles = [
    "preview.html",
    // '2-contents.html',
    // '3-definitions.html',
    // '4-schedule.html',
    // '5-overview.html',
    // '6-maintenance.html',
    // '7-meters.html',
    // '8-compliance.html',
    // '9-utilities.html',
    // '10-rooms.html',
    // '11-declaration.html',
    // '12-disclaimer.html',
    // '13-documents.html'
  ];
  if (report_type == "Inspection Report") {
    //remove only 7-meters.html and 9-utilities.html
    htmlFiles.splice(6, 1);
    htmlFiles.splice(7, 1);
  }
  // const browser = await puppeteer.launch(
  // {
  //     executablePath: '/usr/bin/chromium-browser',
  //     args: ['--no-sandbox']
  // });
  let tenants_name = [];
  tenancy?.tenants?.forEach((tenant) => {
    tenants_name.push(decrypt(tenant.name, tenancy.iv));
  });
  const tenants = tenants_name.join(" , ");
  let html_template_list = [];
  let css_url2 = `http://localhost:${process.env.PORT}/css/report.css`

  // let css_url =
  //   "https://res.cloudinary.com/dcugtdlab/raw/upload/v1716475143/kavouamykklzfjbsrstu.css";
  // mark the time here
  const start_time = Date.now();
  let hydrate_template = fs
    .readFileSync(`${__dirname}/template/preview.html`)
    .toString();
  // replace all instances of PROPERTY_ADDRESS with property address
  hydrate_template = hydrate_template.replace(
    /PROPERTY_ADDRESS/g,
    property.address
  );
  hydrate_template = hydrate_template.replace(/REPORT_TYPE/g, report_type);
  for (let i = 1; i <= 13; i++) {
    // const file=htmlFiles[0];
    if (i == 1) {
      hydrate_template = hydrate_template.replace(
        /REPORT_DATE/g,
        moment(report.date).format("DD-MM-YYYY")
      );
      hydrate_template = hydrate_template
        .replace("PROPERTY_TYPE", property.type)
        .replace("TENANCY_TYPE", tenancy?.type)
        .replace("TENANTS", tenants)
        .replace("REPORT_TYPE", report.report_type)
        .replace(
          "${IVY_LOGO}",
          company_logo?.entity_value?.length > 0
            ? company_logo?.entity_value[0]
            : "https://res.cloudinary.com/dcugtdlab/image/upload/v1694537890/samples/cloudinary-icon.png"
        )
        .replace("CUSTOMER_NAME", customer.name)
        .replace(
          "${COMPANY_LOGO}",
          customer?.logo?.length > 0
            ? customer?.logo[0]
            : "https://res.cloudinary.com/dcugtdlab/image/upload/v1694537890/samples/cloudinary-icon.png"
        )
        .replace("PROPERTY_ADDRESS", property.address)
        .replace("${GALLERY_URL}", gallery_url)
        .replace("${GALLERY_URL_1}", gallery_url)
        .replace("REPORT_TYPE", report.report_type)
        .replace("REF_NUM", report?.ref_number)
        .replace("POSTCODE", property?.postcode)
        .replace(
          "TENANT_START_DATE",
          moment(tenancy?.start_date).format("DD-MM-YYYY")
        )
        .replace("${PROPERTY_IMAGE}", property?.photos[0]);
      // .replace('${CSS_URL}',css_url)
      // html_template_list.push(hydrate_template);
      console.log("1-home.html", Date.now() - start_time);
      // await page.setContent(hydrate_template);
    } else if (i == 2) {
      const rooms_and_areas = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.item_type == "general_overview"
      );
      let template_rooms_and_areas = "";
      let index = 0;
      rooms_and_areas.forEach((room) => {
        index++;
        let list_template = `<li>
                <a href="#">
                  <span class="title"> INDEX . ROOM_NAME <span class="leaders" aria-hidden="true"></span></span>
                  <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
                </a>
              </li>`;
        list_template = list_template
          .replace(
            "ROOM_NAME",
            room?.display_name?.charAt(0).toUpperCase() +
              room?.display_name?.slice(1)
          )
          .replace("INDEX", index);
        template_rooms_and_areas += list_template;
      });
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      let overview_type = "Check In Overview";
      if (report_type == "Inspection Report") {
        overview_type = "Inspection Overview";
      } else if (report_type == "Checkout Report") {
        overview_type = "Check Out Overview";
      }
      let temp = `<li>
              <a href="#">
                <span class="title">${overview_type}<span class="leaders" aria-hidden="true"></span></span>
                <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
              </a>
            </li>
            <li>
            <a href="#">
              <span class="title">Maintenance Overview<span class="leaders" aria-hidden="true"></span></span>
              <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
            </a>
          </li>`;
      if (report_type != "Inspection Report") {
        temp += `<li>
            <a href="#">
              <span class="title">Meters<span class="leaders" aria-hidden="true"></span></span>
              <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
            </a>
          </li>`;
      }
      temp += `<li>
          <a href="#">
            <span class="title">H&S Compliance<span class="leaders" aria-hidden="true"></span></span>
            <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
          </a>
        </li>`;
      if (report_type != "Inspection Report") {
        temp += `<li>
            <a href="#">
              <span class="title">Utilities<span class="leaders" aria-hidden="true"></span></span>
              <span class="page"><span class="visually-hidden">Page</span> REF_NUM </span>
            </a>
          </li>`;
      }
      hydrate_template = hydrate_template
        .replace("ROOMS_AND_AREAS", template_rooms_and_areas)
        .replace("DYNAMIC_CONTENT", temp);
      // html_template_list.push(hydrate_template);
      console.log("2-contents.html", Date.now() - start_time);
    } else if (i == 3) {
      // let template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      // html_template_list.push(template);
      // ht
    } else if (i == 4) {
      let rooms_and_areas = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.item_type == "general_overview"
      );
      rooms_and_areas.sort((a, b) => a.room_rank - b.room_rank);
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      let rooms_and_areas_template = "";
      rooms_and_areas.forEach((room) => {
        let room_template = `<tr>
                <td> ROOM_NAME <br/>`;
        if (room.metadata?.photos?.length > 0) {
          room_template += `<a href=${gallery_url} target="_blank" >(${room.metadata?.photos?.length} photo`;
          if (room.metadata?.photos?.length > 1) room_template += `s`;
          room_template += `)</a>`;
        }
        // else{
        //     room_template+=`&nbsp;`
        // }
        room_template += `</td><td> DESCRIPTION </td></tr>`;

        room_template = room_template.replace(
          "ROOM_NAME",
          cleanString(room?.display_name)
        );
        console.log("description", room.metadata?.description);
        room_template = room_template.replace(
          "DESCRIPTION",
          room.metadata?.description?.length > 0
            ? room.metadata?.description.join(". ") +" "+room.metadata?.body
            : room.metadata?.body
        );
        rooms_and_areas_template += room_template;
      });
      hydrate_template = hydrate_template.replace(
        "ROOMS_AND_AREAS_DESCRIPTIONS",
        rooms_and_areas_template
      );
      // html_template_list.push(hydrate_template);
      console.log("4-schedule.html", Date.now() - start_time);
    } else if (i == 5) {
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      let h_s_compliance = report_responses.filter(
        (report_response) => report_response.entity_type == "check_in_overview"
      );
      if (report.report_type == "Inspection Report") {
        h_s_compliance = report_responses.filter(
          (report_response) =>
            report_response.entity_type == "inspection_overview"
        );
      }
      if (report.report_type == "Checkout Report") {
        h_s_compliance = report_responses.filter(
          (report_response) =>
            report_response.entity_type == "check_out_overview"
        );
      }
      h_s_compliance = h_s_compliance[0];
      let question_response = "";
      h_s_compliance?.metadata?.response?.forEach((h_s) => {
        const response = h_s.answer;
        const question = h_s.question?.split("_")[0];
        const is_yellow_in_green = h_s?.if_yes_in_green;
        let style_class = "response-yes";
        if (response == "No") {
          style_class = "response-no";
        } else if (response == "N/A") {
          style_class = "response-na";
        }
        if (is_yellow_in_green == false) {
          if (style_class == "response-yes") {
            style_class = "response-no";
          } else if (style_class == "response-no") {
            style_class = "response-yes";
          }
        }
        const question_template = `<tr>
                <td> QUESTION </td>
                <td class="${style_class}"> RESPONSE </td>
            </tr>`;
        question_response += question_template
          .replace("QUESTION", question)
          .replace("RESPONSE", response);
      });
      let dynamic_title = "Check In Overview";
      if (report.report_type == "Inspection Report") {
        dynamic_title = "Inspection Overview";
      }
      if (report.report_type == "Checkout Report") {
        dynamic_title = "Check Out Overview";
      }
      if (h_s_compliance?.metadata?.response?.length > 0) {
        let photos_section = "";
        if (h_s_compliance?.metadata?.images?.length > 0) {
          photos_section=`<div class="container page-width">
          <h3>Photos</h3>
          <div class="section">
              <div class="list-of-images">
                  COMPLIANCE_PHOTOS
              </div>
          </div>
      </div>`
      }
        hydrate_template = hydrate_template.replace(
          "OVERVIEW_SECTION",
          `<div class="page" style="page-break-before: always">
            <div class="container page-width">
                <h1> DYNAMIC_TITLE </h1>
                <table>
                    <tr>
                        <th>Question</th>
                        <th style="width:10%;">Response</th>
                    </tr>
                    QUESTION_RESPONSES
                </table>
            </div>
        
            <div class="container page-width">
                <div class="inspectornotes">
                <h3>Inspector Notes</h3>
                <div class="section">
                    <div class="text">
                        <p> COMMENTS </p>
                    </div>
                </div>
            </div>

          ${photos_section}

            <div class="propertynotes">
                <h3>Property Information</h3>
                <div class="section">
                    <div class="text">
                        <p> PROPERTY_INFORMATION </p>
                    </div>
                </div>
            </div>
            </div>
        </div>`
        );
        let compliance_photos = "";
        h_s_compliance?.metadata?.images?.forEach((link) => {
          let photo_ref = `<a href=${gallery_url} target="_blank" >
          <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain;">
          </figure></a>`;
          compliance_photos += photo_ref;
        });
        hydrate_template = hydrate_template
          .replace("QUESTION_RESPONSES", question_response)
          .replace("COMMENTS", h_s_compliance?.metadata?.comment)
          .replace("DYNAMIC_TITLE", dynamic_title)
          .replace("COMPLIANCE_PHOTOS", compliance_photos)
          .replace(
            "PROPERTY_INFORMATION",
            h_s_compliance?.metadata?.property_info
          );
        // html_template_list.push(hydrate_template);
        console.log("5-overview.html", Date.now() - start_time);
      } else {
        hydrate_template = hydrate_template.replace("OVERVIEW_SECTION", "");
      }
    } else if (i == 6) {
      const maintenance = report_responses.filter(
        (report_response) => report_response.entity_type == "rooms_and_areas"
      );
      let maintenance_template = "";
      let flag = 0;
      let maintenance_grouped_by_name = {};
      maintenance.forEach((maintenance) => {
        if (maintenance_grouped_by_name[maintenance.display_name]) {
          maintenance_grouped_by_name[maintenance.display_name].push(
            maintenance
          );
        } else {
          maintenance_grouped_by_name[maintenance.display_name] = [maintenance];
        }
      });
      let rooms_array_1 = maintenance.filter(
        (room) => room.class_type == "general_overview"
      );
      rooms_array_1.sort((a, b) => Number(a.room_rank) - Number(b.room_rank));
      // keep only display_name from rooms_array_1
      let rooms_array = rooms_array_1.map((room) => room.display_name);

      for (let key of rooms_array) {
        let maintenance_group = maintenance_grouped_by_name[key];
        let table_row_maintaince = "";
        let total_cost = 0;
        let index = 0;
        maintenance_group.forEach((maintenance) => {
          if (maintenance?.metadata?.maintenance == true) {
            index++;
            flag++;
            let maintenance_template = `<tr>
                    <td> ITEM_NAME </td>
                    <td> COMMENTS </td>
                    <td> LIABILITY </td>
                </tr>`;
            let maintenance_tag = "";
            maintenance?.metadata?.maintenance_issue.forEach((issue) => {
              maintenance_tag += `${issue}, `;
            });
            maintenance_tag = maintenance_tag.slice(0, -2);
            let maintenance_item = cleanString(maintenance?.item_type);
            maintenance_item = maintenance_item.replace(/_/g, " ");
            maintenance_template = maintenance_template
              .replace("ITEM_NAME", maintenance_item)
              .replace("LIABILITY", maintenance.metadata?.liability[0])
              .replace("COMMENTS", maintenance_tag);
            total_cost += Number(maintenance.metadata?.remedial_cost);
            table_row_maintaince += maintenance_template;
          }
        });
        if (index == 0) continue;
        let maintenance_template_group = `<table>  <tr>
                <th> ${cleanString(key)}` 
                if(total_cost > 0) maintenance_template_group+=`- £${total_cost.toFixed(2)}` 
                maintenance_template_group+=`</th>
                <th>Defects</th>
                <th>Liability</th>
            </tr> ${table_row_maintaince} </table>`;
        maintenance_template += maintenance_template_group;
      }
      if (flag > 0) {
        hydrate_template = hydrate_template.replace(
          "MAINTENANCE_SECTION",
          `<div class="page" style="page-break-before: always">
                <div class="container maintenance page-width" >
                    <h1>Maintenance Overview</h1> 
                    
                    MAINTENANCE_DESCRIPTIONS
            
                </div>
            </div>`
        );
        hydrate_template = hydrate_template.replace(
          "MAINTENANCE_DESCRIPTIONS",
          maintenance_template
        );
      } else
        hydrate_template = hydrate_template.replace("MAINTENANCE_SECTION", "");
      // html_template_list.push(hydrate_template);
      console.log("6-maintenance.html", Date.now() - start_time);
    } else if (i == 7) {
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      // let hydrate_template=template;
      const meters = report_responses.filter(
        (report_response) => report_response.entity_type == "meters"
      );
      let meters_str = "";
      let meters_comment_str = "";
      let meter_photos = "";
      meters.forEach((meter) => {
        let meter_template = `<tr>
                <td> METER <br/>`;
        if (meter.metadata?.photos?.length > 0) {
          meter_template += `<a href=${gallery_url} target = "_blank" > (${meter.metadata?.photos?.length} photo`;
          if (meter.metadata?.photos?.length > 1) meter_template += `s`;
          meter_template += `)</a>`;
        }
        // else{
        //     meter_template+=`&nbsp;`
        // }
        meter_template += `</td><td> LOCATION </td>
                <td> SERIAL </td>
                <td> IN_READING
                     ( DATE )
                </td>
                <td> OUT_READING
                    ( CHECK_DATE )
                    </td>
            </tr>`;
            let meter_in= meter.metadata?.meter_reading_in;
            if(meter_in) meter_in = meter_in + " <br>";
            let meter_out= meter.metadata?.meter_reading_out;
            if(meter_out) meter_out = meter_out + " <br>";
        meter_template = meter_template
          .replace("METER", cleanString(meter.item_type))
          .replace("LOCATION", meter.metadata?.location)
          .replace("SERIAL", meter.metadata?.serial_no)
          .replace("IN_READING", meter_in)
          .replace("OUT_READING", meter_out)
          .replace(
            "DATE",
            moment(meter.metadata?.check_in_date, "YYYY-MM-DD").format(
              "DD-MM-YYYY"
            )
          )
          .replace(
            "CHECK_DATE",
            moment(meter.metadata?.check_out_date, "YYYY-MM-DD").format(
              "DD-MM-YYYY"
            )
          );
        meters_str += meter_template;
        if (meter.metadata?.notes && meter.metadata?.notes != "")
          meters_comment_str +=
            "<p>" + meter.item_type + " - " + meter.metadata?.notes + "</p>";
        meter.metadata?.photos?.forEach((link) => {
          let photo_ref = `<a href=${gallery_url} target="_blank" >
            <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain;">
            </figure></a>`;
          meter_photos += photo_ref;
        });
      });
      if (meters.length > 0) {
        let photos_section = "";
        if (meter_photos!=""){
          photos_section=`<div class="container page-width">
          <h3>Photos</h3>
          <div class="section">
              <div class="list-of-images">
                  METER_PHOTOS
              </div>
          </div>
      </div>`
        }
        hydrate_template = hydrate_template.replace(
          "METERS_SECTION",
          `<div class="page" style="page-break-before: always">
                <div class="container meters page-width" >
                    <h1>Meters</h1>
                    <table>
                        <tr>
                            <th>Type</th>
                            <th>Location</th>
                            <th>Serial No.</th>
                            <th>Check In Reading</th>
                            <th>Check Out Reading</th>
                        </tr>
                        METER_DESCRIPTIONS
                    </table>
                </div>
            
                <div class="container page-width">
                    <div class="inspectornotes">
                    <h3>Inspector Notes</h3>
                    <div class="section">
                        <div class="text">
                            <p> COMMENTS </p>
                        </div>
                    </div>
                </div>
                </div>
            
                ${photos_section}
                
            </div>`
        );
        hydrate_template = hydrate_template
          .replace("COMMENTS", meters_comment_str)
          .replace("METER_DESCRIPTIONS", meters_str)
          .replace("METER_PHOTOS", meter_photos);
        // .replace('${CSS_URL}',css_url)
        console.log("7-meters.html", Date.now() - start_time);
      } else {
        hydrate_template = hydrate_template.replace("METERS_SECTION", "");
      }
      // html_template_list.push(hydrate_template)
    } else if (i == 8) {
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      // let hydrate_template=template
      const compliance = report_responses.filter(
        (report_response) =>
          report_response.entity_type == "rooms_and_areas" &&
          report_response.metadata?.fire_alarm_compliance == true
      );
      let complaince_str = "";
      compliance.forEach((compliance) => {
        let compliance_template = `<tr>
                <td> ROOM_NAME </td>
                <td> ITEM_NAME <br/>`;
        if (compliance.metadata?.photos?.length > 0) {
          compliance_template += `<a href=${gallery_url} target = "_blank"> (${compliance.metadata?.photos?.length}  photo`;
          if (compliance.metadata?.photos?.length > 1)
            compliance_template += `s`;
          compliance_template += `)</a>`;
        }
        // else{
        //     compliance_template+=`&nbsp;`
        // }
        compliance_template += `</td>
                <td> BODY </td>
                <td> TESTED_DATE </td>
                <td> EXPIRY_DATE </td>
            </tr>`;
        let room_name_str = cleanString(compliance?.display_name);
        room_name_str = room_name_str.replace(/_/g, " ");
        let item_type_str = cleanString(compliance?.item_type);
        item_type_str = item_type_str.replace(/_/g, " ");
        compliance_template = compliance_template
          .replace("ITEM_NAME", item_type_str)
          .replace("ROOM_NAME", room_name_str)
          .replace(
            "BODY",
            compliance.metadata?.description.length > 0
              ? compliance.metadata?.description.join(". ") +" "+compliance.metadata?.body
              : " " + compliance.metadata?.body
          )
          .replace(
            "TESTED_DATE",
            compliance.metadata?.date_tested
              ? moment(compliance.metadata?.date_tested, "YYYY-MM-DD").format(
                  "DD-MM-YYYY"
                )
              : ""
          )
          .replace(
            "EXPIRY_DATE",
            compliance.metadata?.expiry_date
              ? moment(compliance.metadata?.expiry_date, "YYYY-MM-DD").format(
                  "DD-MM-YYYY"
                )
              : ""
          );
        complaince_str += compliance_template;
      });
      let h_s_compliance = report_responses.filter(
        (report_response) => report_response.entity_type == "h_s_compliance"
      );
      h_s_compliance = h_s_compliance[0];
      let question_response = "";
      h_s_compliance?.metadata?.response.forEach((h_s) => {
        const response = h_s.answer;
        const question = h_s.question?.split("_")[0];
        let style_class = "response-yes";
        if (response == "No") {
          style_class = "response-no";
        } else if (response == "N/A") {
          style_class = "response-na";
        }
        const question_template = `<tr>
                <td> QUESTION </td>
                <td class="${style_class}"> RESPONSE </td>
            </tr>`;
        question_response += question_template
          .replace("QUESTION", question)
          .replace("RESPONSE", response);
      });
      if (compliance.length > 0) {
        let photos_section = "";
        if(h_s_compliance?.metadata?.images?.length > 0){
          photos_section=`<div class="container page-width">
          <h3>Photos</h3>
          <div class="section">
              <div class="list-of-images">
                  COMPLIANCE_PHOTOS
              </div>
          </div>
      </div>`
        }
        hydrate_template = hydrate_template.replace(
          "COMPLIANCE_SECTION",
          `<div class="page" style="page-break-before: always">
            <div class="container page-width">
                <h1>H&S Compliance</h1>
                <table>
                    <tr>
                        <th>Question</th>
                        <th style="width:10%;">Response</th>
                    </tr>
                    QUESTION_RESPONSES
                </table>
            </div>
        
            <div class="container page-width">
                <div class="inspectornotes">
                <h3>Inspector Notes</h3>
                <div class="section">
                    <div class="text">
                        <p> COMMENTS </p>
                    </div>
                </div>
            </div>

          ${photos_section}
            
            </div>
        
            <div class="container meters page-width" >
                <h1>Alarm Summary </h1>
                <table>
                    <tr>
                        <th style="width:10%;">Room</th>
                        <th style="width:15%;">Item</th>
                        <th style="width:unset;">Description</th>
                        <th style="width:10%;">Date Tested</th>
                        <th style="width:10%;">Expiry Date</th>
                    </tr>
                    COMPLIANCE_DESCRIPTIONS
                   
                </table>
            </div>
        
         
        
    </div>`
        );
        let compliance_photos = "";
        h_s_compliance?.metadata?.images?.forEach((link) => {
          let photo_ref = `<a href=${gallery_url} target="_blank" >
          <figure style="background: #f0f0f0 url('${link}') no-repeat center center; background-size: contain;">
          </figure></a>`;
          compliance_photos += photo_ref;
        });
        hydrate_template = hydrate_template
          .replace("QUESTION_RESPONSES", question_response)
          .replace("COMPLIANCE_DESCRIPTIONS", complaince_str)
          .replace("COMMENTS", h_s_compliance?.metadata?.comment)
          .replace("COMPLIANCE_PHOTOS", compliance_photos);
        // .replace('${CSS_URL}',css_url)
        // html_template_list.push(hydrate_template);
        console.log("8-compliance.html", Date.now() - start_time);
      } else {
        hydrate_template = hydrate_template.replace("COMPLIANCE_SECTION", "");
      }
      // await page.setContent(hydrate_template);
    } else if (i == 9) {
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      const utilities = report_responses.filter(
        (report_response) => report_response.entity_type == "utilities"
      );
      let utilities_str = "";
      let utility_photos = "";
      let utility_comment_str = "";
      utilities.forEach((utility) => {
        let utility_template = `<tr>
                <td> UTILITY_NAME <br/>`;
        if (utility.metadata?.photos?.length > 0) {
          utility_template += `<a href=${gallery_url} target = "_blank" > ( NUM photo`;
          if (utility.metadata?.photos?.length > 1) utility_template += `s`;
          utility_template += `)</a>`;
        }
        // else{
        //     utility_template+=`&nbsp;`
        // }
        utility_template += `</td>  <td> LOCATION </td> </tr>`;
        utility_template = utility_template
          .replace("NUM", utility.metadata?.photos?.length)
          .replace("UTILITY_NAME", cleanString(utility.item_type))
          .replace("LOCATION", utility.metadata?.location);
        utilities_str += utility_template;
        utility.metadata?.photos?.forEach((link) => {
          let photo_ref = `<a href=${gallery_url} target="_blank" > <figure style="background: #f0f0f0 url(${link}) no-repeat center center; background-size: contain;"></figure></a>`;
          utility_photos += photo_ref;
        });
        if (utility.metadata?.notes && utility.metadata?.notes != "")
          utility_comment_str +=
            "<p>" +
            cleanString(utility.item_type) +
            " - " +
            utility.metadata?.notes +
            "</p>";
      });
      if (utilities.length > 0) {
        let utility_photos_section = "";
        if(utility_photos!=""){
          utility_photos_section=`<div class="container page-width">
                <h3>Photos</h3>
                <div class="section">
                    <div class="list-of-images">
                        UTILITY_PHOTOS
                    </div>
                </div>
            </div>`
        }
        hydrate_template = hydrate_template.replace(
          "UTILITIES_SECTION",
          `<div class="page" style="page-break-before: always">
            <div class="container utilities page-width">
                <h1>Utilities</h1>
                <table>
                    <tr>
                        <th>Type</th>
                        <th>Location</th>
                    </tr>
                    UTILITY_DESCRIPTIONS
                  
                </table>
            </div>
            <div class="container page-width">
                <div class="inspectornotes">
                <h3>Inspector Notes</h3>
                <div class="section">
                    <div class="text">
                        <p> COMMENTS </p>
                    </div>
                </div>
                </div>
            </div>
            ${utility_photos_section}
            </div>`
        );
        hydrate_template = hydrate_template
          .replace("PROPERTY_ADDRESS", property.address)
          .replace("UTILITY_DESCRIPTIONS", utilities_str)
          .replace("COMMENTS", utility_comment_str)
          .replace("UTILITY_PHOTOS", utility_photos);
        // html_template_list.push(hydrate_template);
        console.log("9-utilities.html", Date.now() - start_time);
      } else {
        hydrate_template = hydrate_template.replace("UTILITIES_SECTION", "");
      }
    } else if (i == 10) {
      let rooms_and_areas = report_responses.filter(
        (report_response) => report_response.entity_type == "rooms_and_areas"
      );
      rooms_and_areas.sort((a, b) => a.room_rank - b.room_rank);
      let rooms_and_areas_grouped_by_name = {};
      for (let room of rooms_and_areas) {
        if (rooms_and_areas_grouped_by_name[room.display_name]) {
          rooms_and_areas_grouped_by_name[room.display_name].push(room);
        } else {
          rooms_and_areas_grouped_by_name[room.display_name] = [room];
        }
      }
      Object.keys(rooms_and_areas_grouped_by_name).forEach((key) => {
        rooms_and_areas_grouped_by_name[key].sort(
          (a, b) => Number(a.item_rank) - Number(b.item_rank)
        );
      });
      let rooms_array_1 = rooms_and_areas.filter(
        (room) => room.class_type == "general_overview"
      );
      console.log("rooms_array before sorting", rooms_array_1);
      rooms_array_1.sort((a, b) => Number(a.room_rank) - Number(b.room_rank));
      // only keep display_name from rooms_array
      let rooms_array = rooms_array_1.map((room) => room.display_name);
      // sort rooms array in ascending order or room_rank
      console.log("room_array after sorting", rooms_array);
      let index = 0;
      let actual_temp = "";
      for (let key of rooms_array) {
        index++;

        let photos_360 = "";
        let single_photos = "";
        let rooms_and_areas_group = rooms_and_areas_grouped_by_name[key];
        let pic_index = 0;
        let pic_360_index = 0;
        let decor_count = 0;
        let fixtures_count = 0;
        let furnishings_count = 0;
        let decor = "";
        let fixtures = "";
        let furnishings = "";
        for (let inx = 0; inx < rooms_and_areas_group.length; inx++) {
          let room = rooms_and_areas_group[inx];
          if (room.metadata?.photos_360?.length > 0) {
            room.metadata?.photos_360?.forEach((link) => {
              pic_index++;
              pic_360_index++;
              let img_template = `<a href=${gallery_url} target="_blank">
                            <figure style="background: #f0f0f0 url(${link}) no-repeat center center; background-size: contain;">
                            <figcaption>${index}.5.${pic_index} - ${cleanString(
                room?.item_type
              )}  </figcaption>
                            </figure></a>`;
              photos_360 += img_template;
            });
          }
          if (room.metadata?.photos?.length > 0) {
            room.metadata?.photos?.forEach((link) => {
              pic_index++;
              let img_template = `<a href=${gallery_url} target="_blank" >
                            <figure style="background: #f0f0f0 url(${link}) no-repeat center center; background-size: contain;">
                            <figcaption>${index}.5.${pic_index} - ${cleanString(
                room?.item_type
              )}  </figcaption>
                            </figure></a>`;
              single_photos += img_template;
            });
          }
          if (room.metadata?.feedbackImg) {
            pic_index++;
            let img = room.metadata.feedbackImg;
            let img_template = `<a href=${gallery_url} target="_blank" >
                                <figure style="background: #f0f0f0 url(${img}) no-repeat center center; background-size: contain;">
                                <figcaption style="color : red">${index}.5.${pic_index} - ${cleanString(room?.item_type)} - Feedback</figcaption>
                                </figure></a>`;
            single_photos += img_template;
          }
          if (report.report_type == "Inventory Report" && tenancy.type == "HMO") {
            if (room.metadata.hmo_feedback) {
              for (let feedback of room.metadata.hmo_feedback) {
                if (feedback.tenant_id === req.query.tenant_id) {
                  if (feedback.feedbackImg) {
                    pic_index++;
                    let img = feedback.feedbackImg;
                    let img_template = `<a href=${gallery_url} target="_blank" >
                                      <figure style="background: #f0f0f0 url(${img}) no-repeat center center; background-size: contain;">
                                      <figcaption style="color : red">${index}.5.${pic_index} - ${cleanString(room?.item_type)} - Feedback</figcaption>
                                      </figure></a>`;
                    single_photos += img_template;
                  }
                }
              }
            }
          }
          if (report.report_type == "Checkout Report" && room.linked_inventory_report!=null) {
            let temp = room.metadata?.old_description;
            room.metadata.old_description = room.metadata?.description;
            room.metadata.description = temp;
            temp = room.metadata?.old_body;
            room.metadata.old_body = room.metadata?.body;
            room.metadata.body = temp;
            temp = room.metadata?.old_condition;
            room.metadata.old_condition = room.metadata?.condition;
            room.metadata.condition = temp;
            temp = room.metadata?.old_cleanliness;
            room.metadata.old_cleanliness = room.metadata?.cleanliness;
            room.metadata.cleanliness = temp;
          }
          if (room.class_type == "decor") {
            // make room.item_type first letter capital
            // room.item_type=
            decor_count++;
            let condition = room.metadata?.condition;
            let old_condition = room.metadata?.old_condition;
            let cleanliness = room.metadata?.cleanliness;
            let old_cleanliness = room.metadata?.old_cleanliness;
            condition = condition.toLowerCase();
            cleanliness = cleanliness.toLowerCase();
            old_condition = old_condition?.toLowerCase();
            old_cleanliness = old_cleanliness?.toLowerCase();
            let decor_template = `<tr> <td rowspan="2"><b>${index}.2.${decor_count} ${cleanString(
              room?.item_type
            )} </b><br/>`;
            if (room?.metadata?.photos?.length > 0) {
              decor_template += `<a href=${gallery_url}>(${room?.metadata?.photos?.length} photo`;
              if (room?.metadata?.photos?.length > 1) decor_template += `s`;
              decor_template += `)</a>`;
            }
            let tenant_feedback = room.metadata?.feedback;
            let inspector_feedback = room.metadata?.inspector_feedback;
            let inspector_img = room.metadata?.feedbackImg;
            if (room.metadata?.hmo_feedback?.length > 0) {
              // filter by metadata.tenant_id and get the feedback
              let tenant_id = req.query.tenant_id || req.query.id;
              let tenant_feedback_obj = room.metadata?.hmo_feedback.filter(
                (feedback) => feedback.tenant_id == tenant_id
              );
              if (tenant_feedback_obj.length > 0) {
                tenant_feedback = tenant_feedback_obj[0].feedback;
                inspector_img = tenant_feedback_obj[0].feedbackImg;
              }
              if (room.metadata?.hmo_inspector_feedback?.length > 0) {
                let inspector_feedback_obj =
                  room.metadata?.hmo_inspector_feedback.filter(
                    (feedback) => feedback.tenant_id == tenant_id
                  );
                if (inspector_feedback_obj.length > 0) {
                  inspector_feedback = inspector_feedback_obj[0].feedback;
                }
              }
            }
            if (req.query.type == "tenant") {
              tenant_feedback = "";
              inspector_feedback = "";
            }
            if (req.query.original && req.query.original == "true") {
              (inspector_feedback = ""), (tenant_feedback = "");
            }
            decor_template += `</td>
                        <td rowspan="2"> ${
                          room.metadata?.description?.length > 0
                            ? room.metadata?.description.join(". ") +
                              " " +
                              room.metadata?.body
                            : room.metadata?.body
                        } 
                        ${
                          tenant_feedback
                            ? '<span style="color:red;"> Tenant Comments - ' +
                              tenant_feedback +
                              "</span>"
                            : ""
                        }
                        ${
                          inspector_feedback
                            ? '<span style="color:blue;"> Inspector Comments - ' +
                              inspector_feedback +
                              "</span>"
                            : ""
                        } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${condition} pad4r">${
              room?.metadata?.condition
            }</td>`;
            if (report.report_type == "Checkout Report") {
              decor_template += `<td rowspan="2"> ${
                room.metadata?.old_description.length > 0
                  ? room.metadata?.old_description.join(". ") +
                    " " +
                    room.metadata?.old_body
                  : room.metadata?.old_body
              } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${old_condition} pad4r">${
                room?.metadata?.old_condition
              }</td>`;
            }
            decor_template += `</tr><tr><td class="pad4"><strong>Cleanliness</strong></td>
                        <td class="${cleanliness} pad4r">${room?.metadata?.cleanliness}</td>`;
            if (report.report_type == "Checkout Report") {
              decor_template += `<td class="pad4"><strong>Cleanliness</strong></td>
                            <td class="${old_cleanliness} pad4r">${room?.metadata?.old_cleanliness}</td>`;
            }
            decor_template += `</tr>`;
            let maintenance_tag = "";
            room?.metadata?.maintenance_issue?.forEach((issue) => {
              maintenance_tag += `<span class="mr10">${issue} </span>`;
            });
            if (room?.metadata?.maintenance == true) {
              decor_template += `<tr class="maintenance-issue">
                        <td style="width: unset"><span> ${room?.metadata?.liability[0]} liability</span></td>`;
              if (report.report_type == "Checkout Report")
                decor_template += `<td style="width: unset" colspan="7"> ${maintenance_tag} </td>`;
              else
                decor_template += `<td style="width: unset" colspan="3"> ${maintenance_tag} </td>`;
              decor_template += `</tr>`;
            }
            if (req.query.input_box == "true") {
              if (report.report_type == "Checkout Report")
                decor_template += `<td colspan="7"">`;
              else decor_template += `<td colspan="4"">`;
              decor_template += `
                        <button class="item-button" style="cursor: pointer;"  onClick="(function(){
                            document.getElementById('${room._id}').disabled = false;
                            document.getElementById('${room._id}').focus();
                            event.srcElement.style.backgroundColor = '#0010f7';
                            return false;
                        })();return false;">Leave comment?</button><input class="item-comment" disabled id="${room._id}" type="text" placeholder="Please add your feedback here"/>`;
              if (req.query.type == "tenant") {
                decor_template += `
                        <div style="display:flex; margin:10px 0px; gap: 8px; align-items: center;">
                        <input style="display:none;" id="input${room._id}" type="file" onchange="(async function(){
                            const file = document.getElementById('input${room._id}').files[0];
                            const formData = new FormData();
                            formData.append('photo', file);
                            let options = {
                                method: 'POST',
                                headers: {
                                    'x-api-key' : '1234567891'
                                },
                                body: formData
                            }
                            const res = await fetch('https://ivy.studiorav.co.uk/api/console/account/image_upload', options)
                            const data = await res.json()
                            const secure_url = data.data.secure_url
                            document.getElementById('img${room._id}').style = 'width: 100px; height: 100px; display: flex;';
                            document.getElementById('img${room._id}').src = secure_url;
                            return false;
                        })();return false;"/>
                        <button style="background-color: #0010f7; color: white; border-radius: 0.375rem; font-size: 14px; font-weight: 700; height: 40px; padding: 0.5rem 1rem; border: none; cursor: pointer;"onclick="(function(){
                            document.getElementById('input${room._id}').click();
                        })()">Upload Image</button>
                        <button style="background-color: rgb(255, 69, 94); color: white; border-radius: 0.375rem; font-size: 14px; font-weight: 700; height: 40px; padding: 0.5rem 1rem; border: none; cursor: pointer;" onclick="(function(){
                            document.getElementById('img${room._id}').src = '';
                            document.getElementById('img${room._id}').style = 'display: none;';
                        })()">Delete Image</button>
                        <img id="img${room._id}" class="feedback-image"/></div>
                        </td>`;
              } else if (req.query.type == "inspector") {
                decor_template += `<div style="display:flex; margin:10px 0px; gap: 8px; align-items: center;">
                            <img src="${inspector_img}" style="height: 100px; width: 100px;"/>
                            </div>`;
              }
            }
            decor += decor_template;
          } else if (room.class_type == "fixtures") {
            fixtures_count++;
            let condition = room.metadata?.condition;
            let old_condition = room.metadata?.old_condition;
            let cleanliness = room.metadata?.cleanliness;
            let old_cleanliness = room.metadata?.old_cleanliness;
            condition = condition.toLowerCase();
            cleanliness = cleanliness.toLowerCase();
            old_condition = old_condition?.toLowerCase();
            old_cleanliness = old_cleanliness?.toLowerCase();
            let fixtures_template = `<tr> <td rowspan="2"><b>${index}.3.${fixtures_count} ${cleanString(
              room?.item_type
            )}  </b><br/>`;
            if (room?.metadata?.photos?.length > 0) {
              fixtures_template += `<a href=${gallery_url}>(${room?.metadata?.photos?.length} photo`;
              if (room?.metadata?.photos?.length > 1) fixtures_template += `s`;
              fixtures_template += `)</a>`;
            }
            let tenant_feedback = room.metadata?.feedback;
            let inspector_feedback = room.metadata?.inspector_feedback;
            let inspector_img = room.metadata?.feedbackImg;
            if (room.metadata?.hmo_feedback?.length > 0) {
              // filter by metadata.tenant_id and get the feedback
              let tenant_id = req.query.tenant_id || req.query.id;
              let tenant_feedback_obj = room.metadata?.hmo_feedback.filter(
                (feedback) => feedback.tenant_id == tenant_id
              );
              if (tenant_feedback_obj.length > 0) {
                tenant_feedback = tenant_feedback_obj[0].feedback;
                inspector_img = tenant_feedback_obj[0].feedbackImg;
              }
              if (room.metadata?.hmo_inspector_feedback?.length > 0) {
                let inspector_feedback_obj =
                  room.metadata?.hmo_inspector_feedback.filter(
                    (feedback) => feedback.tenant_id == tenant_id
                  );
                if (inspector_feedback_obj.length > 0) {
                  inspector_feedback = inspector_feedback_obj[0].feedback;
                }
              }
            }
            if (req.query.type == "tenant") {
              tenant_feedback = "";
              inspector_feedback = "";
            }
            if (req.query.original && req.query.original == "true") {
              (inspector_feedback = ""), (tenant_feedback = "");
            }
            fixtures_template += `</td>
                        <td rowspan="2"> ${
                          room.metadata?.description?.length > 0
                            ? room.metadata?.description.join(". ") +
                              " " +
                              room.metadata?.body
                            : room.metadata?.body
                        }  
                        ${
                          tenant_feedback
                            ? '<span style="color:red;"> Tenant Comments - ' +
                              tenant_feedback +
                              "</span>"
                            : ""
                        }
                        ${
                          inspector_feedback
                            ? '<span style="color:blue;"> Inspector Comments - ' +
                              inspector_feedback +
                              "</span>"
                            : ""
                        } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${condition} pad4r">${
              room?.metadata?.condition
            }</td>`;
            // fixtures_template+=`</tr><tr>
            // <td class="pad4"><strong>Cleanliness</strong></td>
            // <td class="${cleanliness} pad4">${room?.metadata?.cleanliness}</td>
            // </tr>`
            if (report.report_type == "Checkout Report") {
              fixtures_template += `<td rowspan="2"> ${
                room.metadata?.old_description.length > 0
                  ? room.metadata?.old_description.join(". ") +
                    " " +
                    room.metadata?.old_body
                  : room.metadata?.old_body
              } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${old_condition} pad4r">${
                room?.metadata?.old_condition
              }</td>`;
            }
            fixtures_template += `</tr><tr><td class="pad4"><strong>Cleanliness</strong></td>
                        <td class="${cleanliness} pad4r">${room?.metadata?.cleanliness}</td>`;
            if (report.report_type == "Checkout Report") {
              fixtures_template += `<td class="pad4"><strong>Cleanliness</strong></td>
                            <td class="${old_cleanliness} pad4r">${room?.metadata?.old_cleanliness}</td>`;
            }
            fixtures_template += `</tr>`;
            let maintenance_tag = "";
            room?.metadata?.maintenance_issue?.forEach((issue) => {
              maintenance_tag += `<span class="mr10">${issue} </span>`;
            });
            if (room?.metadata?.maintenance == true) {
              fixtures_template += `<tr class="maintenance-issue">
                        <td style="width: unset"><span> ${room?.metadata?.liability[0]} liability</span></td>`;
              if (report.report_type == "Checkout Report")
                fixtures_template += `<td style="width: unset" colspan="7"> ${maintenance_tag} </td>`;
              else
                fixtures_template += `<td style="width: unset" colspan="3"> ${maintenance_tag} </td>`;
              fixtures_template += `</tr>`;
            }
            if (req.query.input_box == "true") {
              if (report.report_type == "Checkout Report")
                fixtures_template += `<td colspan="7"">`;
              else fixtures_template += `<td colspan="4"">`;
              fixtures_template += `
                        <button class="item-button" style="cursor: pointer;"  onClick="(function(){
                            document.getElementById('${room._id}').disabled = false;
                            document.getElementById('${room._id}').focus();
                            event.srcElement.style.backgroundColor = '#0010f7';
                            return false;
                        })();return false;">Leave comment?</button><input class="item-comment" disabled id="${room._id}" type="text" placeholder="Please add your feedback here"/>`;
              if (req.query.type == "tenant") {
                fixtures_template += `
                        <div style="display:flex; margin:10px 0px; gap: 8px; align-items: center;">
                        <input style="display:none;" id="input${room._id}" type="file" onchange="(async function(){
                            const file = document.getElementById('input${room._id}').files[0];
                            const formData = new FormData();
                            formData.append('photo', file);
                            let options = {
                                method: 'POST',
                                headers: {
                                    'x-api-key' : '1234567891'
                                },
                                body: formData
                            }
                            const res = await fetch('https://ivy.studiorav.co.uk/api/console/account/image_upload', options)
                            const data = await res.json()
                            const secure_url = data.data.secure_url
                            document.getElementById('img${room._id}').style = 'width: 100px; height: 100px; display: flex;';
                            document.getElementById('img${room._id}').src = secure_url;
                            return false;
                        })();return false;"/>
                        <button style="background-color: #0010f7; color: white; border-radius: 0.375rem; font-size: 14px; font-weight: 700; height: 40px; padding: 0.5rem 1rem; border: none; cursor: pointer;"onclick="(function(){
                            document.getElementById('input${room._id}').click();
                        })()">Upload Image</button>
                        <button style="background-color: rgb(255, 69, 94); color: white; border-radius: 0.375rem; font-size: 14px; font-weight: 700; height: 40px; padding: 0.5rem 1rem; border: none; cursor: pointer;" onclick="(function(){
                            document.getElementById('img${room._id}').src = '';
                            document.getElementById('img${room._id}').style = 'display: none;';
                        })()">Delete Image</button>
                        <img id="img${room._id}" class="feedback-image"/></div>
                        </td>`;
              } else if (req.query.type == "inspector") {
                fixtures_template += `<div style="display:flex; margin:10px 0px; gap: 8px; align-items: center;">
                            <img src="${inspector_img}" style="height: 100px; width: 100px;"/>
                            </div>`;
              }
            }
            fixtures += fixtures_template;
          } else if (room.class_type == "furnishings & effects") {
            furnishings_count++;
            let condition = room.metadata?.condition;
            let old_condition = room.metadata?.old_condition;
            let cleanliness = room.metadata?.cleanliness;
            let old_cleanliness = room.metadata?.old_cleanliness;
            condition = condition.toLowerCase();
            cleanliness = cleanliness.toLowerCase();
            old_condition = old_condition?.toLowerCase();
            old_cleanliness = old_cleanliness?.toLowerCase();
            let furnishings_template = `<tr> <td rowspan="2"><b>${index}.4.${furnishings_count} ${cleanString(
              room?.item_type
            )}  </b><br/>`;
            if (room?.metadata?.photos?.length > 0) {
              furnishings_template += `<a href=${gallery_url}>(${room?.metadata?.photos?.length} photo`;
              if (room?.metadata?.photos?.length > 1)
                furnishings_template += `s`;

              furnishings_template += `)</a>`;
            }
            let tenant_feedback = room.metadata?.feedback;
            let inspector_feedback = room.metadata?.inspector_feedback;
            let inspector_img = room.metadata?.feedbackImg;
            if (req.query.original && req.query.original == "true") {
              (inspector_feedback = ""), (tenant_feedback = "");
            }
            if (room.metadata?.hmo_feedback?.length > 0) {
              // filter by metadata.tenant_id and get the feedback
              let tenant_id = req.query.tenant_id || req.query.id;
              let tenant_feedback_obj = room.metadata?.hmo_feedback.filter(
                (feedback) => feedback.tenant_id == tenant_id
              );
              if (tenant_feedback_obj.length > 0) {
                tenant_feedback = tenant_feedback_obj[0].feedback;
                inspector_img = tenant_feedback_obj[0].feedbackImg;
              }
              if (room.metadata?.hmo_inspector_feedback?.length > 0) {
                let inspector_feedback_obj =
                  room.metadata?.hmo_inspector_feedback.filter(
                    (feedback) => feedback.tenant_id == tenant_id
                  );
                if (inspector_feedback_obj.length > 0) {
                  inspector_feedback = inspector_feedback_obj[0].feedback;
                }
              }
            }
            if (req.query.type == "tenant") {
              tenant_feedback = "";
              inspector_feedback = "";
            }
            if (req.query.original && req.query.original == "true") {
              (inspector_feedback = ""), (tenant_feedback = "");
            }
            furnishings_template += `</td>
                        <td rowspan="2"> ${
                          room.metadata?.description.length > 0
                            ? room.metadata?.description.join(". ") +
                              " " +
                              room.metadata?.body
                            : room.metadata?.body
                        } 
                        ${
                          tenant_feedback
                            ? '<span style="color:red;"> Tenant Comments - ' +
                              tenant_feedback +
                              "</span>"
                            : ""
                        }
                        ${
                          inspector_feedback
                            ? '<span style="color:blue;"> Inspector Comments - ' +
                              inspector_feedback +
                              "</span>"
                            : ""
                        } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${condition} pad4r">${
              room?.metadata?.condition
            }</td>`;
            // furnishings_template+=`</tr><tr>
            // <td class="pad4"><strong>Cleanliness</strong></td>
            // <td class="${cleanliness} pad4">${room?.metadata?.cleanliness}</td>
            // </tr>`
            if (report.report_type == "Checkout Report") {
              furnishings_template += `<td rowspan="2"> ${
                room.metadata?.old_description.length > 0
                  ? room.metadata?.old_description.join(". ") +
                    " " +
                    room.metadata?.old_body
                  : room.metadata?.old_body
              } </td>
                        <td class="pad4"><strong>Condition</strong></td>
                        <td class="${old_condition} pad4r">${
                room?.metadata?.old_condition
              }</td>`;
            }
            furnishings_template += `</tr><tr><td class="pad4"><strong>Cleanliness</strong></td>
                        <td class="${cleanliness} pad4r">${room?.metadata?.cleanliness}</td>`;
            if (report.report_type == "Checkout Report") {
              furnishings_template += `<td class="pad4"><strong>Cleanliness</strong></td>
                            <td class="${old_cleanliness} pad4r">${room?.metadata?.old_cleanliness}</td>`;
            }
            furnishings_template += `</tr>`;
            let maintenance_tag = "";
            room?.metadata?.maintenance_issue.forEach((issue) => {
              maintenance_tag += `<span class="mr10">${issue} </span>`;
            });
            if (room?.metadata?.maintenance == true) {
              furnishings_template += `<tr class="maintenance-issue">
                        <td style="width: unset"><span> ${room?.metadata?.liability[0]} liability</span></td>`;
              if (report.report_type == "Checkout Report")
                furnishings_template += `<td style="width: unset" colspan="7"> ${maintenance_tag} </td>`;
              else
                furnishings_template += `<td style="width: unset" colspan="3"> ${maintenance_tag} </td>`;
              furnishings_template += `</tr>`;
            }
            if (req.query.input_box == "true") {
              if (report.report_type == "Checkout Report")
                furnishings_template += `<td colspan="7"">`;
              else furnishings_template += `<td colspan="4"">`;
              furnishings_template += `
                        <button class="item-button" style="cursor: pointer;"  onClick="(function(){
                            document.getElementById('${room._id}').disabled = false;
                            document.getElementById('${room._id}').focus();
                            event.srcElement.style.backgroundColor = '#0010f7';
                            return false;
                        })();return false;">Leave comment?</button><input class="item-comment" disabled id="${room._id}" type="text" placeholder="Please add your feedback here"/>`;
              if (req.query.type == "tenant") {
                furnishings_template += `
                        <div style="display:flex; margin:10px 0px; gap: 8px; align-items: center;">
                        <input style="display:none;" id="input${room._id}" type="file" onchange="(async function(){
                            const file = document.getElementById('input${room._id}').files[0];
                            const formData = new FormData();
                            formData.append('photo', file);
                            let options = {
                                method: 'POST',
                                headers: {
                                    'x-api-key' : '1234567891'
                                },
                                body: formData
                            }
                            const res = await fetch('https://ivy.studiorav.co.uk/api/console/account/image_upload', options)
                            const data = await res.json()
                            const secure_url = data.data.secure_url
                            document.getElementById('img${room._id}').style = 'width: 100px; height: 100px; display: flex;';
                            document.getElementById('img${room._id}').src = secure_url;
                            return false;
                        })();return false;"/>
                        <button style="background-color: #0010f7; color: white; border-radius: 0.375rem; font-size: 14px; font-weight: 700; height: 40px; padding: 0.5rem 1rem; border: none; cursor: pointer;"onclick="(function(){
                            document.getElementById('input${room._id}').click();
                        })()">Upload Image</button>
                        <button style="background-color: rgb(255, 69, 94); color: white; border-radius: 0.375rem; font-size: 14px; font-weight: 700; height: 40px; padding: 0.5rem 1rem; border: none; cursor: pointer;" onclick="(function(){
                            document.getElementById('img${room._id}').src = '';
                            document.getElementById('img${room._id}').style = 'display: none;';
                        })()">Delete Image</button>
                        <img id="img${room._id}" class="feedback-image"/></div>
                        </td>`;
              } else if (req.query.type == "inspector") {
                furnishings_template += `<div style="display:flex; margin:10px 0px; gap: 8px; align-items: center;">
                            <img src="${inspector_img}" style="height: 100px; width: 100px;"/>
                            </div>`;
              }
            }
            furnishings += furnishings_template;
          }
        }
        const general_overview = rooms_and_areas_group.filter(
          (room) => room.item_type == "general_overview"
        );

        let temp = `<div class="inner-page" style="page-break-before: always"><div class="container roompage page-width">
                <h1>${index}. ${cleanString(key)} </h1>
                <h3>${index}.1 Overview</h3>
                <table class="">
                    <tr>
                        <td class="overview"><b> ${index}.1.1 Overview </b> <br/>`;
        if (
          general_overview[0]?.metadata?.photos?.length +
            general_overview[0]?.metadata?.photos_360?.length >
          0
        ) {
          temp += `<a href=${gallery_url} target="_blank"> (${
            general_overview[0]?.metadata?.photos?.length +
            general_overview[0]?.metadata?.photos_360?.length
          } photo`;
          if (
            general_overview[0]?.metadata?.photos?.length +
              general_overview[0]?.metadata?.photos_360?.length >
            1
          )
            temp += `s`;
          temp += `)</a>`;
        }
        // else
        // temp+=`&nbsp;`
        temp += `</td>
                        <td style="width: unset !important"> ${
                          general_overview[0]?.metadata?.description?.length > 0
                            ? general_overview[0].metadata?.description.join(
                                ". "
                              ) + general_overview[0]?.metadata?.body
                            : general_overview[0]?.metadata?.body
                        } </td>
                    </tr>
                </table>
            </div>`;
        if (report.report_type != "Inspection Report") {
          if (decor_count > 0) {
            temp += `<div class="container roompage page-width`;
            if (report.report_type == "Checkout Report") temp += ` checkout`;
            temp += `">
                <h3>${index}.2 Decor</h3>
                <table>
                    ${decor}
                </table>
            </div>`;
          }
          if (fixtures_count > 0) {
            temp += `<div class="container roompage page-width`;
            if (report.report_type == "Checkout Report") temp += ` checkout`;
            temp += `">
                <h3>${index}.3 Fixtures</h3>
                <table>
                    ${fixtures}
                </table>
            </div>`;
          }
          if (furnishings_count > 0) {
            temp += `<div class="container roompage page-width`;
            if (report.report_type == "Checkout Report") temp += ` checkout`;
            temp += `">
                <h3>${index}.4 Furnishings</h3>
                <table>
                    ${furnishings}
                </table>
            </div>`;
          }
        } else if (decor_count > 0) {
          temp += `<div class="container roompage page-width" style="page-break-inside: avoid; page-break-before: auto;">
                <h3>${index}.2 Defects </h3>
                <table>
                    ${decor}
                    ${fixtures}
                    ${furnishings}
                </table>
            </div>`;
        }
        temp += `</div>`;
        if (pic_360_index + pic_index > 0) {
          temp += `<div class="photo-page" style="page-break-before: always">
            <div class="container page-width">`;
          if (pic_360_index + pic_index > 0)
            temp += `<h3>${index}.5 Photos</h3>`;
          if (pic_360_index > 0) {
            temp += `<strong style="margin-bottom: 10px;"></strong>
                <div class="list-of-images larger">
                    ${photos_360}
                </div>`;
          }

          temp += `<strong></strong>
                <div class="list-of-images">
                    ${single_photos}
                </div>
            </div>
            </div>`;
        }
        // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString()
        if (report.report_type == "Checkout Report")
          temp = `<div class="checkout"> ${temp} </div>`;
        actual_temp += temp;
      }

      hydrate_template = hydrate_template.replace(
        "ROOMS_AND_AREAS_DESCRIPTIONS",
        actual_temp
      );
      // .replace('${CSS_URL}',css_url)
      // html_template_list.push(hydrate_template);
      // html_rooms.push(hydrate_template);
      console.log("10-rooms.html", Date.now() - start_time);
    } else if (i == 11 && report.report_type == "Inventory Report") {
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      let signature_url;
      report_responses.forEach((room) => {
        if (room.entity_type == "signature") {
          signature_url = room.metadata?.signature;
        }
      });
      hydrate_template += `<div class="page" style="page-break-before: always">
            <div class="container page-width">
                <h1 class="heading-h1">Declaration</h1>
                <div class="content">
                   
                    <div class="section">
                        <div class="text">
                            <p> DECLARATION </p>
                        </div>
                    </div>
                </div>
            </div>
        
            <div class="container page-width">
                <table class="signatures">
                  <tr>
                      <td>Inspector Name: ASSIGNED_PERSON_NAME </br>
                      Date of Report: REPORT_DATE <br/>
                          <b>Signature</b>
                          <img src=" ${signature_url} " class="ivy-logo"/>`;
      let tenant_feedback = report_responses.filter(
        (report_response) => report_response.entity_type == "tenant_feedback"
      );
      let inspector_feedback = report_responses.filter(
        (report_response) => report_response.entity_type == "inspector_feedback"
      );
      if (tenancy?.type == "HMO") {
        inspector_feedback = inspector_feedback.filter(
          (feedback) =>
            feedback.item_type == (req.query.tenant_id || req.query.id)
        );
      }
      console.log("inspector", tenant_feedback);
      if (req.query.type == "inspector") {
        hydrate_template += `<div id="inspector-feedback">
                <b>Feedback Comments</b>
                <textarea placeholder="Please leave and final comments if you wish…" id="feedback-box"></textarea>
                <button class="item-button" id="feedback-button">I Accept</button>
                <small>By clicking this button you accept that all of the comments and feedback on this report are correct to the best of your knowledge and there is no further information to be added.</small>
              </div>`;
      }
      let inspector_feedback_str = inspector_feedback[0]?.metadata?.feedback;
      if (req.query.original && req.query.original == "true")
        inspector_feedback_str = "";
      hydrate_template += `<p style="color:blue;"> ${inspector_feedback_str}</p></td>
                          FIRST_TENANT_TABLE
                  </tr>
                  <tr>
                        SECOND_TENANT_TABLE
                  </tr>
                </table>
            </div>
        </div>`;
      hydrate_template = hydrate_template
        .replace("DECLARATION", declaration.entity_value[0])
        .replace("ASSIGNED_PERSON_NAME", report.assigned_person_id.name)
        .replace("REPORT_DATE", moment(report.date).format("DD-MM-YYYY"));
      let template_string = `<td>Tenant INDEX Name: NAME </br>
            Date of Signature:  DATE_SIGNATURE <br/>
            <b>Signature</b> <img src=" SIGN_URL " class="ivy-logo"/> COMMENTS`;
      let feedback_template = "";
      if (req.query.type == "tenant") {
        feedback_template += `<div id="tenant-feedback">
                <b>Feedback Comments</b>
                <textarea placeholder="Please add your overall comments in here." id="feedback-box" ></textarea>
                <button class="item-button" id="feedback-button" >I Accept</button>
                <small>By clicking this button you accept that all of the comments and feedback on this report are correct to the best of your knowledge and there is no further information to be added.</small>
              </div>`;
      }
      feedback_template += `<p style="color:red;"> FEEDBACK </p></td>`;
      // ${tenant_feedback[0]?.metadata?.feedback}
      let index = 0;
      let second_table_repl = "";
      let first_table_repl = "";

      const tenant_signature = report_responses.filter(
        (report_response) => report_response.entity_type == "tenant_signature"
      );
      let tenant_signature_map = {};
      tenant_signature.forEach((tenant) => {
        tenant_signature_map[tenant.metadata?.id] = tenant.metadata?.url;
      });
      console.log("tenant_signature_map", tenant_signature_map);
      // const tenant_feedback=report_responses.filter(report_response=>report_response.entity_type=='tenant_feedback');
      // make a map of item_type and metadata.feedback
      let tenant_feedback_map = {};
      tenant_feedback.forEach((tenant) => {
        tenant_feedback_map[tenant.item_type] = tenant.metadata?.feedback;
      });
      console.log("tenant_feedback_map", tenant_feedback_map);
      tenancy?.tenants?.forEach((tenant) => {
        index++;
        if (
          (req.query.type == "tenant" || tenancy.type == "HMO") &&
          (req.query.tenant_id || req.query.id) != tenant._id
        ) {
          index--;
          return;
        }
        let tenant_final_feedback = tenant_feedback_map[tenant?._id] || "";
        if (req.query.type == "tenant") tenant_final_feedback = "";
        if (req.query.original && req.query.original == "true")
          tenant_final_feedback = "";
        let tenant_template = template_string.replace("INDEX", index);
        tenant_template = tenant_template.replace(
          "NAME",
          decrypt(tenant?.name, tenancy?.iv)
        );
        tenant_template = tenant_template.replace(
          "COMMENTS",
          feedback_template
        );
        tenant_template = tenant_template.replace(
          "FEEDBACK",
          tenant_final_feedback
        );
        const default_url =
          "https://res.cloudinary.com/dcugtdlab/image/upload/v1696067271/test/Screenshot_2023-09-30_at_3.16.56_PM_gq25nd.png";
        let sign_url = tenant_signature_map[tenant?._id] || default_url;
        // if (req.query.type == "tenant") sign_url = default_url;
        console.log("sign_url", sign_url);
        tenant_template = tenant_template.replace("SIGN_URL", sign_url);
        if (tenant?.signed_timestamp)
          tenant_template = tenant_template.replace(
            "DATE_SIGNATURE",
            moment(tenant?.signed_timestamp).format("DD-MM-YYYY")
          );
        else tenant_template = tenant_template.replace("DATE_SIGNATURE", "");
        if (index % 2 == 1) {
          second_table_repl += tenant_template;
        } else {
          first_table_repl += tenant_template;
        }
      });
      hydrate_template = hydrate_template
        .replace("FIRST_TENANT_TABLE", first_table_repl)
        .replace("SECOND_TENANT_TABLE", second_table_repl)
        .replace("SIGNATURE_URL", signature_url);
      // .replace('${CSS_URL}',css_url)
      // html_template_list.push(hydrate_template)
      console.log("11-declaration.html", Date.now() - start_time);
      // await page.setContent(hydrate_template);
    } else if (i == 12) {
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      hydrate_template += `<div class="page" style="page-break-before: always">
            <div class="container page-width">
                <h1 class="heading-h1">Disclaimer</h1>
                <div class="content">
                    <div class="section">
                        <p> DISCLAIMER </p>
                    </div>
        
                    <div class="section">
                        <strong>AUTHORISED USAGE</strong>
                        <p><strong>COPYRIGHT IVY INVENTORY © ALL RIGHTS RESERVED.</strong></p>
                    </div>
                </div>
            </div>
        </div>`;
      hydrate_template = hydrate_template.replace(
        "DISCLAIMER",
        disclaimer.entity_value[0]
      );
      // html_template_list.push(hydrate_template);
      console.log("12-disclaimer.html", Date.now() - start_time);
    } else if (i == 13 && report.report_type == "Inventory Report") {
      // let hydrate_template=fs.readFileSync(`${__dirname}/template/${file}`).toString();
      // hydrate_template=template
      hydrate_template += `<div class="page" style="page-break-before: always">
            <div class="container page-width">
                <h1>Documents</h1>
                <p>The following documents are available for this property report.</p>
                <table>
                    <tr>
                        <th>Document title</th>
                    </tr>
        
                    DOCUMENTS_TABLE_ROWS
                </table>
            </div>
        
            <div class="container page-width">
                <h3>Confirmation</h3>
                <div class="section">
                    <div class="text">
                        <p>I can confirm safe receipt of this property report email sent to me on -date sent to tenant- and agree to receiving documents electronically, which I am successfully able to access with the above links.</p>
                    </div>
                </div>
            </div>
        
            <div class="container page-width">
                <table class="signatures">
                  <tr>
                    TENANT_TABLE_ROWS
                  </tr>
                </table>
            </div>
            
        </div>`;
      let repl = "";
      let tenant_repl = "";
      for (let i = 0; i < report?.documents?.length; i++) {
        const temp = `<tr>
                <td><a href=" ${
                  report?.documents[i].url
                } " target="_blank">Document ${i + 1} </a></td>
            </tr>`;
        repl += temp;
      }
      let index = 0;
      const tenant_signature = report_responses.filter(
        (report_response) => report_response.entity_type == "tenant_signature"
      );
      let tenant_signature_map = {};
      tenant_signature.forEach((tenant) => {
        tenant_signature_map[tenant.metadata?.id] = tenant.metadata?.url;
      });
      console.log("tenant_signature_map", tenant_signature_map);
      tenancy?.tenants?.forEach((tenant) => {
        index++;
        console.log(
          req.query.type == "tenant",
          tenancy.type == "HMO",
          (req.query.tenant_id || req.query.id) != tenant._id,
          "signature test"
        );
        if (
          (req.query.type == "tenant" || tenancy.type == "HMO") &&
          (req.query.tenant_id || req.query.id) != tenant._id
        ) {
          index--;
          return;
        }
        const template_string = `<td>Tenant INDEX Name: NAME <br/>
                  Email: TENANT_EMAIL <br/>
                  Date of Signature: DATE_SIGNATURE <br/>
                  <b>Signature</b>
                  <img src=" SIGN_URL " class="ivy-logo"/>
                  </td>`;
        let tenant_template = template_string
          .replace("INDEX", index)
          .replace("NAME", decrypt(tenant?.name, tenancy?.iv))
          .replace("TENANT_EMAIL", decrypt(tenant?.email, tenancy?.iv))
          .replace("REPORT_DATE", moment(report.date).format("DD-MM-YYYY"));
        const default_url =
          "https://res.cloudinary.com/dcugtdlab/image/upload/v1696067271/test/Screenshot_2023-09-30_at_3.16.56_PM_gq25nd.png";
        const sign_url = tenant_signature_map[tenant?._id] || default_url;
        tenant_template = tenant_template.replace("SIGN_URL", sign_url);
        if (tenant?.signed_timestamp)
          tenant_template = tenant_template.replace(
            "DATE_SIGNATURE",
            moment(tenant?.signed_timestamp).format("DD-MM-YYYY")
          );
        else tenant_template = tenant_template.replace("DATE_SIGNATURE", "");
        tenant_repl += tenant_template;
      });
      hydrate_template = hydrate_template
        .replace("DOCUMENTS_TABLE_ROWS", repl)
        .replace("TENANT_TABLE_ROWS", tenant_repl);
      // html_template_list.push(hydrate_template);
      console.log("13-documents.html", Date.now() - start_time);
    }
  }
  html_template_list.push(hydrate_template);
  let html1 =
    `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href=" ${css_url2} ">
    </head>` +
    html_template_list[0] +
    `</body></html>`;
  html1 = html1.replace(/undefined/g, "");
  html1 = html1.replace(/Invalid date/g, "N/A");
  // fs.writeFileSync("test.html",html1);
  // send this html file as response
  console.log("preview")
  return res.send(html1);
});

const getGallery = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  const report = await Report.findById(report_id).select(
    "property_id report_type"
  );
  let [meters, rooms_and_areas, utilities, property] = await Promise.all([
    ReportResponse.find({ report_id, entity_type: "meters" }).select(
      "metadata.photos item_type"
    ),
    ReportResponse.find({ report_id, entity_type: "rooms_and_areas" })
      .select(
        "metadata.photos class_type item_type display_name object_type room_rank item_rank"
      )
      .sort("room_rank item_rank"),
    ReportResponse.find({ report_id, entity_type: "utilities" }).select(
      "metadata.photos item_type"
    ),
    Property.findById(report.property_id).select("address"),
  ]);
  let photos = [];
  meters.forEach((meter) => {
    if (meter.metadata?.photos?.length > 0) {
      photos.push({
        heading: `Meters > ${cleanString(meter.item_type)}`,
        photos: meter.metadata?.photos,
      });
    }
  });
  utilities.forEach((utility) => {
    if (utility.metadata?.photos?.length > 0) {
      photos.push({
        heading: `Utility > ${cleanString(utility.item_type)}`,
        photos: utility.metadata?.photos,
      });
    }
  });
  let rooms_and_areas_grouped_by_name = {};
  for (let room of rooms_and_areas) {
    if (rooms_and_areas_grouped_by_name[room.display_name]) {
      rooms_and_areas_grouped_by_name[room.display_name].push(room);
    } else {
      rooms_and_areas_grouped_by_name[room.display_name] = [room];
    }
  }
  Object.keys(rooms_and_areas_grouped_by_name).forEach((key) => {
    rooms_and_areas_grouped_by_name[key].sort(
      (a, b) => Number(a.item_rank) - Number(b.item_rank)
    );
  });
  let rooms_array_1 = rooms_and_areas.filter(
    (room) => room.class_type == "general_overview"
  );
  rooms_array_1.sort((a, b) => Number(a.room_rank) - Number(b.room_rank));
  let rooms_array = rooms_array_1.map((room) => room.display_name);
  console.log("rooms_array", rooms_array);
  for (let key of rooms_array) {
    rooms_and_areas_grouped_by_name[key].forEach((room) => {
      let combined_pic = [];
      if (room.metadata?.photos?.length > 0) {
        combined_pic = combined_pic.concat(room.metadata?.photos);
      }
      if (room.metadata?.photos_360?.length > 0) {
        combined_pic = combined_pic.concat(room.metadata?.photos_360);
      }
      if (combined_pic.length > 0) {
        let item_type = cleanString(room.item_type);
        // remove _ from item_type
        // item_type=item_type.replace(/_/g, ' ');
        photos.push({
          heading: `Rooms & Areas >  ${cleanString(
            room.display_name
          )} > ${item_type}`,
          photos: combined_pic,
        });
      }
    });
  }
  res.json({
    data: photos,
    property: {
      address: property.address,
      report_type: report.report_type,
    },
  });
});

const getEmailsFromReport = asyncHandler(async (req, res) => {
  const tenancies = await Tenancy.find({
    report_id: req.params.id,
  }).select("tenants iv");
  const report = await Report.findById(req.params.id).select("property_id");
  console.log("report", report);
  const property = await Property.findById(report.property_id).select(
    "customer_user_id"
  );
  console.log("property", property);
  const user = await User.findById(property.customer_user_id).select(
    "email name"
  );
  const customer = await Customer.find({
    email: user.email,
  }).select("email contact_information iv");
  console.log("customer", customer);
  let customer_array = [];
  customer.forEach((cust) => {
    const iv = cust.iv;
    let obj = {};
    cust.contact_information.forEach((contact) => {
      obj = {
        name: decrypt(contact.name, iv),
        email: decrypt(contact.email, iv),
      };
      customer_array.push(obj);
    });
  });
  let tenant_array = [];
  tenancies.forEach((tenancy) => {
    const iv = tenancy.iv;
    let obj = {};
    tenancy.tenants.forEach((tenant) => {
      obj = {
        name: decrypt(tenant.name, iv),
        email: decrypt(tenant.email, iv),
      };
      tenant_array.push(obj);
    });
  });
  // console.log("customer_array",customer_array);
  res.json({
    tenant: tenant_array,
    customer: customer_array,
  });
});

const sendEmailFromReport = asyncHandler(async (req, res) => {
  const payload = req.body.payload;
  const report_id = req.params.id;
  const report = await Report.findById(report_id).select(
    "property_id report_type"
  );
  const property = await Property.findById(report.property_id).select(
    "address"
  );
  payload.forEach((obj) => {
    let template = `${__dirname}/template.html`;
    let email_template = fs.readFileSync(template).toString();
    email_template = email_template.replace("TENANT_NAME", obj.name);
    email_template = email_template.replace(
      "PROPERTY_ADDRESS",
      property.address
    );
    email_template = email_template.replace(
      "VIEW_URL",
      `${process.env.FRONTEND_URL}/view-pdf/${report_id}`
    );
    email_template = email_template.replace("REPORT_TYPE", report.report_type);
    EmailService.send(
      obj.email,
      `${report.report_type} for ${property.address}`,
      email_template
    );
  });
  res.json({
    msg: "Email sent successfully",
  });
});

const emailSignature = asyncHandler(async (req, res) => {
  const payload = req.body.payload;
  const report_id = req.params.id;
  const report = await Report.findById(report_id).select(
    "property_id report_type status"
  );
  const property = await Property.findById(report.property_id).select(
    "address"
  );
  let tenant = await Tenancy.findOne({ report_id }).select("tenants type iv");
  console.log("tenant before filter", tenant);
  let email_array = [];
  payload.forEach((obj) => {
    email_array.push(obj.email);
  });
  const iv = tenant.iv;
  let tenant_map = {};
  tenant.tenants.forEach((tenant) => {
    const email = decrypt(tenant.email, iv);
    tenant_map[email] = tenant._id;
    if (email_array.includes(email)) {
      tenant.status = "sent";
    }
  });
  report.status = "awaiting";
  let wording = "you";
  if (tenant.type == "JOINT") wording = "Lead Tenant";
  payload.forEach((obj) => {
    let template = `${__dirname}/signature.html`;
    let email_template = fs.readFileSync(template).toString();
    email_template = email_template.replace("TENANT_NAME", obj.name);
    email_template = email_template.replace(
      "PROPERTY_ADDRESS",
      property.address
    );
    email_template = email_template.replace(
      "SIGN_URL",
      `${process.env.FRONTEND_URL}/sign/${report_id}/?id=${
        tenant_map[obj.email]
      }`
    );
    email_template = email_template.replace(
      "FEEDBACK_URL",
      `${process.env.FRONTEND_URL}/show-report-pdf/${report_id}/?id=${
        tenant_map[obj.email]
      }`
    );
    email_template = email_template.replace("REPORT_TYPE", report.report_type);
    email_template = email_template.replace("RANDOM_PERSON", wording);
    console.log("sending email to ", obj.email);
    EmailService.send(
      obj.email,
      `${report.report_type} for ${property.address} - Action Required`,
      email_template
    );
  });
  tenant.markModified("tenants");
  await tenant.save();
  res.json({
    msg: "Email sent successfully",
  });
  await report.save();
});

const sendReportFeedback = asyncHandler(async (req, res) => {
  if (req.query.type == "tenant") {
    const report_id = req.params.id;
    const payload = req.body.payload;
    const tenant_id = req.body.tenant_id;
    const feedback = req.body.feedback;
    let tenant_email, tenant_name;
    console.log("feedback", feedback);
    await ReportResponse.create({
      report_id,
      entity_type: "tenant_feedback",
      item_type: tenant_id,
      metadata: {
        feedback,
        tenant_id,
      },
    });
    const tenant = await Tenancy.findOne({ report_id }).select("tenants type iv");
    tenant.tenants.forEach((ten) => {
      if (ten._id == tenant_id) {
        ten.status = "signed";
        tenant_email = decrypt(ten.email, tenant.iv);
        tenant_name =  decrypt(ten.name, tenant.iv);
      }
    });
    tenant.markModified("tenants");
    const report = await Report.findById(report_id).populate({
      path: "assigned_person_id",
      select: "email name",
    });
    console.log("report", report.assigned_person_id.email);
    const property = await Property.findById(report.property_id).select(
      "address"
    );
    //make an array from payload.item_id
    let item_id_array = [];
    payload.forEach((obj) => {
      item_id_array.push(obj.item_id);
    });
    //find report_responses with item_id_array
    const report_responses = await ReportResponse.find({
      _id: {
        $in: item_id_array,
      },
    }).select("metadata");
    // add a new key called feedback to the metadata object and then update the report_response
    report.status = "feedback";
    let request_array = [report.save()];
    // make a map of report_response id and feedback
    let feedback_map = {};
    let found = false;
    payload.forEach((obj) => {
      feedback_map[obj.item_id] = {
        feedback: obj.feedback,
        feedbackImg: obj.feedbackImg,
      };
      if (obj.feedback && obj.feedback.length > 0) found = true;
    });
    report_responses.forEach((report_response) => {
      if (tenant.type == "HMO") {
        if (!report_response.metadata.hmo_feedback)
          report_response.metadata.hmo_feedback = [
            {
              tenant_id: tenant_id,
              feedback: feedback_map[report_response._id]?.feedback,
              feedbackImg: feedback_map[report_response._id]?.feedbackImg,
            },
          ];
        else
          report_response.metadata.hmo_feedback.push({
            tenant_id: tenant_id,
            feedback: feedback_map[report_response._id]?.feedback,
            feedbackImg: feedback_map[report_response._id]?.feedbackImg,
          });
      } else {
        report_response.metadata.feedback =
          feedback_map[report_response._id]?.feedback;
        report_response.metadata.feedbackImg =
          feedback_map[report_response._id]?.feedbackImg;
      }
      // mark metadata as modified
      report_response.markModified("metadata");
      request_array.push(report_response.save());
    });
    await Promise.all(request_array);
    await tenant.save();
    if (found == false) {
      report.status = "approved";
      await report.save();
    }
    res.json({
      msg: "Thank you for confirming",
    });
    const template = `${__dirname}/inspector.html`;
    let email_template = fs.readFileSync(template).toString();
    let tenant_email_template = fs.readFileSync(`${__dirname}/pending.html`).toString();
    email_template = email_template.replace(
      "NAME",
      report.assigned_person_id.name
    );
    email_template = email_template.replace("REPORT_TYPE", report.report_type);
    email_template = email_template.replace(
      "PROPERTY_ADDRESS",
      property.address
    );
    tenant_email_template=tenant_email_template.replace("PROPERTY_ADDRESS",property.address);
    tenant_email_template=tenant_email_template.replace("TENANT_NAME",tenant_name);
    if (tenant.type == "HMO")
      email_template = email_template.replace(
        "VIEW_URL",
        `${process.env.FRONTEND_URL}/inspect/${report_id}?id=${tenant_id}`
      );
    else
      email_template = email_template.replace(
        "VIEW_URL",
        `${process.env.FRONTEND_URL}/inspect/${report_id}`
      );
    EmailService.send(
      report.assigned_person_id.email,
      `${report.report_type} for ${property.address} - Action Required`,
      email_template
    );
    EmailService.send(
      tenant_email,
      `${report.report_type} for ${property.address} - Pending Inspector Approval`,
      tenant_email_template
    )
  } else if (req.query.type == "inspector") {
    const report_id = req.params.id;
    const report = await Report.findById(report_id);
    const tenant = await Tenancy.findOne({ report_id }).select("tenants type");
    const tenant_id = req.body.tenant_id;
    const payload = req.body.payload;
    let item_id_array = [];
    payload.forEach((obj) => {
      item_id_array.push(obj.item_id);
    });
    const feedback = req.body.feedback;
    await ReportResponse.create({
      report_id,
      entity_type: "inspector_feedback",
      item_type: tenant_id,
      metadata: {
        feedback,
      },
    });
    // const tenant=await Tenancy.findOne({report_id}).select('tenants type');
    tenant.tenants.forEach((tenant) => {
      if (tenant._id == tenant_id) {
        tenant.status = "approved";
      }
    });
    tenant.markModified("tenants");

    //find report_responses with item_id_array
    const report_responses = await ReportResponse.find({
      _id: {
        $in: item_id_array,
      },
    }).select("metadata");
    let request_array = [];
    request_array.push(tenant.save());
    // make a map of report_response id and feedback
    let feedback_map = {};
    payload.forEach((obj) => {
      feedback_map[obj.item_id] = obj.feedback;
    });
    report_responses.forEach((report_response) => {
      if (tenant.type == "HMO") {
        if (!report_response.metadata.hmo_inspector_feedback) {
          report_response.metadata.hmo_inspector_feedback = [
            {
              tenant_id: tenant_id,
              feedback: feedback_map[report_response._id],
            },
          ];
        } else {
          report_response.metadata.hmo_inspector_feedback.push({
            tenant_id: tenant_id,
            feedback: feedback_map[report_response._id],
          });
        }
      } else {
        report_response.metadata.inspector_feedback =
          feedback_map[report_response._id];
      }
      // mark metadata as modified
      report_response.markModified("metadata");
      request_array.push(report_response.save());
    });
    await Promise.all(request_array);
    res.status(200).json({
      msg: "Thanks for completing the report",
    });
    report.status = "approved";
    await report.save();
  } else {
    res.status(400).json({
      msg: "Invalid query parameter",
    });
  }
});

const getTenantStatus = asyncHandler(async (req, res) => {
  const report_id = req.params.id;
  const tenant_id = req.params.tenant_id;
  let msg =
    "You have already confirmed receipt of this report. Please click on the 2nd link in your email to view the report";
  let status = true;
  const tenant = await Tenancy.findOne({ report_id }).select("tenants type");
  let found = false;
  let index = 0;
  let found_index;
  tenant.tenants.forEach((tenant) => {
    if (tenant._id == tenant_id) {
      found = true;
      found_index = index;
      if (tenant.status == "signed" || tenant.status == "approved") {
      } else {
        (status = false),
          (msg =
            "You have not signed the report. Please click on the 1st link in your email to sign the report");
      }
    }
    index++;
  });
  console.log("tenancy", tenant.type, found_index, status);
  if (tenant.type == "JOINT" && found_index != 0 && status == true) {
    status = false;
    msg =
      "Thanks for confirming. We will send you a copy of the report once it is done";
  }
  if (found == true) {
    res.status(200).json({
      status,
      msg,
    });
  } else {
    res.status(400).json({
      msg: "Invalid tenant id",
    });
  }
});

const getOfflineReport = asyncHandler(async (req, res) => {
  let custom_query = req.query;
  custom_query["admin_id"] = req.user.admin_id;
  if (req.user.type == "customer") {
    const properties = await req.user.getPropertyIdsOfCustomer();
    custom_query["property_id"] = properties;
  } else if (req.user.type == "clerk") {
    custom_query["assigned_person_id"] = req.user._id;
  }
  const report_id = req.params.id;
  let { filter, skip, limit, sort, projection, populate } = aqp({
    skip: req.page * req.perPage,
    ...custom_query,
  });
  filter = { ...filter, _id: report_id };
  let [report, tenancies] = await Promise.all([
    Report.find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .select(projection)
      .populate({
        path: "property_id assigned_person_id",
        select: "address photos name postcode ",
        populate: {
          path: "customer_user_id",
          select: "name contact_information",
        },
      })
      .lean(),
    Tenancy.find({ report_id }).lean(),
  ]);
  const tenancy_map = {};
  for (let i = 0; i < tenancies.length; i++) {
    tenancy_map[tenancies[i].report_id] = tenancies[i].tenants.length;
  }
  const entities_types = [
    "room_type",
    "meters",
    "utilities",
    "report_type",
    "h_s_compliance_questions",
    "aminities",
    "location",
  ];
  const global_settings = await GlobalSettings.find({
    entity_type: { $in: entities_types },
  }).lean();
  const entities_mapping = {};
  global_settings.forEach((setting) => {
    const { entity_type, entity_value } = setting;
    if (entity_type != null) {
      if (!entities_mapping[entity_type]) entities_mapping[entity_type] = [];
      entities_mapping[entity_type].push(...entity_value);
    }
  });

  const report_types = [
    "Inventory Report",
    "Checkout Report",
    "Inspection Report",
  ];
  let overview_questions = {};
  const include_entity = report_types.includes(report[0].report_type);
  if (include_entity) {
    let entity_type;
    if (report[0].report_type == "Inventory Report")
      entity_type = "overview_inventory_questions";
    else if ((report[0].report_type = "Checkout Report"))
      entity_type = "overview_checkout_questions";
    else {
      entity_type = "overview_inspection_questions";
    }
    overview_questions = await Settings.find({
      entity_type,
      admin_id: req.user.admin_id,
    }).lean();
  }
  const item_descriptions_settings = await GlobalSettings.find({
    entity_type: { $regex: "^item_description", $options: "i" },
  });
  const item_descriptions = {};
  item_descriptions_settings.forEach((item_description) => {
    const { entity_type, entity_value } = item_description;
    if (entity_type != null) {
      if (!item_descriptions[entity_type]) item_descriptions[entity_type] = [];
      item_descriptions[entity_type].push(...entity_value);
    }
  });
  const api_response = {
    success: true,
    data: report[0],
    entities_mapping,
    overview_questions,
    item_descriptions,
  };
  const fields_to_exclude = ["createdAt", "updatedAt"];
  const modified_api_response = JSON.parse(
    JSON.stringify(api_response, (key, value) =>
      fields_to_exclude.includes(key) ? undefined : value
    )
  );
  res.status(200).json(modified_api_response);
});

module.exports = {
  createCustomer,
  createTemplate,
  createProperty,
  getProperties,
  getCustomers,
  deleteProperty,
  deleteCustomer,
  updateProperty,
  updateCustomer,
  createManager,
  deleteManager,
  createClerk,
  deleteClerk,
  createSettings,
  updateSettings,
  getSettings,
  deleteSettings,
  createTenancy,
  getTenancies,
  updateTenancy,
  deleteTenancy,
  createReport,
  updateReport,
  getReports,
  getTemplates,
  deleteReport,
  createReportResponse,
  updateReportResponse,
  getReportResponses,
  deleteReportResponse,
  startReportInspection,
  getDashboardStats,
  getUsers,
  addReportNote,
  addDocument,
  deleteDocument,
  addSignature,
  getReportResponseStatus,
  updateUser,
  deleteUser,
  createUser,
  downloadReport,
  getGallery,
  getReportPreview,
  updateReportRoomsOrder,
  updateReportItemsOrder,
  renameReportRoom,
  updateTemplate,
  deleteTemplate,
  deleteReportRoom,
  getEmailsFromReport,
  sendEmailFromReport,
  emailSignature,
  sendReportFeedback,
  getTenantStatus,
  getOfflineReport,
  duplicateRoom,
  cloneReport,
  duplicateTemplateRoom,
  updateTemplateRoomsOrder,
  updateTemplateItemsOrder,
  renameTemplateRoom,
  deleteTemplateRoom,
  createTemplateResponse,
  updateTemplateResponse,
  getTemplateResponses,
  deleteTemplateResponse,
};
