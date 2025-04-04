const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new device model
const addDeviceModel = async (req, res) => {
  const {
    manufacturer_id,
    model_name,
    device_type,
    description,
    specifications,
    firmware_version,
    is_active,
  } = req.body;

  if (!manufacturer_id || !model_name || !device_type) {
    return res
      .status(400)
      .json({
        message: "manufacturer_id, model_name, and device_type are required",
      });
  }

  if (!isUuid(manufacturer_id)) {
    return res.status(400).json({ message: "Invalid manufacturer ID format" });
  }

  try {
    const query = `
      INSERT INTO device_models 
      (manufacturer_id, model_name, device_type, description, specifications, firmware_version, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;
    `;
    const values = [
      manufacturer_id,
      model_name,
      device_type,
      description || null,
      specifications || null,
      firmware_version || null,
      is_active ?? true,
    ];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Device model added", deviceModel: result.rows[0] });
  } catch (error) {
    console.error("Error adding device model:", error);
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ message: "Device model already exists for this manufacturer" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all device models
const getAllDeviceModel = async (req, res) => {
  try {
    const query = "SELECT * FROM device_models ORDER BY created_at DESC;";
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching device models:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single device model by ID
const getSingleDeviceModel = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid device model ID format" });
  }

  try {
    const query = "SELECT * FROM device_models WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Device model not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching device model:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a device model
const updateDeviceModel = async (req, res) => {
  const { id } = req.params;
  const {
    manufacturer_id,
    model_name,
    device_type,
    description,
    specifications,
    firmware_version,
    is_active,
  } = req.body;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid device model ID format" });
  }

  if (manufacturer_id && !isUuid(manufacturer_id)) {
    return res.status(400).json({ message: "Invalid manufacturer ID format" });
  }

  let updates = [];
  let values = [];
  let index = 1;

  if (manufacturer_id) {
    updates.push(`manufacturer_id = $${index}`);
    values.push(manufacturer_id);
    index++;
  }
  if (model_name) {
    updates.push(`model_name = $${index}`);
    values.push(model_name);
    index++;
  }
  if (device_type) {
    updates.push(`device_type = $${index}`);
    values.push(device_type);
    index++;
  }
  if (description) {
    updates.push(`description = $${index}`);
    values.push(description);
    index++;
  }
  if (specifications) {
    updates.push(`specifications = $${index}`);
    values.push(specifications);
    index++;
  }
  if (firmware_version) {
    updates.push(`firmware_version = $${index}`);
    values.push(firmware_version);
    index++;
  }
  if (is_active !== undefined) {
    updates.push(`is_active = $${index}`);
    values.push(is_active);
    index++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  try {
    const query = `UPDATE device_models SET ${updates.join(
      ", "
    )} WHERE id = $${index} RETURNING *;`;
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Device model not found" });
    }

    res
      .status(200)
      .json({ message: "Device model updated", deviceModel: result.rows[0] });
  } catch (error) {
    console.error("Error updating device model:", error);
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ message: "Device model already exists for this manufacturer" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a device model
const deleteDeviceModel = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid device model ID format" });
  }

  try {
    const query = "DELETE FROM device_models WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Device model not found" });
    }

    res
      .status(200)
      .json({ message: "Device model deleted", deviceModel: result.rows[0] });
  } catch (error) {
    console.error("Error deleting device model:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addDeviceModel,
  getAllDeviceModel,
  getSingleDeviceModel,
  updateDeviceModel,
  deleteDeviceModel,
};
