const express = require("express");
const router = express.Router();
const {
  addDeviceModel,
  getAllDeviceModel,
  getSingleDeviceModel,
  updateDeviceModel,
  deleteDeviceModel,
} = require("../controllers/device-model.controller.js");

router.post("/", addDeviceModel);

router.get("/", getAllDeviceModel);

router.get("/:id", getSingleDeviceModel);

router.put("/:id", updateDeviceModel);

router.delete("/:id", deleteDeviceModel);

module.exports = router;

