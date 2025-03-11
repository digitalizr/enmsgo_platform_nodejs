const { Client } = require("pg");

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,  
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const connectDB = async () => {
  console.log("Attempting to connect to PostgreSQL...");

  try {
    await client.connect();
    console.log("Connected to PostgreSQL ✅");
  } catch (err) {
    console.error("Connection error ❌", err);
    process.exit(1); 
  }
};

module.exports = { connectDB, client };
