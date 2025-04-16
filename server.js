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


// Add rate limiting configuration before defining routes
// Create a rate limiter for general API endpoints


// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  console.log("Auth header:", authHeader)
  console.log("Token:", token ? token.substring(0, 20) + "..." : "No token")

  if (!token) return res.status(401).json({ message: "Authentication required" })

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("Token verification error:", err)
      return res.status(403).json({ message: "Invalid or expired token" })
    }

    // Add the decoded user info to the request
    req.user = user
    console.log("Authenticated user:", JSON.stringify(req.user))
    next()
  })
}


const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes',
  keyGenerator: (req) => {
    // Use user ID if available, otherwise use IP
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for certain paths that don't need it
    const skipPaths = ['/api/auth/login', '/api/auth/register'];
    return skipPaths.includes(req.path);
  }
});

// Create a more lenient limiter for user company relationships
// These are the endpoints causing the 429s
const userCompanyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP/user to 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests for user company data, please try again after a minute',
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Apply the specific rate limiter to the user-companies endpoint
app.use('/api/user-companies', userCompanyLimiter);

// Add a route to check rate limit status - helpful for debugging
app.get('/api/rate-limit-status', authenticateToken, (req, res) => {
  const userOrIp = req.user?.id || req.ip;
  const apiLimitInfo = apiLimiter.store.hits[userOrIp] || { current: 0, limit: apiLimiter.max };
  const userCompanyLimitInfo = userCompanyLimiter.store.hits[userOrIp] || { current: 0, limit: userCompanyLimiter.max };
  
  res.json({
    apiLimit: {
      current: apiLimitInfo.current,
      limit: apiLimitInfo.limit,
      remaining: apiLimitInfo.limit - apiLimitInfo.current,
      resetTime: new Date(Date.now() + apiLimiter.windowMs)
    },
    userCompanyLimit: {
      current: userCompanyLimitInfo.current,
      limit: userCompanyLimitInfo.limit, 
      remaining: userCompanyLimitInfo.limit - userCompanyLimitInfo.current,
      resetTime: new Date(Date.now() + userCompanyLimiter.windowMs)
    }
  });
});


// Check if user has required role
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Authentication required" })

    console.log("Checking roles:", {
      userRole: req.user.role,
      userRoleId: req.user.role_id,
      requiredRoles: roles,
    })

    // Get role name if we have role_id but no role name
    const rolePromise = req.user.role_id && !req.user.role 
      ? db.oneOrNone("SELECT name FROM roles WHERE id = $1", [req.user.role_id])
      : Promise.resolve(null);
      
    rolePromise.then(roleResult => {
      const roleName = roleResult ? roleResult.name.toLowerCase() : null;
      
      // Check various ways to determine role
      const hasRequiredRole = 
        // Check by role name if available in token
        (req.user.role && roles.includes(req.user.role.toLowerCase())) ||
        // Check by role name from DB lookup
        (roleName && roles.includes(roleName)) ||
        // Check by role_id if it matches admin UUID
        (req.user.role_id === "615b2efa-ea1b-44b5-8753-04dc5cf29b84") ||
        // Special case for admin role by name
        (req.user.role && req.user.role.toLowerCase() === "admin");
      
      if (!hasRequiredRole) {
        console.log("Access denied for user:", req.user)
        return res.status(403).json({ message: "Access denied: Insufficient permissions" })
      }
      
      next()
    }).catch(error => {
      console.error("Error checking role:", error);
      return res.status(500).json({ message: "Error checking permissions" });
    });
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
app.get("/api/devices/smart-meters", authenticateToken, async (req, res) => {
  try {
    const { status, manufacturer, search, limit = 10, offset = 0 } = req.query

    let query = `
      SELECT sm.id, sm.serial_number, sm.status, sm.firmware_version, sm.last_seen, sm.notes,
             dm.id as model_id, dm.model_name, m.name as manufacturer,
             sma.id as assignment_id, c.id as company_id, c.name as company_name
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
    res.status(500).json({
      message: "Server error while fetching smart meters",
      details: error.message,
      stack: error.stack,
    })
  }
})

app.post("/api/devices/smart-meters", authenticateToken, async (req, res) => {
  try {
    const { serial_number, manufacturer_id, model_id, firmware_version, communication_protocol, status, notes } =
      req.body

    console.log("Creating smart meter with data:", req.body)

    // Check if serial number already exists
    const existing = await db.oneOrNone("SELECT id FROM smart_meters WHERE serial_number = $1", [serial_number])
    if (existing) {
      return res.status(409).json({ message: "Smart meter with this serial number already exists" })
    }

    // Insert new smart meter
    const newSmartMeter = await db.one(
      `
      INSERT INTO smart_meters (
        serial_number, model_id, firmware_version, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `,
      [serial_number, model_id, firmware_version || null, status || "available", notes || null, req.user.id],
    )

    console.log("Smart meter created successfully:", newSmartMeter)
    return res.status(201).json(newSmartMeter)
  } catch (error) {
    console.error("Error creating smart meter:", error)
    return res.status(500).json({
      message: "Server error creating smart meter",
      details: error.message,
      stack: error.stack,
    })
  }
})

app.get("/api/devices/smart-meters/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const smartMeter = await db.oneOrNone(
      `
      SELECT sm.*, dm.model_name, m.name as manufacturer_name
      FROM smart_meters sm
      JOIN device_models dm ON sm.model_id = dm.id
      JOIN manufacturers m ON dm.manufacturer_id = m.id
      WHERE sm.id = $1
    `,
      [id],
    )

    if (!smartMeter) {
      return res.status(404).json({ message: "Smart meter not found" })
    }

    return res.status(200).json(smartMeter)
  } catch (error) {
    console.error("Error fetching smart meter:", error)
    return res.status(500).json({
      message: "Server error fetching smart meter",
      details: error.message,
      stack: error.stack,
    })
  }
})

app.put("/api/devices/smart-meters/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { serial_number, model_id, firmware_version, status, notes } = req.body

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
        model_id = $2,
        firmware_version = $3,
        status = $4,
        notes = $5,
        updated_at = NOW(),
        updated_by = $6
      WHERE id = $7
      RETURNING *
    `,
      [serial_number, model_id, firmware_version || null, status || "available", notes || null, req.user.id, id],
    )

    return res.status(200).json(updatedSmartMeter)
  } catch (error) {
    console.error("Error updating smart meter:", error)
    return res.status(500).json({
      message: "Server error updating smart meter",
      details: error.message,
      stack: error.stack,
    })
  }
})

app.delete("/api/devices/smart-meters/:id", authenticateToken, async (req, res) => {
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
    return res.status(500).json({
      message: "Server error deleting smart meter",
      details: error.message,
      stack: error.stack,
    })
  }
})

// Add these routes after the smart meters routes

