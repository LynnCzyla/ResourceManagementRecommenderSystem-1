// backend/routes/ProjectManager/feedbackRequests.js
const express = require('express');
const router = express.Router();
const {
  createFeedbackRequest,
  getFeedbackRequests,
  resendFeedbackRequest,
} = require('../../controllers/feedbackRequestController');

// ✅ GET /api/pm/feedback-requests?createdBy=<profileId>
// Changed from '/feedback-requests' to '/'
router.get('/', getFeedbackRequests);

// ✅ POST /api/pm/feedback-requests
// Changed from '/feedback-requests' to '/'
router.post('/', createFeedbackRequest);

// ✅ POST /api/pm/feedback-requests/:id/resend
// Changed from '/feedback-requests/:id/resend' to '/:id/resend'
router.post('/:id/resend', resendFeedbackRequest);

module.exports = router;