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
const dashboardRoutes = require('./routes/Admin/dashboard');
const auditLogsRoutes = require('./routes/Admin/auditLogs');

app.use('/api/rm', require('./routes/ResourceManager/Index'));
app.use('/api/pm', require('./routes/ProjectManager'));
app.use('/api/hr', require('./routes/HumanResource/Index'));

app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', departmentsPositionsRoutes);
app.use('/api/admin', contactAdminRoutes);
app.use('/api/admin', dashboardRoutes);
app.use('/api/admin', auditLogsRoutes);
app.use("/api/auth", forgotPasswordRoutes);
app.use("/api/auth", loginRoutes);
app.use("/api/users", userRoutes);
app.use("/api/users", userManagementRoutes);
app.use("/api/admin", unlockRoutes);
app.use("/api/settings", systemSettingsRoutes);
app.use('/api/employee', documentRoutes);

// ⭐ ADDED
app.use('/api/employee', require('./routes/Employee/Assignments'));
app.use('/api/employee', require('./routes/Employee/History'));

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
});

app.get("/", (req, res) => {
    res.json({ message: "Backend API is running" });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        success: false, 
        error: err.message || 'Internal server error' 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});