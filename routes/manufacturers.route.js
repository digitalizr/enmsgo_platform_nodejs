const express = require("express");
const router = express.Router();
const {
  addManufacturer,
  getAllManufacturers,
  getSingleManufacturer,
  updateManufacturer,
  deleteManufacturer,
} = require("../controllers/manufacturers.controller.js");

router.post("/", addManufacturer);

router.get("/", getAllManufacturers);

router.get("/:id", getSingleManufacturer);

router.put("/:id", updateManufacturer);

router.delete("/:id", deleteManufacturer);

module.exports = router;

