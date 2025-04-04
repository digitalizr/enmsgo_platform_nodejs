const express = require("express");
const router = express.Router();
const {
  addIntegrationConfig,
  getAllIntegrationConfigs,
  getIntegrationConfigById,
  updateIntegrationConfig,
  deleteIntegrationConfig,
} = require("../controllers/integration_configs.controller.js");

// Integration Config Routes
router.post("/", addIntegrationConfig);
router.get("/", getAllIntegrationConfigs);
router.get("/:id", getIntegrationConfigById);
router.put("/:id", updateIntegrationConfig);
router.delete("/:id", deleteIntegrationConfig);

module.exports = router;
