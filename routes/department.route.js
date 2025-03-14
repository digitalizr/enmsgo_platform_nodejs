const express = require("express");
const router = express.Router();
const {
  registerDepartment,
  getDepartmentById,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
} = require("../controllers/department.controller.js");

// Define company routes
router.post("/register", registerDepartment);
router.get("/:id", getDepartmentById);
router.get("/", getAllDepartments);
router.put("/:id", updateDepartment);
router.delete("/:id", deleteDepartment);

module.exports = router;

// {
//   "name": "IT Department",
//   "facility_id": 1
// }