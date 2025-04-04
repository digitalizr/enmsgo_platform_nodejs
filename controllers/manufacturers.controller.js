const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a Manufacturer
const addManufacturer = async (req, res) => {
  const { name, website, support_email, support_phone, notes } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Manufacturer name is required" });
  }

  try {
    const query = `
      INSERT INTO manufacturers (name, website, support_email, support_phone, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *;
    `;
    const values = [name, website || null, support_email || null, support_phone || null, notes || null];
    const result = await client.query(query, values);

    res.status(201).json({ message: "Manufacturer added", manufacturer: result.rows[0] });
  } catch (error) {
    console.error("Error adding manufacturer:", error);
    if (error.code === "23505") {
      return res.status(400).json({ message: "Manufacturer name must be unique" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all manufacturers
const getAllManufacturers = async (req, res) => {
  try {
    const query = "SELECT * FROM manufacturers ORDER BY created_at DESC;";
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching manufacturers:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single manufacturer by ID
const getSingleManufacturer = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid manufacturer ID format" });
  }

  try {
    const query = "SELECT * FROM manufacturers WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching manufacturer:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a manufacturer
const updateManufacturer = async (req, res) => {
  const { id } = req.params;
  const { name, website, support_email, support_phone, notes } = req.body;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid manufacturer ID format" });
  }

  let updates = [];
  let values = [];
  let index = 1;

  if (name) {
    updates.push(`name = $${index}`);
    values.push(name);
    index++;
  }
  if (website) {
    updates.push(`website = $${index}`);
    values.push(website);
    index++;
  }
  if (support_email) {
    updates.push(`support_email = $${index}`);
    values.push(support_email);
    index++;
  }
  if (support_phone) {
    updates.push(`support_phone = $${index}`);
    values.push(support_phone);
    index++;
  }
  if (notes) {
    updates.push(`notes = $${index}`);
    values.push(notes);
    index++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  try {
    const query = `UPDATE manufacturers SET ${updates.join(", ")} WHERE id = $${index} RETURNING *;`;
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }

    res.status(200).json({ message: "Manufacturer updated", manufacturer: result.rows[0] });
  } catch (error) {
    console.error("Error updating manufacturer:", error);
    if (error.code === "23505") {
      return res.status(400).json({ message: "Manufacturer name must be unique" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a manufacturer
const deleteManufacturer = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid manufacturer ID format" });
  }

  try {
    const query = "DELETE FROM manufacturers WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }

    res.status(200).json({ message: "Manufacturer deleted", manufacturer: result.rows[0] });
  } catch (error) {
    console.error("Error deleting manufacturer:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addManufacturer,
  getAllManufacturers,
  getSingleManufacturer,
  updateManufacturer,
  deleteManufacturer,
};