// Edge Gateways routes
app.get("/api/devices/edge-gateways", authenticateToken, async (req, res) => {
  try {
    const { status, manufacturer, search, limit = 10, offset = 0 } = req.query

    let query = `
      SELECT eg.*, dm.id as model_id, dm.model_name, m.name as manufacturer_name, m.id as manufacturer_id
      FROM edge_gateways eg
      LEFT JOIN device_models dm ON eg.model_id = dm.id
      LEFT JOIN manufacturers m ON dm.manufacturer_id = m.id
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 1

    if (status && status !== "all") {
      query += ` AND eg.status = $${paramCount}`
      queryParams.push(status)
      paramCount++
    }

    if (manufacturer) {
      query += ` AND m.id = $${paramCount}`
      queryParams.push(manufacturer)
      paramCount++
    }

    if (search) {
      query += ` AND (eg.serial_number ILIKE $${paramCount} OR dm.name ILIKE $${paramCount} OR m.name ILIKE $${paramCount})`
      queryParams.push(`%${search}%`)
      paramCount++
    }

    // Count total
    const countQuery = `SELECT COUNT(*) FROM (${query}) as count_query`
    const countResult = await db.one(countQuery, queryParams)
    const total = Number.parseInt(countResult.count)

    // Add pagination
    query += ` ORDER BY eg.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`
    queryParams.push(limit, offset)

    const edgeGateways = await db.manyOrNone(query, queryParams)

    return res.status(200).json({
      data: edgeGateways,
      pagination: {
        total,
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching edge gateways:", error)
    return res.status(500).json({ message: "Server error fetching edge gateways" })
  }
})

app.post("/api/devices/edge-gateways", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { serial_number, manufacturer_id, model_id, mac_address, firmware_version, status, notes } = req.body

    // Check if serial number already exists
    const existing = await db.oneOrNone("SELECT id FROM edge_gateways WHERE serial_number = $1", [serial_number])
    if (existing) {
      return res.status(409).json({ message: "Edge gateway with this serial number already exists" })
    }

    // Insert new edge gateway
    const newEdgeGateway = await db.one(
      `
      INSERT INTO edge_gateways (
        serial_number, model_id, mac_address, firmware_version, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `,
      [
        serial_number,
        model_id,
        mac_address || null,
        firmware_version || null,
        status || "available",
        notes || null,
        req.user.id,
      ],
    )

    return res.status(201).json(newEdgeGateway)
  } catch (error) {
    console.error("Error creating edge gateway:", error)
    return res.status(500).json({ message: "Server error creating edge gateway" })
  }
})

app.get("/api/devices/edge-gateways/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const edgeGateway = await db.oneOrNone(
      `
      SELECT eg.*, dm.name as model_name, m.name as manufacturer_name, m.id as manufacturer_id
      FROM edge_gateways eg
      LEFT JOIN device_models dm ON eg.model_id = dm.id
      LEFT JOIN manufacturers m ON dm.manufacturer_id = m.id
      WHERE eg.id = $1
    `,
      [id],
    )

    if (!edgeGateway) {
      return res.status(404).json({ message: "Edge gateway not found" })
    }

    return res.status(200).json(edgeGateway)
  } catch (error) {
    console.error("Error fetching edge gateway:", error)
    return res.status(500).json({ message: "Server error fetching edge gateway" })
  }
})

app.put("/api/devices/edge-gateways/:id", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { id } = req.params
    const { serial_number, model_id, mac_address, firmware_version, status, notes } = req.body

    // Check if edge gateway exists
    const edgeGateway = await db.oneOrNone("SELECT id FROM edge_gateways WHERE id = $1", [id])
    if (!edgeGateway) {
      return res.status(404).json({ message: "Edge gateway not found" })
    }

    // Update edge gateway
    const updatedEdgeGateway = await db.one(
      `
      UPDATE edge_gateways SET
        serial_number = $1,
        model_id = $2,
        mac_address = $3,
        firmware_version = $4,
        status = $5,
        notes = $6,
        updated_at = NOW(),
        updated_by = $7
      WHERE id = $8
      RETURNING *
    `,
      [
        serial_number,
        model_id,
        mac_address || null,
        firmware_version || null,
        status || "available",
        notes || null,
        req.user.id,
        id,
      ],
    )

    return res.status(200).json(updatedEdgeGateway)
  } catch (error) {
    console.error("Error updating edge gateway:", error)
    return res.status(500).json({ message: "Server error updating edge gateway" })
  }
})

app.delete("/api/devices/edge-gateways/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    // Check if edge gateway exists
    const edgeGateway = await db.oneOrNone("SELECT id FROM edge_gateways WHERE id = $1", [id])
    if (!edgeGateway) {
      return res.status(404).json({ message: "Edge gateway not found" })
    }

    // Delete edge gateway
    await db.none("DELETE FROM edge_gateways WHERE id = $1", [id])

    return res.status(200).json({ message: "Edge gateway deleted successfully" })
  } catch (error) {
    console.error("Error deleting edge gateway:", error)
    return res.status(500).json({ message: "Server error deleting edge gateway" })
  }
})

// IP Addresses for Edge Gateways
app.get("/api/devices/edge-gateways/:id/ip-addresses", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const ipAddresses = await db.manyOrNone(
      `
      SELECT * FROM edge_gateway_ip_addresses
      WHERE edge_gateway_id = $1
      ORDER BY created_at DESC
    `,
      [id],
    )

    return res.status(200).json({ data: ipAddresses })
  } catch (error) {
    console.error("Error fetching IP addresses:", error)
    return res.status(500).json({ message: "Server error fetching IP addresses" })
  }
})

app.post(
  "/api/devices/edge-gateways/:id/ip-addresses",
  authenticateToken,
  checkRole(["admin", "operator"]),
  async (req, res) => {
    try {
      const { id } = req.params
      const { ip_address, port } = req.body

      // Check if edge gateway exists
      const edgeGateway = await db.oneOrNone("SELECT id FROM edge_gateways WHERE id = $1", [id])
      if (!edgeGateway) {
        return res.status(404).json({ message: "Edge gateway not found" })
      }

      // Insert new IP address
      const newIpAddress = await db.one(
        `
      INSERT INTO edge_gateway_ip_addresses (
        edge_gateway_id, ip_address, port, created_by
      ) VALUES ($1, $2, $3, $4) RETURNING *
    `,
        [id, ip_address, port || null, req.user.id],
      )

      return res.status(201).json(newIpAddress)
    } catch (error) {
      console.error("Error adding IP address:", error)
      return res.status(500).json({ message: "Server error adding IP address" })
    }
  },
)

app.delete(
  "/api/devices/edge-gateways/:gatewayId/ip-addresses/:ipId",
  authenticateToken,
  checkRole(["admin", "operator"]),
  async (req, res) => {
    try {
      const { gatewayId, ipId } = req.params

      // Check if IP address exists and belongs to the gateway
      const ipAddress = await db.oneOrNone(
        "SELECT id FROM edge_gateway_ip_addresses WHERE id = $1 AND edge_gateway_id = $2",
        [ipId, gatewayId],
      )
      if (!ipAddress) {
        return res.status(404).json({ message: "IP address not found or does not belong to this gateway" })
      }

      // Delete IP address
      await db.none("DELETE FROM edge_gateway_ip_addresses WHERE id = $1", [ipId])

      return res.status(200).json({ message: "IP address removed successfully" })
    } catch (error) {
      console.error("Error removing IP address:", error)
      return res.status(500).json({ message: "Server error removing IP address" })
    }
  },
)

// Specifications for Edge Gateways
app.get("/api/devices/edge-gateways/:id/specifications", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const specifications = await db.oneOrNone(
      `
      SELECT * FROM edge_gateway_specifications
      WHERE edge_gateway_id = $1
    `,
      [id],
    )

    return res.status(200).json({ data: specifications || {} })
  } catch (error) {
    console.error("Error fetching specifications:", error)
    return res.status(500).json({ message: "Server error fetching specifications" })
  }
})

app.put(
  "/api/devices/edge-gateways/:id/specifications",
  authenticateToken,
  checkRole(["admin", "operator"]),
  async (req, res) => {
    try {
      const { id } = req.params
      const { os, os_version, cpu, memory, storage, connectivity, additional_specs } = req.body

      // Check if edge gateway exists
      const edgeGateway = await db.oneOrNone("SELECT id FROM edge_gateways WHERE id = $1", [id])
      if (!edgeGateway) {
        return res.status(404).json({ message: "Edge gateway not found" })
      }

      // Check if specifications already exist
      const existingSpecs = await db.oneOrNone(
        "SELECT id FROM edge_gateway_specifications WHERE edge_gateway_id = $1",
        [id],
      )

      let specs
      if (existingSpecs) {
        // Update existing specifications
        specs = await db.one(
          `
        UPDATE edge_gateway_specifications SET
          os = $1,
          os_version = $2,
          cpu = $3,
          memory = $4,
          storage = $5,
          connectivity = $6,
          additional_specs = $7,
          updated_at = NOW(),
          updated_by = $8
        WHERE edge_gateway_id = $9
        RETURNING *
      `,
          [
            os || null,
            os_version || null,
            cpu || null,
            memory || null,
            storage || null,
            connectivity || [],
            additional_specs || null,
            req.user.id,
            id,
          ],
        )
      } else {
        // Insert new specifications
        specs = await db.one(
          `
        INSERT INTO edge_gateway_specifications (
          edge_gateway_id, os, os_version, cpu, memory, storage, connectivity, additional_specs, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
      `,
          [
            id,
            os || null,
            os_version || null,
            cpu || null,
            memory || null,
            storage || null,
            connectivity || [],
            additional_specs || null,
            req.user.id,
          ],
        )
      }

      return res.status(200).json(specs)
    } catch (error) {
      console.error("Error updating specifications:", error)
      return res.status(500).json({ message: "Server error updating specifications" })
    }
  },
)

// Connection Details for Edge Gateways
app.get("/api/devices/edge-gateways/:id/connection-details", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const connectionDetails = await db.oneOrNone(
      `
      SELECT * FROM edge_gateway_connection_details
      WHERE edge_gateway_id = $1
    `,
      [id],
    )

    return res.status(200).json({ data: connectionDetails || {} })
  } catch (error) {
    console.error("Error fetching connection details:", error)
    return res.status(500).json({ message: "Server error fetching connection details" })
  }
})

app.put(
  "/api/devices/edge-gateways/:id/connection-details",
  authenticateToken,
  checkRole(["admin", "operator"]),
  async (req, res) => {
    try {
      const { id } = req.params
      const { ssh_username, ssh_password, ssh_key, web_interface_url, web_username, web_password, api_key, notes } =
        req.body

      // Check if edge gateway exists
      const edgeGateway = await db.oneOrNone("SELECT id FROM edge_gateways WHERE id = $1", [id])
      if (!edgeGateway) {
        return res.status(404).json({ message: "Edge gateway not found" })
      }

      // Check if connection details already exist
      const existingDetails = await db.oneOrNone(
        "SELECT id FROM edge_gateway_connection_details WHERE edge_gateway_id = $1",
        [id],
      )

      let details
      if (existingDetails) {
        // Update existing connection details
        details = await db.one(
          `
        UPDATE edge_gateway_connection_details SET
          ssh_username = $1,
          ssh_password = $2,
          ssh_key = $3,
          web_interface_url = $4,
          web_username = $5,
          web_password = $6,
          api_key = $7,
          notes = $8,
          updated_at = NOW(),
          updated_by = $9
        WHERE edge_gateway_id = $10
        RETURNING *
      `,
          [
            ssh_username || null,
            ssh_password || null,
            ssh_key || null,
            web_interface_url || null,
            web_username || null,
            web_password || null,
            api_key || null,
            notes || null,
            req.user.id,
            id,
          ],
        )
      } else {
        // Insert new connection details
        details = await db.one(
          `
        INSERT INTO edge_gateway_connection_details (
          edge_gateway_id, ssh_username, ssh_password, ssh_key, web_interface_url, web_username, web_password, api_key, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
      `,
          [
            id,
            ssh_username || null,
            ssh_password || null,
            ssh_key || null,
            web_interface_url || null,
            web_username || null,
            web_password || null,
            api_key || null,
            notes || null,
            req.user.id,
          ],
        )
      }

      return res.status(200).json(details)
    } catch (error) {
      console.error("Error updating connection details:", error)
      return res.status(500).json({ message: "Server error updating connection details" })
    }
  },
)

// Companies routes - IMPROVED ERROR HANDLING
app.post("/api/companies", authenticateToken, async (req, res) => {
  try {
    console.log("Creating company with user:", JSON.stringify(req.user)) // Debug log
    console.log("Company data:", JSON.stringify(req.body)) // Log the request body

    // TEMPORARILY COMMENT OUT ROLE CHECK FOR DEBUGGING
    // const isAdmin = req.user.role_id === "615b2efa-ea1b-44b5-8753-04dc5cf29b84" ||
    //                (req.user.role && req.user.role.toLowerCase() === "admin");
    // const isOperator = req.user.role_id === "operator-role-id" ||
    //                   (req.user.role && req.user.role.toLowerCase() === "operator");

    // if (!isAdmin && !isOperator) {
    //   return res.status(403).json({ message: "Access denied: Insufficient permissions" });
    // }

    // ALLOW ALL AUTHENTICATED USERS FOR NOW
    console.log("Role check bypassed for debugging")

    const {
      name,
      industry = null,
      address = null,
      city = null,
      state = null,
      postal_code = null,
      country = null,
      contact_name,
      contact_email,
      contact_phone = null,
      status = "active",
    } = req.body

    // Validate required fields
    if (!name || !contact_name || !contact_email) {
      return res.status(400).json({ message: "Name, contact name, and contact email are required" })
    }

    // Check if the companies table exists
    try {
      await db.one("SELECT 1 FROM information_schema.tables WHERE table_name = $1", ["companies"])
    } catch (error) {
      console.error("Companies table does not exist:", error)
      return res.status(500).json({ message: "Database schema error: companies table not found" })
    }

    // Check if the user exists
    try {
      const userExists = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [req.user.id])
      if (!userExists) {
        console.error("User not found:", req.user.id)
        return res.status(400).json({ message: "Invalid user ID" })
      }
    } catch (error) {
      console.error("Error checking user:", error)
      return res.status(500).json({ message: "Error validating user" })
    }

    // Insert new company with simplified query
    try {
      const newCompany = await db.one(
        `
        INSERT INTO companies (
          name, contact_name, contact_email, contact_phone, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `,
        [name, contact_name, contact_email, contact_phone, status, req.user.id],
      )

      console.log("Company created successfully:", newCompany)
      return res.status(201).json(newCompany)
    } catch (dbError) {
      console.error("Database error creating company:", dbError)
      return res.status(500).json({
        message: "Database error creating company",
        details: dbError.message,
        code: dbError.code,
      })
    }
  } catch (error) {
    console.error("Error creating company:", error)
    return res.status(500).json({ message: "Server error creating company", details: error.message })
  }
})

app.get("/api/companies", authenticateToken, async (req, res) => {
  try {
    // Get query parameters for filtering
    const { status, search } = req.query

    // Base query to get companies with creator info
    let query = `
      SELECT c.*, 
             u.first_name || ' ' || u.last_name as created_by_name
      FROM companies c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 1

    // Add filters if provided
    if (status && status !== "all") {
      query += ` AND c.status = $${paramCount}`
      queryParams.push(status)
      paramCount++
    }

    if (search) {
      query += ` AND (c.name ILIKE $${paramCount} OR c.contact_name ILIKE $${paramCount} OR c.contact_email ILIKE $${paramCount})`
      queryParams.push(`%${search}%`)
      paramCount++
    }

    query += ` ORDER BY c.created_at DESC`

    // Execute the query
    const companies = await db.manyOrNone(query, queryParams)

    // For each company, get its facilities
    for (const company of companies) {
      // Get facilities for this company
      const facilities = await db.manyOrNone(
        `
        SELECT * FROM facilities 
        WHERE company_id = $1
        ORDER BY name
      `,
        [company.id],
      )

      // For each facility, get its departments
      for (const facility of facilities) {
        const departments = await db.manyOrNone(
          `
          SELECT * FROM departments
          WHERE facility_id = $1
          ORDER BY name
        `,
          [facility.id],
        )

        facility.departments = departments
      }

      company.facilities = facilities
    }

    return res.status(200).json(companies)
  } catch (error) {
    console.error("Error fetching companies:", error)
    return res.status(500).json({ message: "Server error fetching companies" })
  }
})

app.put("/api/companies/:id", authenticateToken, async (req, res) => {
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

    console.log("Updating company with ID:", id)
    console.log("Company data:", JSON.stringify(req.body))

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [id])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Update company with simplified query to match the table structure
    const updatedCompany = await db.one(
      `
      UPDATE companies SET
        name = $1,
        address = $2,
        contact_name = $3,
        contact_email = $4,
        contact_phone = $5,
        status = $6,
        updated_at = NOW(),
        updated_by = $7
      WHERE id = $8
      RETURNING *
    `,
      [name, address || null, contact_name, contact_email, contact_phone || null, status || "active", req.user.id, id],
    )

    return res.status(200).json(updatedCompany)
  } catch (error) {
    console.error("Error updating company:", error)
    return res.status(500).json({ message: "Server error updating company", details: error.message })
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
             f.name as facility_name,
             d.name as department_name,
             eg.serial_number as edge_gateway_serial,
             u.first_name || ' ' || u.last_name as created_by_name
      FROM assignments a
      JOIN companies c ON a.company_id = c.id
      LEFT JOIN facilities f ON a.facility_id = f.id
      LEFT JOIN departments d ON a.department_id = d.id
      LEFT JOIN edge_gateways eg ON a.edge_gateway_id = eg.id
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
    `)

    // For each assignment, get its smart meters
    for (const assignment of assignments) {
      const smartMeters = await db.manyOrNone(
        `
        SELECT sm.id, sm.serial_number, sm.status, sm.firmware_version,
               dm.model_name, m.name as manufacturer_name
        FROM smart_meter_assignments sma
        JOIN smart_meters sm ON sma.smart_meter_id = sm.id
        JOIN device_models dm ON sm.model_id = dm.id
        JOIN manufacturers m ON dm.manufacturer_id = m.id
        WHERE sma.assignment_id = $1
      `,
        [assignment.id],
      )

      assignment.smart_meters = smartMeters
    }

    return res.status(200).json(assignments)
  } catch (error) {
    console.error("Error fetching assignments:", error)
    return res.status(500).json({
      message: "Server error fetching assignments",
      details: error.message,
      stack: error.stack,
    })
  }
})

app.post("/api/assignments", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const {
      company_id,
      smart_meter_id,
      facility_id,
      department_id,
      edge_gateway_id,
      location_details,
      installation_notes,
      status,
    } = req.body

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [company_id])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Check if smart meter exists and is available
    if (smart_meter_id) {
      const smartMeter = await db.oneOrNone("SELECT id, status FROM smart_meters WHERE id = $1", [smart_meter_id])
      if (!smartMeter) {
        return res.status(404).json({ message: "Smart meter not found" })
      }

      if (smartMeter.status !== "available") {
        return res.status(409).json({ message: "Smart meter is not available for assignment" })
      }
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // Create assignment
      const newAssignment = await t.one(
        `
        INSERT INTO assignments (
          company_id, facility_id, department_id, edge_gateway_id, created_by
        ) VALUES ($1, $2, $3, $4, $5) RETURNING *
      `,
        [company_id, facility_id || null, department_id || null, edge_gateway_id || null, req.user.id],
      )

      // If smart meter is provided, create smart meter assignment
      if (smart_meter_id) {
        await t.one(
          `
          INSERT INTO smart_meter_assignments (
            assignment_id, smart_meter_id, created_by
          ) VALUES ($1, $2, $3) RETURNING id
        `,
          [newAssignment.id, smart_meter_id, req.user.id],
        )

        // Update smart meter status
        await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["assigned", smart_meter_id])
      }

      return res.status(201).json(newAssignment)
    })
  } catch (error) {
    console.error("Error creating assignment:", error)
    return res.status(500).json({
      message: "Server error creating assignment",
      details: error.message,
      stack: error.stack,
    })
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
    const assignment = await db.oneOrNone("SELECT id FROM assignments WHERE id = $1", [id])
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" })
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // Get any smart meters assigned to this assignment
      const smartMeterAssignments = await t.manyOrNone(
        "SELECT smart_meter_id FROM smart_meter_assignments WHERE assignment_id = $1",
        [id],
      )

      // Update smart meter status back to available for all assigned smart meters
      for (const sma of smartMeterAssignments) {
        await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["available", sma.smart_meter_id])
      }

      // Delete smart meter assignments
      await t.none("DELETE FROM smart_meter_assignments WHERE assignment_id = $1", [id])

      // Delete assignment
      await t.none("DELETE FROM assignments WHERE id = $1", [id])

      return res.status(200).json({ message: "Assignment deleted successfully" })
    })
  } catch (error) {
    console.error("Error deleting assignment:", error)
    return res.status(500).json({
      message: "Server error deleting assignment",
      details: error.message,
      stack: error.stack,
    })
  }
})

// Add these endpoints to your server.js after the existing assignments routes

// Assign edge gateway to company
app.post("/api/assignments/assign-edge-gateway", authenticateToken, async (req, res) => {
  try {
    const { companyId, facilityId, departmentId, gatewayId } = req.body

    if (!companyId || !gatewayId) {
      return res.status(400).json({ message: "Company ID and Gateway ID are required" })
    }

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [companyId])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Check if edge gateway exists and is available
    const gateway = await db.oneOrNone("SELECT id, status FROM edge_gateways WHERE id = $1", [gatewayId])
    if (!gateway) {
      return res.status(404).json({ message: "Edge gateway not found" })
    }

    if (gateway.status !== "available") {
      return res.status(409).json({ message: "Edge gateway is not available for assignment" })
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // Create assignment
      const newAssignment = await t.one(
        `
        INSERT INTO assignments (
          company_id, facility_id, department_id, edge_gateway_id, created_by
        ) VALUES ($1, $2, $3, $4, $5) RETURNING *
        `,
        [companyId, facilityId || null, departmentId || null, gatewayId, req.user.id],
      )

      // Update edge gateway status
      await t.none("UPDATE edge_gateways SET status = $1 WHERE id = $2", ["assigned", gatewayId])

      return res.status(201).json(newAssignment)
    })
  } catch (error) {
    console.error("Error assigning edge gateway:", error)
    return res.status(500).json({
      message: "Server error assigning edge gateway",
      details: error.message,
      stack: error.stack,
    })
  }
})

// Assign smart meters to edge gateway
app.post("/api/assignments/assign-smart-meters", authenticateToken, async (req, res) => {
  try {
    const { gatewayId, meterIds } = req.body

    if (!gatewayId || !meterIds || !Array.isArray(meterIds) || meterIds.length === 0) {
      return res.status(400).json({ message: "Gateway ID and at least one meter ID are required" })
    }

    // Check if edge gateway exists
    const gateway = await db.oneOrNone("SELECT id FROM edge_gateways WHERE id = $1", [gatewayId])
    if (!gateway) {
      return res.status(404).json({ message: "Edge gateway not found" })
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // Get assignment for this gateway
      const assignment = await t.oneOrNone("SELECT id FROM assignments WHERE edge_gateway_id = $1", [gatewayId])

      if (!assignment) {
        return res.status(404).json({ message: "No assignment found for this edge gateway" })
      }

      // For each meter ID
      const results = []
      for (const meterId of meterIds) {
        // Check if smart meter exists and is available
        const smartMeter = await t.oneOrNone("SELECT id, status FROM smart_meters WHERE id = $1", [meterId])

        if (!smartMeter) {
          return res.status(404).json({ message: `Smart meter with ID ${meterId} not found` })
        }

        if (smartMeter.status !== "available") {
          return res.status(409).json({ message: `Smart meter with ID ${meterId} is not available for assignment` })
        }

        // Create smart meter assignment
        const newSmartMeterAssignment = await t.one(
          `
          INSERT INTO smart_meter_assignments (
            assignment_id, smart_meter_id, created_by
          ) VALUES ($1, $2, $3) RETURNING *
        `,
          [assignment.id, meterId, req.user.id],
        )

        // Update smart meter status
        await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["assigned", meterId])

        results.push(newSmartMeterAssignment)
      }

      return res.status(201).json({
        message: `Successfully assigned ${results.length} smart meters to edge gateway`,
        assignments: results,
      })
    })
  } catch (error) {
    console.error("Error assigning smart meters:", error)
    return res.status(500).json({
      message: "Server error assigning smart meters",
      details: error.message,
      stack: error.stack,
    })
  }
})

// Remove edge gateway assignment
app.post("/api/assignments/remove-edge-gateway", authenticateToken, async (req, res) => {
  try {
    const { userId, gatewayId } = req.body

    if (!userId || !gatewayId) {
      return res.status(400).json({ message: "User ID and Gateway ID are required" })
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // First get the user's company information
      const userCompanyResult = await t.oneOrNone(
        `SELECT uc.company_id FROM user_companies uc 
       WHERE uc.user_id = $1 
       ORDER BY uc.is_primary DESC LIMIT 1`,
        [userId],
      )

      if (!userCompanyResult) {
        return res.status(404).json({ message: "User is not associated with any company" })
      }

      const companyId = userCompanyResult.company_id

      // Get assignment for this company and gateway
      const assignment = await t.oneOrNone(
        `SELECT id FROM assignments 
      WHERE company_id = $1 AND edge_gateway_id = $2`,
        [companyId, gatewayId],
      )

      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" })
      }

      // Get any smart meters assigned to this assignment
      const smartMeterAssignments = await t.manyOrNone(
        `SELECT smart_meter_id FROM smart_meter_assignments 
      WHERE assignment_id = $1`,
        [assignment.id],
      )

      // Update smart meter status back to available for all assigned smart meters
      for (const sma of smartMeterAssignments) {
        await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["available", sma.smart_meter_id])
      }

      // Delete smart meter assignments
      await t.none("DELETE FROM smart_meter_assignments WHERE assignment_id = $1", [assignment.id])

      // Delete assignment
      await t.none("DELETE FROM assignments WHERE id = $1", [assignment.id])

      // Update edge gateway status
      await t.none("UPDATE edge_gateways SET status = $1 WHERE id = $2", ["available", gatewayId])

      return res.status(200).json({ message: "Edge gateway assignment removed successfully" })
    })
  } catch (error) {
    console.error("Error removing edge gateway assignment:", error)
    return res.status(500).json({
      message: "Server error removing edge gateway assignment",
      details: error.message,
      stack: error.stack,
    })
  }
})

// Remove smart meter assignment
app.post("/api/assignments/remove-smart-meter", authenticateToken, async (req, res) => {
  try {
    const { gatewayId, meterId } = req.body

    if (!gatewayId || !meterId) {
      return res.status(400).json({ message: "Gateway ID and Meter ID are required" })
    }

    // Start a transaction
    return await db.tx(async (t) => {
      // Get assignment for this gateway
      const assignment = await t.oneOrNone("SELECT id FROM assignments WHERE edge_gateway_id = $1", [gatewayId])

      if (!assignment) {
        return res.status(404).json({ message: "No assignment found for this edge gateway" })
      }

      // Check if smart meter is assigned to this assignment
      const smartMeterAssignment = await t.oneOrNone(
        `
        SELECT id FROM smart_meter_assignments 
        WHERE assignment_id = $1 AND smart_meter_id = $2
      `,
        [assignment.id, meterId],
      )

      if (!smartMeterAssignment) {
        return res.status(404).json({ message: "Smart meter is not assigned to this edge gateway" })
      }

      // Delete smart meter assignment
      await t.none("DELETE FROM smart_meter_assignments WHERE id = $1", [smartMeterAssignment.id])

      // Update smart meter status
      await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["available", meterId])

      return res.status(200).json({ message: "Smart meter assignment removed successfully" })
    })
  } catch (error) {
    console.error("Error removing smart meter assignment:", error)
    return res.status(500).json({
      message: "Server error removing smart meter assignment",
      details: error.message,
      stack: error.stack,
    })
  }
})

// Users routes
app.get("/api/users", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    // Find the users route that's causing the error
    // Change this SQL query:
    // SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status,
    //        u.created_at, u.updated_at, u.require_password_change, u.last_login_at,
    //        c.id as company_id, c.name as company_name,
    //        f.id as facility_id, f.name as facility_name,
    //        d.id as department_id, d.name as department_name
    // FROM users u
    // LEFT JOIN companies c ON u.company_id = c.id
    // LEFT JOIN facilities f ON u.facility_id = f.id
    // LEFT JOIN departments d ON u.department_id = d.id
    // ORDER BY u.created_at DESC

    // To this updated query that uses user_companies table for the relationship:
    const users = await db.manyOrNone(`
  SELECT u.id, u.email, u.first_name, u.last_name, r.name as role, 
         u.is_active as status, u.created_at, u.updated_at, 
         u.require_password_change, u.last_login,
         c.id as company_id, c.name as company_name,
         f.id as facility_id, f.name as facility_name,
         d.id as department_id, d.name as department_name
  FROM users u
  LEFT JOIN roles r ON u.role_id = r.id
  LEFT JOIN user_companies uc ON u.id = uc.user_id
  LEFT JOIN companies c ON uc.company_id = c.id
  LEFT JOIN facilities f ON uc.facility_id = f.id
  LEFT JOIN departments d ON uc.department_id = d.id
  ORDER BY u.created_at DESC
`)

    // Format the response
    const formattedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.status === "active",
      created_at: user.created_at,
      updated_at: user.updated_at,
      require_password_change: user.require_password_change,
      last_login_at: user.last_login,
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

    return res.status(200).json({ data: formattedUsers })
  } catch (error) {
    console.error("Error fetching users:", error)
    return res.status(500).json({ message: "Server error fetching users" })
  }
})
app.post("/api/users", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { email, password, first_name, last_name, role_id, is_active, require_password_change } = req.body;

    // Validate required fields
    if (!email || !password || !first_name || !last_name || !role_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if email already exists
    const existingUser = await db.oneOrNone("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists" });
    }

    // Check if role exists
    const roleExists = await db.oneOrNone("SELECT id FROM roles WHERE id = $1", [role_id]);
    if (!roleExists) {
      return res.status(400).json({ message: "Invalid role_id" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const newUser = await db.one(
      `
      INSERT INTO users (
        email, password_hash, first_name, last_name, role_id, is_active, 
        require_password_change, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role_id, is_active
      `,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        role_id,
        is_active !== undefined ? is_active : true,
        require_password_change !== undefined ? require_password_change : true,
        req.user.id,
      ]
    );

    return res.status(201).json(newUser);
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ message: "Server error creating user", error: error.message });
  }
});

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
    console.log(`Fetching models for manufacturer ID: ${id}`)

    // First check if the manufacturer exists
    const manufacturer = await db.oneOrNone("SELECT id FROM manufacturers WHERE id = $1", [id])

    if (!manufacturer) {
      console.log(`Manufacturer with ID ${id} not found`)
      return res.status(404).json({ message: "Manufacturer not found" })
    }

    // Query for device models - UPDATED to use device_models table instead of meter_models
    const models = await db.manyOrNone(
      `SELECT * 
       FROM device_models 
       WHERE manufacturer_id = $1
       ORDER BY model_name`,
      [id],
    )

    console.log(`Found ${models.length} models for manufacturer ${id}`)
    return res.status(200).json({ data: models })
  } catch (error) {
    console.error("Error fetching manufacturer models:", error)
    return res.status(500).json({
      message: "Server error fetching manufacturer models",
      details: error.message,
      stack: error.stack,
    })
  }
})

app.get("/api/devices/smart-meters", authenticateToken, async (req, res) => {
  try {
    const { status, manufacturer, search, limit = 10, offset = 0 } = req.query

    let query = `
      SELECT sm.id, sm.serial_number, sm.status, sm.firmware_version, sm.last_seen, sm.notes,
             dm.id as model_id, dm.model_name, m.name as manufacturer,
             sma.id as assignment_id, c.id as company_id, c.name as company_name
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

// Companies routes with facilitiesties
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

// Facilities routes - FIXED ROUTE PATH
app.post("/api/companies/:companyId/facilities", authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params
    const { name, location, address, contact_name, contact_email, contact_phone, notes } = req.body

    console.log("Creating facility with data:", JSON.stringify(req.body))
    console.log("For company ID:", companyId)
    console.log("By user:", JSON.stringify(req.user))

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Facility name is required" })
    }

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [companyId])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Insert new facility
    try {
      const newFacility = await db.one(
        `
        INSERT INTO facilities (
          company_id, name, location, address, contact_name, contact_email, contact_phone, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
      `,
        [
          companyId,
          name,
          location || null,
          address || null,
          contact_name || null,
          contact_email || null,
          contact_phone || null,
          notes || null,
          req.user.id,
        ],
      )

      console.log("Facility created successfully:", newFacility)
      return res.status(201).json(newFacility)
    } catch (dbError) {
      console.error("Database error creating facility:", dbError)
      return res.status(500).json({
        message: "Database error creating facility",
        details: dbError.message,
        code: dbError.code,
      })
    }
  } catch (error) {
    console.error("Error creating facility:", error)
    return res.status(500).json({ message: "Server error creating facility", details: error.message })
  }
})

// Update facility
app.put("/api/companies/:companyId/facilities/:facilityId", authenticateToken, async (req, res) => {
  try {
    const { companyId, facilityId } = req.params
    const { name, location, address, contact_name, contact_email, contact_phone, notes } = req.body

    console.log("Updating facility with data:", JSON.stringify(req.body))
    console.log("For company ID:", companyId)
    console.log("Facility ID:", facilityId)
    console.log("By user:", JSON.stringify(req.user))

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Facility name is required" })
    }

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [companyId])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Check if facility exists and belongs to the company
    const facility = await db.oneOrNone("SELECT id FROM facilities WHERE id = $1 AND company_id = $2", [
      facilityId,
      companyId,
    ])
    if (!facility) {
      return res.status(404).json({ message: "Facility not found or does not belong to the company" })
    }

    // Update facility
    try {
      const updatedFacility = await db.one(
        `
        UPDATE facilities SET
          name = $1,
          location = $2,
          address = $3,
          contact_name = $4,
          contact_email = $5,
          contact_phone = $6,
          notes = $7,
          updated_at = NOW(),
          updated_by = $8
        WHERE id = $9 AND company_id = $10
        RETURNING *
      `,
        [
          name,
          location || null,
          address || null,
          contact_name || null,
          contact_email || null,
          contact_phone || null,
          notes || null,
          req.user.id,
          facilityId,
          companyId,
        ],
      )

      console.log("Facility updated successfully:", updatedFacility)
      return res.status(200).json(updatedFacility)
    } catch (dbError) {
      console.error("Database error updating facility:", dbError)
      return res.status(500).json({
        message: "Database error updating facility",
        details: dbError.message,
        code: dbError.code,
      })
    }
  } catch (error) {
    console.error("Error updating facility:", error)
    return res.status(500).json({ message: "Server error updating facility", details: error.message })
  }
})

