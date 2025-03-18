const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const { Pool } = require("pg")
const dotenv = require("dotenv")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcrypt")
const { v4: uuidv4 } = require("uuid")
const rateLimit = require("express-rate-limit")

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 3001

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
})

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
app.use(morgan("combined")) // Logging

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
})
// Apply rate limiting to all routes
app.use(apiLimiter)

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) return res.status(401).json({ message: "Authentication required" })

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" })
    req.user = user

    // Set user ID for audit logs
    pool
      .query("SET LOCAL app.current_user_id = $1", [user.id])
      .then(() => next())
      .catch((error) => {
        console.error("Error setting user context:", error)
        next()
      })
  })
}

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Energy Management SaaS API" })
})

// Auth routes
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body

  console.log("Login attempt:", { email, password })

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" })
  }

  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const userResult = await pool.query(
        "SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.is_active, u.require_password_change, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = $1",
        [email],
      )

      if (userResult.rows.length === 0) {
        return res.status(401).json({ message: "Invalid credentials" })
      }

      const user = userResult.rows[0]

      if (!user.is_active) {
        return res.status(401).json({ message: "Account is inactive" })
      }

      const validPassword = await bcrypt.compare(password, user.password_hash)
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" })
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.first_name,
          lastName: user.last_name,
        },
        process.env.JWT_SECRET,
        { expiresIn: "8h" },
      )

      await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id])

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          requirePasswordChange: user.require_password_change,
        },
        token,
      })
    } catch (error) {
      if (error.code === 'ECONNRESET') {
        console.error("Database connection was reset. Retrying...")
        attempt++
        if (attempt >= maxRetries) {
          return res.status(500).json({ message: "Server error during login after multiple attempts" })
        }
      } else {
        console.error("Login error:", error)
        return res.status(500).json({ message: "Server error during login" })
      }
    }
  }
})

app.post("/api/auth/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, role = "customer" } = req.body

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" })
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email])

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Email already in use" })
    }

    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [role])

    if (roleResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid role" })
    }

    const roleId = roleResult.rows[0].id

    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    const newUser = await pool.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [firstName, lastName, email, passwordHash, roleId],
    )

    res.status(201).json({
      message: "User registered successfully",
      userId: newUser.rows[0].id,
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

    const userResult = await pool.query(
      "SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()",
      [token],
    )

    if (userResult.rows.length === 0) {
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

    const userResult = await pool.query(
      "SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()",
      [token],
    )

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired token" })
    }

    const userId = userResult.rows[0].id

    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    await pool.query(
      "UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, require_password_change = FALSE, updated_at = NOW() WHERE id = $2",
      [passwordHash, userId],
    )

    res.json({ message: "Password updated successfully" })
  } catch (error) {
    console.error("Set password error:", error)
    res.status(500).json({ message: "Server error during password update" })
  }
})

