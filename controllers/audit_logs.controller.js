const { client } = require("../lib/connectDB.js");

// Add an audit log entry
const addAuditLog = async (req, res) => {
  const {
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    ip_address,
  } = req.body;

  if (!table_name || !record_id || !action) {
    return res
      .status(400)
      .json({ message: "table_name, record_id, and action are required" });
  }

  try {
    const query = `
      INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      table_name,
      record_id,
      action,
      old_data || null,
      new_data || null,
      changed_by || null,
      ip_address || null,
    ];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Audit log added", auditLog: result.rows[0] });
  } catch (error) {
    console.error("Error adding audit log:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all audit log entries
const getAllAuditLogs = async (req, res) => {
  try {
    const query = "SELECT * FROM audit_logs ORDER BY changed_at DESC;";
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single audit log entry by ID
const getSingleAuditLog = async (req, res) => {
  const { id } = req.params;
  try {
    const query = "SELECT * FROM audit_logs WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Audit log not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update an audit log entry (Not typically needed, but included for completeness)
const updateAuditLog = async (req, res) => {
  return res
    .status(405)
    .json({ message: "Update operation not allowed on audit logs" });
};

// Delete an audit log entry
const deleteAuditLog = async (req, res) => {
  const { id } = req.params;
  try {
    const query = "DELETE FROM audit_logs WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Audit log not found" });
    }

    res
      .status(200)
      .json({ message: "Audit log deleted", auditLog: result.rows[0] });
  } catch (error) {
    console.error("Error deleting audit log:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addAuditLog,
  getAllAuditLogs,
  getSingleAuditLog,
  updateAuditLog,
  deleteAuditLog,
};
