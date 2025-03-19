const express = require("express");
const router = express.Router();
const {
  addRole,
  getAllRoles,
  getSingleRole,
  updateRole,
  deleteRole,
} = require("../controllers/roles.controller.js");

router.post("/", addRole);

router.get("/", getAllRoles);

router.get("/:id", getSingleRole);

router.put("/:id", updateRole);

router.delete("/:id", deleteRole);

module.exports = router;

