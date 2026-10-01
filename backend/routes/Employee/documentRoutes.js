const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentController = require('../../controllers/documentController');
const { verifyToken } = require('../Middleware/auth');

const supabase = require('../../supabase');

// Configure multer memory storage
const storage = multer.memoryStorage();

// Cache system settings briefly (60 seconds) to avoid DB roundtrip on every file upload
let cachedSettings = null;
let lastSettingsFetch = 0;

async function getSystemSettings() {
  const now = Date.now();
  if (cachedSettings && (now - lastSettingsFetch < 60000)) {
    return cachedSettings;
  }
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('max_file_upload_size')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.warn('⚠️ Could not fetch system settings, using default 10MB:', error?.message);
      cachedSettings = { max_file_upload_size: 10 };
    } else {
      cachedSettings = { max_file_upload_size: data.max_file_upload_size || 10 };
    }
  } catch (err) {
    console.warn('⚠️ Error fetching system settings, using default 10MB:', err.message);
    cachedSettings = { max_file_upload_size: 10 };
  }
  lastSettingsFetch = now;
  return cachedSettings;
}

// Dynamic multer upload middleware reading max_file_upload_size from system settings
const dynamicUpload = async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    const maxFileSizeMB = settings.max_file_upload_size || 10;
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

    const uploader = multer({
      storage: storage,
      limits: {
        fileSize: maxFileSizeBytes
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and PDF are allowed'));
        }
      }
    }).single('document');

    uploader(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: `File size exceeds the ${maxFileSizeMB}MB limit configured by the administrator. Please upload a smaller file.`
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }
      next();
    });
  } catch (err) {
    console.error('Error in dynamicUpload middleware:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error processing file upload'
    });
  }
};

// ============ LOAD FEEDBACK CONTROLLER ============
let feedbackController;
try {
    feedbackController = require('../../controllers/feedbackController');
    console.log('✅ Feedback controller loaded');
} catch (error) {
    console.log('⚠️ Feedback controller not found:', error.message);
    feedbackController = null;
}

// ============ SETTINGS ROUTE FOR EMPLOYEES ============
// GET /api/employee/system-settings (fetches max file upload size configured by Super Admin)
router.get('/system-settings', verifyToken, async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      success: true,
      data: {
        max_file_upload_size: settings.max_file_upload_size || 10
      }
    });
  } catch (error) {
    console.error('Error fetching employee system settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upload settings'
    });
  }
});

// ============ DOCUMENT ROUTES (ALL PROTECTED) ============
router.post('/process-document', verifyToken, dynamicUpload, documentController.processDocument);
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