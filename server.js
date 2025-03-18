require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN }));

// Database Configuration
const pool = new Pool({
    user: process.env.DB_USER || "admin",
    host: process.env.DB_HOST || "103.91.67.38",
    database: process.env.DB_NAME || "energy_management",
    password: process.env.DB_PASS || "admin123",
    port: process.env.DB_PORT || 5432,
    ssl: false, // Change to { rejectUnauthorized: false } if using SSL
});

// Step 1: Check database connectivity
async function checkDatabaseConnection() {
    try {
        console.log("🔍 Checking database connection...");
        const client = await pool.connect();
        console.log("✅ Database connected successfully!");
        client.release();
    } catch (error) {
        console.error("❌ Database connection error:", error);
    }
}
checkDatabaseConnection();

// Step 2: Debugging route to check DB status
app.get("/health", async (req, res) => {
    try {
        console.log("⚡ Checking database health...");
        const result = await pool.query("SELECT NOW() AS server_time");
        res.json({ status: "UP", db_time: result.rows[0].server_time });
    } catch (error) {
        console.error("🚨 Database health check failed:", error);
        res.status(500).json({ status: "DOWN", error: error.message });
    }
});

// Authentication Route (Example)
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("🔍 Attempting login for:", email);
        
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = result.rows[0];
        if (user.password !== password) {  // ⚠️ Replace this with hashed password checking
            return res.status(401).json({ message: "Invalid credentials" });
        }
        
        res.json({ message: "Login successful", user: user.email });
    } catch (error) {
        console.error("🚨 Server error during login:", error);
        res.status(500).json({ message: "Server error during login" });
    }
});

// Step 3: Graceful Shutdown to prevent connection issues
process.on("SIGINT", async () => {
    console.log("🚦 Closing database connection...");
    await pool.end();
    console.log("🔌 Database connection closed. Exiting process.");
    process.exit(0);
});

// Step 4: Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
