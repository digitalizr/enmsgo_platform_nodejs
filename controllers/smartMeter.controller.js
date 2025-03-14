const { client } = require("../lib/connectDB.js");

// Smart Meter Controller
const addSmartMeter = async (req, res) => {
  const { serial_number, model, manufacturer, status } = req.body;

  if (!serial_number || !model || !manufacturer) {
    return res
      .status(400)
      .json({ message: "Serial number, model, and manufacturer are required" });
  }

  try {
    const query = `
      INSERT INTO smart_meters (serial_number, model, manufacturer, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [serial_number, model, manufacturer, status || "available"];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Smart meter added", smartMeter: result.rows[0] });
  } catch (error) {
    console.error("Error adding smart meter:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllSmartMeters = async (req, res) => {
  try {
    const query = "SELECT * FROM smart_meters ORDER BY id DESC;";
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching smart meters:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

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

const updateSmartMeter = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    let query = "UPDATE smart_meters SET ";
    const values = [];
    let index = 1;

    for (const key in updates) {
      query += `${key} = $${index}, `;
      values.push(updates[key]);
      index++;
    }

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
