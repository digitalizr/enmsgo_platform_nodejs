const express = require("express");
const router = express.Router();
const {
  addSmartMeterAssignment,
  getAllSmartMeterAssignments,
  getSmartMeterAssignmentById,
  updateSmartMeterAssignment,
  deleteSmartMeterAssignment,
} = require("../controllers/smartMeterAssignments.controller.js");

// Smart Meter Assignment Routes
router.post("/", addSmartMeterAssignment);
router.get("/", getAllSmartMeterAssignments);
router.get("/:id", getSmartMeterAssignmentById);
router.put("/:id", updateSmartMeterAssignment);
router.delete("/:id", deleteSmartMeterAssignment);

module.exports = router;
