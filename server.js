// Import required modules
require("dotenv").config()
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const rateLimit = require("express-rate-limit")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcrypt")
const { v4: uuidv4 } = require("uuid")
const pgp = require("pg-promise")()

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 3001

// Create database connection
const db = pgp(process.env.DATABASE_URL)

// Initialize pg-promise
const cn = process.env.DATABASE_URL
const pool = pgp(cn)

// Middleware
app.use(helmet()) // Security headers
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)
app.use(express.json()) // Parse JSON bodies
app.use(morgan("dev")) // Logging

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
})
app.use("/api/", apiLimiter)

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) return res.status(401).json({ message: "Authentication required" })

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" })
    req.user = user
    next()
  })
}

// Check if user has required role
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Authentication required" })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Insufficient permissions" })
    }
    next()
  }
}

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Energy Management SaaS API" })
})

// Auth routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user by email
    const user = await db.oneOrNone("SELECT * FROM users WHERE email = $1", [email])

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role_id: user.role_id, // Include role_id in the token
        firstName: user.first_name,
        lastName: user.last_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    )

    // Check if password change is required
    if (user.require_password_change) {
      return res.status(200).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role_id: user.role_id, // Include role_id in the response
        },
        requirePasswordChange: true,
      })
    }

    // Return token and user info
    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role_id: user.role_id, // Include role_id in the response
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    return res.status(500).json({ message: "Server error during login" })
  }
})

// Password change for first-time login
app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const userId = req.user.id

    // Get user
    const user = await db.oneOrNone("SELECT * FROM users WHERE id = $1", [userId])
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ message: "Current password is incorrect" })
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword, salt)

    // Update password and clear require_password_change flag
    await db.none(
      "UPDATE users SET password_hash = $1, require_password_change = false, updated_at = NOW() WHERE id = $2",
      [hashedPassword, userId],
    )

    return res.status(200).json({ message: "Password updated successfully" })
  } catch (error) {
    console.error("Password change error:", error)
    return res.status(500).json({ message: "Server error during password change" })
  }
})

app.post("/api/auth/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, role = "customer" } = req.body

    // Validate input
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" })
    }

    // Check if email already exists
    const existingUser = await db.oneOrNone("SELECT id FROM users WHERE email = $1", [email])
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" })
    }

    // Get role ID - Fixed this part to use db instead of pool
    const roleResult = await db.oneOrNone("SELECT id FROM roles WHERE name = $1", [role])

    if (!roleResult) {
      // If role doesn't exist, create a default customer role
      console.log(`Role '${role}' not found, using default role`)
      // Use a default role ID or create a new role
      const defaultRoleId = 2 // Assuming 2 is the customer role ID

      // Insert new user with default role ID
      const newUser = await db.one(
        "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [firstName, lastName, email, await bcrypt.hash(password, 10), role],
      )

      return res.status(201).json({
        message: "User registered successfully",
        userId: newUser.id,
      })
    }

    const roleId = roleResult.id

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    // Create user
    const newUser = await db.one(
      "INSERT INTO users (first_name, last_name, email, password_hash, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [firstName, lastName, email, passwordHash, roleId],
    )

    res.status(201).json({
      message: "User registered successfully",
      userId: newUser.id,
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Server error during registration" })
  }
})

app.post("/api/auth/validate-token", async (req, res) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ message: "Token is required" })
    }

    // Find user with this reset token
    const userResult = await db.oneOrNone(
      "SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()",
      [token],
    )

    if (!userResult) {
      return res.status(400).json({ message: "Invalid or expired token" })
    }

    res.json({ valid: true })
  } catch (error) {
    console.error("Token validation error:", error)
    res.status(500).json({ message: "Server error during token validation" })
  }
})

