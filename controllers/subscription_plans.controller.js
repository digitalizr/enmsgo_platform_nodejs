const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new subscription plan
const addSubscriptionPlan = async (req, res) => {
  const {
    name,
    description,
    price_monthly,
    price_annually,
    meters_allowed,
    users_allowed,
    features,
    created_by,
  } = req.body;

  // Validate inputs
  if (
    !name ||
    !price_monthly ||
    !price_annually ||
    !meters_allowed ||
    !users_allowed
  ) {
    return res
      .status(400)
      .json({
        message:
          "Required fields: name, price_monthly, price_annually, meters_allowed, users_allowed",
      });
  }

  try {
    const query = `
      INSERT INTO subscription_plans (
        name, description, price_monthly, price_annually, meters_allowed, users_allowed, features, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
    `;
    const values = [
      name,
      description || null,
      price_monthly,
      price_annually,
      meters_allowed,
      users_allowed,
      features || null,
      created_by,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Subscription Plan created", plan: result.rows[0] });
  } catch (error) {
    if (error.constraint === "subscription_plans_name_key") {
      return res
        .status(409)
        .json({ message: "Subscription Plan name must be unique" });
    }
    console.error("Error adding subscription plan:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all subscription plans
const getAllSubscriptionPlans = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM subscription_plans ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get subscription plan by ID
const getSubscriptionPlanById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Subscription Plan ID" });

  try {
    const result = await client.query(
      "SELECT * FROM subscription_plans WHERE id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Subscription Plan not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update subscription plan by ID
const updateSubscriptionPlan = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Subscription Plan ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE subscription_plans
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Subscription Plan not found" });

    res
      .status(200)
      .json({ message: "Subscription Plan updated", plan: result.rows[0] });
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete subscription plan by ID
const deleteSubscriptionPlan = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Subscription Plan ID" });

  try {
    const result = await client.query(
      "DELETE FROM subscription_plans WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Subscription Plan not found" });

    res
      .status(200)
      .json({ message: "Subscription Plan deleted", plan: result.rows[0] });
  } catch (error) {
    console.error("Error deleting subscription plan:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
};
