const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new assignment
const addAssignment = async (req, res) => {
  const {
    company_id,
    facility_id,
    department_id,
    edge_gateway_id,
    created_by,
  } = req.body;

  if (
    !company_id ||
    !isUuid(company_id) ||
    !edge_gateway_id ||
    !isUuid(edge_gateway_id)
  ) {
    return res
      .status(400)
      .json({ message: "Invalid or missing company_id or edge_gateway_id" });
  }

  try {
    const query = `
      INSERT INTO assignments (
        company_id, facility_id, department_id, edge_gateway_id, created_by
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const values = [
      company_id,
      facility_id,
      department_id,
      edge_gateway_id,
      created_by,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Assignment created", assignment: result.rows[0] });
  } catch (error) {
    if (error.constraint === "assignments_edge_gateway_id_key") {
      return res
        .status(409)
        .json({ message: "Edge Gateway is already assigned" });
    }
    console.error("Error adding assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all assignments
const getAllAssignments = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM assignments ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get assignment by ID
const getAssignmentById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Assignment ID" });

  try {
    const result = await client.query(
      "SELECT * FROM assignments WHERE id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Assignment not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update assignment
const updateAssignment = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Assignment ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE assignments
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Assignment not found" });

    res
      .status(200)
      .json({ message: "Assignment updated", assignment: result.rows[0] });
  } catch (error) {
    if (error.constraint === "assignments_edge_gateway_id_key") {
      return res
        .status(409)
        .json({ message: "Edge Gateway is already assigned" });
    }
    console.error("Error updating assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete assignment
const deleteAssignment = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Assignment ID" });

  try {
    const result = await client.query(
      "DELETE FROM assignments WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Assignment not found" });

    res
      .status(200)
      .json({ message: "Assignment deleted", assignment: result.rows[0] });
  } catch (error) {
    console.error("Error deleting assignment:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addAssignment,
  getAllAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
};
