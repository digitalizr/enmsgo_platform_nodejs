const { client } = require("../lib/connectDB.js");

// Add a new permission
const addPermissions = async (req, res) => {
  const { name, description, resource, action } = req.body;

  if (!name || !resource || !action) {
    return res
      .status(400)
      .json({ message: "Name, resource, and action are required" });
  }

  try {
    const query = `
      INSERT INTO permissions (name, description, resource, action)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [name, description || null, resource, action];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Permission created", permission: result.rows[0] });
  } catch (error) {
    console.error("Error adding permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all permissions
const getAllPermissionss = async (req, res) => {
  try {
    const query = "SELECT * FROM permissions ORDER BY created_at DESC;";
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single permission by ID
const getSinglePermissions = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "SELECT * FROM permissions WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Permission not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a permission
const updatePermissions = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    let query = "UPDATE permissions SET ";
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
      return res.status(404).json({ message: "Permission not found" });
    }

    res
      .status(200)
      .json({ message: "Permission updated", permission: result.rows[0] });
  } catch (error) {
    console.error("Error updating permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a permission
const deletePermissions = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM permissions WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Permission not found" });
    }

    res
      .status(200)
      .json({ message: "Permission deleted", permission: result.rows[0] });
  } catch (error) {
    console.error("Error deleting permission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addPermissions,
  getAllPermissionss,
  getSinglePermissions,
  updatePermissions,
  deletePermissions,
};
