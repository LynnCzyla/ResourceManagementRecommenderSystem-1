// backend/routes/ProjectManager/index.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/auth');

console.log('✅ PM Router initializing...');

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'PM Router is working!',
    timestamp: new Date().toISOString(),
    routes: ['/dashboard', '/projects', '/employees', '/skills', '/tasks', '/resource-requests', '/feedback-requests', '/performance']
  });
});

router.use(verifyToken);
console.log('✅ Auth middleware applied');

console.log('📦 Loading Dashboard route...');
router.use('/dashboard', require('./dashboard'));
console.log('✅ Dashboard route loaded');

console.log('📦 Loading Projects route...');
router.use('/projects', require('./projects'));
console.log('✅ Projects route loaded');

console.log('📦 Loading Resource Requests route...');
router.use('/resource-requests', require('./resourceRequests'));
console.log('✅ resourceRequests route loaded');

console.log('📦 Loading Tasks route...');
router.use('/tasks', require('./tasks'));
console.log('✅ Tasks route loaded');

console.log('📦 Loading Employees route...');
router.use('/employees', require('./employees'));
console.log('✅ Employees route loaded');

console.log('📦 Loading Feedback Requests route...');
router.use('/feedback-requests', require('./feedbackRequests'));
console.log('✅ Feedback Requests route loaded');

console.log('📦 Loading Skills route...');
router.use('/skills', require('./skills'));
console.log('✅ Skills route loaded');

console.log('📦 Loading Performance route...');
router.use('/performance', require('./performance'));
console.log('✅ Performance route loaded');

module.exports = router;