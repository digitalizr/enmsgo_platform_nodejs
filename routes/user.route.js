const express = require("express");
const router = express.Router();
const {
  addUser,
  getAllUsers,
  getSingleUser,
  updateUser,
  deleteUser,
  loginUser,
  logoutUser,
  verifyUser,
  getNewToken,
  getRefreshToken
} = require("../controllers/user.controller");

router.post("/", addUser);
router.get("/", getAllUsers);
router.get("/:id", getSingleUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

// Authentication Routes
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/verify", verifyUser);
router.post("/token", getNewToken);
router.post("/refresh-token", getRefreshToken);

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