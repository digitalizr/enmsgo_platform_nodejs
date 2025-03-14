const { client } = require("../lib/connectDB.js");

// Department Controller
const registerDepartment = async (req, res) => {
  const { name, facility_id } = req.body;

  if (!name || !facility_id) {
    return res
      .status(400)
      .json({ message: "Name and facility ID are required" });
  }

  try {
    const query = `
      INSERT INTO departments (name, facility_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *;
    `;
    const values = [name, facility_id];
    const result = await client.query(query, values);

    res
      .status(201)
      .json({ message: "Department registered", department: result.rows[0] });
  } catch (error) {
    console.error("Error registering department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getDepartmentById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "SELECT * FROM departments WHERE id = $1;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllDepartments = async (req, res) => {
  try {
    const query = "SELECT * FROM departments ORDER BY created_at DESC;";
    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    let query = "UPDATE departments SET ";
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
      return res.status(404).json({ message: "Department not found" });
    }

    res
      .status(200)
      .json({ message: "Department updated", department: result.rows[0] });
  } catch (error) {
    console.error("Error updating department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteDepartment = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM departments WHERE id = $1 RETURNING *;";
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    res
      .status(200)
      .json({ message: "Department deleted", department: result.rows[0] });
  } catch (error) {
    console.error("Error deleting department:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  registerDepartment,
  getDepartmentById,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
};
