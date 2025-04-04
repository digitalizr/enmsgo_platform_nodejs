const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a User to a Company
const addUserCompany = async (req, res) => {
  const { user_id, company_id, facility_id, department_id, is_primary } = req.body;

  if (!user_id || !company_id) {
    return res.status(400).json({ message: "User ID and Company ID are required" });
  }

  if (!isUuid(user_id) || !isUuid(company_id)) {
    return res.status(400).json({ message: "Invalid UUID format for user_id or company_id" });
  }

  if (facility_id && !isUuid(facility_id)) {
    return res.status(400).json({ message: "Invalid UUID format for facility_id" });
  }

  if (department_id && !isUuid(department_id)) {
    return res.status(400).json({ message: "Invalid UUID format for department_id" });
  }

  try {
    // Ensure only one primary company per user
    if (is_primary) {
      await client.query("UPDATE user_companies SET is_primary = FALSE WHERE user_id = $1", [user_id]);
    }

    const query = `
      INSERT INTO user_companies (user_id, company_id, facility_id, department_id, is_primary, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *;
    `;
    const values = [user_id, company_id, facility_id || null, department_id || null, is_primary || false];
    
    const result = await client.query(query, values);
    res.status(201).json({ message: "User assigned to company", user_company: result.rows[0] });
  } catch (error) {
    console.error("Error adding user to company:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all user-company relationships
const getAllUserCompanies = async (req, res) => {
  try {
    const query = `
      SELECT uc.*, u.name AS user_name, c.name AS company_name, f.name AS facility_name, d.name AS department_name
      FROM user_companies uc
      LEFT JOIN users u ON uc.user_id = u.id
      LEFT JOIN companies c ON uc.company_id = c.id
      LEFT JOIN facilities f ON uc.facility_id = f.id
      LEFT JOIN departments d ON uc.department_id = d.id
      ORDER BY uc.created_at DESC;
    `;
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching user-company relationships:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single user-company relationship by user_id and company_id
const getSingleUserCompany = async (req, res) => {
  const { user_id, company_id } = req.params;

  if (!isUuid(user_id) || !isUuid(company_id)) {
    return res.status(400).json({ message: "Invalid UUID format for user_id or company_id" });
  }

  try {
    const query = `SELECT * FROM user_companies WHERE user_id = $1 AND company_id = $2;`;
    const result = await client.query(query, [user_id, company_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User-company relationship not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching user-company relationship:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a user-company relationship
const updateUserCompany = async (req, res) => {
  const { user_id, company_id } = req.params;
  const { facility_id, department_id, is_primary } = req.body;

  if (!isUuid(user_id) || !isUuid(company_id)) {
    return res.status(400).json({ message: "Invalid UUID format for user_id or company_id" });
  }

  if (facility_id && !isUuid(facility_id)) {
    return res.status(400).json({ message: "Invalid UUID format for facility_id" });
  }

  if (department_id && !isUuid(department_id)) {
    return res.status(400).json({ message: "Invalid UUID format for department_id" });
  }

  try {
    let updates = [];
    let values = [];
    let index = 1;

    if (facility_id) {
      updates.push(`facility_id = $${index}`);
      values.push(facility_id);
      index++;
    }
    if (department_id) {
      updates.push(`department_id = $${index}`);
      values.push(department_id);
      index++;
    }
    if (typeof is_primary !== "undefined") {
      if (is_primary) {
        await client.query("UPDATE user_companies SET is_primary = FALSE WHERE user_id = $1", [user_id]);
      }
      updates.push(`is_primary = $${index}`);
      values.push(is_primary);
      index++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    const query = `UPDATE user_companies SET ${updates.join(", ")} WHERE user_id = $${index} AND company_id = $${index + 1} RETURNING *;`;
    values.push(user_id, company_id);

    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User-company relationship not found" });
    }

    res.status(200).json({ message: "User-company relationship updated", user_company: result.rows[0] });
  } catch (error) {
    console.error("Error updating user-company relationship:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a user-company relationship
const deleteUserCompany = async (req, res) => {
  const { user_id, company_id } = req.params;

  if (!isUuid(user_id) || !isUuid(company_id)) {
    return res.status(400).json({ message: "Invalid UUID format for user_id or company_id" });
  }

  try {
    const query = `DELETE FROM user_companies WHERE user_id = $1 AND company_id = $2 RETURNING *;`;
    const result = await client.query(query, [user_id, company_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User-company relationship not found" });
    }

    res.status(200).json({ message: "User-company relationship deleted", user_company: result.rows[0] });
  } catch (error) {
    console.error("Error deleting user-company relationship:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addUserCompany,
  getAllUserCompanies,
  getSingleUserCompany,
  updateUserCompany,
  deleteUserCompany,
};
