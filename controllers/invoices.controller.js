const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new invoice
const addInvoice = async (req, res) => {
  const {
    subscription_id,
    company_id,
    invoice_number,
    issue_date,
    due_date,
    amount,
    tax_amount,
    total_amount,
    status,
    payment_date,
    notes,
  } = req.body;

  // Validate input fields
  if (
    !subscription_id ||
    !company_id ||
    !invoice_number ||
    !issue_date ||
    !due_date ||
    !amount ||
    !total_amount
  ) {
    return res
      .status(400)
      .json({
        message:
          "Required fields: subscription_id, company_id, invoice_number, issue_date, due_date, amount, total_amount",
      });
  }

  if (!isUuid(subscription_id) || !isUuid(company_id)) {
    return res
      .status(400)
      .json({ message: "Invalid UUID for subscription_id or company_id" });
  }

  try {
    const query = `
      INSERT INTO invoices (
        subscription_id, company_id, invoice_number, issue_date, due_date, amount, tax_amount, 
        total_amount, status, payment_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *;
    `;
    const values = [
      subscription_id,
      company_id,
      invoice_number,
      issue_date,
      due_date,
      amount,
      tax_amount || 0,
      total_amount,
      status || "pending",
      payment_date || null,
      notes || null,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Invoice created", invoice: result.rows[0] });
  } catch (error) {
    console.error("Error adding invoice:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all invoices
const getAllInvoices = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM invoices ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get invoice by ID
const getInvoiceById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Invoice ID" });

  try {
    const result = await client.query("SELECT * FROM invoices WHERE id = $1;", [
      id,
    ]);
    if (!result.rows.length)
      return res.status(404).json({ message: "Invoice not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update invoice by ID
const updateInvoice = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Invoice ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE invoices
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Invoice not found" });

    res
      .status(200)
      .json({ message: "Invoice updated", invoice: result.rows[0] });
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete invoice by ID
const deleteInvoice = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Invoice ID" });

  try {
    const result = await client.query(
      "DELETE FROM invoices WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Invoice not found" });

    res
      .status(200)
      .json({ message: "Invoice deleted", invoice: result.rows[0] });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addInvoice,
  getAllInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
};
