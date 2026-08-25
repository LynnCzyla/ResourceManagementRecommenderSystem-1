// backend/routes/HumanResource/Index.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/auth');

// Test route (no auth) — useful to confirm the router is mounted
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'HR Router is working!',
    timestamp: new Date().toISOString(),
    routes: ['/job-postings', '/applications', '/interviews', '/hired-employees', '/dashboard/summary'],
  });
});

// Everything below requires a valid session
router.use(verifyToken);

router.use('/job-postings', require('./jobPostings'));
router.use('/applications', require('./applications'));
router.use('/interviews', require('./interviews'));
router.use('/hired-employees', require('./hiredEmployees'));
router.use('/dashboard', require('./dashboard'));
router.use('/resource-requests', require('./resourceRequests'));

module.exports = router;
