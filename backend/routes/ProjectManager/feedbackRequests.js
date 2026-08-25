// backend/routes/ProjectManager/feedbackRequests.js
const express = require('express');
const router = express.Router();
const {
  createFeedbackRequest,
  getFeedbackRequests,
  resendFeedbackRequest,
} = require('../../controllers/feedbackRequestController');

// GET /api/pm/feedback-requests?createdBy=<profileId>
router.get('/feedback-requests', getFeedbackRequests);

// POST /api/pm/feedback-requests
router.post('/feedback-requests', createFeedbackRequest);

// POST /api/pm/feedback-requests/:id/resend
router.post('/feedback-requests/:id/resend', resendFeedbackRequest);

module.exports = router;