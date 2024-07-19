const AccountController = require("@controller/client/account/account.js");
const withPagination = require("@middleware/withPagination.js");
const withAdminUser = require("@middleware/withAdminUser.js");
const withFullUser = require("@middleware/withFullUser.js");
const withClerk = require("@middleware/withClerk.js");
const withManager = require("@middleware/withManager.js");
module.exports = function (router) {
  router.get(
    "/customer",
    [withFullUser, withPagination],
    AccountController.getCustomers
  );
  router.post("/customer", [withClerk], AccountController.createCustomer);
  router.put("/customer/:id", [withClerk], AccountController.updateCustomer);
  router.delete(
    "/customer/:id",
    [withManager],
    AccountController.deleteCustomer
  );
  router.get(
    "/property",
    [withFullUser, withPagination],
    AccountController.getProperties
  );
  router.post("/property", [withClerk], AccountController.createProperty);
  router.delete(
    "/property/:id",
    [withManager],
    AccountController.deleteProperty
  );
  router.put("/property/:id", [withClerk], AccountController.updateProperty);
  router.post("/manager", [withAdminUser], AccountController.createManager);
  router.delete(
    "/manager/:id",
    [withAdminUser],
    AccountController.deleteManager
  );
  router.post("/clerk", [withManager], AccountController.createClerk);
  router.delete("/clerk/:id", [withManager], AccountController.deleteClerk);
  router.post("/settings", [withAdminUser], AccountController.createSettings);
  router.put(
    "/settings/:id",
    [withAdminUser],
    AccountController.updateSettings
  );
  router.get(
    "/settings",
    [withAdminUser, withPagination],
    AccountController.getSettings
  );
  router.delete(
    "/settings/:id",
    [withAdminUser],
    AccountController.deleteSettings
  );
  router.post("/report", [withClerk], AccountController.createReport);
  router.post(
    "/template",
    [withClerk, withFullUser],
    AccountController.createTemplate
  );
  router.put("/report/:id", [withClerk], AccountController.updateReport);
  router.put("/template/:id", [withClerk], AccountController.updateTemplate);
  router.get(
    "/report",
    [withFullUser, withPagination],
    AccountController.getReports
  );
  router.get(
    "/template",
    [withFullUser, withPagination],
    AccountController.getTemplates
  );
  router.delete("/report/:id", [withManager], AccountController.deleteReport);
  router.delete(
    "/template/:id",
    [withManager],
    AccountController.deleteTemplate
  );
  router.post(
    "/report/:id/rooms_order",
    [withClerk],
    AccountController.updateReportRoomsOrder
  );
  router.post(
    "/template/:id/rooms_order",
    [withClerk],
    AccountController.updateTemplateRoomsOrder
  );
  router.post(
    "/report/:id/duplicate",
    [withClerk],
    AccountController.duplicateRoom
  );

  router.post(
    "/template/:id/duplicate",
    [withClerk],
    AccountController.duplicateTemplateRoom
  );
  router.post(
    "/report/:id/clone",
    [withFullUser],
    AccountController.cloneReport
  );
  router.post(
    "/report/:id/items_order",
    [withClerk],
    AccountController.updateReportItemsOrder
  );
  router.post(
    "/template/:id/items_order",
    [withClerk],
    AccountController.updateTemplateItemsOrder
  );
  router.put(
    "/report/:id/room_rename",
    [withClerk],
    AccountController.renameReportRoom
  );
  router.put(
    "/template/:id/room_rename",
    [withClerk],
    AccountController.renameTemplateRoom
  );
  router.delete(
    "/report/:id/room_delete",
    [withClerk],
    AccountController.deleteReportRoom
  );
  router.delete(
    "/template/:id/room_delete",
    [withClerk],
    AccountController.deleteTemplateRoom
  );
  router.post(
    "/report/:id/add_report_note",
    [withClerk],
    AccountController.addReportNote
  );
  router.post(
    "/report/:id/add_document",
    [withClerk],
    AccountController.addDocument
  );
  router.delete(
    "/report/:id/delete_document/:document_id",
    [withClerk],
    AccountController.deleteDocument
  );
  router.post(
    "/report/:id/add_signature",
    [withClerk],
    AccountController.addSignature
  );
  router.get("/report/:id/gallery", [], AccountController.getGallery);
  router.get("/report/:id/email", [], AccountController.getEmailsFromReport);
  router.post("/report/:id/email", [], AccountController.sendEmailFromReport);
  router.post("/report/:id/signature", [], AccountController.emailSignature);
  router.post("/report/:id/feedback", [], AccountController.sendReportFeedback);
  router.post("/tenancy", [withClerk], AccountController.createTenancy);
  router.put("/tenancy/:id", [withClerk], AccountController.updateTenancy);
  router.get(
    "/tenancy",
    [withFullUser, withPagination],
    AccountController.getTenancies
  );
  router.delete("/tenancy/:id", [withManager], AccountController.deleteTenancy);

  router.post(
    "/report_response",
    [withClerk],
    AccountController.createReportResponse
  );
  router.post(
    "/template_response",
    [withClerk],
    AccountController.createTemplateResponse
  );
  router.put(
    "/report_response/:id",
    [withClerk],
    AccountController.updateReportResponse
  );
  router.put(
    "/template_response/:id",
    [withClerk],
    AccountController.updateTemplateResponse
  );
  router.get(
    "/report_response",
    [withFullUser, withPagination],
    AccountController.getReportResponses
  );
  router.get(
    "/template_response",
    [withFullUser, withPagination],
    AccountController.getTemplateResponses
  );
  router.delete(
    "/report_response/:id",
    [withManager],
    AccountController.deleteReportResponse
  );
  router.delete(
    "/template_response/:id",
    [withManager],
    AccountController.deleteTemplateResponse
  );
  router.get(
    "/report_response/:id/status",
    [withClerk],
    AccountController.getReportResponseStatus
  );
  router.post(
    "/report/start_inspection/:id",
    [withClerk],
    AccountController.startReportInspection
  );
  router.get(
    "/dashboard/stats",
    [withFullUser],
    AccountController.getDashboardStats
  );
  router.get(
    "/users",
    [withFullUser, withPagination],
    AccountController.getUsers
  );
  router.delete("/user/:id", [withAdminUser], AccountController.deleteUser);
  router.put("/user/:id", [withAdminUser], AccountController.updateUser);
  router.post("/user", [withFullUser], AccountController.createUser);
  router.get("/report/download/:id", [], AccountController.downloadReport);
  router.get("/report/preview/:id", [], AccountController.getReportPreview);
  router.get(
    "/offline/report/:id",
    [withFullUser],
    AccountController.getOfflineReport
  );
};