app.post("/api/auth/set-password", async (req, res) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" })
    }

    // Find user with this reset token
    const userResult = await db.oneOrNone(
      "SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()",
      [token],
    )

    if (!userResult) {
      return res.status(400).json({ message: "Invalid or expired token" })
    }

    const userId = userResult.id

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    // Update user password
    await db.none(
      "UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, require_password_change = FALSE, updated_at = NOW() WHERE id = $2",
      [passwordHash, userId],
    )

    res.json({ message: "Password updated successfully" })
  } catch (error) {
    console.error("Set password error:", error)
    res.status(500).json({ message: "Server error during password update" })
  }
})

// Smart Meters routes
app.get("/api/smart-meters", authenticateToken, async (req, res) => {
  try {
    const smartMeters = await db.manyOrNone(`
      SELECT sm.*, m.name as manufacturer_name, m.id as manufacturer_id, 
             mm.name as model_name, mm.id as model_id
      FROM smart_meters sm
      LEFT JOIN manufacturers m ON sm.manufacturer_id = m.id
      LEFT JOIN meter_models mm ON sm.model_id = mm.id
      ORDER BY sm.created_at DESC
    `)

    return res.status(200).json(smartMeters)
  } catch (error) {
    console.error("Error fetching smart meters:", error)
    return res.status(500).json({ message: "Server error fetching smart meters" })
  }
})

app.post("/api/smart-meters", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const {
      serial_number,
      manufacturer_id,
      model_id,
      installation_date,
      firmware_version,
      communication_protocol,
      status,
    } = req.body

    // Check if serial number already exists
    const existing = await db.oneOrNone("SELECT id FROM smart_meters WHERE serial_number = $1", [serial_number])
    if (existing) {
      return res.status(409).json({ message: "Smart meter with this serial number already exists" })
    }

    // Insert new smart meter
    const newSmartMeter = await db.one(
      `
      INSERT INTO smart_meters (
        serial_number, manufacturer_id, model_id, installation_date, 
        firmware_version, communication_protocol, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `,
      [
        serial_number,
        manufacturer_id,
        model_id,
        installation_date || null,
        firmware_version,
        communication_protocol,
        status || "available",
        req.user.id,
      ],
    )

    return res.status(201).json(newSmartMeter)
  } catch (error) {
    console.error("Error creating smart meter:", error)
    return res.status(500).json({ message: "Server error creating smart meter" })
  }
})

app.put("/api/smart-meters/:id", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { id } = req.params
    const {
      serial_number,
      manufacturer_id,
      model_id,
      installation_date,
      firmware_version,
      communication_protocol,
      status,
    } = req.body

    // Check if smart meter exists
    const smartMeter = await db.oneOrNone("SELECT id FROM smart_meters WHERE id = $1", [id])
    if (!smartMeter) {
      return res.status(404).json({ message: "Smart meter not found" })
    }

    // Update smart meter
    const updatedSmartMeter = await db.one(
      `
      UPDATE smart_meters SET
        serial_number = $1,
        manufacturer_id = $2,
        model_id = $3,
        installation_date = $4,
        firmware_version = $5,
        communication_protocol = $6,
        status = $7,
        updated_at = NOW(),
        updated_by = $8
      WHERE id = $9
      RETURNING *
    `,
      [
        serial_number,
        manufacturer_id,
        model_id,
        installation_date || null,
        firmware_version,
        communication_protocol,
        status,
        req.user.id,
        id,
      ],
    )

    return res.status(200).json(updatedSmartMeter)
  } catch (error) {
    console.error("Error updating smart meter:", error)
    return res.status(500).json({ message: "Server error updating smart meter" })
  }
})

app.delete("/api/smart-meters/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    // Check if smart meter exists
    const smartMeter = await db.oneOrNone("SELECT id FROM smart_meters WHERE id = $1", [id])
    if (!smartMeter) {
      return res.status(404).json({ message: "Smart meter not found" })
    }

    // Delete smart meter
    await db.none("DELETE FROM smart_meters WHERE id = $1", [id])

    return res.status(200).json({ message: "Smart meter deleted successfully" })
  } catch (error) {
    console.error("Error deleting smart meter:", error)
    return res.status(500).json({ message: "Server error deleting smart meter" })
  }
})

