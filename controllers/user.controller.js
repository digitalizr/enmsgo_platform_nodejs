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
    // Check if role_id exists
    const roleCheck = await client.query("SELECT id FROM roles WHERE id = $1", [role_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ message: "Invalid role_id" });
    }

    // Hash password
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

    // Generate JWT token for the new user
    const token = await generateToken(result.rows[0].id);

    res.status(201).json({ message: "User registered successfully", user: result.rows[0], token });
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// User Login
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

    // Compare password with stored hash
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = await generateToken(user.id);

    res.status(200).json({ message: "Login successful", user, token });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Logout User
const logoutUser = (req, res) => {
  res.status(200).json({ message: "User logged out successfully" });
};

// Verify User (Check if token is valid)
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

// Get New Token
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

// Refresh Token (Assuming a refresh token system exists)
const getRefreshToken = async (req, res) => {
  const refreshToken = req.body.refreshToken;

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