// Delete facility
app.delete("/api/companies/:companyId/facilities/:facilityId", authenticateToken, async (req, res) => {
  try {
    const { companyId, facilityId } = req.params

    console.log("Deleting facility with ID:", facilityId)
    console.log("For company ID:", companyId)
    console.log("By user:", JSON.stringify(req.user))

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [companyId])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // Check if facility exists and belongs to the company
    const facility = await db.oneOrNone("SELECT id FROM facilities WHERE id = $1 AND company_id = $2", [
      facilityId,
      companyId,
    ])
    if (!facility) {
      return res.status(404).json({ message: "Facility not found or does not belong to the company" })
    }

    // Delete facility (cascade will delete departments)
    try {
      await db.none("DELETE FROM facilities WHERE id = $1 AND company_id = $2", [facilityId, companyId])

      console.log("Facility deleted successfully")
      return res.status(200).json({ message: "Facility deleted successfully" })
    } catch (dbError) {
      console.error("Database error deleting facility:", dbError)
      return res.status(500).json({
        message: "Database error deleting facility",
        details: dbError.message,
        code: dbError.code,
      })
    }
  } catch (error) {
    console.error("Error deleting facility:", error)
    return res.status(500).json({ message: "Server error deleting facility", details: error.message })
  }
})

// Departments routes - CRUD operations
app.post("/api/facilities/:facilityId/departments", authenticateToken, async (req, res) => {
  try {
    const { facilityId } = req.params
    const { name, notes } = req.body

    console.log("Creating department with data:", JSON.stringify(req.body))
    console.log("For facility ID:", facilityId)
    console.log("By user:", JSON.stringify(req.user))

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Department name is required" })
    }

    // Check if facility exists
    const facility = await db.oneOrNone("SELECT id FROM facilities WHERE id = $1", [facilityId])
    if (!facility) {
      return res.status(404).json({ message: "Facility not found" })
    }

    // Insert new department
    try {
      const newDepartment = await db.one(
        `
        INSERT INTO departments (
          facility_id, name, notes, created_by
        ) VALUES ($1, $2, $3, $4) RETURNING *
      `,
        [facilityId, name, notes || null, req.user.id],
      )

      console.log("Department created successfully:", newDepartment)
      return res.status(201).json(newDepartment)
    } catch (dbError) {
      console.error("Database error creating department:", dbError)
      return res.status(500).json({
        message: "Database error creating department",
        details: dbError.message,
        code: dbError.code,
      })
    }
  } catch (error) {
    console.error("Error creating department:", error)
    return res.status(500).json({ message: "Server error creating department", details: error.message })
  }
})

