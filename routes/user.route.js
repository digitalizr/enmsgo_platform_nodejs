const express = require("express");
const router = express.Router();
const {
  addUser,
  getAllUsers,
  getSingleUser,
  updateUser,
  deleteUser,
} = require("../controllers/user.controller");

// Route to add a new user
router.post("/", addUser);

// Route to get all users
router.get("/", getAllUsers);

// Route to get a single user by ID
router.get("/:id", getSingleUser);

// Route to update a user by ID
router.put("/:id", updateUser);

// Route to delete a user by ID
router.delete("/:id", deleteUser);

module.exports = router;


// {
//   "email": "john.doe@example.com",
//   "password": "securePassword123",
//   "full_name": "John Doe",
//   "role": "manager",
//   "company_id": 1,
//   "facility_id": 1,
//   "department_id": 1,
//   "status": "active"
// }