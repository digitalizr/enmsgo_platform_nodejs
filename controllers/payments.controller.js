const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new payment
const addPayment = async (req, res) => {
  const {
    invoice_id,
    company_id,
    amount,
    payment_date,
    payment_method,
    transaction_id,
    status,
    notes,
  } = req.body;

  // Validate required fields
  if (
    !invoice_id ||
    !company_id ||
    !amount ||
    !payment_date ||
    !payment_method ||
    !status
  ) {
    return res
      .status(400)
      .json({
        message:
          "Missing required fields: invoice_id, company_id, amount, payment_date, payment_method, status",
      });
  }

  if (!isUuid(invoice_id) || !isUuid(company_id)) {
    return res
      .status(400)
      .json({ message: "Invalid UUID for invoice_id or company_id" });
  }

  try {
    const query = `
      INSERT INTO payments (invoice_id, company_id, amount, payment_date, payment_method, transaction_id, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
    `;
    const values = [
      invoice_id,
      company_id,
      amount,
      payment_date,
      payment_method,
      transaction_id || null,
      status,
      notes || null,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Payment recorded", payment: result.rows[0] });
  } catch (error) {
    console.error("Error adding payment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all payments
const getAllPayments = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM payments ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Payment ID" });

  try {
    const result = await client.query("SELECT * FROM payments WHERE id = $1;", [
      id,
    ]);
    if (!result.rows.length)
      return res.status(404).json({ message: "Payment not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update payment by ID
const updatePayment = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Payment ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE payments
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Payment not found" });

    res
      .status(200)
      .json({ message: "Payment updated", payment: result.rows[0] });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete payment by ID
const deletePayment = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Payment ID" });

  try {
    const result = await client.query(
      "DELETE FROM payments WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Payment not found" });

    res
      .status(200)
      .json({ message: "Payment deleted", payment: result.rows[0] });
  } catch (error) {
    console.error("Error deleting payment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addPayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
};
