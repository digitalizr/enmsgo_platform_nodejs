const express = require("express");
const router = express.Router();
const {
    addRolePermissions,
    getAllRolePermissionss,
    getSingleRolePermissions,
    updateRolePermissions,
    deleteRolePermissions,
} = require("../controllers/roles-permissions.controller.js");

router.post("/", addRolePermissions);

router.get("/", getAllRolePermissionss);

router.get("/:id", getSingleRolePermissions);

router.put("/:id", updateRolePermissions);

router.delete("/:id", deleteRolePermissions);

module.exports = router;

