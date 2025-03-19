const express = require("express");
const router = express.Router();
const {
  addRolesPermissions,
  getAllRolesPermissionss,
  getSingleRolesPermissions,
  updateRolesPermissions,
  deleteRolesPermissions,
} = require("../controllers/roles-permissions.controller.js");

router.post("/", addRolesPermissions);

router.get("/", getAllRolesPermissionss);

router.get("/:id", getSingleRolesPermissions);

router.put("/:id", updateRolesPermissions);

router.delete("/:id", deleteRolesPermissions);

module.exports = router;