// User routes
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    if (!["admin", "operator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" })
    }

    const result = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, 
             r.name as role, u.created_at, u.last_login,
             c.id as company_id, c.name as company_name,
             f.id as facility_id, f.name as facility_name,
             d.id as department_id, d.name as department_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_companies uc ON u.id = uc.user_id AND uc.is_primary = TRUE
      LEFT JOIN companies c ON uc.company_id = c.id
      LEFT JOIN facilities f ON uc.facility_id = f.id
      LEFT JOIN departments d ON uc.department_id = d.id
      ORDER BY u.created_at DESC
    `)

    const users = result.rows.map((user) => ({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone,
      is_active: user.is_active,
      role: user.role,
      created_at: user.created_at,
      last_login: user.last_login,
      company: user.company_id
        ? {
            id: user.company_id,
            name: user.company_name,
          }
        : null,
      facility: user.facility_id
        ? {
            id: user.facility_id,
            name: user.facility_name,
          }
        : null,
      department: user.department_id
        ? {
            id: user.department_id,
            name: user.department_name,
          }
        : null,
    }))

    res.json({ data: users })
  } catch (error) {
    console.error("Error fetching users:", error)
    res.status(500).json({ message: "Server error while fetching users" })
  }
})

app.post("/api/users", authenticateToken, async (req, res) => {
  try {
    if (!["admin", "operator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" })
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      role,
      status,
      company_id,
      facility_id,
      department_id,
      password,
      require_password_change = true,
    } = req.body

    if (!first_name || !last_name || !email || !role) {
      return res.status(400).json({ message: "Required fields missing" })
    }

    const client = await pool.connect()

    try {
      await client.query("BEGIN")

      const roleResult = await client.query("SELECT id FROM roles WHERE name = $1", [role])

      if (roleResult.rows.length === 0) {
        return res.status(400).json({ message: "Invalid role" })
      }

      const roleId = roleResult.rows[0].id

      let passwordHash = null
      if (password) {
        const salt = await bcrypt.genSalt(10)
        passwordHash = await bcrypt.hash(password, salt)
      }

      const newUserResult = await client.query(
        `INSERT INTO users (
          first_name, last_name, email, phone, password_hash, 
          role_id, is_active, require_password_change, created_by
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING id`,
        [
          first_name,
          last_name,
          email,
          phone,
          passwordHash,
          roleId,
          status === "active",
          require_password_change,
          req.user.id,
        ],
      )

      const userId = newUserResult.rows[0].id

      if (company_id) {
        await client.query(
          `INSERT INTO user_companies (
            user_id, company_id, facility_id, department_id, is_primary
          ) 
          VALUES ($1, $2, $3, $4, TRUE)`,
          [userId, company_id, facility_id || null, department_id || null],
        )
      }

      await client.query("COMMIT")

      res.status(201).json({
        message: "User created successfully",
        userId: userId,
      })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error creating user:", error)
    res.status(500).json({ message: "Server error while creating user" })
  }
})

app.post("/api/users/:id/reset-password", authenticateToken, async (req, res) => {
  try {
    if (!["admin", "operator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" })
    }

    const { id } = req.params

    const resetToken = uuidv4()
    const resetExpires = new Date()
    resetExpires.setHours(resetExpires.getHours() + 24)

    await pool.query(
      "UPDATE users SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW() WHERE id = $3",
      [resetToken, resetExpires, id],
    )

    const userResult = await pool.query("SELECT email FROM users WHERE id = $1", [id])

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" })
    }

    const userEmail = userResult.rows[0].email
    const resetLink = `${process.env.FRONTEND_URL}/set-password?token=${resetToken}`

    console.log(`Password reset link for ${userEmail}: ${resetLink}`)

    res.json({
      message: "Password reset email sent",
      ...(process.env.NODE_ENV !== "production" && { resetLink }),
    })
  } catch (error) {
    console.error("Error resetting password:", error)
    res.status(500).json({ message: "Server error while resetting password" })
  }
})

app.post("/api/users/:id/manual-reset", authenticateToken, async (req, res) => {
  try {
    if (!["admin", "operator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" })
    }

    const { id } = req.params
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ message: "Password is required" })
    }

    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    await pool.query(
      "UPDATE users SET password_hash = $1, require_password_change = TRUE, updated_at = NOW(), updated_by = $2 WHERE id = $3",
      [passwordHash, req.user.id, id],
    )

    res.json({ message: "Password reset successfully" })
  } catch (error) {
    console.error("Error manually resetting password:", error)
    res.status(500).json({ message: "Server error while resetting password" })
  }
})

// Smart Meters routes
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

    const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`
    const countResult = await pool.query(countQuery, queryParams)
    const total = Number.parseInt(countResult.rows[0].count)

    query += ` ORDER BY sm.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`
    queryParams.push(limit, offset)

    const result = await pool.query(query, queryParams)

    const smartMeters = result.rows.map((meter) => ({
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

// -------------------------------
// Companies & Related Entities Routes
// -------------------------------

// GET companies (existing endpoint)
app.get("/api/companies", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.address, c.contact_name, c.contact_email, c.contact_phone, 
             c.status, c.notes, c.created_at,
             (SELECT COUNT(*) FROM facilities f WHERE f.company_id = c.id) as facilities_count,
             (SELECT COUNT(*) FROM facilities f 
              JOIN departments d ON f.id = d.facility_id 
              WHERE f.company_id = c.id) as departments_count
      FROM companies c
      ORDER BY c.name
    `)
    res.json({ data: result.rows })
  } catch (error) {
    console.error("Error fetching companies:", error)
    res.status(500).json({ message: "Server error while fetching companies" })
  }
})

// NEW ENDPOINT: Create a new company
app.post("/api/companies", authenticateToken, async (req, res) => {
  try {
    const { name, address, contact_name, contact_email, contact_phone, status, notes } = req.body

    if (!name || !contact_name || !contact_email) {
      return res.status(400).json({ message: "Name, contact name, and contact email are required" })
    }

    const result = await pool.query(
      `INSERT INTO companies (name, address, contact_name, contact_email, contact_phone, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, address, contact_name, contact_email, contact_phone, status || "lead", notes || null]
    )

    res.status(201).json({ data: result.rows[0] })
  } catch (error) {
    console.error("Error creating company:", error)
    res.status(500).json({ message: "Server error while creating company" })
  }
})

// NEW ENDPOINT: Create a new facility for a company
app.post("/api/companies/:companyId/facilities", authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params
    const { name, location, address, contact_name, contact_email, contact_phone, notes } = req.body

    if (!name) {
      return res.status(400).json({ message: "Facility name is required" })
    }

    const result = await pool.query(
      `INSERT INTO facilities (company_id, name, location, address, contact_name, contact_email, contact_phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [companyId, name, location, address, contact_name, contact_email, contact_phone, notes || null]
    )

    res.status(201).json({ data: result.rows[0] })
  } catch (error) {
    console.error("Error creating facility:", error)
    res.status(500).json({ message: "Server error while creating facility" })
  }
})

// NEW ENDPOINT: Create a new department for a facility
app.post("/api/facilities/:facilityId/departments", authenticateToken, async (req, res) => {
  try {
    const { facilityId } = req.params
    const { name, notes } = req.body

    if (!name) {
      return res.status(400).json({ message: "Department name is required" })
    }

    const result = await pool.query(
      `INSERT INTO departments (facility_id, name, notes)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [facilityId, name, notes || null]
    )

    res.status(201).json({ data: result.rows[0] })
  } catch (error) {
    console.error("Error creating department:", error)
    res.status(500).json({ message: "Server error while creating department" })
  }
})

