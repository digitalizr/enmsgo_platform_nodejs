const { client } = require("../lib/connectDB.js");

// Add a role-permission association
const addRolePermissions = async (req, res) => {
  const { role_id, permission_id } = req.body;

  if (!role_id || !permission_id) {
    return res.status(400).json({ message: "role_id and permission_id are required" });
  }

  try {
    const query = `
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const values = [role_id, permission_id];
    const result = await client.query(query, values);

    res.status(201).json({ message: "Role-Permission added", rolePermission: result.rows[0] });
  } catch (error) {
    console.error("Error adding role-permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all role-permission associations
const getAllRolePermissionss = async (req, res) => {
  try {
    const query = `SELECT * FROM role_permissions ORDER BY created_at DESC;`;
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching role-permissions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get role-permissions by role_id
const getSingleRolePermissions = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `SELECT * FROM role_permissions WHERE role_id = $1;`;
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No permissions found for this role" });
    }

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching role-permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update role-permission (Not applicable since primary key is composite, returning 405)
const updateRolePermissions = async (req, res) => {
  return res.status(405).json({ message: "Update operation is not allowed on role-permissions" });
};

// Delete a role-permission association
const deleteRolePermissions = async (req, res) => {
  const { role_id, permission_id } = req.body;

  if (!role_id || !permission_id) {
    return res.status(400).json({ message: "role_id and permission_id are required" });
  }

  try {
    const query = `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2 RETURNING *;`;
    const result = await client.query(query, [role_id, permission_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Role-Permission association not found" });
    }

    res.status(200).json({ message: "Role-Permission deleted", rolePermission: result.rows[0] });
  } catch (error) {
    console.error("Error deleting role-permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addRolePermissions,
  getAllRolePermissionss,
  getSingleRolePermissions,
  updateRolePermissions,
  deleteRolePermissions,
};