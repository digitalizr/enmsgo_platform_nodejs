const { client } = require("../lib/connectDB.js");

// Utility function to validate MAC address format
const isValidMacAddress = (mac) => {
  const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
  return macRegex.test(mac);
};

// Add a new smart meter
const addSmartMeter = async (req, res) => {
  const {
    brand,
    serial_number,
    mac_address,
    installed_location,
    installed_date,
    installed_by,
    company_id,
  } = req.body;

  // Validate required fields
  if (!brand || !serial_number || !mac_address || !company_id) {
    return res
      .status(400)
      .json({
        message:
          "Brand, serial number, MAC address, and company ID are required",
      });
  }

  // Validate MAC address format
  if (!isValidMacAddress(mac_address)) {
    return res.status(400).json({ message: "Invalid MAC address format" });
  }

  try {
    // Ensure company exists before inserting
    const companyCheck = await client.query(
      "SELECT id FROM companies WHERE id = $1",
      [company_id]
    );
    if (companyCheck.rows.length === 0) {
      return res.status(400).json({ message: "Invalid company ID" });
    }

    // Insert the smart meter
    const query = `
      INSERT INTO smart_meters (brand, serial_number, mac_address, installed_location, installed_date, installed_by, company_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      brand,
      serial_number,
      mac_address,
      installed_location || null,
      installed_date || null,
      installed_by || null,
      company_id,
    ];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Smart meter added", smartMeter: result.rows[0] });
  } catch (error) {
    console.error("Error adding smart meter:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all smart meters
const getAllSmartMeters = async (req, res) => {
  try {
    const query = "SELECT * FROM smart_meters ORDER BY installed_date DESC;";
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching smart meters:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single smart meter by ID
const getSmartMeterById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "SELECT * FROM smart_meters WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Smart meter not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching smart meter:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a smart meter by ID
const updateSmartMeter = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  // Validate MAC address if provided
  if (updates.mac_address && !isValidMacAddress(updates.mac_address)) {
    return res.status(400).json({ message: "Invalid MAC address format" });
  }

  try {
    // Ensure company exists if updating company_id
    if (updates.company_id) {
      const companyCheck = await client.query(
        "SELECT id FROM companies WHERE id = $1",
        [updates.company_id]
      );
      if (companyCheck.rows.length === 0) {
        return res.status(400).json({ message: "Invalid company ID" });
      }
    }

    // Dynamically construct update query
    let query = "UPDATE smart_meters SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      query += `${key} = $${index}, `;
      values.push(updates[key]);
      index++;
    }

    // Remove trailing comma and add WHERE clause
    query = query.slice(0, -2) + ` WHERE id = $${index} RETURNING *;`;
    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Smart meter not found" });
    }

    res
      .status(200)
      .json({ message: "Smart meter updated", smartMeter: result.rows[0] });
  } catch (error) {
    console.error("Error updating smart meter:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a smart meter by ID
const deleteSmartMeter = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM smart_meters WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Smart meter not found" });
    }

    res
      .status(200)
      .json({ message: "Smart meter deleted", smartMeter: result.rows[0] });
  } catch (error) {
    console.error("Error deleting smart meter:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addSmartMeter,
  getAllSmartMeters,
  getSmartMeterById,
  updateSmartMeter,
  deleteSmartMeter,
};