// Update department
app.put("/api/facilities/:facilityId/departments/:departmentId", authenticateToken, async (req, res) => {
  try {
    const { facilityId, departmentId } = req.params
    const { name, notes } = req.body

    console.log("Updating department with data:", JSON.stringify(req.body))
    console.log("For facility ID:", facilityId)
    console.log("Department ID:", departmentId)
    console.log("By user:", JSON.stringify(req.user))

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Department name is required" })
    }

    // Check if facility exists
    const facility = await db.oneOrNone("SELECT id FROM facilities WHERE id = $1", [facilityId])
    if (!facility) {
      return res.status(404).json({ message: "Facility not found" })
    }

    // Check if department exists and belongs to the facility
    const department = await db.oneOrNone("SELECT id FROM departments WHERE id = $1 AND facility_id = $2", [
      departmentId,
      facilityId,
    ])
    if (!department) {
      return res.status(404).json({ message: "Department not found or does not belong to the facility" })
    }

    // Update department
    try {
      const updatedDepartment = await db.one(
        `
        UPDATE departments SET
          name = $1,
          notes = $2,
          updated_at = NOW(),
          updated_by = $3
        WHERE id = $4 AND facility_id = $5
        RETURNING *
      `,
        [name, notes || null, req.user.id, departmentId, facilityId],
      )

      console.log("Department updated successfully:", updatedDepartment)
      return res.status(200).json(updatedDepartment)
    } catch (dbError) {
      console.error("Database error updating department:", dbError)
      return res.status(500).json({
        message: "Database error updating department",
        details: dbError.message,
        code: dbError.code,
      })
    }
  } catch (error) {
    console.error("Error updating department:", error)
    return res.status(500).json({ message: "Server error updating department", details: error.message })
  }
})

