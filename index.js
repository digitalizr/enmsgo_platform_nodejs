const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const audit_logs = require("./routes/audit_logs.route.js");
const rolesRoutes = require("./routes/roles.route.js");
const permissionRoutes = require("./routes/permission.route.js");
const rolePermission = require("./routes/roles-permissions.route.js");
const userRoutes = require("./routes/user.route.js");
const facilitiesRoutes = require("./routes/facility.route.js");
const departmentRoutes = require("./routes/department.route.js");
const companyRoutes = require("./routes/company.route.js");
const userCompanies = require("./routes/user_companies.route.js");
const manufacturerRoutes = require("./routes/manufacturers.route.js");
const deviceModelRoutes = require("./routes/device-model.route.js");
const smartMetersRoutes = require("./routes/smartMeter.route.js");
const edgeGatewayRoutes = require("./routes/edge_gateways.route.js");
const edgeGatewaySpecsRoutes = require("./routes/edge_gateway_specs.route.js");
const edgeGatewayIPRoutes = require("./routes/edge_gateway_ip.route.js");
const edgeGatewayConnectionInfoRoutes = require("./routes/edge_gateway_connection_details.route.js");
const assignmentsRoutes = require("./routes/assignments.route.js");
const smartMeterAssignmentsRoutes = require("./routes/smart_meter_assignments.route.js");
const subscriptionPlansRoutes = require("./routes/subscription_plans.route.js");
const subscriptionsRoutes = require("./routes/subscriptions.route.js");
const invoicesRoutes = require("./routes/invoices.routes.js");
const invoiceItemsRoutes = require("./routes/invoice_items.route.js");
const paymentsRoutes = require("./routes/payments.route.js");
const settingsRoutes = require("./routes/settings.route.js");
const integrationConfigsRoutes = require("./routes/integration_configs.route.js");

const cors = require("cors");

const app = express();

const { connectDB } = require("./lib/connectDB");

// useCors

app.use(cors());

// define port
const PORT = process.env.PORT;

// json middleware

app.use(express.json());

// routes
app.use("/api/audit-logs", audit_logs);
app.use("/api/roles", rolesRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/roles-permissions", rolePermission);
app.use("/api/users", userRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/facility", facilitiesRoutes);
app.use("/api/department", departmentRoutes);
app.use("/api/user-companies", userCompanies);
app.use("/api/manufactures", manufacturerRoutes);
app.use("/api/device-model", deviceModelRoutes);
app.use("/api/smart-meters", smartMetersRoutes);
app.use("/api/edge-gateway", edgeGatewayRoutes);
app.use("/api/edge-gateway-specs", edgeGatewaySpecsRoutes);
app.use("/api/edge-gateway-ip", edgeGatewayIPRoutes);
app.use("/api/edge-gateway-connection-info", edgeGatewayConnectionInfoRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/smart-meter-assignments", smartMeterAssignmentsRoutes);
app.use("/api/subscription-plans", subscriptionPlansRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/invoice-items", invoiceItemsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/integration-configs", integrationConfigsRoutes);

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on PORT ${PORT}`);
});
