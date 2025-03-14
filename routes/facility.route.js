const express = require("express");
const router = express.Router();
const {
  registerFacility,
  getFacilityById,
  getAllFacilities,
  updateFacility,
  deleteFacility,
} = require("../controllers/facility.controller.js");

// Define company routes
router.post("/register", registerFacility);
router.get("/:id", getFacilityById);
router.get("/", getAllFacilities);
router.put("/:id", updateFacility);
router.delete("/:id", deleteFacility);

module.exports = router;

// {
//     "name": "Main Warehouse",
//     "company_id": 1,
//     "location": "123 Industrial Park, City"
//   }
