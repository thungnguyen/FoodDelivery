const express = require("express");
const router  = express.Router();
const authController = require("../controllers/customerController");
const { protect } = require("../middlewares/auth"); // your JWT-checker
const adminAuth = require("../middlewares/adminAuth");

router.post("/register/customer", authController.register);
router.post("/login",           authController.login);

// Admin management routes
router.get("/admin/customers", adminAuth, authController.adminListCustomers);
router.patch("/admin/customers/:id/status", adminAuth, authController.adminUpdateCustomerStatus);

// Protected customer routes
router
  .route("/customer/profile")
  .get(protect, authController.getProfile)
  .patch(protect, authController.updateProfile);

module.exports = router;
