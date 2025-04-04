const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new setting
const addSetting = async (req, res) => {
  const { category, key, value, description, is_system } = req.body;

  // Validate required fields
  if (!category || !key) {
    return res
      .status(400)
      .json({ message: "Missing required fields: category, key" });
  }

  try {
    const query = `
      INSERT INTO settings (category, key, value, description, is_system)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const values = [
      category,
      key,
      value || null,
      description || null,
      is_system || false,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Setting created", setting: result.rows[0] });
  } catch (error) {
    console.error("Error adding setting:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({
          message: "Setting with the same category and key already exists",
        });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all settings
const getAllSettings = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM settings ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get setting by ID
const getSettingById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Setting ID" });

  try {
    const result = await client.query("SELECT * FROM settings WHERE id = $1;", [
      id,
    ]);
    if (!result.rows.length)
      return res.status(404).json({ message: "Setting not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching setting:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update setting by ID
const updateSetting = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Setting ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE settings
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Setting not found" });

    res
      .status(200)
      .json({ message: "Setting updated", setting: result.rows[0] });
  } catch (error) {
    console.error("Error updating setting:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete setting by ID
const deleteSetting = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Setting ID" });

  try {
    const result = await client.query(
      "DELETE FROM settings WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Setting not found" });

    res
      .status(200)
      .json({ message: "Setting deleted", setting: result.rows[0] });
  } catch (error) {
    console.error("Error deleting setting:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addSetting,
  getAllSettings,
  getSettingById,
  updateSetting,
  deleteSetting,
};
