const { client } = require("../lib/connectDB.js");
const { validate: isUuid } = require("uuid");

// Add a new IP address for an Edge Gateway
const addEdgeGatewayIP = async (req, res) => {
  const { gateway_id, ip_address, port, is_active } = req.body;

  if (!gateway_id || !isUuid(gateway_id)) {
    return res.status(400).json({ message: "Invalid or missing gateway_id" });
  }
  if (!ip_address) {
    return res.status(400).json({ message: "IP address is required" });
  }

  try {
    const query = `
      INSERT INTO edge_gateway_ip_addresses (gateway_id, ip_address, port, is_active)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [gateway_id, ip_address, port, is_active ?? true];

    const result = await client.query(query, values);
    res.status(201).json({ message: "IP address added", ip: result.rows[0] });
  } catch (error) {
    console.error("Error adding IP address:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all IP addresses
const getAllEdgeGatewayIPs = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM edge_gateway_ip_addresses ORDER BY created_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching IP addresses:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get IP addresses by Gateway ID
const getEdgeGatewayIPById = async (req, res) => {
  const { gateway_id } = req.params;
  if (!isUuid(gateway_id))
    return res.status(400).json({ message: "Invalid Gateway ID" });

  try {
    const result = await client.query(
      "SELECT * FROM edge_gateway_ip_addresses WHERE gateway_id = $1;",
      [gateway_id]
    );
    if (!result.rows.length)
      return res
        .status(404)
        .json({ message: "No IP addresses found for this Gateway" });

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching IP addresses:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update an IP address by ID
const updateEdgeGatewayIP = async (req, res) => {
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
      UPDATE edge_gateway_ip_addresses
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "IP address not found" });

    res.status(200).json({ message: "IP address updated", ip: result.rows[0] });
  } catch (error) {
    console.error("Error updating IP address:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete an IP address by ID
const deleteEdgeGatewayIP = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(400).json({ message: "Invalid IP ID" });

  try {
    const result = await client.query(
      "DELETE FROM edge_gateway_ip_addresses WHERE id = $1 RETURNING *;",
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "IP address not found" });

    res.status(200).json({ message: "IP address deleted", ip: result.rows[0] });
  } catch (error) {
    console.error("Error deleting IP address:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addEdgeGatewayIP,
  getAllEdgeGatewayIPs,
  getEdgeGatewayIPById,
  updateEdgeGatewayIP,
  deleteEdgeGatewayIP,
};
