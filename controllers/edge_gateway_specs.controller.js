const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add Edge Gateway Specifications
const addEdgeGatewaySpecs = async (req, res) => {
  const {
    gateway_id,
    os,
    os_version,
    cpu,
    memory,
    storage,
    connectivity,
    additional_specs,
  } = req.body;

  if (!gateway_id || !isUuid(gateway_id)) {
    return res.status(400).json({ message: "Invalid or missing gateway_id" });
  }

  try {
    const query = `
      INSERT INTO edge_gateway_specifications (gateway_id, os, os_version, cpu, memory, storage, connectivity, additional_specs)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
    `;
    const values = [
      gateway_id,
      os,
      os_version,
      cpu,
      memory,
      storage,
      connectivity,
      additional_specs,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({
        message: "Edge Gateway Specification added",
        specs: result.rows[0],
      });
  } catch (error) {
    console.error("Error adding Edge Gateway Specification:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all Edge Gateway Specifications
const getAllEdgeGatewaySpecs = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM edge_gateway_specifications ORDER BY updated_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching specifications:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get specifications by Gateway ID
const getEdgeGatewaySpecsById = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Gateway ID" });

  try {
    const result = await client.query(
      "SELECT * FROM edge_gateway_specifications WHERE gateway_id = $1;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Specifications not found" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching specification:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update Edge Gateway Specifications
const updateEdgeGatewaySpecs = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!isUuid(id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid ID or no fields to update" });
  }

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE edge_gateway_specifications
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE gateway_id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Specifications not found" });

    res
      .status(200)
      .json({ message: "Specifications updated", specs: result.rows[0] });
  } catch (error) {
    console.error("Error updating specifications:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete Edge Gateway Specifications
const deleteEdgeGatewaySpecs = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id))
    return res.status(400).json({ message: "Invalid Gateway ID" });

  try {
    const result = await client.query(
      "DELETE FROM edge_gateway_specifications WHERE gateway_id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Specifications not found" });

    res
      .status(200)
      .json({ message: "Specifications deleted", specs: result.rows[0] });
  } catch (error) {
    console.error("Error deleting specifications:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addEdgeGatewaySpecs,
  getAllEdgeGatewaySpecs,
  getEdgeGatewaySpecsById,
  updateEdgeGatewaySpecs,
  deleteEdgeGatewaySpecs,
};
