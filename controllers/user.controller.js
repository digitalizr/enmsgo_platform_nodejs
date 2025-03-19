const { client } = require("../lib/connectDB.js");
const bcrypt = require("bcrypt");

// Add a new user
const addUser = async (req, res) => {
  const { 
    first_name, last_name, email, phone, password, role_id, 
    created_by, is_active, require_password_change 
  } = req.body;

  if (!first_name || !last_name || !email || !password || !role_id) {
    return res.status(400).json({ message: "First name, last name, email, password, and role_id are required" });
  }

  try {
    // Check if role_id exists
    const roleCheck = await client.query("SELECT id FROM roles WHERE id = $1", [role_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ message: "Invalid role_id" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const query = `
      INSERT INTO users (
        first_name, last_name, email, phone, password_hash, role_id, 
        is_active, require_password_change, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      first_name, last_name, email, phone || null, hashedPassword, role_id, 
      is_active ?? true, require_password_change ?? false, created_by || null
    ];
    const result = await client.query(query, values);

    res.status(201).json({ message: "User added successfully", user: result.rows[0] });
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, 
             u.require_password_change, u.last_login, r.id as role_id, 
             r.name as role_name, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC;
    `;
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single user by ID
const getSingleUser = async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT u.*, r.name as role_name 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1;
    `;
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a user
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { updated_by, password, ...updates } = req.body;

  if (Object.keys(updates).length === 0 && !password) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    let query = "UPDATE users SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      query += `${key} = $${index}, `;
      values.push(updates[key]);
      index++;
    }

    // Handle password update separately
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `password_hash = $${index}, `;
      values.push(hashedPassword);
      index++;
    }

    // Set updated_at and updated_by
    query += `updated_at = NOW(), updated_by = $${index} WHERE id = $${index + 1} RETURNING *;`;
    values.push(updated_by || null, id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated successfully", user: result.rows[0] });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a user
const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const query = "DELETE FROM users WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted successfully", user: result.rows[0] });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addUser,
  getAllUsers,
  getSingleUser,
  updateUser,
  deleteUser,
};
