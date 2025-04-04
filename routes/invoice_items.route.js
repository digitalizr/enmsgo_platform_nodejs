const express = require("express");
const router = express.Router();
const {
  addInvoiceItem,
  getAllInvoiceItems,
  getInvoiceItemById,
  updateInvoiceItem,
  deleteInvoiceItem,
} = require("../controllers/invoice_items.controller.js");

// Invoice Items Routes
router.post("/", addInvoiceItem);
router.get("/", getAllInvoiceItems);
router.get("/:id", getInvoiceItemById);
router.put("/:id", updateInvoiceItem);
router.delete("/:id", deleteInvoiceItem);

module.exports = router;
