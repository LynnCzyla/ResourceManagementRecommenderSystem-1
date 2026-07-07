const express = require('express');
const router = express.Router();

// Dashboard, Employee Directory, Projects only — RMRequestsTab.jsx intentionally untouched
router.use(require('./dashboard'));
router.use(require('./employees'));
router.use(require('./projects'));

module.exports = router;