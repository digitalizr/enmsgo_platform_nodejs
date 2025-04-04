const { client } = require("../lib/connectDB.js");
const bcrypt = require("bcrypt");
const { validate: isUuid } = require("uuid");

const SALT_ROUNDS = 10;

// Add a new Edge Gateway connection info
const addEdgeGatewayConnectionInfo = async (req, res) => {
  const {
    gateway_id,
    ssh_username,
    ssh_password,
    ssh_key,
    web_interface_url,
    web_username,
    web_password,
    api_key,
    notes,
  } = req.body;

  if (!gateway_id || !isUuid(gateway_id)) {
    return res.status(400).json({ message: "Invalid or missing gateway_id" });
  }

  try {
    // Hash passwords before saving
    const hashedSSHPassword = ssh_password
      ? await bcrypt.hash(ssh_password, SALT_ROUNDS)
      : null;
    const hashedWebPassword = web_password
      ? await bcrypt.hash(web_password, SALT_ROUNDS)
      : null;

    const query = `
      INSERT INTO edge_gateway_connection_details (
        gateway_id, ssh_username, ssh_password, ssh_key, 
        web_interface_url, web_username, web_password, api_key, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *;
    `;
    const values = [
      gateway_id,
      ssh_username,
      hashedSSHPassword,
      ssh_key,
      web_interface_url,
      web_username,
      hashedWebPassword,
      api_key,
      notes,
    ];

    const result = await client.query(query, values);
    res
      .status(201)
      .json({ message: "Connection info added", connection: result.rows[0] });
  } catch (error) {
    console.error("Error adding connection info:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all connection details
const getAllEdgeGatewayConnectionInfos = async (_, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM edge_gateway_connection_details ORDER BY updated_at DESC;"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching connection details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get connection details by Gateway ID
const getEdgeGatewayConnectionInfoById = async (req, res) => {
  const { id: gateway_id } = req.params;
  if (!isUuid(gateway_id))
    return res.status(400).json({ message: "Invalid Gateway ID" });

  try {
    const result = await client.query(
      "SELECT * FROM edge_gateway_connection_details WHERE gateway_id = $1;",
      [gateway_id]
    );
    if (!result.rows.length)
      return res
        .status(404)
        .json({ message: "No connection details found for this Gateway" });

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching connection details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update connection details by Gateway ID
const updateEdgeGatewayConnectionInfo = async (req, res) => {
  const { id: gateway_id } = req.params;
  const updates = req.body;

  if (!isUuid(gateway_id) || !Object.keys(updates).length) {
    return res
      .status(400)
      .json({ message: "Invalid Gateway ID or no fields to update" });
  }

  // Hash passwords if updated
  if (updates.ssh_password)
    updates.ssh_password = await bcrypt.hash(updates.ssh_password, SALT_ROUNDS);
  if (updates.web_password)
    updates.web_password = await bcrypt.hash(updates.web_password, SALT_ROUNDS);

  const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
  if (!fields.length)
    return res.status(400).json({ message: "No updatable fields" });

  try {
    const query = `
      UPDATE edge_gateway_connection_details
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE gateway_id = $${fields.length + 1} RETURNING *;
    `;
    const values = [...Object.values(updates), gateway_id];

    const result = await client.query(query, values);
    if (!result.rows.length)
      return res.status(404).json({ message: "Connection details not found" });

    res
      .status(200)
      .json({
        message: "Connection details updated",
        connection: result.rows[0],
      });
  } catch (error) {
    console.error("Error updating connection details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete connection details by Gateway ID
const deleteEdgeGatewayConnectionInfo = async (req, res) => {
  const { id: gateway_id } = req.params;
  if (!isUuid(gateway_id))
    return res.status(400).json({ message: "Invalid Gateway ID" });

  try {
    const result = await client.query(
      "DELETE FROM edge_gateway_connection_details WHERE gateway_id = $1 RETURNING *;",
      [gateway_id]
    );
    if (!result.rows.length)
      return res.status(404).json({ message: "Connection details not found" });

    res
      .status(200)
      .json({
        message: "Connection details deleted",
        connection: result.rows[0],
      });
  } catch (error) {
    console.error("Error deleting connection details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addEdgeGatewayConnectionInfo,
  getAllEdgeGatewayConnectionInfos,
  getEdgeGatewayConnectionInfoById,
  updateEdgeGatewayConnectionInfo,
  deleteEdgeGatewayConnectionInfo,
};
