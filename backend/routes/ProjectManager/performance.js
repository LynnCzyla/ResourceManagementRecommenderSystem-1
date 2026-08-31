// backend/routes/ProjectManager/performance.js
const express = require('express');
const router = express.Router();
const {
  getClientFeedbackForEmployee,
  submitPmEvaluation,
  getPmClientFeedback,
} = require('../../controllers/employeeFeedbackController');

// GET /api/pm/performance/client-feedback?profileId=<EMP id>&projectId=<optional>
router.get('/client-feedback', getClientFeedbackForEmployee);

// GET /api/pm/performance/my-client-feedback
router.get('/my-client-feedback', getPmClientFeedback);

// POST /api/pm/performance/evaluations
router.post('/evaluations', submitPmEvaluation);

module.exports = router;