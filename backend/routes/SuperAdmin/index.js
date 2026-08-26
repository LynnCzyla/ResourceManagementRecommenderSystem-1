// backend/routes/SuperAdmin/index.js
const express = require('express');
const router = express.Router();

const accountsRoutes = require('./accounts');
const adminsRoutes = require('./admins');
const branchesRoutes = require('./branches');
const dashboardRoutes = require('./dashboard');
const auditLogsRoutes = require('./audit-logs'); // ← NEW

// Mount routes
router.use('/', accountsRoutes);
router.use('/', adminsRoutes);
router.use('/', branchesRoutes);
router.use('/', dashboardRoutes);
router.use('/', auditLogsRoutes); // ← NEW

module.exports = router;