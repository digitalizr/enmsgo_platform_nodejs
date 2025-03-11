const { client } = require("../lib/connectDB.js");

// Register a new company
const registerCompany = async (req, res) => {
  const { name, address, contact_person, contact_email, contact_phone, status } = req.body;

  if (!name || !address || !contact_person || !contact_email || !contact_phone) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const query = `
      INSERT INTO companies (name, address, contact_person, contact_email, contact_phone, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;
    const values = [name, address, contact_person, contact_email, contact_phone, status || "lead"];
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

  try {
    const query = "SELECT * FROM companies WHERE id = $1;";
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
    const query = "SELECT * FROM companies ORDER BY created_at DESC;";
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

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    let query = "UPDATE companies SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      query += `${key} = $${index}, `;
      values.push(updates[key]);
      index++;
    }

    query = query.slice(0, -2) + ` WHERE id = $${index} RETURNING *;`;
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