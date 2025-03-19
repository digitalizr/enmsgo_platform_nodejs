const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Allowed status values
const VALID_STATUSES = ["Contracted", "Proposal", "Contacted", "Lead"];

// Register a new company
const registerCompany = async (req, res) => {
  const { 
    name, 
    address, 
    contact_name, 
    contact_email, 
    contact_phone, 
    status, 
    notes, 
    created_by 
  } = req.body;

  if (!name || !address || !contact_name || !contact_email || !contact_phone || !created_by) {
    return res.status(400).json({ message: "All required fields must be provided" });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    const query = `
      INSERT INTO companies (
        name, 
        address, 
        contact_name, 
        contact_email, 
        contact_phone, 
        status, 
        notes, 
        created_at, 
        updated_at, 
        created_by, 
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $8)
      RETURNING *;
    `;
    const values = [
      name, 
      address, 
      contact_name, 
      contact_email, 
      contact_phone, 
      status || "Lead", 
      notes, 
      created_by
    ];
    const result = await client.query(query, values);

    res.status(201).json({ message: "Company registered", company: result.rows[0] });
  } catch (error) {
    console.error("Error registering company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a company by ID
const getCompanyById = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid company ID" });
  }

  try {
    const query = `SELECT * FROM companies WHERE id = $1;`;
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all companies
const getAllCompanies = async (req, res) => {
  try {
    const query = `SELECT * FROM companies ORDER BY created_at DESC;`;
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a company by ID
const updateCompany = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid company ID" });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    const validColumns = [
      "name", "address", "contact_name", "contact_email", "contact_phone", "status", "notes", "updated_by"
    ];
    
    let query = "UPDATE companies SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      if (validColumns.includes(key)) {
        query += `${key} = $${index}, `;
        values.push(updates[key]);
        index++;
      }
    }

    query = query.slice(0, -2) + `, updated_at = NOW() WHERE id = $${index} RETURNING *;`;
    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.status(200).json({ message: "Company updated", company: result.rows[0] });
  } catch (error) {
    console.error("Error updating company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a company by ID
const deleteCompany = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid company ID" });
  }

  try {
    const query = "DELETE FROM companies WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.status(200).json({ message: "Company deleted", company: result.rows[0] });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  registerCompany,
  getCompanyById,
  getAllCompanies,
  updateCompany,
  deleteCompany,
};