// Companies routes
app.get("/api/companies", authenticateToken, async (req, res) => {
  try {
    const companies = await db.manyOrNone(`
      SELECT c.*, 
             COUNT(DISTINCT a.id) as assigned_meters_count,
             u.first_name || ' ' || u.last_name as created_by_name
      FROM companies c
      LEFT JOIN assignments a ON c.id = a.company_id
      LEFT JOIN users u ON c.created_by = u.id
      GROUP BY c.id, u.first_name, u.last_name
      ORDER BY c.created_at DESC
    `)

    return res.status(200).json(companies)
  } catch (error) {
    console.error("Error fetching companies:", error)
    return res.status(500).json({ message: "Server error fetching companies" })
  }
})

app.post("/api/companies", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const {
      name,
      industry,
      address,
      city,
      state,
      postal_code,
      country,
      contact_name,
      contact_email,
      contact_phone,
      status,
    } = req.body

    // Insert new company
    const newCompany = await db.one(
      `
      INSERT INTO companies (
        name, industry, address, city, state, postal_code, country,
        contact_name, contact_email, contact_phone, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *
    `,
      [
        name,
        industry,
        address,
        city,
        state,
        postal_code,
        country,
        contact_name,
        contact_email,
        contact_phone,
        status || "active",
        req.user.id,
      ],
    )

    return res.status(201).json(newCompany)
  } catch (error) {
    console.error("Error creating company:", error)
    return res.status(500).json({ message: "Server error creating company" })
  }
})

app.put("/api/companies/:id", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      industry,
      address,
      city,
      state,
      postal_code,
      country,
      contact_name,
      contact_email,
      contact_phone,
      status,
    } = req.body

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [id])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Update company
    const updatedCompany = await db.one(
      `
      UPDATE companies SET
        name = $1,
        industry = $2,
        address = $3,
        city = $4,
        state = $5,
        postal_code = $6,
        country = $7,
        contact_name = $8,
        contact_email = $9,
        contact_phone = $10,
        status = $11,
        updated_at = NOW(),
        updated_by = $12
      WHERE id = $13
      RETURNING *
    `,
      [
        name,
        industry,
        address,
        city,
        state,
        postal_code,
        country,
        contact_name,
        contact_email,
        contact_phone,
        status,
        req.user.id,
        id,
      ],
    )

    return res.status(200).json(updatedCompany)
  } catch (error) {
    console.error("Error updating company:", error)
    return res.status(500).json({ message: "Server error updating company" })
  }
})

app.delete("/api/companies/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [id])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Check if company has assignments
    const assignments = await db.oneOrNone("SELECT id FROM assignments WHERE company_id = $1 LIMIT 1", [id])
    if (assignments) {
      return res.status(409).json({ message: "Cannot delete company with active assignments" })
    }

    // Delete company
    await db.none("DELETE FROM companies WHERE id = $1", [id])

    return res.status(200).json({ message: "Company deleted successfully" })
  } catch (error) {
    console.error("Error deleting company:", error)
    return res.status(500).json({ message: "Server error deleting company" })
  }
})

// Assignments routes
app.get("/api/assignments", authenticateToken, async (req, res) => {
  try {
    const assignments = await db.manyOrNone(`
      SELECT a.*,
             c.name as company_name,
             sm.serial_number as meter_serial_number,
             u.first_name || ' ' || u.last_name as created_by_name
      FROM assignments a
      JOIN companies c ON a.company_id = c.id
      JOIN smart_meters sm ON a.smart_meter_id = sm.id
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
    `)

    return res.status(200).json(assignments)
  } catch (error) {
    console.error("Error fetching assignments:", error)
    return res.status(500).json({ message: "Server error fetching assignments" })
  }
})

