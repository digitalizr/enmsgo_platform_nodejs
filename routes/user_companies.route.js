const express = require("express");
const router = express.Router();
const {
  addUserCompany,
  getAllUserCompanies,
  getSingleUserCompany,
  updateUserCompany,
  deleteUserCompany,
} = require("../controllers/user_companies.controller.js");

router.post("/", addUserCompany);

router.get("/", getAllUserCompanies);

router.get("/:id", getSingleUserCompany);

router.put("/:id", updateUserCompany);

router.delete("/:id", deleteUserCompany);

module.exports = router;

