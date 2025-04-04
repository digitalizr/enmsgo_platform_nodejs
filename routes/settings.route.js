const express = require("express");
const router = express.Router();
const {
  addSetting,
  getAllSettings,
  getSettingById,
  updateSetting,
  deleteSetting,
} = require("../controllers/settings.controller.js");

// Settings Routes
router.post("/", addSetting);
router.get("/", getAllSettings);
router.get("/:id", getSettingById);
router.put("/:id", updateSetting);
router.delete("/:id", deleteSetting);

module.exports = router;
