const { client } = require("../lib/connectDB.js");
const bcrypt = require("bcryptjs"); 

// User Controller
const addUser = async (req, res) => {
  const {
    email,
    password_hash,
    first_name,
    last_name,
    phone,
  } = req.body;

  // Validate required fields
  if (
    !email ||
    !password_hash ||
    !first_name ||
    !last_name ||
    !phone 
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Validate role and status
  // if (!["manager", "operator"].includes(role)) {
  //   return res.status(400).json({ message: "Invalid role" });
  // }
  // if (status && !["active", "inactive"].includes(status)) {
  //   return res.status(400).json({ message: "Invalid status" });
  // }

  try {
    // Hash the password
    // const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, phone, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, email, first_name,last_name,phone,created_at;
    `;
    const values = [
      email,
      password_hash,
      first_name,
      last_name,
      phone
    ];
    const result = await client.query(query, values);

    res.status(201).json({ message: "User added", user: result.rows[0] });
  } catch (error) {
    console.error("Error adding user:", error);
    if (error.code === "23505") {
      // Unique constraint violation (email)
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const query = `
      SELECT id, email, full_name, role, company_id, facility_id, department_id, status, created_at
      FROM users
      ORDER BY created_at DESC;
    `;
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getSingleUser = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT id, email, full_name, role, company_id, facility_id, department_id, status, created_at
      FROM users
      WHERE id = $1;
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

const updateUser = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  // Validate role and status if provided
  if (updates.role && !["manager", "operator"].includes(updates.role)) {
    return res.status(400).json({ message: "Invalid role" });
  }
  if (updates.status && !["active", "inactive"].includes(updates.status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    let query = "UPDATE users SET ";
    const values = [];
    let index = 1;

    // Handle password hashing if password is being updated
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    for (const key in updates) {
      query += `${key} = $${index}, `;
      values.push(updates[key]);
      index++;
    }

    query =
      query.slice(0, -2) +
      ` WHERE id = $${index} RETURNING id, email, full_name, role, company_id, facility_id, department_id, status, created_at;`;
    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated", user: result.rows[0] });
  } catch (error) {
    console.error("Error updating user:", error);
    if (error.code === "23505") {
      // Unique constraint violation (email)
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      DELETE FROM users
      WHERE id = $1
      RETURNING id, email, full_name, role, company_id, facility_id, department_id, status, created_at;
    `;
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
