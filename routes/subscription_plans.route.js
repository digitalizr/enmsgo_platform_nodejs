const express = require("express");
const router = express.Router();
const {
  addSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} = require("../controllers/subscription_plans.controller.js");

// Subscription Plan Routes
router.post("/", addSubscriptionPlan);
router.get("/", getAllSubscriptionPlans);
router.get("/:id", getSubscriptionPlanById);
router.put("/:id", updateSubscriptionPlan);
router.delete("/:id", deleteSubscriptionPlan);

module.exports = router;
