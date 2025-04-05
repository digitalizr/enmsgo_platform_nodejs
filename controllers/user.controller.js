const { client } = require("../lib/connectDB.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const generateToken = require("../utils/generateToken.js");

// Register a new user
const addUser = async (req, res) => {
  const {
    first_name, last_name, email, phone, password, role_id,
    created_by, is_active, require_password_change
  } = req.body;

  if (!first_name || !last_name || !email || !password || !role_id) {
    return res.status(400).json({ message: "First name, last name, email, password, and role_id are required" });
  }

  try {
    const roleCheck = await client.query("SELECT id FROM roles WHERE id = $1", [role_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ message: "Invalid role_id" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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
    const token = await generateToken(result.rows[0].id);

    res.status(201).json({ message: "User registered successfully", user: result.rows[0], token });
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Login User
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await client.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = await generateToken(user.id);

    await client.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);

    res.status(200).json({ message: "Login successful", user, token });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update user
const updateUser = async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    last_name,
    email,
    phone,
    password,
    role_id,
    is_active,
    require_password_change,
    updated_by
  } = req.body;

  if (!first_name || !last_name || !email || !role_id) {
    return res.status(400).json({
      message: "First name, last name, email, and role_id are required"
    });
  }

  try {
    const userCheck = await client.query("SELECT * FROM users WHERE id = $1", [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const roleCheck = await client.query("SELECT id FROM roles WHERE id = $1", [role_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ message: "Invalid role_id" });
    }

    let hashedPassword = userCheck.rows[0].password_hash;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const query = `
      UPDATE users
      SET
        first_name = $1,
        last_name = $2,
        email = $3,
        phone = $4,
        password_hash = $5,
        role_id = $6,
        is_active = $7,
        require_password_change = $8,
        updated_by = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *;
    `;

    const values = [
      first_name,
      last_name,
      email,
      phone || null,
      hashedPassword,
      role_id,
      is_active ?? true,
      require_password_change ?? false,
      updated_by || null,
      id
    ];

    const result = await client.query(query, values);

    res.status(200).json({ message: "User updated successfully", user: result.rows[0] });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const result = await client.query("SELECT * FROM users ORDER BY created_at DESC");
    res.status(200).json({ users: result.rows });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get single user
const getSingleUser = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await client.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const userCheck = await client.query("SELECT id FROM users WHERE id = $1", [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    await client.query("DELETE FROM users WHERE id = $1", [id]);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Logout
const logoutUser = (req, res) => {
  res.status(200).json({ message: "User logged out successfully" });
};

// Verify token
const verifyUser = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.status(200).json({ message: "User verified", userId: decoded.userId });
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};

// Get new token
const getNewToken = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const token = await generateToken(userId);
    res.status(200).json({ token });
  } catch (error) {
    console.error("Error generating new token:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Refresh token (if using refresh tokens)
const getRefreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token is required" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const newToken = await generateToken(decoded.userId);
    res.status(200).json({ token: newToken });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(401).json({ message: "Invalid refresh token" });
  }
};

module.exports = {
  addUser,
  getAllUsers,
  getSingleUser,
  updateUser,
  deleteUser,
  loginUser,
  logoutUser,
  verifyUser,
  getNewToken,
  getRefreshToken,
};
