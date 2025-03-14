const express = require("express");
const router = express.Router();
const {
    addSmartMeter,
  getAllSmartMeters,
  getSmartMeterById,
  updateSmartMeter,
  deleteSmartMeter,
} = require("../controllers/smartMeter.controller.js");

// Routes for smart meters
router.post("/", addSmartMeter);
router.get("/", getAllSmartMeters);
router.get("/:id", getSmartMeterById);
router.put("/:id", updateSmartMeter);
router.delete("/:id", deleteSmartMeter);

module.exports = router;
