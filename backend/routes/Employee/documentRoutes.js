const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentController = require('../../controllers/documentController');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and PDF are allowed'));
        }
    }
});

// ============ DOCUMENT ROUTES ============
router.post('/process-document', upload.single('document'), documentController.processDocument);
router.get('/documents', documentController.getDocuments);
router.get('/profile/:employeeId', documentController.getProfile);
router.put('/profile', documentController.updateProfile);

// ============ SKILL ROUTES ============
router.get('/skills', documentController.getSkills);

// ============ STATS ROUTES ============
router.get('/stats', documentController.getStats);

// ============ FEEDBACK ROUTES ============
// Load feedback controller
let feedbackController;
try {
    feedbackController = require('../../controllers/feedbackController');
    console.log('✅ Feedback controller loaded');
} catch (error) {
    console.log('⚠️ Feedback controller not found');
    feedbackController = null;
}

// Add feedback routes only if controller exists
if (feedbackController) {
    if (typeof feedbackController.saveSkillFeedback === 'function') {
        router.post('/skill-feedback', feedbackController.saveSkillFeedback);
        console.log('✅ POST /skill-feedback route added');
    }
    
    if (typeof feedbackController.getPendingFeedback === 'function') {
        router.get('/pending-feedback/:documentId', feedbackController.getPendingFeedback);
        console.log('✅ GET /pending-feedback/:documentId route added');
    }
    
    if (typeof feedbackController.getFeedbackStats === 'function') {
        router.get('/feedback-stats', feedbackController.getFeedbackStats);
        console.log('✅ GET /feedback-stats route added');
    }
}

module.exports = router;