app.post("/api/assignments", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { company_id, smart_meter_id, location_details, installation_notes, status } = req.body

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [company_id])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Check if smart meter exists and is available
    const smartMeter = await db.oneOrNone("SELECT id, status FROM smart_meters WHERE id = $1", [smart_meter_id])
    if (!smartMeter) {
      return res.status(404).json({ message: "Smart meter not found" })
    }

    if (smartMeter.status !== "available") {
      return res.status(409).json({ message: "Smart meter is not available for assignment" })
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // Create assignment
      const newAssignment = await t.one(
        `
        INSERT INTO assignments (
          company_id, smart_meter_id, location_details, installation_notes, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
      `,
        [company_id, smart_meter_id, location_details, installation_notes, status || "active", req.user.id],
      )

      // Update smart meter status
      await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["assigned", smart_meter_id])

      return res.status(201).json(newAssignment)
    })
  } catch (error) {
    console.error("Error creating assignment:", error)
    return res.status(500).json({ message: "Server error creating assignment" })
  }
})

app.put("/api/assignments/:id", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { id } = req.params
    const { location_details, installation_notes, status } = req.body

    // Check if assignment exists
    const assignment = await db.oneOrNone("SELECT id FROM assignments WHERE id = $1", [id])
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" })
    }

    // Update assignment
    const updatedAssignment = await db.one(
      `
      UPDATE assignments SET
        location_details = $1,
        installation_notes = $2,
        status = $3,
        updated_at = NOW(),
        updated_by = $4
      WHERE id = $5
      RETURNING *
    `,
      [location_details, installation_notes, status, req.user.id, id],
    )

    return res.status(200).json(updatedAssignment)
  } catch (error) {
    console.error("Error updating assignment:", error)
    return res.status(500).json({ message: "Server error updating assignment" })
  }
})

app.delete("/api/assignments/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    // Check if assignment exists
    const assignment = await db.oneOrNone("SELECT id, smart_meter_id FROM assignments WHERE id = $1", [id])
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" })
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // Delete assignment
      await t.none("DELETE FROM assignments WHERE id = $1", [id])

      // Update smart meter status back to available
      await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["available", assignment.smart_meter_id])

      return res.status(200).json({ message: "Assignment deleted successfully" })
    })
  } catch (error) {
    console.error("Error deleting assignment:", error)
    return res.status(500).json({ message: "Server error deleting assignment" })
  }
})

// Users routes
app.get("/api/users", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const users = await db.manyOrNone(`
      SELECT id, email, first_name, last_name, role, status, created_at, updated_at, 
             require_password_change, last_login_at
      FROM users
      ORDER BY created_at DESC
    `)

    return res.status(200).json(users)
  } catch (error) {
    console.error("Error fetching users:", error)
    return res.status(500).json({ message: "Server error fetching users" })
  }
})

app.post("/api/users", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, status } = req.body

    // Check if email already exists
    const existingUser = await db.oneOrNone("SELECT id FROM users WHERE email = $1", [email])
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists" })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Insert new user
    const newUser = await db.one(
      `
      INSERT INTO users (
        email, password_hash, first_name, last_name, role, status, 
        require_password_change, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role, status
    `,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        role,
        status || "active",
        true, // Require password change on first login
        req.user.id,
      ],
    )

    return res.status(201).json(newUser)
  } catch (error) {
    console.error("Error creating user:", error)
    return res.status(500).json({ message: "Server error creating user" })
  }
})

app.put("/api/users/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    const { email, first_name, last_name, role, status } = req.body

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [id])
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Update user
    const updatedUser = await db.one(
      `
      UPDATE users SET
        email = $1,
        first_name = $2,
        last_name = $3,
        role = $4,
        status = $5,
        updated_at = NOW(),
        updated_by = $6
      WHERE id = $7
      RETURNING id, email, first_name, last_name, role, status
    `,
      [email, first_name, last_name, role, status, req.user.id, id],
    )

    return res.status(200).json(updatedUser)
  } catch (error) {
    console.error("Error updating user:", error)
    return res.status(500).json({ message: "Server error updating user" })
  }
})

