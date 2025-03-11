const { client } = require("../lib/connectDB.js");

// ✅ Add a new user 
const addUser = async (req, res) => {
  const { name, email, phone, role, company_id } = req.body;

  if (!name || !email || !role || !company_id) {
    return res.status(400).json({ message: "Name, email, role, and company_id are required" });
  }

  // Validate role
  const allowedRoles = ["operator", "manager", "admin"];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid role. Allowed values: operator, manager, admin" });
  }

  try {
    // Ensure the company exists before adding the user
    const companyCheck = await client.query("SELECT id FROM companies WHERE id = $1", [company_id]);
    if (companyCheck.rows.length === 0) {
      return res.status(400).json({ message: "Invalid company_id. Company does not exist." });
    }

    // Insert new user
    const query = `
      INSERT INTO users (name, email, phone, role, company_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const values = [name, email, phone || null, role, company_id];

    const result = await client.query(query, values);

    res.status(201).json({ message: "User added", user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email already exists" });
    }
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Get all users
const getAllUsers = async (req, res) => {
  try {
    const query = `
      SELECT users.*, companies.name AS company_name 
      FROM users 
      LEFT JOIN companies ON users.company_id = companies.id
      ORDER BY created_at DESC;
    `;
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Get a single user by ID
const getSingleUser = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT users.*, companies.name AS company_name 
      FROM users 
      LEFT JOIN companies ON users.company_id = companies.id
      WHERE users.id = $1;
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

// ✅ Update user details by ID (only update allowed fields)
const updateUser = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const allowedFields = ["name", "email", "phone", "role", "company_id"];
    const queryParts = [];
    const values = [];
    let index = 1;

    for (const key in updates) {
      if (!allowedFields.includes(key)) {
        return res.status(400).json({ message: `Invalid field: ${key}` });
      }
      queryParts.push(`${key} = $${index}`);
      values.push(updates[key]);
      index++;
    }

    const query = `
      UPDATE users 
      SET ${queryParts.join(", ")}
      WHERE id = $${index} RETURNING *;
    `;
    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated", user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email already exists" });
    }
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Delete a user by ID
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM users WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted", user: result.rows[0] });
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
