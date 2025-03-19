const { client } = require("../lib/connectDB.js");

// Add a role-permission mapping
const addRolesPermissions = async (req, res) => {
  const { role_id, permission_id } = req.body;

  if (!role_id || !permission_id) {
    return res
      .status(400)
      .json({ message: "role_id and permission_id are required" });
  }

  try {
    // Check if role_id exists
    const roleCheck = await client.query(
      "SELECT id FROM roles WHERE id = $1;",
      [role_id]
    );
    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ message: "Role not found" });
    }

    // Check if permission_id exists
    const permissionCheck = await client.query(
      "SELECT id FROM permissions WHERE id = $1;",
      [permission_id]
    );
    if (permissionCheck.rows.length === 0) {
      return res.status(404).json({ message: "Permission not found" });
    }

    // Insert role-permission mapping
    const query = `
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const result = await client.query(query, [role_id, permission_id]);

    res
      .status(201)
      .json({
        message: "Role-Permission mapping created",
        rolePermission: result.rows[0],
      });
  } catch (error) {
    console.error("Error adding role-permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all role-permission mappings
const getAllRolesPermissionss = async (req, res) => {
  try {
    const query = `
      SELECT rp.*, r.name AS role_name, p.name AS permission_name
      FROM role_permissions rp
      JOIN roles r ON rp.role_id = r.id
      JOIN permissions p ON rp.permission_id = p.id
      ORDER BY rp.created_at DESC;
    `;
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching role-permission mappings:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single role-permission mapping by role_id and permission_id
const getSingleRolesPermissions = async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT rp.*, r.name AS role_name, p.name AS permission_name
      FROM role_permissions rp
      JOIN roles r ON rp.role_id = r.id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = $1;
    `;
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Role-Permission mapping not found" });
    }

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching role-permission mapping:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a role-permission mapping (Not typically needed, but included for completeness)
const updateRolesPermissions = async (req, res) => {
  return res
    .status(405)
    .json({ message: "Update operation not allowed on role-permissions" });
};

// Delete a role-permission mapping
const deleteRolesPermissions = async (req, res) => {
  const { id } = req.params;
  try {
    const query =
      "DELETE FROM role_permissions WHERE role_id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Role-Permission mapping not found" });
    }

    res
      .status(200)
      .json({
        message: "Role-Permission mapping deleted",
        rolePermission: result.rows[0],
      });
  } catch (error) {
    console.error("Error deleting role-permission mapping:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addRolesPermissions,
  getAllRolesPermissionss,
  getSingleRolesPermissions,
  updateRolesPermissions,
  deleteRolesPermissions,
};
