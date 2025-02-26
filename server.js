require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

// Test DB Connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL 🚀'))
  .catch(err => {
    console.error('Connection error', err);
    console.error('Error details:', {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
  });

// Routes

// 1️⃣ Get All Companies
app.get('/companies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2️⃣ Add a Company
app.post('/companies', async (req, res) => {
  const { name, company_type, lead_name, email, phone } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO companies (name, company_type, lead_name, email, phone) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, company_type, lead_name, email, phone]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3️⃣ Get All Smart Meters
app.get('/smart-meters', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM smart_meters');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4️⃣ Add a Smart Meter
app.post('/smart-meters', async (req, res) => {
  const { brand, serial_number, mac_address, installed_location, installed_date, installed_by, company_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO smart_meters (brand, serial_number, mac_address, installed_location, installed_date, installed_by, company_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [brand, serial_number, mac_address, installed_location, installed_date, installed_by, company_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port} 🚀`);
});