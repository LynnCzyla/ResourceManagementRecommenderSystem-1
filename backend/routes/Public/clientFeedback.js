// backend/routes/Public/clientFeedback.js
//
// Public, unauthenticated routes for the client-facing feedback form.
// Mounted separately from routes/ProjectManager/* — no auth middleware,
// since the client has no account and only has the access_token in the URL.

const express = require('express');
const router = express.Router();
const {
  getFeedbackRequestByToken,
  submitFeedbackResponses,
} = require('../../controllers/clientFeedbackController');

// GET /api/public/feedback/:token
router.get('/feedback/:token', getFeedbackRequestByToken);

// POST /api/public/feedback/:token
router.post('/feedback/:token', submitFeedbackResponses);

module.exports = router;