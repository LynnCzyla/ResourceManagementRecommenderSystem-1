// D:\ResourceManagementRecommenderSystem\backend\server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// ============ RECOMMENDATION ENGINE ============
const recommendationEngine = require("./services/recommendationService");

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ IMPORT AUTH MIDDLEWARE ============
const { verifyToken } = require("./routes/Middleware/auth");

// Routes
const userRoutes = require("./routes/Admin/createUsers");
const userManagementRoutes = require("./routes/Admin/userManagement");
const forgotPasswordRoutes = require("./routes/Auth/forgotPassword");
const systemSettingsRoutes = require("./routes/Admin/systemSettings");
const unlockRoutes = require("./routes/Admin/unlockUsers");
const loginRoutes = require("./routes/Auth/login");

// ✅ Import both public and protected contact routes
const contactPublicRoutes = require('./routes/Public/contactPublic');
const contactProtectedRoutes = require('./routes/Admin/contactAdmin');

const departmentsPositionsRoutes = require('./routes/Admin/departmentsPositions');
const notificationsRouter = require('./routes/notifications');
const documentRoutes = require('./routes/Employee/documentRoutes');
const dashboardRoutes = require('./routes/Admin/dashboard');
const auditLogsRoutes = require('./routes/Admin/auditLogs');
const applicantRoutes = require('./routes/applicant/applicantRoutes');

// ============ SUPER ADMIN ROUTES ============
const superAdminDashboardRoutes = require('./routes/SuperAdmin/dashboard');
const superAdminAccountsRoutes  = require('./routes/SuperAdmin/accounts');
const superAdminAdminsRoutes    = require('./routes/SuperAdmin/admins');
const superAdminBranchesRoutes  = require('./routes/SuperAdmin/branches');
const superAdminAuditLogsRoutes = require('./routes/SuperAdmin/audit-logs');

// ============ MOUNT SUPER ADMIN ROUTES ============
app.use('/api/superadmin', superAdminDashboardRoutes);
app.use('/api/superadmin', superAdminAccountsRoutes);
app.use('/api/superadmin', superAdminAdminsRoutes);
app.use('/api/superadmin', superAdminBranchesRoutes);
app.use('/api/superadmin', superAdminAuditLogsRoutes);

// ============ MOUNT OTHER ROUTES ============
app.use('/api/rm', require('./routes/ResourceManager/Index'));
app.use('/api/pm', require('./routes/ProjectManager'));
app.use('/api/hr', require('./routes/HumanResource/Index'));
app.use('/api/public', require('./routes/Public/clientFeedback'));

app.use('/api/applicant', applicantRoutes);
app.use('/api/notifications', notificationsRouter);

// ✅ MOUNT CONTACT ROUTES - PUBLIC (no auth) and PROTECTED (with auth)
app.use('/api/public/admin', contactPublicRoutes);    // Public routes - NO auth required
app.use('/api/admin', contactProtectedRoutes);         // Protected routes - Auth required

app.use('/api/admin', departmentsPositionsRoutes);
app.use('/api/admin', dashboardRoutes);
app.use('/api/admin', auditLogsRoutes);
app.use("/api/auth", forgotPasswordRoutes);
app.use("/api/auth", loginRoutes);
app.use("/api/users", userRoutes);
app.use("/api/users", verifyToken, userManagementRoutes);
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

// ============ CLEAR CACHE ENDPOINT ============
app.post('/api/admin/clear-alias-cache', (req, res) => {
    try {
        recommendationEngine.clearAliasCache();
        res.json({ 
            success: true, 
            message: 'Alias cache cleared. Will refresh on next request.' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============ FORCE REFRESH ALIASES ============
app.post('/api/admin/refresh-aliases', async (req, res) => {
    try {
        await recommendationEngine.refreshAliases();
        res.json({ 
            success: true, 
            message: 'Aliases refreshed from database' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============ GET CACHE STATUS ============
app.get('/api/admin/cache-status', (req, res) => {
    const hasCache = recommendationEngine._aliasMap !== null;
    const cacheAge = hasCache && recommendationEngine._aliasCacheTime 
        ? Math.round((Date.now() - recommendationEngine._aliasCacheTime) / 1000) 
        : null;
    const cacheSize = hasCache && recommendationEngine._aliasMap 
        ? Object.keys(recommendationEngine._aliasMap).length 
        : 0;
    
    res.json({
        success: true,
        data: {
            hasCache: hasCache,
            cacheAgeSeconds: cacheAge,
            cacheSize: cacheSize,
            ttlSeconds: Math.round(recommendationEngine._aliasCacheTTL / 1000),
            isExpired: hasCache && cacheAge !== null && cacheAge > recommendationEngine._aliasCacheTTL / 1000
        }
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        success: false, 
        error: err.message || 'Internal server error' 
    });
});

// ============ START SERVER ============
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
    // ============ PRELOAD ALIASES ============
    console.log('🔄 Preloading skill aliases...');
    try {
        await recommendationEngine.preloadAliases();
        console.log('✅ Recommendation engine ready');
    } catch (error) {
        console.error('❌ Failed to preload aliases:', error.message);
        console.log('⚠️ Aliases will load on first recommendation request');
    }
});