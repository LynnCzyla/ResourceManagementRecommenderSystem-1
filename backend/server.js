// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Import auth middleware - CORRECT PATH
const { verifyToken } = require('./routes/Middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// Import routes    
const userRoutes = require("./routes/Admin/createUsers");
const userManagementRoutes = require("./routes/Admin/userManagement");
const forgotPasswordRoutes = require("./routes/Auth/forgotPassword");
const systemSettingsRoutes = require("./routes/Admin/systemSettings"); // Add this

// Use routes

app.use('/api/admin', require('./routes/Admin/contactAdmin'));
// with the other app.use lines
app.use("/api/auth", forgotPasswordRoutes);
app.use("/api/users", verifyToken, userRoutes);
app.use("/api/users", verifyToken, userManagementRoutes);
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