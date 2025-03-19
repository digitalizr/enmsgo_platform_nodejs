const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Register a new facility
const registerFacility = async (req, res) => {
  const {
    name,
    company_id,
    location,
    address,
    contact_name,
    contact_email,
    contact_phone,
    notes,
  } = req.body;

  if (!name || !company_id) {
    return res
      .status(400)
      .json({ message: "Name and company ID are required" });
  }

  if (!isUuid(company_id)) {
    return res.status(400).json({ message: "Invalid company ID format" });
  }

  if (contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    const query = `
      INSERT INTO facilities (name, company_id, location, address, contact_name, contact_email, contact_phone, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *;
    `;
    const values = [
      name,
      company_id,
      location,
      address,
      contact_name,
      contact_email,
      contact_phone,
      notes,
    ];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Facility registered", facility: result.rows[0] });
  } catch (error) {
    console.error("Error registering facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a facility by ID
const getFacilityById = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid facility ID format" });
  }

  try {
    const query = "SELECT * FROM facilities WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Facility not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all facilities
const getAllFacilities = async (req, res) => {
  try {
    const query = "SELECT * FROM facilities ORDER BY created_at DESC;";
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching facilities:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a facility by ID
const updateFacility = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid facility ID format" });
  }

  if (updates.company_id && !isUuid(updates.company_id)) {
    return res.status(400).json({ message: "Invalid company ID format" });
  }

  if (
    updates.contact_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contact_email)
  ) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const validColumns = [
      "name",
      "company_id",
      "location",
      "address",
      "contact_name",
      "contact_email",
      "contact_phone",
      "notes",
    ];
    let query = "UPDATE facilities SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      if (validColumns.includes(key)) {
        query += `${key} = $${index}, `;
        values.push(updates[key]);
        index++;
      }
    }

    query =
      query.slice(0, -2) +
      `, updated_at = NOW() WHERE id = $${index} RETURNING *;`;
    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Facility not found" });
    }

    res
      .status(200)
      .json({ message: "Facility updated", facility: result.rows[0] });
  } catch (error) {
    console.error("Error updating facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a facility by ID
const deleteFacility = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid facility ID format" });
  }

  try {
    const query = "DELETE FROM facilities WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Facility not found" });
    }

    res
      .status(200)
      .json({ message: "Facility deleted", facility: result.rows[0] });
  } catch (error) {
    console.error("Error deleting facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  registerFacility,
  getFacilityById,
  getAllFacilities,
  updateFacility,
  deleteFacility,
};
