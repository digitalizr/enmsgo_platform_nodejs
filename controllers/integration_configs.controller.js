const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new integration config
const addIntegrationConfig = async (req, res) => {
  const { name, integration_type, config, is_active, created_by } = req.body;

  // Validate required fields
  if (!name || !integration_type || !config) {
    return res
      .status(400)
      .json({
        message: "Missing required fields: name, integration_type, config",
      });
  }

  try {
    const query = `
      INSERT INTO integration_configs (name, integration_type, config, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const values = [
      name,
      integration_type,
      config,
      is_active ?? true,
      created_by || null,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({
        message: "Integration Config created",
        integrationConfig: result.rows[0],
      });
  } catch (error) {
    console.error("Error adding integration config:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all integration configs
const getAllIntegrationConfigs = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM integration_configs ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching integration configs:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get integration config by ID
const getIntegrationConfigById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Integration Config ID" });

  try {
    const result = await client.query(
      "SELECT * FROM integration_configs WHERE id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Integration Config not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching integration config:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update integration config by ID
const updateIntegrationConfig = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({
        message: "Invalid Integration Config ID or no fields to update",
      });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE integration_configs
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Integration Config not found" });

    res
      .status(200)
      .json({
        message: "Integration Config updated",
        integrationConfig: result.rows[0],
      });
  } catch (error) {
    console.error("Error updating integration config:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete integration config by ID
const deleteIntegrationConfig = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Integration Config ID" });

  try {
    const result = await client.query(
      "DELETE FROM integration_configs WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Integration Config not found" });

    res
      .status(200)
      .json({
        message: "Integration Config deleted",
        integrationConfig: result.rows[0],
      });
  } catch (error) {
    console.error("Error deleting integration config:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addIntegrationConfig,
  getAllIntegrationConfigs,
  getIntegrationConfigById,
  updateIntegrationConfig,
  deleteIntegrationConfig,
};