// Delete department
app.delete("/api/facilities/:facilityId/departments/:departmentId", authenticateToken, async (req, res) => {
  try {
    const { facilityId, departmentId } = req.params

    console.log("Deleting department with ID:", departmentId)
    console.log("For facility ID:", facilityId)
    console.log("By user:", JSON.stringify(req.user))

    // Check if facility exists
    const facility = await db.oneOrNone("SELECT id FROM facilities WHERE id = $1", [facilityId])
    if (!facility) {
      return res.status(404).json({ message: "Facility not found" })
    }

    // Check if department exists and belongs to the facility
    const department = await db.oneOrNone("SELECT id FROM departments WHERE id = $1 AND facility_id = $2", [
      departmentId,
      facilityId,
    ])
    if (!department) {
      return res.status(404).json({ message: "Department not found or does not belong to the facility" })
    }

    // Delete department
    try {
      await db.none("DELETE FROM departments WHERE id = $1 AND facility_id = $2", [departmentId, facilityId])

      console.log("Department deleted successfully")
      return res.status(200).json({ message: "Department deleted successfully" })
    } catch (dbError) {
      console.error("Database error deleting department:", dbError)
      return res.status(500).json({
        message: "Database error deleting department",
        details: dbError.message,
        code: dbError.code,
      })
    }
  } catch (error) {
    console.error("Error deleting department:", error)
    return res.status(500).json({ message: "Server error deleting department", details: error.message })
  }
})

// Device Models routes
app.get("/api/device-models", authenticateToken, async (req, res) => {
  try {
    const { device_type } = req.query

    let query = `
      SELECT dm.id, dm.model_name, dm.device_type, dm.description, dm.specifications, 
             dm.firmware_version, dm.is_active, m.id as manufacturer_id, m.name as manufacturer
      FROM device_models dm
      JOIN manufacturers m ON dm.manufacturer_id = m.id
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 1

    if (device_type) {
      query += ` AND dm.device_type = $${paramCount}`
      queryParams.push(device_type)
      paramCount++
    }

    query += ` ORDER BY m.name, dm.model_name`

    const models = await db.manyOrNone(query, queryParams)

    res.json({ data: models })
  } catch (error) {
    console.error("Error fetching device models:", error)
    res.status(500).json({ message: "Server error while fetching device models" })
  }
})

app.get("/api/device-models/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const model = await db.oneOrNone(
      `
      SELECT dm.id, dm.model_name, dm.device_type, dm.description, dm.specifications, 
             dm.firmware_version, dm.is_active, m.id as manufacturer_id, m.name as manufacturer
      FROM device_models dm
      JOIN manufacturers m ON dm.manufacturer_id = m.id
      WHERE dm.id = $1
    `,
      [id],
    )

    if (!model) {
      return res.status(404).json({ message: "Device model not found" })
    }

    res.json(model)
  } catch (error) {
    console.error("Error fetching device model:", error)
    res.status(500).json({ message: "Server error while fetching device model" })
  }
})

// Add these routes after the device models routes

// Manufacturers routes
app.get("/api/manufacturers", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching all manufacturers")
    const manufacturers = await db.manyOrNone("SELECT * FROM manufacturers ORDER BY name")
    console.log(`Found ${manufacturers.length} manufacturers`)
    return res.status(200).json({ data: manufacturers })
  } catch (error) {
    console.error("Error fetching manufacturers:", error)
    return res.status(500).json({ message: "Server error fetching manufacturers" })
  }
})

// Update the GET /api/manufacturers/:id/models endpoint to use a consistent response format
app.get("/api/manufacturers/:id/models", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Fetching models for manufacturer ID: ${id}`)

    // First check if the manufacturer exists
    const manufacturer = await db.oneOrNone("SELECT id FROM manufacturers WHERE id = $1", [id])

    if (!manufacturer) {
      console.log(`Manufacturer with ID ${id} not found`)
      return res.status(404).json({ message: "Manufacturer not found" })
    }

    // Query for device models for the edge gateway device type
    const models = await db.manyOrNone(
      `SELECT * 
     FROM device_models 
     WHERE manufacturer_id = $1 AND device_type = 'edge_gateway'
     ORDER BY model_name`,
      [id],
    )

    console.log(`Found ${models.length} models for manufacturer ${id}`)
    return res.status(200).json({ data: models })
  } catch (error) {
    console.error("Error fetching manufacturer models:", error)
    return res.status(500).json({
      message: "Server error fetching manufacturer models",
      details: error.message,
    })
  }
})

app.get("/api/manufacturers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const manufacturer = await db.oneOrNone("SELECT * FROM manufacturers WHERE id = $1", [id])

    if (!manufacturer) {
      return res.status(404).json({ message: "Manufacturer not found" })
    }

    return res.status(200).json(manufacturer)
  } catch (error) {
    console.error("Error fetching manufacturer:", error)
    return res.status(500).json({ message: "Server error fetching manufacturer" })
  }
})

app.get("/api/manufacturers/:id/models", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const models = await db.manyOrNone(
      `SELECT dm.* 
       FROM device_models dm
       WHERE dm.manufacturer_id = $1
       ORDER BY dm.model_name`,
      [id],
    )

    return res.status(200).json({ data: models })
  } catch (error) {
    console.error("Error fetching manufacturer models:", error)
    return res.status(500).json({ message: "Server error fetching manufacturer models" })
  }
})

// Update the device-models endpoint to include manufacturer information
app.get("/api/device-models", authenticateToken, async (req, res) => {
  try {
    const { device_type } = req.query

    let query = `
      SELECT dm.id, dm.model_name, dm.device_type, dm.description, dm.specifications, 
             dm.firmware_version, dm.is_active, m.id as manufacturer_id, m.name as manufacturer
      FROM device_models dm
      JOIN manufacturers m ON dm.manufacturer_id = m.id
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 1

    if (device_type) {
      query += ` AND dm.device_type = $${paramCount}`
      queryParams.push(device_type)
      paramCount++
    }

    query += ` ORDER BY m.name, dm.model_name`

    const models = await db.manyOrNone(query, queryParams)

    res.json({ data: models })
  } catch (error) {
    console.error("Error fetching device models:", error)
    res.status(500).json({ message: "Server error while fetching device models" })
  }
})

// Add these endpoints for manufacturers and models if they don't already exist:

// GET all manufacturers
// app.get("/api/manufacturers", authenticateToken, async (req, res) => {
//   try {
//     console.log("GET /api/manufacturers - Fetching all manufacturers")
//     const manufacturers = await db.query("SELECT * FROM manufacturers ORDER BY name")
//     console.log(`Found ${manufacturers.rows.length} manufacturers`)
//     res.json(manufacturers.rows)
//   } catch (error) {
//     console.error("Error fetching manufacturers:", error)
//     res.status(500).json({ message: "Failed to fetch manufacturers", error: error.message })
//   }
// })

// GET models for a specific manufacturer
// app.get("/api/manufacturers/:id/models", authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.params
//     console.log(`GET /api/manufacturers/${id}/models - Fetching models for manufacturer`)

//     // First check if manufacturer exists
//     const manufacturerResult = await db.query("SELECT * FROM manufacturers WHERE id = $1", [id])
//     if (manufacturerResult.rows.length === 0) {
//       console.log(`Manufacturer with ID ${id} not found`)
//       return res.status(404).json({ message: "Manufacturer not found" })
//     }

//     const models = await db.query("SELECT * FROM device_models WHERE manufacturer_id = $1 ORDER BY model_name", [id])
//     console.log(`Found ${models.rows.length} models for manufacturer ${id}`)
//     res.json(models.rows)
//   } catch (error) {
//     console.error(`Error fetching models for manufacturer ${req.params.id}:`, error)
//     res.status(500).json({ message: "Failed to fetch models", error: error.message })
//   }
// })

// GET a specific manufacturer
app.get("/api/manufacturers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    console.log(`GET /api/manufacturers/${id} - Fetching manufacturer`)
    const result = await db.query("SELECT * FROM manufacturers WHERE id = $1", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Manufacturer not found" })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error(`Error fetching manufacturer ${req.params.id}:`, error)
    res.status(500).json({ message: "Failed to fetch manufacturer", error: error.message })
  }
})

// POST create a new manufacturer
app.post("/api/manufacturers", authenticateToken, async (req, res) => {
  try {
    const { name, contact_info, website } = req.body
    console.log("POST /api/manufacturers - Creating new manufacturer:", req.body)

    if (!name) {
      return res.status(400).json({ message: "Manufacturer name is required" })
    }

    const result = await db.query(
      "INSERT INTO manufacturers (name, contact_info, website) VALUES ($1, $2, $3) RETURNING *",
      [name, contact_info, website],
    )

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error("Error creating manufacturer:", error)
    res.status(500).json({ message: "Failed to create manufacturer", error: error.message })
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

// Update the API endpoints for companies, facilities, and departments to ensure they return data in a consistent format

// Companies routes with facilities
app.get("/api/companies", authenticateToken, async (req, res) => {
  try {
    // Get query parameters for filtering
    const { status, search } = req.query

    // Base query to get companies with creator info
    let query = `
      SELECT c.*, 
             u.first_name || ' ' || u.last_name as created_by_name
      FROM companies c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 1

    // Add filters if provided
    if (status && status !== "all") {
      query += ` AND c.status = $${paramCount}`
      queryParams.push(status)
      paramCount++
    }

    if (search) {
      query += ` AND (c.name ILIKE $${paramCount} OR c.contact_name ILIKE $${paramCount} OR c.contact_email ILIKE $${paramCount})`
      queryParams.push(`%${search}%`)
      paramCount++
    }

    query += ` ORDER BY c.created_at DESC`

    // Execute the query
    const companies = await db.manyOrNone(query, queryParams)
    console.log(`Found ${companies.length} companies`)

    return res.status(200).json(companies)
  } catch (error) {
    console.error("Error fetching companies:", error)
    return res.status(500).json({ message: "Server error fetching companies" })
  }
})

app.get("/api/companies/:id/facilities", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Fetching facilities for company ID: ${id}`)

    const result = await db.manyOrNone(
      `
      SELECT id, name, location, address, contact_name, contact_email, contact_phone, notes
      FROM facilities
      WHERE company_id = $1
      ORDER BY name
    `,
      [id],
    )

    console.log(`Found ${result.length} facilities for company ${id}`)
    return res.status(200).json({ data: result })
  } catch (error) {
    console.error("Error fetching facilities:", error)
    return res.status(500).json({ message: "Server error while fetching facilities" })
  }
})

app.get("/api/facilities/:id/departments", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Fetching departments for facility ID: ${id}`)

    const result = await db.manyOrNone(
      `
      SELECT id, name, notes
      FROM departments
      WHERE facility_id = $1
      ORDER BY name
    `,
      [id],
    )

    console.log(`Found ${result.length} departments for facility ${id}`)
    return res.status(200).json({ data: result })
  } catch (error) {
    console.error("Error fetching departments:", error)
    return res.status(500).json({ message: "Server error while fetching departments" })
  }
})

// Add these routes to your server.js file to handle user-company relationships
// Add this after your existing user routes:

