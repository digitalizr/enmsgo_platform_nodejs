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

// Authentication routes
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/verify", verifyUser);
router.post("/token", getNewToken);
router.post("/refresh-token", getRefreshToken);

// User CRUD routes
router.post("/", addUser);
router.get("/", getAllUsers);
router.get("/:id", getSingleUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
