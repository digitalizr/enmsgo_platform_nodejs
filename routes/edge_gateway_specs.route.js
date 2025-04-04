const express = require("express");
const router = express.Router();
const {
  addEdgeGatewaySpecs,
  getAllEdgeGatewaySpecs,
  getEdgeGatewaySpecsById,
  updateEdgeGatewaySpecs,
  deleteEdgeGatewaySpecs,
} = require("../controllers/edge_gateway_specs.controller.js");

// Routes for smart meters
router.post("/", addEdgeGatewaySpecs);
router.get("/", getAllEdgeGatewaySpecs);
router.get("/:id", getEdgeGatewaySpecsById);
router.put("/:id", updateEdgeGatewaySpecs);
router.delete("/:id", deleteEdgeGatewaySpecs);

module.exports = router;
