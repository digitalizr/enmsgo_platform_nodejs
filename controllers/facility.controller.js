const { client } = require("../lib/connectDB.js");

// Facility Controller
const registerFacility = async (req, res) => {
  const { name, company_id, location } = req.body;

  if (!name || !company_id || !location) {
    return res
      .status(400)
      .json({ message: "Name, company ID, and location are required" });
  }

  try {
    const query = `
      INSERT INTO facilities (name, company_id, location, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *;
    `;
    const values = [name, company_id, location];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Facility registered", facility: result.rows[0] });
  } catch (error) {
    console.error("Error registering facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getFacilityById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "SELECT * FROM facilities WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Facility not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllFacilities = async (req, res) => {
  try {
    const query = "SELECT * FROM facilities ORDER BY created_at DESC;";
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching facilities:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateFacility = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    let query = "UPDATE facilities SET ";
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
      return res.status(404).json({ message: "Facility not found" });
    }

    res
      .status(200)
      .json({ message: "Facility updated", facility: result.rows[0] });
  } catch (error) {
    console.error("Error updating facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteFacility = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM facilities WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Facility not found" });
    }

    res
      .status(200)
      .json({ message: "Facility deleted", facility: result.rows[0] });
  } catch (error) {
    console.error("Error deleting facility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  registerFacility,
  getFacilityById,
  getAllFacilities,
  updateFacility,
  deleteFacility,
};
