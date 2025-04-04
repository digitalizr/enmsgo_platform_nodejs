const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new smart meter assignment
const addSmartMeterAssignment = async (req, res) => {
  const { assignment_id, smart_meter_id, created_by } = req.body;

  if (
    !assignment_id ||
    !isUuid(assignment_id) ||
    !smart_meter_id ||
    !isUuid(smart_meter_id)
  ) {
    return res
      .status(400)
      .json({ message: "Invalid or missing assignment_id or smart_meter_id" });
  }

  try {
    const query = `
      INSERT INTO smart_meter_assignments (
        assignment_id, smart_meter_id, created_by
      ) VALUES ($1, $2, $3) RETURNING *;
    `;
    const values = [assignment_id, smart_meter_id, created_by];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Smart Meter assigned", assignment: result.rows[0] });
  } catch (error) {
    if (error.constraint === "smart_meter_assignments_smart_meter_id_key") {
      return res
        .status(409)
        .json({ message: "Smart Meter is already assigned" });
    }
    console.error("Error adding smart meter assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all smart meter assignments
const getAllSmartMeterAssignments = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM smart_meter_assignments ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching smart meter assignments:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get smart meter assignment by ID
const getSmartMeterAssignmentById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res
      .status(400)
      .json({ message: "Invalid Smart Meter Assignment ID" });

  try {
    const result = await client.query(
      "SELECT * FROM smart_meter_assignments WHERE id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res
        .status(404)
        .json({ message: "Smart Meter Assignment not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching smart meter assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update smart meter assignment
const updateSmartMeterAssignment = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({
        message: "Invalid Smart Meter Assignment ID or no fields to update",
      });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE smart_meter_assignments
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res
        .status(404)
        .json({ message: "Smart Meter Assignment not found" });

    res
      .status(200)
      .json({
        message: "Smart Meter Assignment updated",
        assignment: result.rows[0],
      });
  } catch (error) {
    if (error.constraint === "smart_meter_assignments_smart_meter_id_key") {
      return res
        .status(409)
        .json({ message: "Smart Meter is already assigned" });
    }
    console.error("Error updating smart meter assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete smart meter assignment
const deleteSmartMeterAssignment = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res
      .status(400)
      .json({ message: "Invalid Smart Meter Assignment ID" });

  try {
    const result = await client.query(
      "DELETE FROM smart_meter_assignments WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res
        .status(404)
        .json({ message: "Smart Meter Assignment not found" });

    res
      .status(200)
      .json({
        message: "Smart Meter Assignment deleted",
        assignment: result.rows[0],
      });
  } catch (error) {
    console.error("Error deleting smart meter assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addSmartMeterAssignment,
  getAllSmartMeterAssignments,
  getSmartMeterAssignmentById,
  updateSmartMeterAssignment,
  deleteSmartMeterAssignment,
};
