// routes/ResourceManager/Index.js (capital I)
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/auth');

console.log('✅ RM Router initializing...');

// Apply auth middleware to ALL RM routes
router.use(verifyToken);

// Use uppercase to match file names
router.use(require('./Dashboard'));  // Capital D
router.use(require('./Employees'));  // Capital E
router.use(require('./Projects'));   // Capital P

console.log('✅ RM Routes registered with auth middleware');

module.exports = router;