// User-Company Relationships routes
app.post("/api/user-companies", authenticateToken, async (req, res) => {
  try {
    const { user_id, company_id, facility_id, department_id, is_primary } = req.body

    // Validate required fields
    if (!user_id || !company_id) {
      return res.status(400).json({ message: "User ID and Company ID are required" })
    }

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [user_id])
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [company_id])
    if (!company) {
      return res.status(404).json({ message: "Company not found" })
    }

    // If is_primary is true, set all other relationships for this user to is_primary = false
    if (is_primary) {
      await db.none("UPDATE user_companies SET is_primary = FALSE WHERE user_id = $1", [user_id])
    }

    // Insert new relationship
    const newRelationship = await db.one(
      `
      INSERT INTO user_companies (
        user_id, company_id, facility_id, department_id, is_primary
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *
      `,
      [user_id, company_id, facility_id, department_id, is_primary || false],
    )

    return res.status(201).json(newRelationship)
  } catch (error) {
    console.error("Error creating user-company relationship:", error)
    return res.status(500).json({
      message: "Server error creating user-company relationship",
      error: error.message,
    })
  }
})

app.get("/api/user-companies/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    // Get relationships with company, facility, and department info
    const relationships = await db.manyOrNone(
      `
      SELECT uc.*, 
             c.id as company_id, c.name as company_name,
             f.id as facility_id, f.name as facility_name,
             d.id as department_id, d.name as department_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      LEFT JOIN facilities f ON uc.facility_id = f.id
      LEFT JOIN departments d ON uc.department_id = d.id
      WHERE uc.user_id = $1
      `,
      [userId],
    )

    // Format the response
    const formattedRelationships = relationships.map((rel) => ({
      id: rel.id,
      user_id: rel.user_id,
      is_primary: rel.is_primary,
      created_at: rel.created_at,
      updated_at: rel.updated_at,
      company: {
        id: rel.company_id,
        name: rel.company_name,
      },
      facility: rel.facility_id
        ? {
            id: rel.facility_id,
            name: rel.facility_name,
          }
        : null,
      department: rel.department_id
        ? {
            id: rel.department_id,
            name: rel.department_name,
          }
        : null,
    }))

    return res.status(200).json({ data: formattedRelationships })
  } catch (error) {
    console.error("Error fetching user-company relationships:", error)
    return res.status(500).json({
      message: "Server error fetching user-company relationships",
      error: error.message,
    })
  }
})

app.delete("/api/user-companies/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    // Delete all relationships for this user
    await db.none("DELETE FROM user_companies WHERE user_id = $1", [userId])

    return res.status(200).json({ message: "User-company relationships deleted successfully" })
  } catch (error) {
    console.error("Error deleting user-company relationships:", error)
    return res.status(500).json({
      message: "Server error deleting user-company relationships",
      error: error.message,
    })
  }
})

// Update the POST /api/users route to handle role_id instead of role
// Find the existing route and replace it with:

app.post("/api/users", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { email, password, first_name, last_name, role_id, is_active, require_password_change } = req.body

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
        email, password_hash, first_name, last_name, role_id, is_active, 
        require_password_change, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role_id, is_active
      `,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        role_id,
        is_active !== undefined ? is_active : true,
        require_password_change !== undefined ? require_password_change : true,
        req.user.id,
      ],
    )

    return res.status(201).json(newUser)
  } catch (error) {
    console.error("Error creating user:", error)
    return res.status(500).json({
      message: "Server error creating user",
      error: error.message,
    })
  }
})

// Update the PUT /api/users/:id route to handle role_id instead of role
// Find the existing route and replace it with:

app.put("/api/users/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    const { email, first_name, last_name, role_id, is_active, phone } = req.body

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
        role_id = $4,
        is_active = $5,
        phone = $6,
        updated_at = NOW(),
        updated_by = $7
      WHERE id = $8
      RETURNING id, email, first_name, last_name, role_id, is_active, phone
      `,
      [email, first_name, last_name, role_id, is_active, phone, req.user.id, id],
    )

    return res.status(200).json(updatedUser)
  } catch (error) {
    console.error("Error updating user:", error)
    return res.status(500).json({
      message: "Server error updating user",
      error: error.message,
    })
  }
})

// Update the GET /api/users route to include role information
// Find the existing route and replace it with:

app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    // Get users with role information
    const users = await db.manyOrNone(`
      SELECT u.id, u.email, u.first_name, u.last_name, 
             r.id as role_id, r.name as role, 
             u.is_active, u.created_at, u.updated_at, 
             u.require_password_change, u.last_login, u.phone
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `)

    // Format the response
    const formattedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role_id: user.role_id,
      role: user.role,
      is_active: user.is_active,
      phone: user.phone,
      created_at: user.created_at,
      updated_at: user.updated_at,
      require_password_change: user.require_password_change,
      last_login_at: user.last_login,
    }))

    return res.status(200).json({ data: formattedUsers })
  } catch (error) {
    console.error("Error fetching users:", error)
    return res.status(500).json({
      message: "Server error fetching users",
      error: error.message,
    })
  }
})

// Add these routes to server.js

// Roles API (new)
app.get("/api/roles", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching all roles")
    const roles = await db.manyOrNone("SELECT id, name, description FROM roles ORDER BY name")
    console.log(`Found ${roles.length} roles`)
    return res.status(200).json({ data: roles })
  } catch (error) {
    console.error("Error fetching roles:", error)
    return res.status(500).json({
      message: "Server error fetching roles",
      error: error.message || "Unknown error",
    })
  }
})

// Update the POST /api/users route to handle role_id instead of role
app.post("/api/users", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    console.log("Creating user with data:", JSON.stringify(req.body))
    const { email, password, first_name, last_name, role_id, is_active, require_password_change } = req.body

    // Validate required fields
    if (!email || !password || !first_name || !last_name || !role_id) {
      return res.status(400).json({
        message: "Missing required fields",
        error: "Email, password, first_name, last_name, and role_id are required",
      })
    }

    // Check if email already exists
    const existingUser = await db.oneOrNone("SELECT id FROM users WHERE email = $1", [email])
    if (existingUser) {
      return res.status(409).json({
        message: "User with this email already exists",
        error: "Email already in use",
      })
    }

    // Check if role exists
    const roleExists = await db.oneOrNone("SELECT id FROM roles WHERE id = $1", [role_id])
    if (!roleExists) {
      return res.status(400).json({
        message: "Invalid role_id",
        error: "The specified role_id does not exist",
      })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Insert new user
    const newUser = await db.one(
      `
      INSERT INTO users (
        email, password_hash, first_name, last_name, role_id, is_active, 
        require_password_change, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role_id, is_active
      `,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        role_id,
        is_active !== undefined ? is_active : true,
        require_password_change !== undefined ? require_password_change : true,
        req.user.id,
      ],
    )

    console.log("User created successfully:", newUser)
    return res.status(201).json(newUser)
  } catch (error) {
    console.error("Error creating user:", error)
    return res.status(500).json({
      message: "Server error creating user",
      error: error.message || "Unknown error",
    })
  }
})

// Update the PUT /api/users/:id route to handle role_id instead of role
app.put("/api/users/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Updating user with ID ${id} with data:`, JSON.stringify(req.body))
    const { email, first_name, last_name, role_id, is_active, phone } = req.body

    // Validate required fields
    if (!email || !first_name || !last_name || !role_id) {
      return res.status(400).json({
        message: "Missing required fields",
        error: "Email, first_name, last_name, and role_id are required",
      })
    }

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [id])
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        error: "The specified user does not exist",
      })
    }

    // Check if role exists
    const roleExists = await db.oneOrNone("SELECT id FROM roles WHERE id = $1", [role_id])
    if (!roleExists) {
      return res.status(400).json({
        message: "Invalid role_id",
        error: "The specified role_id does not exist",
      })
    }

    // Update user
    const updatedUser = await db.one(
      `
      UPDATE users SET
        email = $1,
        first_name = $2,
        last_name = $3,
        role_id = $4,
        is_active = $5,
        phone = $6,
        updated_at = NOW(),
        updated_by = $7
      WHERE id = $8
      RETURNING id, email, first_name, last_name, role_id, is_active, phone
      `,
      [email, first_name, last_name, role_id, is_active, phone, req.user.id, id],
    )

    console.log("User updated successfully:", updatedUser)
    return res.status(200).json(updatedUser)
  } catch (error) {
    console.error("Error updating user:", error)
    return res.status(500).json({
      message: "Server error updating user",
      error: error.message || "Unknown error",
    })
  }
})

// Update the GET /api/users route to include role information
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching all users with company relationships")

    // Get users with role information
    const users = await db.manyOrNone(`
      SELECT u.id, u.email, u.first_name, u.last_name, 
             r.id as role_id, r.name as role, 
             u.is_active, u.created_at, u.updated_at, 
             u.require_password_change, u.last_login, u.phone
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `)

    console.log(`Found ${users.length} users`)

    // For each user, get their company relationships
    const formattedUsers = await Promise.all(
      users.map(async (user) => {
        try {
          // Get primary company relationship
          const relationshipQuery = `
          SELECT uc.company_id, uc.facility_id, uc.department_id,
                 c.name as company_name,
                 f.name as facility_name,
                 d.name as department_name
          FROM user_companies uc
          LEFT JOIN companies c ON uc.company_id = c.id
          LEFT JOIN facilities f ON uc.facility_id = f.id
          LEFT JOIN departments d ON uc.department_id = d.id
          WHERE uc.user_id = $1
          ORDER BY uc.is_primary DESC
          LIMIT 1
        `

          const relationship = await db.oneOrNone(relationshipQuery, [user.id])

          return {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role_id: user.role_id,
            role: user.role,
            is_active: user.is_active,
            phone: user.phone,
            created_at: user.created_at,
            updated_at: user.updated_at,
            require_password_change: user.require_password_change,
            last_login_at: user.last_login,
            company:
              relationship && relationship.company_id
                ? {
                    id: relationship.company_id,
                    name: relationship.company_name,
                  }
                : null,
            facility:
              relationship && relationship.facility_id
                ? {
                    id: relationship.facility_id,
                    name: relationship.facility_name,
                  }
                : null,
            department:
              relationship && relationship.department_id
                ? {
                    id: relationship.department_id,
                    name: relationship.department_name,
                  }
                : null,
          }
        } catch (error) {
          console.error(`Error getting relationships for user ${user.id}:`, error)
          // Return user without relationships
          return {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role_id: user.role_id,
            role: user.role,
            is_active: user.is_active,
            phone: user.phone,
            created_at: user.created_at,
            updated_at: user.updated_at,
            require_password_change: user.require_password_change,
            last_login_at: user.last_login,
            company: null,
            facility: null,
            department: null,
          }
        }
      }),
    )

    console.log("Returning users with relationships")
    return res.status(200).json({ data: formattedUsers })
  } catch (error) {
    console.error("Error fetching users:", error)
    return res.status(500).json({
      message: "Server error fetching users",
      error: error.message || "Unknown error",
    })
  }
})

