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
      INSERT INTO manufacturers (name, website, support_email, support_phone, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const values = [name, website, support_email, support_phone, notes];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Manufacturer added", manufacturer: result.rows[0] });
  } catch (error) {
    console.error("Error adding manufacturer:", error);
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ message: "Manufacturer name must be unique" });
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
  const updates = req.body;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid manufacturer ID format" });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    let query = "UPDATE manufacturers SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      query += `${key} = $${index}, `;
      values.push(updates[key]);
      index++;
    }

    query =
      query.slice(0, -2) +
      `, updated_at = NOW() WHERE id = $${index} RETURNING *;`;
    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }

    res
      .status(200)
      .json({ message: "Manufacturer updated", manufacturer: result.rows[0] });
  } catch (error) {
    console.error("Error updating manufacturer:", error);
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

    res
      .status(200)
      .json({ message: "Manufacturer deleted", manufacturer: result.rows[0] });
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
 
