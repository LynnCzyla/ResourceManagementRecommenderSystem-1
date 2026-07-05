const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
const userRoutes = require("./routes/Admin/createUsers");
const userManagementRoutes = require("./routes/Admin/userManagement");
const forgotPasswordRoutes = require("./routes/Auth/forgotPassword");
const systemSettingsRoutes = require("./routes/Admin/systemSettings");
const unlockRoutes = require("./routes/Admin/unlockUsers");
const loginRoutes = require("./routes/Auth/login");
const contactAdminRoutes = require('./routes/Admin/contactAdmin');
const departmentsPositionsRoutes = require('./routes/Admin/departmentsPositions');
const notificationsRouter = require('./routes/notifications');
const documentRoutes = require('./routes/Employee/documentRoutes');
app.use('/api/pm', require('./routes/ProjectManager'));

app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', departmentsPositionsRoutes);
app.use('/api/admin', contactAdminRoutes);
app.use("/api/auth", forgotPasswordRoutes);
app.use("/api/auth", loginRoutes);
app.use("/api/users", userRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/admin", unlockRoutes);
app.use("/api/settings", systemSettingsRoutes);
app.use('/api/employee', documentRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
});

app.get("/", (req, res) => {
    res.json({ message: "Backend API is running" });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        success: false, 
        error: err.message || 'Internal server error' 
    });
});

// ✅ ONE app.listen ONLY — at the very bottom
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});