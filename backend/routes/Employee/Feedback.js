// backend/routes/Employee/Feedback.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/auth');
const { getMyFeedback } = require('../../controllers/employeeFeedbackController');

// GET /api/employee/feedback
router.get('/feedback', verifyToken, getMyFeedback);

module.exports = router;