const express = require("express");
const router = express.Router();
const {
  addEdgeGatewayConnectionInfo,
  getAllEdgeGatewayConnectionInfos,
  getEdgeGatewayConnectionInfoById,
  updateEdgeGatewayConnectionInfo,
  deleteEdgeGatewayConnectionInfo,
} = require("../controllers/edge_gateway_connection_details.controller");

// Routes for smart meters
router.post("/", addEdgeGatewayConnectionInfo);
router.get("/", getAllEdgeGatewayConnectionInfos);
router.get("/:id", getEdgeGatewayConnectionInfoById);
router.put("/:id", updateEdgeGatewayConnectionInfo);
router.delete("/:id", deleteEdgeGatewayConnectionInfo);

module.exports = router;
