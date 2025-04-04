const express = require("express");
const router = express.Router();
const {
  addEdgeGatewayIP,
  getAllEdgeGatewayIPs,
  getEdgeGatewayIPById,
  updateEdgeGatewayIP,
  deleteEdgeGatewayIP,
} = require("../controllers/edge_gateway_ip.controller.js");

// Routes for smart meters
router.post("/", addEdgeGatewayIP);
router.get("/", getAllEdgeGatewayIPs);
router.get("/:id", getEdgeGatewayIPById);
router.put("/:id", updateEdgeGatewayIP);
router.delete("/:id", deleteEdgeGatewayIP);

module.exports = router;
