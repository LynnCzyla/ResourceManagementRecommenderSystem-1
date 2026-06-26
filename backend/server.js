// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes    
const userRoutes = require("./routes/Admin/createUsers");
const userManagementRoutes = require("./routes/Admin/userManagement");
const forgotPasswordRoutes = require("./routes/Auth/forgotPassword");
const systemSettingsRoutes = require("./routes/Admin/systemSettings"); // Add this
const unlockRoutes = require("./routes/Admin/unlockUsers"); // Add this
const loginRoutes = require("./routes/Auth/login"); // Add this
const contactAdminRoutes = require('./routes/Admin/contactAdmin');
const departmentsPositionsRoutes = require('./routes/Admin/departmentsPositions'); // Add this
const notificationsRouter = require('./routes/notifications');
const documentRoutes = require('./routes/Employee/documentRoutes');

// with the other app.use lines
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', departmentsPositionsRoutes);
app.use('/api/admin', contactAdminRoutes);
app.use("/api/auth", forgotPasswordRoutes);
app.use("/api/auth", loginRoutes); // Login route
app.use("/api/users", userRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/admin", unlockRoutes); // Add admin routes
app.use("/api/settings", systemSettingsRoutes); // Add system settings routes
app.use('/api/employee', documentRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        python: 'Ready'
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        success: false, 
        error: err.message || 'Internal server error' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 API endpoints:`);
    console.log(`   POST /api/employee/process-document`);
    console.log(`   POST /api/employee/process-ocr`);
    console.log(`   POST /api/employee/process-nlp`);
    console.log(`   GET  /api/employee/stats`);
    console.log(`   POST /api/employee/validate-accuracy`);
});

app.get("/", (req, res) => {
    res.json({
        message: "Backend API is running"
    });
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});