app.delete("/api/users/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [id])
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Prevent self-deletion
    if (id === req.user.id) {
      return res.status(400).json({ message: "Cannot delete your own account" })
    }

    // Delete user
    await db.none("DELETE FROM users WHERE id = $1", [id])

    return res.status(200).json({ message: "User deleted successfully" })
  } catch (error) {
    console.error("Error deleting user:", error)
    return res.status(500).json({ message: "Server error deleting user" })
  }
})

// Reset password (admin function)
app.post("/api/users/:id/reset-password", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    const { newPassword } = req.body

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [id])
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword, salt)

    // Update password and set require_password_change flag
    await db.none(
      "UPDATE users SET password_hash = $1, require_password_change = true, updated_at = NOW(), updated_by = $2 WHERE id = $3",
      [hashedPassword, req.user.id, id],
    )

    return res.status(200).json({ message: "Password reset successfully" })
  } catch (error) {
    console.error("Password reset error:", error)
    return res.status(500).json({ message: "Server error during password reset" })
  }
})

// Get manufacturers
app.get("/api/manufacturers", authenticateToken, async (req, res) => {
  try {
    const manufacturers = await db.manyOrNone("SELECT * FROM manufacturers ORDER BY name")
    return res.status(200).json(manufacturers)
  } catch (error) {
    console.error("Error fetching manufacturers:", error)
    return res.status(500).json({ message: "Server error fetching manufacturers" })
  }
})

// Get meter models by manufacturer
app.get("/api/manufacturers/:id/models", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const models = await db.manyOrNone("SELECT * FROM meter_models WHERE manufacturer_id = $1 ORDER BY name", [id])
    return res.status(200).json(models)
  } catch (error) {
    console.error("Error fetching meter models:", error)
    return res.status(500).json({ message: "Server error fetching meter models" })
  }
})

app.get("/api/devices/smart-meters", authenticateToken, async (req, res) => {
  try {
    const { status, manufacturer, search, limit = 10, offset = 0 } = req.query

    let query = `
      SELECT sm.id, sm.serial_number, sm.status, sm.firmware_version, sm.last_seen, sm.notes,
             dm.id as model_id, dm.model_name, m.name as manufacturer,
             a.id as assignment_id, c.id as company_id, c.name as company_name
      FROM smart_meters sm
      JOIN device_models dm ON sm.model_id = dm.id
      JOIN manufacturers m ON dm.manufacturer_id = m.id
      LEFT JOIN smart_meter_assignments sma ON sm.id = sma.smart_meter_id
      LEFT JOIN assignments a ON sma.assignment_id = a.id
      LEFT JOIN companies c ON a.company_id = c.id
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 1

    if (status && status !== "all") {
      query += ` AND sm.status = $${paramCount}`
      queryParams.push(status)
      paramCount++
    }

    if (manufacturer) {
      query += ` AND m.id = $${paramCount}`
      queryParams.push(manufacturer)
      paramCount++
    }

    if (search) {
      query += ` AND (sm.serial_number ILIKE $${paramCount} OR dm.model_name ILIKE $${paramCount} OR m.name ILIKE $${paramCount})`
      queryParams.push(`%${search}%`)
      paramCount++
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`
    const countResult = await db.one(countQuery, queryParams)
    const total = Number.parseInt(countResult.count)

    // Add pagination
    query += ` ORDER BY sm.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`
    queryParams.push(limit, offset)

    const result = await db.manyOrNone(query, queryParams)

    const smartMeters = result.map((meter) => ({
      id: meter.id,
      serial_number: meter.serial_number,
      model: {
        id: meter.model_id,
        model_name: meter.model_name,
        manufacturer: meter.manufacturer,
      },
      status: meter.status,
      firmware_version: meter.firmware_version,
      last_seen: meter.last_seen,
      notes: meter.notes,
      assigned: !!meter.assignment_id,
      assignedTo: meter.company_name || null,
    }))

    res.json({
      data: smartMeters,
      pagination: {
        total,
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching smart meters:", error)
    res.status(500).json({ message: "Server error while fetching smart meters" })
  }
})

// Companies routes with facilities
app.get("/api/companies-with-facilities", authenticateToken, async (req, res) => {
  try {
    const result = await db.manyOrNone(`
      SELECT c.id, c.name, c.address, c.contact_name, c.contact_email, c.contact_phone, 
             c.status, c.notes, c.created_at,
             (SELECT COUNT(*) FROM facilities f WHERE f.company_id = c.id) as facilities_count,
             (SELECT COUNT(*) FROM facilities f 
              JOIN departments d ON f.id = d.facility_id 
              WHERE f.company_id = c.id) as departments_count
      FROM companies c
      ORDER BY c.name
    `)

    res.json({ data: result })
  } catch (error) {
    console.error("Error fetching companies:", error)
    res.status(500).json({ message: "Server error while fetching companies" })
  }
})

app.get("/api/companies/:id/facilities", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const result = await db.manyOrNone(
      `
      SELECT id, name, location, address, contact_name, contact_email, contact_phone, notes
      FROM facilities
      WHERE company_id = $1
      ORDER BY name
    `,
      [id],
    )

    res.json({ data: result })
  } catch (error) {
    console.error("Error fetching facilities:", error)
    res.status(500).json({ message: "Server error while fetching facilities" })
  }
})

app.get("/api/facilities/:id/departments", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const result = await db.manyOrNone(
      `
      SELECT id, name, notes
      FROM departments
      WHERE facility_id = $1
      ORDER BY name
    `,
      [id],
    )

    res.json({ data: result })
  } catch (error) {
    console.error("Error fetching departments:", error)
    res.status(500).json({ message: "Server error while fetching departments" })
  }
})

