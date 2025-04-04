const { client } = require("../lib/connectDB.js");

// Predefined system roles
const SYSTEM_ROLES = ["technician", "operator", "admin", "customer"];

// Add a new role
const addRole = async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Role name is required" });
  }

  try {
    const isSystemRole = SYSTEM_ROLES.includes(name);
    const query = `
      INSERT INTO roles (name, description, is_system, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *;
    `;
    const values = [name, description || null, isSystemRole];
    const result = await client.query(query, values);

    res.status(201).json({ message: "Role created", role: result.rows[0] });
  } catch (error) {
    console.error("Error adding role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all roles
const getAllRoles = async (req, res) => {
  try {
    const query = "SELECT * FROM roles ORDER BY created_at DESC;";
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single role by ID
const getSingleRole = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "SELECT * FROM roles WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Role not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a role
const updateRole = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const roleCheck = await client.query("SELECT * FROM roles WHERE id = $1;", [id]);
    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ message: "Role not found" });
    }

    if (roleCheck.rows[0].is_system) {
      return res.status(403).json({ message: "System roles cannot be modified" });
    }

    let query = "UPDATE roles SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      query += `${key} = $${index}, `;
      values.push(updates[key]);
      index++;
    }

    query = query.slice(0, -2) + `, updated_at = NOW() WHERE id = $${index} RETURNING *;`;
    values.push(id);

    const result = await client.query(query, values);

    res.status(200).json({ message: "Role updated", role: result.rows[0] });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a role
const deleteRole = async (req, res) => {
  const { id } = req.params;

  try {
    const roleCheck = await client.query("SELECT * FROM roles WHERE id = $1;", [id]);
    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ message: "Role not found" });
    }

    if (roleCheck.rows[0].is_system) {
      return res.status(403).json({ message: "System roles cannot be deleted" });
    }

    const query = "DELETE FROM roles WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    res.status(200).json({ message: "Role deleted", role: result.rows[0] });
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addRole,
  getAllRoles,
  getSingleRole,
  updateRole,
  deleteRole,
};
