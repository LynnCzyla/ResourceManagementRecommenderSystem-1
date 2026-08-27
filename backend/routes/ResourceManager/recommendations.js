// backend/routes/ResourceManager/recommendations.js
const express = require('express');
const router = express.Router();
const recommendationController = require('../../controllers/recommendationController');
const { verifyToken } = require('../Middleware/auth');

console.log('📦 Loading recommendations route...');

// Apply auth middleware to all routes in this router
router.use(verifyToken);

// ============================================
// ✅ TEST ROUTE - To verify router is working
// ============================================
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Recommendations router is working!',
        timestamp: new Date().toISOString(),
        user: req.user ? {
            id: req.user.id,
            role: req.user.role,
            branch_id: req.user.branch_id,
            is_super_admin: req.user.is_super_admin
        } : null,
        availableRoutes: [
            'GET /api/rm/recommendations/:requirementId',
            'GET /api/rm/recommendations/projects/:projectId',
            'GET /api/rm/recommendations/employees/:profileId/performance',
            'GET /api/rm/recommendations/employees/:profileId/workload',
            'POST /api/rm/recommendations/projects/:projectId/assign'
        ]
    });
});

// ============================================
// ✅ RECOMMENDATION ROUTES
// ============================================

// GET /api/rm/recommendations/:requirementId
// Get recommendations by requirement ID
router.get('/:requirementId', recommendationController.getRecommendationsByRequirement);

// GET /api/rm/recommendations/projects/:projectId
// Get recommendations for a project
router.get('/projects/:projectId', recommendationController.getRecommendations);

// GET /api/rm/recommendations/employees/:profileId/performance
// Get employee performance details
router.get('/employees/:profileId/performance', recommendationController.getEmployeePerformance);

// GET /api/rm/recommendations/employees/:profileId/workload
// Get employee workload
router.get('/employees/:profileId/workload', recommendationController.getEmployeeWorkload);

// POST /api/rm/recommendations/projects/:projectId/assign
// Assign employee to project
router.post('/projects/:projectId/assign', recommendationController.assignEmployee);

console.log('✅ recommendations route loaded with all endpoints');

module.exports = router;