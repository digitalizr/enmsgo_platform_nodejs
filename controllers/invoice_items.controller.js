const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new invoice item
const addInvoiceItem = async (req, res) => {
  const { invoice_id, description, quantity, unit_price, amount } = req.body;

  // Validate input fields
  if (!invoice_id || !description || !quantity || !unit_price || !amount) {
    return res
      .status(400)
      .json({
        message:
          "Required fields: invoice_id, description, quantity, unit_price, amount",
      });
  }

  if (!isUuid(invoice_id)) {
    return res.status(400).json({ message: "Invalid UUID for invoice_id" });
  }

  try {
    const query = `
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const values = [invoice_id, description, quantity, unit_price, amount];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Invoice Item created", invoice_item: result.rows[0] });
  } catch (error) {
    console.error("Error adding invoice item:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all invoice items
const getAllInvoiceItems = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM invoice_items ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching invoice items:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get invoice item by ID
const getInvoiceItemById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Invoice Item ID" });

  try {
    const result = await client.query(
      "SELECT * FROM invoice_items WHERE id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Invoice Item not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching invoice item:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update invoice item by ID
const updateInvoiceItem = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Invoice Item ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE invoice_items
      SET ${fields.join(", ")}, created_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Invoice Item not found" });

    res
      .status(200)
      .json({ message: "Invoice Item updated", invoice_item: result.rows[0] });
  } catch (error) {
    console.error("Error updating invoice item:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete invoice item by ID
const deleteInvoiceItem = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Invoice Item ID" });

  try {
    const result = await client.query(
      "DELETE FROM invoice_items WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Invoice Item not found" });

    res
      .status(200)
      .json({ message: "Invoice Item deleted", invoice_item: result.rows[0] });
  } catch (error) {
    console.error("Error deleting invoice item:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addInvoiceItem,
  getAllInvoiceItems,
  getInvoiceItemById,
  updateInvoiceItem,
  deleteInvoiceItem,
};
