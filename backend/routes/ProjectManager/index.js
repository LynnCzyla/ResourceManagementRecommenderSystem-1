const express = require('express');
const router = express.Router();

router.use(require('./dashboard'));
router.use(require('./projects'));
router.use(require('./resourceRequests'));
router.use(require('./tasks'));
router.use(require('./employees'));
router.use(require('./feedbackRequests'));   // ← add this line

module.exports = router;