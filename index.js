const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const audit_logs = require("./routes/audit_logs.route.js");
const rolesRoutes = require("./routes/roles.route.js");
const permissionRoutes = require("./routes/permission.route.js");
const userRoutes = require("./routes/user.route.js")
const facilitiesRoutes = require("./routes/facility.route.js")
const departmentRoutes = require("./routes/department.route.js")
const companyRoutes = require("./routes/company.route.js");
const userCompanies = require("./routes/user_companies.route.js");
const smartMetersRoutes = require("./routes/smartMeter.route.js")
const manufacturerRoutes = require("./routes/manufacturers.route.js")


const cors = require("cors");

const app = express();

const { connectDB } = require("./lib/connectDB");

// useCors

app.use(cors())

// define port
const PORT = process.env.PORT;

// json middleware

app.use(express.json());

// routes
app.use("/api/audit-logs", audit_logs);
app.use("/api/roles", rolesRoutes);
app.use("/api/roles-permissions", permissionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/smart-meters", smartMetersRoutes);
app.use("/api/facility", facilitiesRoutes);
app.use("/api/department", departmentRoutes);
app.use("/api/user-companies", userCompanies);
app.use("/api/manufactures", manufacturerRoutes);

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on PORT ${PORT}`);
});
