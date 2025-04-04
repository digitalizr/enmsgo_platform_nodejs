const express = require("express");
const router = express.Router();
const {
  addEdgeGateway,
  getAllEdgeGateways,
  getEdgeGatewayById,
  updateEdgeGateway,
  deleteEdgeGateway,
} = require("../controllers/edgeGateway.controller.js");

// Routes for smart meters
router.post("/", addEdgeGateway);
router.get("/", getAllEdgeGateways);
router.get("/:id", getEdgeGatewayById);
router.put("/:id", updateEdgeGateway);
router.delete("/:id", deleteEdgeGateway);

module.exports = router;
