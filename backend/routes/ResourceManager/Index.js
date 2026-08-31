// backend/routes/ResourceManager/Index.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/auth');

console.log('✅ RM Router initializing...');

router.get('/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'RM Router is working!',
        timestamp: new Date().toISOString(),
        routes: ['/dashboard', '/projects', '/employees', '/requirements', '/assignments', '/recommendations', '/reports', '/feedback-report']
    });
});

router.use(verifyToken);
console.log('✅ Auth middleware applied');

console.log('📦 Loading Dashboard route...');
const dashboardRoutes = require('./Dashboard');
console.log('✅ Dashboard route loaded');

console.log('📦 Loading Projects route...');
const projectsRoutes = require('./Projects');
console.log('✅ Projects route loaded');

console.log('📦 Loading requirements route...');
const requirementsRoutes = require('./requirements');
console.log('✅ requirements route loaded');

console.log('📦 Loading assignments route...');
const assignmentsRoutes = require('./assignments');
console.log('✅ assignments route loaded');

console.log('📦 Loading Employees route...');
const employeesRoutes = require('./Employees');
console.log('✅ Employees route loaded');

console.log('📦 Loading recommendations route...');
const recommendationsRoutes = require('./recommendations');
console.log('✅ recommendations route loaded');

const resourceRequestsRoutes = require('./resourceRequests');
console.log('✅ resourceRequests route loaded');

console.log('📦 Loading Reports route...');
const reportsRoutes = require('./Reports');
console.log('✅ Reports route loaded');

console.log('📦 Loading Feedback Report route...');
const feedbackReportRoutes = require('./feedbackReport');
console.log('✅ feedbackReport route loaded');

console.log('🔗 Registering routes...');
router.use('/dashboard', dashboardRoutes);
router.use('/projects', projectsRoutes);
router.use('/requirements', requirementsRoutes);
router.use('/assignments', assignmentsRoutes);
router.use('/employees', employeesRoutes);
router.use('/recommendations', recommendationsRoutes);
router.use('/resource-requests', resourceRequestsRoutes);
router.use('/reports', reportsRoutes);
router.use('/feedback-report', feedbackReportRoutes);
console.log('✅ All routes registered');

console.log('✅ RM Routes registered with auth middleware');

module.exports = router;