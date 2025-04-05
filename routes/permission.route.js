const express = require("express");
const router = express.Router();
const {
  addPermissions,
  getAllPermissions,
  getSinglePermissions,
  updatePermissions,
  deletePermissions,
} = require("../controllers/permission.controller.js");

router.post("/", addPermissions);

router.get("/", getAllPermissions);

router.get("/:id", getSinglePermissions);

router.put("/:id", updatePermissions);

router.delete("/:id", deletePermissions);

module.exports = router;

