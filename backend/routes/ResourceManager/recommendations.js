// backend/routes/ResourceManager/recommendations.js
const express = require('express');
const router = express.Router();
const recommendationController = require('../../controllers/recommendationController'); // ✅ Correct path
const { verifyToken } = require('../Middleware/auth');

// Apply auth middleware
router.use(verifyToken);

// Get recommendations for a project
router.get(
    '/projects/:projectId/recommendations',
    recommendationController.getRecommendations
);

// Get employee workload
router.get(
    '/employees/:profileId/workload',
    recommendationController.getEmployeeWorkload
);

// Assign employee to project
router.post(
    '/projects/:projectId/assign',
    recommendationController.assignEmployee
);

module.exports = router;