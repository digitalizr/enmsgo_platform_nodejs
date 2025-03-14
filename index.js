const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const companyRoutes = require("./routes/company.route.js");
const userRoutes = require("./routes/user.route.js");
const smartMetersRoutes = require("./routes/smartMeter.route.js")
const facilitiesRoutes = require("./routes/facility.route.js")
const departmentRoutes = require("./routes/department.route.js")

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
app.use("/api/users", userRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/smart-meters", smartMetersRoutes);
app.use("/api/facility", facilitiesRoutes);
app.use("/api/department", departmentRoutes);

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on PORT ${PORT}`);
});
