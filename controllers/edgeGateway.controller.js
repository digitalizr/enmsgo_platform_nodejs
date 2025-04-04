const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new Edge Gateway
const addEdgeGateway = async (req, res) => {
  const {
    serial_number,
    model_id,
    mac_address,
    status = "available",
    firmware_version,
    last_seen,
    notes,
    created_by,
  } = req.body;

  if (
    !serial_number ||
    !model_id ||
    !isUuid(model_id) ||
    (created_by && !isUuid(created_by))
  ) {
    return res
      .status(400)
      .json({ message: "Invalid or missing required fields" });
  }

  try {
    const query = `
      INSERT INTO edge_gateways (serial_number, model_id, mac_address, status, firmware_version, last_seen, notes, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING *;
    `;
    const values = [
      serial_number,
      model_id,
      mac_address,
      status,
      firmware_version,
      last_seen,
      notes,
      created_by,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Edge Gateway added", edgeGateway: result.rows[0] });
  } catch (error) {
    console.error("Error adding Edge Gateway:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all Edge Gateways
const getAllEdgeGateways = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM edge_gateways ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching Edge Gateways:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single Edge Gateway by ID
const getEdgeGatewayById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Edge Gateway ID" });

  try {
    const result = await client.query(
      "SELECT * FROM edge_gateways WHERE id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Edge Gateway not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching Edge Gateway:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update an Edge Gateway
const updateEdgeGateway = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid ID or no fields to update" });
  }

  const fields = Object.keys(updates)
    .filter((key) => key !== "created_by")
    .map((key, i) => `${key} = $${i + 1}`);

  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `UPDATE edge_gateways SET ${fields.join(
      ", "
    )}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *;`;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Edge Gateway not found" });

    res
      .status(200)
      .json({ message: "Edge Gateway updated", edgeGateway: result.rows[0] });
  } catch (error) {
    console.error("Error updating Edge Gateway:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete an Edge Gateway
const deleteEdgeGateway = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Edge Gateway ID" });

  try {
    const result = await client.query(
      "DELETE FROM edge_gateways WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Edge Gateway not found" });

    res
      .status(200)
      .json({ message: "Edge Gateway deleted", edgeGateway: result.rows[0] });
  } catch (error) {
    console.error("Error deleting Edge Gateway:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addEdgeGateway,
  getAllEdgeGateways,
  getEdgeGatewayById,
  updateEdgeGateway,
  deleteEdgeGateway,
};
