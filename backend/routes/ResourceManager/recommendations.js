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
router.get('/:requirementId', async (req, res) => {
    try {
        const { requirementId } = req.params;
        console.log(`🔍 Getting recommendations for requirement: ${requirementId}`);
        
        const supabase = require('../../supabase');
        
        // Get the requirement to find project_id
        const { data: requirement, error: reqError } = await supabase
            .from('project_resource_requirements')
            .select('project_id, role_title')
            .eq('id', requirementId)
            .single();
        
        if (reqError || !requirement) {
            console.error('❌ Requirement not found:', reqError);
            return res.status(404).json({
                success: false,
                error: 'Requirement not found'
            });
        }
        
        console.log(`📋 Found project_id: ${requirement.project_id} for requirement ${requirementId}`);
        
        // Forward to the project recommendations
        req.params.projectId = requirement.project_id;
        return recommendationController.getRecommendations(req, res);
    } catch (error) {
        console.error('❌ Error in recommendations by requirement:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// GET /api/rm/recommendations/project/:projectId
// Get recommendations for a project
// ============================================
router.get('/project/:projectId', recommendationController.getRecommendations);

// Get employee workload
router.get('/employee/:profileId/workload', recommendationController.getEmployeeWorkload);

// Assign employee to project
router.post('/project/:projectId/assign', recommendationController.assignEmployee);

module.exports = router;