// Facilities & Departments read routes
app.get("/api/companies/:id/facilities", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT id, name, location, address, contact_name, contact_email, contact_phone, notes
       FROM facilities
       WHERE company_id = $1
       ORDER BY name`,
      [id],
    )
    res.json({ data: result.rows })
  } catch (error) {
    console.error("Error fetching facilities:", error)
    res.status(500).json({ message: "Server error while fetching facilities" })
  }
})

app.get("/api/facilities/:id/departments", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT id, name, notes
       FROM departments
       WHERE facility_id = $1
       ORDER BY name`,
      [id],
    )
    res.json({ data: result.rows })
  } catch (error) {
    console.error("Error fetching departments:", error)
    res.status(500).json({ message: "Server error while fetching departments" })
  }
})

// Subscription routes
app.get("/api/subscription-plans", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, price_monthly, price_annually, 
             meters_allowed, users_allowed, features
      FROM subscription_plans
      WHERE is_active = TRUE
      ORDER BY price_monthly
    `)
    res.json({ data: result.rows })
  } catch (error) {
    console.error("Error fetching subscription plans:", error)
    res.status(500).json({ message: "Server error while fetching subscription plans" })
  }
})

app.get("/api/subscriptions", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.status, s.start_date, s.end_date, s.billing_cycle, 
             s.next_billing_date, s.amount, s.payment_method,
             c.id as company_id, c.name as company_name,
             sp.id as plan_id, sp.name as plan_name, 
             sp.meters_allowed, sp.users_allowed,
             (SELECT COUNT(*) FROM assignments a 
              JOIN smart_meter_assignments sma ON a.id = sma.assignment_id
              WHERE a.company_id = c.id) as meters_used,
             (SELECT COUNT(*) FROM user_companies uc 
              WHERE uc.company_id = c.id) as users_used
      FROM subscriptions s
      JOIN companies c ON s.company_id = c.id
      JOIN subscription_plans sp ON s.plan_id = sp.id
      ORDER BY s.next_billing_date
    `)

    const subscriptions = result.rows.map((sub) => ({
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