// Subscription routes
app.get("/api/subscription-plans", authenticateToken, async (req, res) => {
  try {
    const result = await db.manyOrNone(`
      SELECT id, name, description, price_monthly, price_annually, 
             meters_allowed, users_allowed, features
      FROM subscription_plans
      WHERE is_active = TRUE
      ORDER BY price_monthly
    `)

    res.json({ data: result })
  } catch (error) {
    console.error("Error fetching subscription plans:", error)
    res.status(500).json({ message: "Server error while fetching subscription plans" })
  }
})

app.get("/api/subscriptions", authenticateToken, async (req, res) => {
  try {
    const result = await db.manyOrNone(`
      SELECT s.id, s.status, s.start_date, s.end_date, s.billing_cycle, 
           s.next_billing_date, s.amount, s.payment_method,
           c.id as company_id, c.name as company_name,
           sp.id as plan_id, sp.name as plan_name, 
           sp.meters_allowed, sp.users_allowed,
           (SELECT COUNT(*) FROM assignments a 
            WHERE a.company_id = c.id) as meters_used,
           (SELECT COUNT(*) FROM users u 
            WHERE u.company_id = c.id) as users_used
    FROM subscriptions s
    JOIN companies c ON s.company_id = c.id
    JOIN subscription_plans sp ON s.plan_id = sp.id
    ORDER BY s.next_billing_date
  `)

    const subscriptions = result.map((sub) => ({
      id: sub.id,
      company: {
        id: sub.company_id,
        name: sub.company_name,
      },
      plan: sub.plan_name,
      status: sub.status,
      startDate: sub.start_date,
      endDate: sub.end_date,
      billingCycle: sub.billing_cycle,
      nextBillingDate: sub.next_billing_date,
      amount: sub.amount,
      paymentMethod: sub.payment_method,
      metersAllowed: sub.meters_allowed,
      usersAllowed: sub.users_allowed,
      metersUsed: Number.parseInt(sub.meters_used),
      usersUsed: Number.parseInt(sub.users_used),
    }))

    res.json({ data: subscriptions })
  } catch (error) {
    console.error("Error fetching subscriptions:", error)
    res.status(500).json({ message: "Server error while fetching subscriptions" })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ message: "Something went wrong!" })
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

module.exports = app

