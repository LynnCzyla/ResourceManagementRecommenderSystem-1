// backend/routes/ResourceManager/recommendations.js
const express = require('express');
const router = express.Router();
const recommendationController = require('../../controllers/recommendationController');
const { verifyToken } = require('../Middleware/auth');

console.log('📦 Loading recommendations route...');

// Apply auth middleware to all routes in this router
router.use(verifyToken);

// ============================================
// GET /api/rm/recommendations/:requirementId
// Get recommendations by requirement ID
// ============================================
router.get('/:requirementId', recommendationController.getRecommendationsByRequirement);

// ============================================
// GET /api/rm/recommendations/project/:projectId
// Get recommendations for a project
// ============================================
router.get('/project/:projectId', recommendationController.getRecommendations);

// ============================================
// GET /api/rm/employee/:profileId/performance
// Get employee performance details
// ============================================
router.get('/employee/:profileId/performance', recommendationController.getEmployeePerformance);

// Get employee workload
router.get('/employee/:profileId/workload', recommendationController.getEmployeeWorkload);

// Assign employee to project
router.post('/project/:projectId/assign', recommendationController.assignEmployee);

module.exports = router;