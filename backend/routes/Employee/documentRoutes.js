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

// ============ LOAD FEEDBACK CONTROLLER ============
let feedbackController;
try {
    feedbackController = require('../../controllers/feedbackController');
    console.log('✅ Feedback controller loaded');
} catch (error) {
    console.log('⚠️ Feedback controller not found:', error.message);
    feedbackController = null;
}

const supabase = require('../../supabase');

// ============ DOCUMENT ROUTES (ALL PROTECTED) ============
router.post('/process-document', verifyToken, upload.single('document'), documentController.processDocument);
router.get('/documents', verifyToken, documentController.getDocuments);

// ============================================================
// NEW: Detailed document endpoint (lazy loading)
// ============================================================
router.get('/documents/:documentId/details', verifyToken, documentController.getDocumentDetails);

router.get('/skills', verifyToken, documentController.getSkills);
router.get('/stats', verifyToken, documentController.getStats);

// ============ EMPLOYEE SUB-ROUTES ============
router.use('/', require('./employeeApi'));

// ============ ML STATUS ROUTE ============
if (feedbackController && typeof feedbackController.getMLStatus === 'function') {
    router.get('/ml-status', verifyToken, feedbackController.getMLStatus);
    console.log('✅ GET /ml-status route added');
} else {
    console.log('⚠️ ML Status route not available - feedbackController.getMLStatus missing');
    router.get('/ml-status', verifyToken, (req, res) => {
        res.json({
            success: true,
            data: {
                ml_active: false,
                ml_trained: false,
                status: 'unavailable',
                message: 'ML Status service is being configured. Please check server logs.'
            }
        });
    });
}

// ============ FEEDBACK ROUTES ============
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
    
    if (typeof feedbackController.cleanupDuplicateSkills === 'function') {
        router.post('/cleanup-duplicates', feedbackController.cleanupDuplicateSkills);
        console.log('✅ POST /cleanup-duplicates route added');
    }
    
    if (typeof feedbackController.syncSkills === 'function') {
        router.post('/sync-skills', verifyToken, feedbackController.syncSkills);
        console.log('✅ POST /sync-skills route added');
    }
    
    if (typeof feedbackController.retrainML === 'function') {
        router.post('/retrain-ml', verifyToken, feedbackController.retrainML);
        console.log('✅ POST /retrain-ml route added');
    }

    router.get('/documents/:documentId/ocr', verifyToken, documentController.getDocumentOcrText);
}

module.exports = router;