// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Import routes    
const userRoutes = require("./routes/Admin/createUsers");
const userManagementRoutes = require("./routes/Admin/userManagement");
const forgotPasswordRoutes = require("./routes/Auth/forgotPassword");
const systemSettingsRoutes = require("./routes/Admin/systemSettings"); // Add this
const unlockRoutes = require("./routes/Admin/unlockUsers"); // Add this
const loginRoutes = require("./routes/Auth/login"); // Add this
const contactAdminRoutes = require('./routes/Admin/contactAdmin');


// with the other app.use lines
app.use('/api/admin', contactAdminRoutes);
app.use("/api/auth", forgotPasswordRoutes);
app.use("/api/auth", loginRoutes); // Login route
app.use("/api/users", userRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/admin", unlockRoutes); // Add admin routes
app.use("/api/settings", systemSettingsRoutes); // Add system settings routes

app.get("/", (req, res) => {
    res.json({
        message: "Backend API is running"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});