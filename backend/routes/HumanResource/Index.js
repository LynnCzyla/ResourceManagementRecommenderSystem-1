// backend/routes/HumanResource/index.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/auth');

console.log('✅ HR Router initializing...');

// Apply auth middleware to ALL HR routes
router.use(verifyToken);
console.log('✅ Auth middleware applied');

// ✅ Role check middleware for Human Resources
const requireHumanResources = (req, res, next) => {
  const userRole = req.user?.role;
  const isSuperAdmin = req.user?.is_super_admin || false;

  if (isSuperAdmin) {
    return next();
  }

  if (userRole !== 'Human Resources') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Human Resources role required.'
    });
  }

  next();
};

// ✅ Role check middleware for routes accessible by HR or Admin (e.g. hired employees for account creation)
const requireHrOrAdmin = (req, res, next) => {
  const userRole = req.user?.role;
  const isSuperAdmin = req.user?.is_super_admin || false;

  if (isSuperAdmin || userRole === 'Human Resources' || userRole === 'Admin' || userRole === 'Administrator') {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Access denied. Human Resources or Admin role required.'
  });
};

// Import routes with debug logs
console.log('📦 Loading Dashboard route...');
const dashboardRoutes = require('./dashboard');
console.log('✅ Dashboard route loaded');

console.log('📦 Loading Job Postings route...');
const jobPostingsRoutes = require('./jobPostings');
console.log('✅ Job Postings route loaded');

console.log('📦 Loading Applications route...');
const applicationsRoutes = require('./applications');
console.log('✅ Applications route loaded');

console.log('📦 Loading Resource Requests route...');
const resourceRequestsRoutes = require('./resourceRequests');
console.log('✅ Resource Requests route loaded');

console.log('📦 Loading Interviews route...');
const interviewsRoutes = require('./interviews');
console.log('✅ Interviews route loaded');

console.log('📦 Loading Hired Employees route...');
const hiredEmployeesRoutes = require('./hiredEmployees');
console.log('✅ Hired Employees route loaded');

console.log('📦 Loading Departments route...');
const departmentsRoutes = require('./departments');
console.log('✅ Departments route loaded');

console.log('📦 Loading Branches route...');
const branchesRoutes = require('./branches');
console.log('✅ Branches route loaded');

// Register routes with role check
console.log('🔗 Registering routes...');
router.use('/dashboard', requireHumanResources, dashboardRoutes);
router.use('/job-postings', requireHumanResources, jobPostingsRoutes);
router.use('/applications', requireHumanResources, applicationsRoutes);
router.use('/resource-requests', requireHumanResources, resourceRequestsRoutes);
router.use('/interviews', requireHumanResources, interviewsRoutes);
router.use('/hired-employees', requireHrOrAdmin, hiredEmployeesRoutes);
router.use('/departments', requireHumanResources, departmentsRoutes);
router.use('/branches', requireHumanResources, branchesRoutes);
console.log('✅ All routes registered');

console.log('✅ HR Routes registered with auth middleware');

module.exports = router;