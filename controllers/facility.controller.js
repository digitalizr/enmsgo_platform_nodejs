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
    created_by,
  } = req.body;

  if (!name || !company_id || !created_by) {
    return res.status(400).json({ message: "Name, company_id, and created_by are required" });
  }

  if (!isUuid(company_id) || !isUuid(created_by)) {
    return res.status(400).json({ message: "Invalid UUID format for company_id or created_by" });
  }

  if (contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    const query = `
      INSERT INTO facilities (
        name, company_id, location, address, contact_name, contact_email, 
        contact_phone, notes, created_at, updated_at, created_by, updated_by
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9, $9) 
      RETURNING *;
    `;
    const values = [
      name, company_id, location || null, address || null, contact_name || null, 
      contact_email || null, contact_phone || null, notes || null, created_by
    ];
    const result = await client.query(query, values);

    res.status(201).json({ message: "Facility registered", facility: result.rows[0] });
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
  const { updated_by, ...updates } = req.body;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid facility ID format" });
  }

  if (!isUuid(updated_by)) {
    return res.status(400).json({ message: "Invalid UUID format for updated_by" });
  }

  if (updates.company_id && !isUuid(updates.company_id)) {
    return res.status(400).json({ message: "Invalid company ID format" });
  }

  if (updates.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contact_email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const validColumns = [
      "name", "company_id", "location", "address", "contact_name", 
      "contact_email", "contact_phone", "notes"
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

    query += `updated_at = NOW(), updated_by = $${index} WHERE id = $${index + 1} RETURNING *;`;
    values.push(updated_by, id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Facility not found" });
    }

    res.status(200).json({ message: "Facility updated", facility: result.rows[0] });
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

    res.status(200).json({ message: "Facility deleted", facility: result.rows[0] });
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
