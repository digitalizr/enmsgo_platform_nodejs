const express = require("express");
const router = express.Router();
const {
  registerCompany,
  getCompanyById,
  getAllCompanies,
  updateCompany,
  deleteCompany
} = require("../controllers/company.controller.js");

// Define company routes
router.post("/register", registerCompany);
router.get("/:id", getCompanyById);
router.get("/", getAllCompanies);
router.put("/:id", updateCompany); 
router.delete("/:id", deleteCompany);

module.exports = router;