// Add User-Company relationships endpoints
app.post("/api/user-companies", authenticateToken, async (req, res) => {
  try {
    console.log("Creating user-company relationship with data:", JSON.stringify(req.body))
    const { user_id, company_id, facility_id, department_id, is_primary } = req.body

    // Validate required fields
    if (!user_id || !company_id) {
      return res.status(400).json({
        message: "Missing required fields",
        error: "user_id and company_id are required",
      })
    }

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [user_id])
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        error: "The specified user does not exist",
      })
    }

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [company_id])
    if (!company) {
      return res.status(404).json({
        message: "Company not found",
        error: "The specified company does not exist",
      })
    }

    // If facility_id is provided, check if it exists and belongs to the company
    if (facility_id) {
      const facility = await db.oneOrNone("SELECT id FROM facilities WHERE id = $1 AND company_id = $2", [
        facility_id,
        company_id,
      ])

      if (!facility) {
        return res.status(400).json({
          message: "Invalid facility",
          error: "The facility does not exist or does not belong to the specified company",
        })
      }

      // If department_id is provided, check if it exists and belongs to the facility
      if (department_id) {
        const department = await db.oneOrNone("SELECT id FROM departments WHERE id = $1 AND facility_id = $2", [
          department_id,
          facility_id,
        ])

        if (!department) {
          return res.status(400).json({
            message: "Invalid department",
            error: "The department does not exist or does not belong to the specified facility",
          })
        }
      }
    }

    // Check if relationship already exists
    const existingRelationship = await db.oneOrNone(
      "SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2",
      [user_id, company_id],
    )

    if (existingRelationship) {
      // Update existing relationship
      console.log("Updating existing user-company relationship")
      const updatedRelationship = await db.one(
        `
        UPDATE user_companies SET
          facility_id = $1,
          department_id = $2,
          is_primary = $3,
          updated_at = NOW()
        WHERE user_id = $4 AND company_id = $5
        RETURNING *
        `,
        [facility_id, department_id, is_primary || false, user_id, company_id],
      )

      console.log("User-company relationship updated successfully:", updatedRelationship)
      return res.status(200).json(updatedRelationship)
    }

    // If is_primary is true, set all other relationships for this user to is_primary = false
    if (is_primary) {
      await db.none("UPDATE user_companies SET is_primary = FALSE WHERE user_id = $1", [user_id])
    }

    // Insert new relationship
    const newRelationship = await db.one(
      `
      INSERT INTO user_companies (
        user_id, company_id, facility_id, department_id, is_primary
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *
      `,
      [user_id, company_id, facility_id, department_id, is_primary || false],
    )

    console.log("User-company relationship created successfully:", newRelationship)
    return res.status(201).json(newRelationship)
  } catch (error) {
    console.error("Error creating user-company relationship:", error)
    return res.status(500).json({
      message: "Server error creating user-company relationship",
      error: error.message || "Unknown error",
    })
  }
})

app.get("/api/user-companies/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    console.log(`Fetching user-company relationships for user ${userId}`)

    // Get relationships with company, facility, and department info
    const relationships = await db.manyOrNone(
      `
      SELECT uc.*, 
             c.id as company_id, c.name as company_name,
             f.id as facility_id, f.name as facility_name,
             d.id as department_id, d.name as department_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      LEFT JOIN facilities f ON uc.facility_id = f.id
      LEFT JOIN departments d ON uc.department_id = d.id
      WHERE uc.user_id = $1
      ORDER BY uc.is_primary DESC
      `,
      [userId],
    )

    console.log(`Found ${relationships.length} relationships for user ${userId}`)

    // Format the response
    const formattedRelationships = relationships.map((rel) => ({
      id: rel.id,
      user_id: rel.user_id,
      is_primary: rel.is_primary,
      created_at: rel.created_at,
      updated_at: rel.updated_at,
      company: {
        id: rel.company_id,
        name: rel.company_name,
      },
      facility: rel.facility_id
        ? {
            id: rel.facility_id,
            name: rel.facility_name,
          }
        : null,
      department: rel.department_id
        ? {
            id: rel.department_id,
            name: rel.department_name,
          }
        : null,
    }))

    return res.status(200).json({ data: formattedRelationships })
  } catch (error) {
    console.error("Error fetching user-company relationships:", error)
    return res.status(500).json({
      message: "Server error fetching user-company relationships",
      error: error.message || "Unknown error",
    })
  }
})

app.delete("/api/user-companies/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    console.log(`Deleting user-company relationships for user ${userId}`)

    // Delete all relationships for this user
    await db.none("DELETE FROM user_companies WHERE user_id = $1", [userId])
    console.log(`Deleted all relationships for user ${userId}`)

    return res.status(200).json({
      message: "User-company relationships deleted successfully",
      success: true,
    })
  } catch (error) {
    console.error("Error deleting user-company relationships:", error)
    return res.status(500).json({
      message: "Server error deleting user-company relationships",
      error: error.message || "Unknown error",
    })
  }
})

// Update the POST /api/users route to handle role_id instead of role
// Find the existing route and replace it with:

app.post("/api/users", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    console.log("Creating user with data:", JSON.stringify(req.body))
    const { email, password, first_name, last_name, role_id, is_active, require_password_change } = req.body

    // Validate required fields
    if (!email || !password || !first_name || !last_name || !role_id) {
      return res.status(400).json({
        message: "Missing required fields",
        error: "Email, password, first_name, last_name, and role_id are required",
      })
    }

    // Check if email already exists
    const existingUser = await db.oneOrNone("SELECT id FROM users WHERE email = $1", [email])
    if (existingUser) {
      return res.status(409).json({
        message: "User with this email already exists",
        error: "Email already in use",
      })
    }

    // Check if role exists
    const roleExists = await db.oneOrNone("SELECT id FROM roles WHERE id = $1", [role_id])
    if (!roleExists) {
      return res.status(400).json({
        message: "Invalid role_id",
        error: "The specified role_id does not exist",
      })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Insert new user
    const newUser = await db.one(
      `
      INSERT INTO users (
        email, password_hash, first_name, last_name, role_id, is_active, 
        require_password_change, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role_id, is_active
      `,
      [
        email,
        hashedPassword,
        first_name,
        last_name,
        role_id,
        is_active !== undefined ? is_active : true,
        require_password_change !== undefined ? require_password_change : true,
        req.user.id,
      ],
    )

    console.log("User created successfully:", newUser)
    return res.status(201).json(newUser)
  } catch (error) {
    console.error("Error creating user:", error)
    return res.status(500).json({
      message: "Server error creating user",
      error: error.message || "Unknown error",
    })
  }
})

