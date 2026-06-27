const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentController = require('../../controllers/documentController');
const { verifyToken } = require('../Middleware/auth');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024
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

// ============ DOCUMENT ROUTES (ALL PROTECTED) ============
router.post('/process-document', verifyToken, upload.single('document'), documentController.processDocument);
router.get('/documents', verifyToken, documentController.getDocuments);
router.get('/profile', verifyToken, documentController.getCurrentProfile);
router.get('/profile/:employeeId', verifyToken, documentController.getProfile);
router.put('/profile', verifyToken, documentController.updateProfile);

// ============ SKILL ROUTES ============
router.get('/skills', verifyToken, documentController.getSkills);

// ============ STATS ROUTES ============
router.get('/stats', verifyToken, documentController.getStats);

// ============ FEEDBACK ROUTES ============
let feedbackController;
try {
    feedbackController = require('../../controllers/feedbackController');
    console.log('✅ Feedback controller loaded');
} catch (error) {
    console.log('⚠️ Feedback controller not found');
    feedbackController = null;
}

if (feedbackController) {
    if (typeof feedbackController.saveSkillFeedback === 'function') {
        router.post('/skill-feedback', verifyToken, feedbackController.saveSkillFeedback);
        console.log('✅ POST /skill-feedback route added');
    }
    if (typeof feedbackController.getPendingFeedback === 'function') {
        router.get('/pending-feedback/:documentId', verifyToken, feedbackController.getPendingFeedback);
        console.log('✅ GET /pending-feedback/:documentId route added');
    }
    if (typeof feedbackController.getFeedbackStats === 'function') {
        router.get('/feedback-stats', verifyToken, feedbackController.getFeedbackStats);
        console.log('✅ GET /feedback-stats route added');
    }
}

module.exports = router;