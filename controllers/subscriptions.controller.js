const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new subscription
const addSubscription = async (req, res) => {
  const {
    company_id,
    plan_id,
    status,
    start_date,
    end_date,
    billing_cycle,
    next_billing_date,
    amount,
    payment_method,
    payment_details,
    notes,
    created_by,
  } = req.body;

  // Validate input fields
  if (
    !company_id ||
    !plan_id ||
    !status ||
    !start_date ||
    !billing_cycle ||
    !next_billing_date ||
    !amount
  ) {
    return res
      .status(400)
      .json({
        message:
          "Required fields: company_id, plan_id, status, start_date, billing_cycle, next_billing_date, amount",
      });
  }

  if (
    !isUuid(company_id) ||
    !isUuid(plan_id) ||
    (created_by && !isUuid(created_by))
  ) {
    return res
      .status(400)
      .json({ message: "Invalid UUID for company_id, plan_id or created_by" });
  }

  try {
    const query = `
      INSERT INTO subscriptions (
        company_id, plan_id, status, start_date, end_date, billing_cycle, next_billing_date, amount, 
        payment_method, payment_details, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *;
    `;
    const values = [
      company_id,
      plan_id,
      status || "active",
      start_date,
      end_date || null,
      billing_cycle,
      next_billing_date,
      amount,
      payment_method || null,
      payment_details || null,
      notes || null,
      created_by || null,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Subscription created", subscription: result.rows[0] });
  } catch (error) {
    console.error("Error adding subscription:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all subscriptions
const getAllSubscriptions = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM subscriptions ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get subscription by ID
const getSubscriptionById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Subscription ID" });

  try {
    const result = await client.query(
      "SELECT * FROM subscriptions WHERE id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Subscription not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update subscription by ID
const updateSubscription = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Subscription ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE subscriptions
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Subscription not found" });

    res
      .status(200)
      .json({ message: "Subscription updated", subscription: result.rows[0] });
  } catch (error) {
    console.error("Error updating subscription:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete subscription by ID
const deleteSubscription = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Subscription ID" });

  try {
    const result = await client.query(
      "DELETE FROM subscriptions WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Subscription not found" });

    res
      .status(200)
      .json({ message: "Subscription deleted", subscription: result.rows[0] });
  } catch (error) {
    console.error("Error deleting subscription:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addSubscription,
  getAllSubscriptions,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
};