// Update the PUT /api/users/:id route to handle role_id instead of role
app.put("/api/users/:id", authenticateToken, checkRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Updating user with ID ${id} with data:`, JSON.stringify(req.body))
    const { email, first_name, last_name, role_id, is_active, phone } = req.body

    // Validate required fields
    if (!email || !first_name || !last_name || !role_id) {
      return res.status(400).json({
        message: "Missing required fields",
        error: "Email, first_name, last_name, and role_id are required",
      })
    }

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [id])
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        error: "The specified user does not exist",
      })
    }

    // Check if role exists
    const roleExists = await db.oneOrNone("SELECT id FROM roles WHERE id = $1", [role_id])
    if (!roleExists) {
      return res.status(400).json({
        message: "Invalid role_id",
        error: "The specified role_id does not exist",
      })
    }

    // Update user
    const updatedUser = await db.one(
      `
      UPDATE users SET
        email = $1,
        first_name = $2,
        last_name = $3,
        role_id = $4,
        is_active = $5,
        phone = $6,
        updated_at = NOW(),
        updated_by = $7
      WHERE id = $8
      RETURNING id, email, first_name, last_name, role_id, is_active, phone
      `,
      [email, first_name, last_name, role_id, is_active, phone, req.user.id, id],
    )

    console.log("User updated successfully:", updatedUser)
    return res.status(200).json(updatedUser)
  } catch (error) {
    console.error("Error updating user:", error)
    return res.status(500).json({
      message: "Server error updating user",
      error: error.message || "Unknown error",
    })
  }
})

// Update the GET /api/users route to include role information
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching all users with company relationships")

    // Get users with role information
    const users = await db.manyOrNone(`
      SELECT u.id, u.email, u.first_name, u.last_name, 
             r.id as role_id, r.name as role, 
             u.is_active, u.created_at, u.updated_at, 
             u.require_password_change, u.last_login, u.phone
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `)

    console.log(`Found ${users.length} users`)

    // For each user, get their company relationships
    const formattedUsers = await Promise.all(
      users.map(async (user) => {
        try {
          // Get primary company relationship
          const relationshipQuery = `
          SELECT uc.company_id, uc.facility_id, uc.department_id,
                 c.name as company_name,
                 f.name as facility_name,
                 d.name as department_name
          FROM user_companies uc
          LEFT JOIN companies c ON uc.company_id = c.id
          LEFT JOIN facilities f ON uc.facility_id = f.id
          LEFT JOIN departments d ON uc.department_id = d.id
          WHERE uc.user_id = $1
          ORDER BY uc.is_primary DESC
          LIMIT 1
        `

          const relationship = await db.oneOrNone(relationshipQuery, [user.id])

          return {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role_id: user.role_id,
            role: user.role,
            is_active: user.is_active,
            phone: user.phone,
            created_at: user.created_at,
            updated_at: user.updated_at,
            require_password_change: user.require_password_change,
            last_login_at: user.last_login,
            company:
              relationship && relationship.company_id
                ? {
                    id: relationship.company_id,
                    name: relationship.company_name,
                  }
                : null,
            facility:
              relationship && relationship.facility_id
                ? {
                    id: relationship.facility_id,
                    name: relationship.facility_name,
                  }
                : null,
            department:
              relationship && relationship.department_id
                ? {
                    id: relationship.department_id,
                    name: relationship.department_name,
                  }
                : null,
          }
        } catch (error) {
          console.error(`Error getting relationships for user ${user.id}:`, error)
          // Return user without relationships
          return {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role_id: user.role_id,
            role: user.role,
            is_active: user.is_active,
            phone: user.phone,
            created_at: user.created_at,
            updated_at: user.updated_at,
            require_password_change: user.require_password_change,
            last_login_at: user.last_login,
            company: null,
            facility: null,
            department: null,
          }
        }
      }),
    )

    console.log("Returning users with relationships")
    return res.status(200).json({ data: formattedUsers })
  } catch (error) {
    console.error("Error fetching users:", error)
    return res.status(500).json({
      message: "Server error fetching users",
      error: error.message || "Unknown error",
    })
  }
})

// Add User-Company relationships endpoints
app.post("/api/user-companies", authenticateToken, async (req, res) => {
  try {
    console.log("Creating user-company relationship with data:", JSON.stringify(req.body))
    const { user_id, company_id, facility_id, department_id, is_primary } = req.body

    // Validate required fields
    if (!user_id || !company_id) {
      return res.status(400).json({
        message: "Missing required fields",
        error: "user_id and company_id are required",
      })
    }

    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [user_id])
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        error: "The specified user does not exist",
      })
    }

    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [company_id])
    if (!company) {
      return res.status(404).json({
        message: "Company not found",
        error: "The specified company does not exist",
      })
    }

    // If facility_id is provided, check if it exists and belongs to the company
    if (facility_id) {
      const facility = await db.oneOrNone("SELECT id FROM facilities WHERE id = $1 AND company_id = $2", [
        facility_id,
        company_id,
      ])

      if (!facility) {
        return res.status(400).json({
          message: "Invalid facility",
          error: "The facility does not exist or does not belong to the specified company",
        })
      }

      // If department_id is provided, check if it exists and belongs to the facility
      if (department_id) {
        const department = await db.oneOrNone("SELECT id FROM departments WHERE id = $1 AND facility_id = $2", [
          department_id,
          facility_id,
        ])

        if (!department) {
          return res.status(400).json({
            message: "Invalid department",
            error: "The department does not exist or does not belong to the specified facility",
          })
        }
      }
    }

    // Check if relationship already exists
    const existingRelationship = await db.oneOrNone(
      "SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2",
      [user_id, company_id],
    )

    if (existingRelationship) {
      // Update existing relationship
      console.log("Updating existing user-company relationship")
      const updatedRelationship = await db.one(
        `
        UPDATE user_companies SET
          facility_id = $1,
          department_id = $2,
          is_primary = $3,
          updated_at = NOW()
        WHERE user_id = $4 AND company_id = $5
        RETURNING *
        `,
        [facility_id, department_id, is_primary || false, user_id, company_id],
      )

      console.log("User-company relationship updated successfully:", updatedRelationship)
      return res.status(200).json(updatedRelationship)
    }

    // If is_primary is true, set all other relationships for this user to is_primary = false
    if (is_primary) {
      await db.none("UPDATE user_companies SET is_primary = FALSE WHERE user_id = $1", [user_id])
    }

    // Insert new relationship
    const newRelationship = await db.one(
      `
      INSERT INTO user_companies (
        user_id, company_id, facility_id, department_id, is_primary
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *
      `,
      [user_id, company_id, facility_id, department_id, is_primary || false],
    )

    console.log("User-company relationship created successfully:", newRelationship)
    return res.status(201).json(newRelationship)
  } catch (error) {
    console.error("Error creating user-company relationship:", error)
    return res.status(500).json({
      message: "Server error creating user-company relationship",
      error: error.message || "Unknown error",
    })
  }
})


app.get("/api/user-companies/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    console.log(`Fetching user-company relationships for user ${userId}`)

    // Get relationships with company, facility, and department info
    const relationships = await db.manyOrNone(
      `
      SELECT uc.*, 
             c.id as company_id, c.name as company_name,
             f.id as facility_id, f.name as facility_name,
             d.id as department_id, d.name as department_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      LEFT JOIN facilities f ON uc.facility_id = f.id
      LEFT JOIN departments d ON uc.department_id = d.id
      WHERE uc.user_id = $1
      ORDER BY uc.is_primary DESC
      `,
      [userId],
    )

    console.log(`Found ${relationships.length} relationships for user ${userId}`)

    // Format the response
    const formattedRelationships = relationships.map((rel) => ({
      id: rel.id,
      user_id: rel.user_id,
      is_primary: rel.is_primary,
      created_at: rel.created_at,
      updated_at: rel.updated_at,
      company: {
        id: rel.company_id,
        name: rel.company_name,
      },
      facility: rel.facility_id
        ? {
            id: rel.facility_id,
            name: rel.facility_name,
          }
        : null,
      department: rel.department_id
        ? {
            id: rel.department_id,
            name: rel.department_name,
          }
        : null,
    }))

    return res.status(200).json({ data: formattedRelationships })
  } catch (error) {
    console.error("Error fetching user-company relationships:", error)
    return res.status(500).json({
      message: "Server error fetching user-company relationships",
      error: error.message || "Unknown error",
    })
  }
})

// User-level device assignment endpoints
// Add these to your server.js file

// Get all edge gateways assigned to a specific user
app.get("/api/users/:userId/edge-gateways", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [userId]);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get edge gateways assigned to this user
    const edgeGateways = await db.manyOrNone(`
      SELECT uega.*, eg.serial_number, eg.status, eg.firmware_version, eg.last_seen,
             dm.model_name, m.name as manufacturer_name,
             c.name as company_name, f.name as facility_name, d.name as department_name
      FROM user_edge_gateway_assignments uega
      JOIN edge_gateways eg ON uega.edge_gateway_id = eg.id
      JOIN device_models dm ON eg.model_id = dm.id
      JOIN manufacturers m ON dm.manufacturer_id = m.id
      JOIN companies c ON uega.company_id = c.id
      LEFT JOIN facilities f ON uega.facility_id = f.id
      LEFT JOIN departments d ON uega.department_id = d.id
      WHERE uega.user_id = $1
      ORDER BY uega.created_at DESC
    `, [userId]);
    
    return res.status(200).json({ data: edgeGateways });
  } catch (error) {
    console.error("Error fetching user edge gateways:", error);
    return res.status(500).json({ message: "Server error fetching user edge gateways" });
  }
});

// Get all smart meters assigned to a specific user
app.get("/api/users/:userId/smart-meters", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [userId]);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get smart meters assigned to this user
    const smartMeters = await db.manyOrNone(`
      SELECT usma.*, sm.serial_number, sm.status, sm.firmware_version, sm.last_seen,
             dm.model_name, m.name as manufacturer_name,
             c.name as company_name, f.name as facility_name, d.name as department_name,
             eg.serial_number as edge_gateway_serial
      FROM user_smart_meter_assignments usma
      JOIN smart_meters sm ON usma.smart_meter_id = sm.id
      JOIN device_models dm ON sm.model_id = dm.id
      JOIN manufacturers m ON dm.manufacturer_id = m.id
      JOIN companies c ON usma.company_id = c.id
      LEFT JOIN facilities f ON usma.facility_id = f.id
      LEFT JOIN departments d ON usma.department_id = d.id
      LEFT JOIN edge_gateways eg ON usma.edge_gateway_id = eg.id
      WHERE usma.user_id = $1
      ORDER BY usma.created_at DESC
    `, [userId]);
    
    return res.status(200).json({ data: smartMeters });
  } catch (error) {
    console.error("Error fetching user smart meters:", error);
    return res.status(500).json({ message: "Server error fetching user smart meters" });
  }
});

// Assign edge gateway to a specific user
app.post("/api/users/:userId/edge-gateways", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { edge_gateway_id, company_id, facility_id, department_id } = req.body;
    
    // Validate required fields
    if (!edge_gateway_id || !company_id) {
      return res.status(400).json({ message: "Edge gateway ID and company ID are required" });
    }
    
    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [userId]);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check if edge gateway exists and is available
    const gateway = await db.oneOrNone("SELECT id, status FROM edge_gateways WHERE id = $1", [edge_gateway_id]);
    if (!gateway) {
      return res.status(404).json({ message: "Edge gateway not found" });
    }
    
    if (gateway.status !== "available") {
      return res.status(409).json({ message: "Edge gateway is not available for assignment" });
    }
    
    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [company_id]);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    
    // Start a transaction
    return await db.tx(async (t) => {
      // Create user-edge gateway assignment
      const assignment = await t.one(`
        INSERT INTO user_edge_gateway_assignments (
          user_id, edge_gateway_id, company_id, facility_id, department_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
      `, [userId, edge_gateway_id, company_id, facility_id || null, department_id || null, req.user.id]);
      
      // Update edge gateway status
      await t.none("UPDATE edge_gateways SET status = $1 WHERE id = $2", ["assigned", edge_gateway_id]);
      
      return res.status(201).json(assignment);
    });
  } catch (error) {
    console.error("Error assigning edge gateway to user:", error);
    return res.status(500).json({ message: "Server error assigning edge gateway to user" });
  }
});

// Assign smart meter to a specific user
app.post("/api/users/:userId/smart-meters", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { smart_meter_id, edge_gateway_id, company_id, facility_id, department_id } = req.body;
    
    // Validate required fields
    if (!smart_meter_id || !company_id) {
      return res.status(400).json({ message: "Smart meter ID and company ID are required" });
    }
    
    // Check if user exists
    const user = await db.oneOrNone("SELECT id FROM users WHERE id = $1", [userId]);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check if smart meter exists and is available
    const smartMeter = await db.oneOrNone("SELECT id, status FROM smart_meters WHERE id = $1", [smart_meter_id]);
    if (!smartMeter) {
      return res.status(404).json({ message: "Smart meter not found" });
    }
    
    if (smartMeter.status !== "available") {
      return res.status(409).json({ message: "Smart meter is not available for assignment" });
    }
    
    // Check if company exists
    const company = await db.oneOrNone("SELECT id FROM companies WHERE id = $1", [company_id]);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    
    // If edge gateway is provided, check if it exists and is assigned to the same user
    if (edge_gateway_id) {
      const gatewayAssignment = await db.oneOrNone(`
        SELECT id FROM user_edge_gateway_assignments 
        WHERE edge_gateway_id = $1 AND user_id = $2
      `, [edge_gateway_id, userId]);
      
      if (!gatewayAssignment) {
        return res.status(400).json({ 
          message: "The specified edge gateway is not assigned to this user or does not exist" 
        });
      }
    }
    
    // Start a transaction
    return await db.tx(async (t) => {
      // Create user-smart meter assignment
      const assignment = await t.one(`
        INSERT INTO user_smart_meter_assignments (
          user_id, smart_meter_id, edge_gateway_id, company_id, facility_id, department_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
      `, [
        userId, 
        smart_meter_id, 
        edge_gateway_id || null, 
        company_id, 
        facility_id || null, 
        department_id || null, 
        req.user.id
      ]);
      
      // Update smart meter status
      await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["assigned", smart_meter_id]);
      
      return res.status(201).json(assignment);
    });
  } catch (error) {
    console.error("Error assigning smart meter to user:", error);
    return res.status(500).json({ message: "Server error assigning smart meter to user" });
  }
});

// Remove edge gateway assignment from a user
app.delete("/api/users/:userId/edge-gateways/:gatewayId", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { userId, gatewayId } = req.params;
    
    // Check if assignment exists
    const assignment = await db.oneOrNone(`
      SELECT id FROM user_edge_gateway_assignments 
      WHERE user_id = $1 AND edge_gateway_id = $2
    `, [userId, gatewayId]);
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // Start a transaction
    return await db.tx(async (t) => {
      // Get any smart meters assigned to this edge gateway and user
      const smartMeterAssignments = await t.manyOrNone(`
        SELECT id, smart_meter_id FROM user_smart_meter_assignments 
        WHERE user_id = $1 AND edge_gateway_id = $2
      `, [userId, gatewayId]);
      
      // Update smart meter assignments to remove edge gateway reference
      for (const sma of smartMeterAssignments) {
        await t.none(`
          UPDATE user_smart_meter_assignments 
          SET edge_gateway_id = NULL, updated_at = NOW(), updated_by = $1
          WHERE id = $2
        `, [req.user.id, sma.id]);
      }
      
      // Delete edge gateway assignment
      await t.none("DELETE FROM user_edge_gateway_assignments WHERE id = $1", [assignment.id]);
      
      // Update edge gateway status
      await t.none("UPDATE edge_gateways SET status = $1 WHERE id = $2", ["available", gatewayId]);
      
      return res.status(200).json({ message: "Edge gateway assignment removed successfully" });
    });
  } catch (error) {
    console.error("Error removing edge gateway assignment:", error);
    return res.status(500).json({ message: "Server error removing edge gateway assignment" });
  }
});

// Remove smart meter assignment from a user
app.delete("/api/users/:userId/smart-meters/:meterId", authenticateToken, checkRole(["admin", "operator"]), async (req, res) => {
  try {
    const { userId, meterId } = req.params;
    
    // Check if assignment exists
    const assignment = await db.oneOrNone(`
      SELECT id FROM user_smart_meter_assignments 
      WHERE user_id = $1 AND smart_meter_id = $2
    `, [userId, meterId]);
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // Start a transaction
    return await db.tx(async (t) => {
      // Delete smart meter assignment
      await t.none("DELETE FROM user_smart_meter_assignments WHERE id = $1", [assignment.id]);
      
      // Update smart meter status
      await t.none("UPDATE smart_meters SET status = $1 WHERE id = $2", ["available", meterId]);
      
      return res.status(200).json({ message: "Smart meter assignment removed successfully" });
    });
  } catch (error) {
    console.error("Error removing smart meter assignment:", error);
    return res.status(500).json({ message: "Server error removing smart meter assignment" });
  }
});