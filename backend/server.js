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
// with the other route imports
const forgotPasswordRoutes = require("./routes/Auth/forgotPassword");

// with the other app.use lines
app.use("/api/auth", forgotPasswordRoutes);

// Use routes
app.use("/api/users", userRoutes);
app.use("/api/users", userManagementRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "Backend API is running"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});