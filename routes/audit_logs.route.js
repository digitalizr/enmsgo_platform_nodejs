const express = require("express");
const router = express.Router();
const {
  addAuditLog,
  getAllAuditLogs,
  getSingleAuditLog,
  updateAuditLog,
  deleteAuditLog,
} = require("../controllers/audit_logs.controller.js");

router.post("/", addAuditLog);

router.get("/", getAllAuditLogs);

router.get("/:id", getSingleAuditLog);

router.put("/:id", updateAuditLog);

router.delete("/:id", deleteAuditLog);

module.exports = router;

