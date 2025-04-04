const express = require("express");
const router = express.Router();
const {
  addAssignment,
  getAllAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
} = require("../controllers/assignments.controller.js");

// Assignment Routes
router.post("/", addAssignment);
router.get("/", getAllAssignments);
router.get("/:id", getAssignmentById);
router.put("/:id", updateAssignment);
router.delete("/:id", deleteAssignment);

module.exports = router;
