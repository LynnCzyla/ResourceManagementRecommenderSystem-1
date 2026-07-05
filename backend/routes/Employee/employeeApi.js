const express = require('express');
const router = express.Router();

router.use(require('./dashboard'));
router.use(require('./Assignments'));
router.use(require('./Profile'));

module.exports = router;
