const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Register a new department
const registerDepartment = async (req, res) => {
  const { name, facility_id, notes, created_by } = req.body;

  if (!name || !facility_id || !created_by) {
    return res.status(400).json({ message: "Name, facility_id, and created_by are required" });
  }

  if (!isUuid(facility_id) || !isUuid(created_by)) {
    return res.status(400).json({ message: "Invalid UUID format for facility_id or created_by" });
  }

  try {
    const query = `
      INSERT INTO departments (name, facility_id, notes, created_at, updated_at, created_by, updated_by)
      VALUES ($1, $2, $3, NOW(), NOW(), $4, $4)
      RETURNING *;
    `;
    const values = [name, facility_id, notes || null, created_by];

    const result = await client.query(query, values);

    res.status(201).json({ message: "Department registered", department: result.rows[0] });
  } catch (error) {
    console.error("Error registering department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a department by ID
const getDepartmentById = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid department ID format" });
  }

  try {
    const query = "SELECT * FROM departments WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all departments
const getAllDepartments = async (req, res) => {
  try {
    const query = "SELECT * FROM departments ORDER BY created_at DESC;";
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a department by ID
const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { updated_by, ...updates } = req.body;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid department ID format" });
  }

  if (!isUuid(updated_by)) {
    return res.status(400).json({ message: "Invalid UUID format for updated_by" });
  }

  if (updates.facility_id && !isUuid(updates.facility_id)) {
    return res.status(400).json({ message: "Invalid facility ID format" });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const validColumns = ["name", "notes", "facility_id"];
    let query = "UPDATE departments SET ";
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
      return res.status(404).json({ message: "Department not found" });
    }

    res.status(200).json({ message: "Department updated", department: result.rows[0] });
  } catch (error) {
    console.error("Error updating department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a department by ID
const deleteDepartment = async (req, res) => {
  const { id } = req.params;

  if (!isUuid(id)) {
    return res.status(400).json({ message: "Invalid department ID format" });
  }

  try {
    const query = "DELETE FROM departments WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.status(200).json({ message: "Department deleted", department: result.rows[0] });
  } catch (error) {
    console.error("Error deleting department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  registerDepartment,
  getDepartmentById,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
};
